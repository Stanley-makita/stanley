'use client'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { montarEtiquetasVinculo, type EntidadeVinculo, type MotivoRecusa } from '@/lib/documentos/vinculos'
// Só o tipo: o módulo de destinos é de servidor (importa o bot) e não pode ir pro navegador.
import type { DestinoVinculo } from '@/lib/documentos/destinosVinculo'

export interface ResultadoVinculo { vinculados: number; ja_existiam: number; recusados: { documento_id: string; motivo: MotivoRecusa }[] }
export interface CandidatosPessoa { pessoa_id: string; nome: string; documentos: { id: string; nome: string; classificacao: string | null; recebido_em: string }[] }

export async function chamarApiVinculos<T>(caminho: string, init: { method?: 'GET' | 'POST' | 'DELETE'; body?: unknown } = {}): Promise<T> {
  const { data: sessao } = await supabase.auth.getSession()
  const res = await fetch(`/api/documentos/vinculos${caminho}`, {
    method: init.method ?? 'GET',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessao.session?.access_token ?? ''}` },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })
  const json = await res.json().catch(() => null) as (T & { error?: string }) | null
  if (!res.ok) throw new Error(json?.error ?? 'Não foi possível concluir. Tente de novo.')
  return json as T
}

// Qualquer lista de documentos (Pessoa/Lead/Negócio) e as etiquetas precisam recarregar.
function invalidarDocumentos(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['documentos-unificado'] })
  qc.invalidateQueries({ queryKey: ['documentos-etiquetas'] })
  qc.invalidateQueries({ queryKey: ['documentos-candidatos'] })
}

export function useEnviarDocumentos() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { documento_ids: string[]; entidade_tipo: EntidadeVinculo; entidade_id: string }) =>
      chamarApiVinculos<ResultadoVinculo>('', { method: 'POST', body }),
    onSuccess: () => invalidarDocumentos(qc),
  })
}

export function useRemoverVinculo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { documento_id: string; entidade_tipo: EntidadeVinculo; entidade_id: string }) =>
      chamarApiVinculos<{ ok: true }>('', { method: 'DELETE', body }),
    onSuccess: () => invalidarDocumentos(qc),
  })
}

export function useDestinosPessoa(pessoaId: string | undefined, busca: string, habilitado: boolean) {
  return useQuery({
    queryKey: ['documentos-destinos', pessoaId, busca],
    enabled: habilitado && !!pessoaId,
    queryFn: async () => (await chamarApiVinculos<{ destinos: DestinoVinculo[] }>(
      `/destinos?pessoa_id=${encodeURIComponent(pessoaId!)}&busca=${encodeURIComponent(busca)}`,
    )).destinos,
  })
}

export function useCandidatosTrazer(entidadeTipo: EntidadeVinculo, entidadeId: string | undefined, habilitado: boolean) {
  return useQuery({
    queryKey: ['documentos-candidatos', entidadeTipo, entidadeId],
    enabled: habilitado && !!entidadeId,
    queryFn: async () => (await chamarApiVinculos<{ pessoas: CandidatosPessoa[] }>(
      `/candidatos?entidade_tipo=${entidadeTipo}&entidade_id=${encodeURIComponent(entidadeId!)}`,
    )).pessoas,
  })
}

/** Onde cada documento está (tela da Pessoa). Leads fora da carteira aparecem só como "Lead". */
export function useEtiquetasVinculo(documentoIds: string[], habilitado: boolean) {
  return useQuery({
    queryKey: ['documentos-etiquetas', [...documentoIds].sort().join(',')],
    enabled: habilitado && documentoIds.length > 0,
    queryFn: async () => {
      const { data: vinculos, error } = await supabase.from('documento_vinculos')
        .select('documento_id, entidade_tipo, entidade_id').in('documento_id', documentoIds).in('entidade_tipo', ['lead', 'processo'])
      if (error) throw error
      const lista = (vinculos ?? []) as { documento_id: string; entidade_tipo: string; entidade_id: string }[]
      const idsLead = Array.from(new Set(lista.filter(v => v.entidade_tipo === 'lead').map(v => v.entidade_id)))
      const idsProc = Array.from(new Set(lista.filter(v => v.entidade_tipo === 'processo').map(v => v.entidade_id)))
      const fasePorLead = new Map<string, string | null>()
      const numeroPorProc = new Map<string, string>()
      if (idsLead.length) {
        const { data, error: e } = await supabase.from('leads').select('id, fase:fases!fase_id(nome)').in('id', idsLead)
        if (e) throw e
        for (const l of (data ?? []) as unknown as { id: string; fase: { nome: string } | { nome: string }[] | null }[]) {
          fasePorLead.set(l.id, (Array.isArray(l.fase) ? l.fase[0]?.nome : l.fase?.nome) ?? null)
        }
      }
      if (idsProc.length) {
        const { data, error: e } = await supabase.from('processos').select('id, numero_processo').in('id', idsProc)
        if (e) throw e
        for (const p of (data ?? []) as { id: string; numero_processo: string }[]) numeroPorProc.set(p.id, p.numero_processo)
      }
      return montarEtiquetasVinculo(lista, fasePorLead, numeroPorProc)
    },
  })
}
