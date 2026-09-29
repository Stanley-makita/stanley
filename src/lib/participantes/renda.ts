import { PAPEIS_COMPRA, type PapelParticipacao } from './tipos'

export interface RendaComposta {
  formal: number
  informal: number
  total: number
  participantes: Array<{ pessoa_id: string; nome: string; papel: PapelParticipacao; compoe_renda: boolean; formal: number; informal: number }>
}

type Entrada = { papel: PapelParticipacao; compoe_renda: boolean; pessoa: { id: string; nome?: unknown; renda_formal?: unknown; renda_informal?: unknown } }
const num = (v: unknown) => (v == null || v === '' ? 0 : Number(v) || 0)

/** Soma a renda de quem compõe renda no lado da compra. Renda sempre da Pessoa. */
export function rendaComposta(ps: Entrada[]): RendaComposta {
  const participantes = ps.filter(p => PAPEIS_COMPRA.includes(p.papel)).map(p => ({
    pessoa_id: p.pessoa.id, nome: String(p.pessoa.nome ?? ''), papel: p.papel, compoe_renda: p.compoe_renda,
    formal: num(p.pessoa.renda_formal), informal: num(p.pessoa.renda_informal),
  }))
  const somados = participantes.filter(p => p.compoe_renda)
  const formal = somados.reduce((t, p) => t + p.formal, 0)
  const informal = somados.reduce((t, p) => t + p.informal, 0)
  return { formal, informal, total: formal + informal, participantes }
}
