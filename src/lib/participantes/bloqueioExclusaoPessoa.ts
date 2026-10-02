import type { SupabaseClient } from '@supabase/supabase-js'
import { MODALIDADE_LABELS, type ModalidadeProcesso } from '@/types/processos'

// Excluir Pessoa é soft delete, e a sincronização de participantes ignora Pessoa excluída —
// se ela ainda estiver num lead/negócio ativo, a proposta fica sem cliente em silêncio
// (caso real 02/10/2026: #proc-077 de Consórcio). Por isso a exclusão é recusada antes.

export interface PropostaAtiva {
  tipo: 'lead' | 'processo'
  id: string
  rotulo: string
}

type Lead = { id: string; nome: string | null; deleted_at?: string | null }
type Processo = { id: string; numero_processo: string | null; modalidade: string | null; deleted_at?: string | null }

function rotuloProcesso(p: Processo) {
  const modalidade = MODALIDADE_LABELS[p.modalidade as ModalidadeProcesso] ?? p.modalidade ?? 'negócio'
  return `${p.numero_processo ?? 'negócio'} (${modalidade})`
}

export async function propostasAtivasDaPessoa(sb: SupabaseClient, empresaId: string, pessoaId: string): Promise<PropostaAtiva[]> {
  const [parts, procs, leads] = await Promise.all([
    sb.from('participacoes')
      .select('lead:leads(id, nome, deleted_at), processo:processos(id, numero_processo, modalidade, deleted_at)')
      .eq('pessoa_id', pessoaId)
      .eq('empresa_id', empresaId),
    sb.from('processos').select('id, numero_processo, modalidade')
      .eq('pessoa_id', pessoaId).eq('empresa_id', empresaId).is('deleted_at', null),
    sb.from('leads').select('id, nome')
      .eq('pessoa_id', pessoaId).eq('empresa_id', empresaId).is('deleted_at', null),
  ])
  for (const r of [parts, procs, leads]) if (r.error) throw new Error(r.error.message)

  const porChave = new Map<string, PropostaAtiva>()
  const addProcesso = (p: Processo) => porChave.set(`processo:${p.id}`, { tipo: 'processo', id: p.id, rotulo: rotuloProcesso(p) })
  const addLead = (l: Lead) => porChave.set(`lead:${l.id}`, { tipo: 'lead', id: l.id, rotulo: l.nome ?? 'sem nome' })

  for (const linha of (parts.data ?? []) as unknown as Array<{ lead: Lead | null; processo: Processo | null }>) {
    if (linha.processo && !linha.processo.deleted_at) addProcesso(linha.processo)
    if (linha.lead && !linha.lead.deleted_at) addLead(linha.lead)
  }
  for (const p of (procs.data ?? []) as Processo[]) addProcesso(p)
  for (const l of (leads.data ?? []) as Lead[]) addLead(l)

  return Array.from(porChave.values()).sort((a, b) => (a.tipo === b.tipo ? 0 : a.tipo === 'processo' ? -1 : 1))
}

export function mensagemBloqueioExclusao(propostas: PropostaAtiva[]): string | null {
  if (propostas.length === 0) return null
  const itens = propostas.map(p => (p.tipo === 'processo' ? p.rotulo : `lead ${p.rotulo}`))
  return `Esta pessoa ainda está em: ${itens.join(', ')}. Remova-a desses cadastros (ou exclua o negócio/lead) antes de excluir a pessoa.`
}
