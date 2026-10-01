'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import { cpfValido } from '@/lib/cpf'

export interface RelacionamentoResumo {
  pessoa_a_id: string
  pessoa_b_id: string
  tipo: 'casamento' | 'uniao_estavel'
  regime_bens: string | null
  data_inicio: string | null
}

async function authHeader(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession()
  return { Authorization: `Bearer ${session?.access_token ?? ''}`, 'Content-Type': 'application/json' }
}

/** Casamentos vigentes de qualquer uma das Pessoas (para rotular "Cônjuge de X"). */
export function useRelacionamentosDe(pessoaIds: string[]) {
  const ids = Array.from(new Set(pessoaIds)).sort()
  return useQuery({
    queryKey: ['relacionamentos', ...ids],
    enabled: ids.length > 0,
    queryFn: async (): Promise<RelacionamentoResumo[]> => {
      const campos = 'pessoa_a_id, pessoa_b_id, tipo, regime_bens, data_inicio'
      const [a, b] = await Promise.all([
        supabase.from('pessoa_relacionamentos').select(campos).in('pessoa_a_id', ids).is('data_fim', null),
        supabase.from('pessoa_relacionamentos').select(campos).in('pessoa_b_id', ids).is('data_fim', null),
      ])
      if (a.error) throw a.error
      if (b.error) throw b.error
      const vistos = new Set<string>()
      return [...(a.data ?? []), ...(b.data ?? [])].filter((r) => {
        const k = `${r.pessoa_a_id}|${r.pessoa_b_id}`
        if (vistos.has(k)) return false
        vistos.add(k)
        return true
      }) as RelacionamentoResumo[]
    },
  })
}

function invalidarLead(qc: ReturnType<typeof useQueryClient>, leadId: string) {
  qc.invalidateQueries({ queryKey: ['leads', leadId] })
  qc.invalidateQueries({ queryKey: ['relacionamentos'] })
}

/** "Compõe renda" definido à mão (PATCH /api/participacoes/[id], migration 331). */
export function useAlterarCompoeRenda(leadId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ participacaoId, compoe }: { participacaoId: string; compoe: boolean }) => {
      const res = await fetch(`/api/participacoes/${participacaoId}`, {
        method: 'PATCH', headers: await authHeader(), body: JSON.stringify({ compoe_renda: compoe }),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error ?? 'Não foi possível salvar.')
      }
    },
    onSuccess: () => invalidarLead(qc, leadId),
  })
}

/**
 * Inclui um participante no lead pelo caminho já existente (lead_coparticipantes); a
 * sincronização da Fase A cria a participação. Com `nome`, cria antes a Pessoa (tipo cliente).
 */
export function useAdicionarParticipante(leadId: string) {
  const qc = useQueryClient()
  const { usuario } = useAuth()
  return useMutation({
    mutationFn: async (entrada: { pessoaId: string } | { nome: string; cpf?: string }): Promise<string> => {
      if (!usuario?.empresa_id) throw new Error('Sessão sem empresa.')
      let pessoaId: string
      if ('pessoaId' in entrada) {
        pessoaId = entrada.pessoaId
      } else {
        const nome = entrada.nome.trim()
        if (!nome) throw new Error('Informe o nome.')
        const cpf = (entrada.cpf ?? '').replace(/\D/g, '')
        if (cpf && !cpfValido(cpf)) throw new Error('CPF inválido.')
        const { data: nova, error } = await supabase.from('pessoas')
          .insert({ empresa_id: usuario.empresa_id, nome, cpf: cpf || null, tipo: 'cliente' })
          .select('id').single()
        if (error?.code === '23505') throw new Error('Esse CPF já é de outra pessoa cadastrada — busque por ele.')
        if (error || !nova) throw new Error('Não foi possível criar a pessoa.')
        pessoaId = nova.id as string
      }
      const { error: eVinc } = await supabase.from('lead_coparticipantes')
        .insert({ empresa_id: usuario.empresa_id, lead_id: leadId, pessoa_id: pessoaId })
      if (eVinc && eVinc.code !== '23505') throw new Error('Não foi possível incluir o participante.')
      return pessoaId
    },
    onSuccess: () => invalidarLead(qc, leadId),
  })
}

/** Remove um coparticipante do lead (a Pessoa e os documentos dela permanecem). */
export function useRemoverParticipante(leadId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (pessoaId: string) => {
      const { data, error } = await supabase.from('lead_coparticipantes')
        .delete().eq('lead_id', leadId).eq('pessoa_id', pessoaId).select('id')
      if (error) throw error
      if (!data?.length) throw new Error('Não foi possível remover — verifique seu acesso ao lead.')
    },
    onSuccess: () => invalidarLead(qc, leadId),
  })
}

export type ResultadoConjuge = { ok: true } | { precisaConfirmar: string[] }

/** "Casado(a) com" (POST /api/pessoas/[id]/conjuge). 409 = encerraria casamento de outra pessoa. */
export function useDefinirConjuge() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (p: {
      pessoaId: string; conjugeId: string | null; estadoCivil: string
      regime: string | null; data: string | null; confirmarEncerrar?: boolean
    }): Promise<ResultadoConjuge> => {
      const res = await fetch(`/api/pessoas/${p.pessoaId}/conjuge`, {
        method: 'POST', headers: await authHeader(),
        body: JSON.stringify({
          conjuge_pessoa_id: p.conjugeId, estado_civil: p.estadoCivil,
          regime_casamento: p.regime, data_casamento: p.data, confirmar_encerrar: !!p.confirmarEncerrar,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (res.status === 409) return { precisaConfirmar: ((json.encerra ?? []) as Array<{ nome: string }>).map((x) => x.nome) }
      if (!res.ok) throw new Error(json.error ?? 'Não foi possível salvar o casamento.')
      return { ok: true }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pessoa-completa'] })
      qc.invalidateQueries({ queryKey: ['leads'] })
      qc.invalidateQueries({ queryKey: ['relacionamentos'] })
    },
  })
}

/** "Tornar principal" (POST /api/leads/[id]/titular). 409 = já é principal de outro lead aberto. */
export function useTornarPrincipal(leadId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (pessoaId: string) => {
      const res = await fetch(`/api/leads/${leadId}/titular`, {
        method: 'POST', headers: await authHeader(), body: JSON.stringify({ pessoa_id: pessoaId }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error ?? 'Não foi possível trocar o principal.')
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads'] })
      qc.invalidateQueries({ queryKey: ['relacionamentos'] })
      qc.invalidateQueries({ queryKey: ['pessoa-completa'] })
    },
  })
}
