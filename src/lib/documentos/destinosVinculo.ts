import type { SupabaseClient } from '@supabase/supabase-js'
import { STATUS_BLOQUEADOS_PROCESSO } from '@/lib/bot/fonti-comandos'
import { interpretarBuscaDestino, type EntidadeVinculo } from '@/lib/documentos/vinculos'

export interface DestinoVinculo { entidade_tipo: EntidadeVinculo; entidade_id: string; titulo: string; subtitulo: string | null; pessoa_participa: boolean }

/** Mesma lista de "lead fechado" do índice leads_pessoa_aberto_unico (migration 311). */
export const STATUS_LEAD_FECHADO = ['aprovado', 'reprovado', 'convertido_em_processo', 'concluido', 'cancelado']
const LIMITE_BUSCA = 10

type Nome = { nome: string }
type LeadRow = { id: string; nome: string | null; fase: Nome | Nome[] | null }
type ProcRow = { id: string; numero_processo: string; banco: Nome | Nome[] | null }
const um = <T,>(x: T | T[] | null): T | null => (Array.isArray(x) ? x[0] ?? null : x)

const paraDestinoLead = (l: LeadRow, participa: boolean): DestinoVinculo => ({
  entidade_tipo: 'lead', entidade_id: l.id, titulo: `Lead · ${l.nome ?? 'sem nome'}`, subtitulo: um(l.fase)?.nome ?? null, pessoa_participa: participa,
})
const paraDestinoProc = (p: ProcRow, participa: boolean): DestinoVinculo => ({
  entidade_tipo: 'processo', entidade_id: p.id, titulo: p.numero_processo, subtitulo: um(p.banco)?.nome ?? null, pessoa_participa: participa,
})

/**
 * Roda com o cliente do USUÁRIO (RLS): só devolve o que ele já enxerga — a busca livre
 * nunca revela lead/negócio de outra carteira.
 */
export async function buscarDestinos(cliente: SupabaseClient, pessoaId: string, busca: string): Promise<DestinoVinculo[]> {
  const fechados = `(${STATUS_LEAD_FECHADO.join(',')})`
  const bloqueados = `(${STATUS_BLOQUEADOS_PROCESSO.join(',')})`
  const selLead = 'id, nome, fase:fases!fase_id(nome)'
  const selProc = 'id, numero_processo, banco:bancos!banco_id(nome)'

  const [leadsTit, leadsConj, comp, vend] = await Promise.all([
    cliente.from('leads').select(selLead).eq('pessoa_id', pessoaId).is('deleted_at', null).not('status_analise', 'in', fechados),
    cliente.from('leads').select(selLead).eq('conjuge_pessoa_id', pessoaId).is('deleted_at', null).not('status_analise', 'in', fechados),
    cliente.from('processo_compradores').select('processo_id').eq('pessoa_id', pessoaId),
    cliente.from('processo_vendedores').select('processo_id').eq('pessoa_id', pessoaId),
  ])
  const erro = leadsTit.error ?? leadsConj.error ?? comp.error ?? vend.error
  if (erro) throw new Error(`destinos: ${erro.message}`)

  const idsProcDaPessoa = Array.from(new Set([...(comp.data ?? []), ...(vend.data ?? [])].map(r => r.processo_id as string)))
  let procsDaPessoa: ProcRow[] = []
  if (idsProcDaPessoa.length) {
    const { data, error } = await cliente.from('processos').select(selProc)
      .in('id', idsProcDaPessoa).is('deleted_at', null).not('status_processo', 'in', bloqueados)
    if (error) throw new Error(`destinos: ${error.message}`)
    procsDaPessoa = (data ?? []) as unknown as ProcRow[]
  }

  const vistos = new Set<string>()
  const resultado: DestinoVinculo[] = []
  const add = (d: DestinoVinculo) => { if (!vistos.has(d.entidade_id)) { vistos.add(d.entidade_id); resultado.push(d) } }
  for (const l of [...(leadsTit.data ?? []), ...(leadsConj.data ?? [])] as unknown as LeadRow[]) add(paraDestinoLead(l, true))
  for (const p of procsDaPessoa) add(paraDestinoProc(p, true))

  const { numeroProcesso, texto } = interpretarBuscaDestino(busca)
  if (numeroProcesso) {
    const { data, error } = await cliente.from('processos').select(selProc).eq('numero_processo', numeroProcesso).is('deleted_at', null).limit(1)
    if (error) throw new Error(`destinos: ${error.message}`)
    for (const p of (data ?? []) as unknown as ProcRow[]) add(paraDestinoProc(p, idsProcDaPessoa.includes(p.id)))
  } else if (texto) {
    const [leadsBusca, pessoasBusca] = await Promise.all([
      cliente.from('leads').select(selLead).ilike('nome', `%${texto}%`).is('deleted_at', null).not('status_analise', 'in', fechados).limit(LIMITE_BUSCA),
      cliente.from('pessoas').select('id').ilike('nome', `%${texto}%`).is('deleted_at', null).limit(LIMITE_BUSCA),
    ])
    if (leadsBusca.error || pessoasBusca.error) throw new Error(`destinos: ${(leadsBusca.error ?? pessoasBusca.error)!.message}`)
    for (const l of (leadsBusca.data ?? []) as unknown as LeadRow[]) add(paraDestinoLead(l, false))
    const idsPessoas = (pessoasBusca.data ?? []).map(p => p.id as string)
    if (idsPessoas.length) {
      const { data: compBusca, error: eC } = await cliente.from('processo_compradores').select('processo_id').in('pessoa_id', idsPessoas).limit(LIMITE_BUSCA)
      if (eC) throw new Error(`destinos: ${eC.message}`)
      const ids = Array.from(new Set((compBusca ?? []).map(r => r.processo_id as string)))
      if (ids.length) {
        const { data, error } = await cliente.from('processos').select(selProc).in('id', ids).is('deleted_at', null).not('status_processo', 'in', bloqueados)
        if (error) throw new Error(`destinos: ${error.message}`)
        for (const p of (data ?? []) as unknown as ProcRow[]) add(paraDestinoProc(p, idsProcDaPessoa.includes(p.id)))
      }
    }
  }
  return resultado
}
