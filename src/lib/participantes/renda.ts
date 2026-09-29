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

/**
 * Renda total considerando uma edição em andamento (não salva) da renda do cônjuge —
 * usado pra manter o feedback "ao vivo" do total no rodapé enquanto o usuário digita,
 * sem esperar o save + refetch de `useParticipantes`.
 *
 * `edicao` null = sem edição em andamento, usa só o que já veio do servidor.
 * Com edição: se já existe um participante `conjuge_anuente`, substitui a renda dele
 * pelos valores digitados e recalcula `compoe_renda` como `renda > 0` (mesma regra que
 * `salvarRendaConjuge` vai persistir). Se ainda não existe (`casado` mas sem participação
 * cadastrada), soma os valores digitados direto — ele passará a existir só depois do save.
 */
export function rendaTotalComEdicaoConjuge(
  ps: Entrada[],
  edicao: { formal: number; informal: number } | null,
): number {
  if (!edicao) return rendaComposta(ps).total
  const { formal, informal } = edicao
  const idx = ps.findIndex(p => p.papel === 'conjuge_anuente')
  if (idx === -1) return rendaComposta(ps).total + formal + informal
  const ajustados = ps.map((p, i) =>
    i === idx
      ? { ...p, compoe_renda: formal + informal > 0, pessoa: { ...p.pessoa, renda_formal: formal, renda_informal: informal } }
      : p,
  )
  return rendaComposta(ajustados).total
}
