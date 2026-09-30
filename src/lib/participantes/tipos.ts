/** Participantes V2 (spec 2026-09-28-participantes-v2-design.md). */
export type PapelParticipacao = 'titular' | 'coparticipante' | 'conjuge_anuente' | 'vendedor' | 'conjuge_vendedor'

export const PAPEIS_COMPRA: readonly PapelParticipacao[] = ['titular', 'coparticipante', 'conjuge_anuente']
export const PAPEIS_VENDA: readonly PapelParticipacao[] = ['vendedor', 'conjuge_vendedor']

export type PropostaRef = { tipo: 'lead' | 'processo'; id: string }

export interface RelacionamentoVigente {
  id: string
  pessoa_a_id: string
  pessoa_b_id: string
  tipo: 'casamento' | 'uniao_estavel'
  regime_bens: string | null
  data_inicio: string | null
}

export type PessoaRow = Record<string, unknown> & { id: string }

export interface ParticipanteCarregado {
  participacao_id: string
  papel: PapelParticipacao
  compoe_renda: boolean
  ordem: number
  pessoa: PessoaRow
  conjuge: { pessoa: PessoaRow; relacionamento: RelacionamentoVigente } | null
}
