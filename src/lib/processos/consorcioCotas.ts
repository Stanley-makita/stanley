// Consórcio: o crédito e a administradora moram nas COTAS (processo_cotas), não em
// processos.valor_financiado/banco_id (campos do financiamento — sempre vazios no consórcio).
// Caso real 03/10/2026: tabela de Negócios › Consórcio com "Valor do Crédito" e "Administradora" em branco.
// Cota cancelada/substituída não conta; sem cota válida, cai nos campos do próprio negócio.
export type CotaResumo = { valor_carta: number | null; administradora_nome: string | null; status_cota: string | null }

const VALIDA = (c: CotaResumo) => c.status_cota !== 'cancelado' && c.status_cota !== 'substituido'

export function creditoConsorcio(p: { cotas?: CotaResumo[] | null; credito_desejado?: number | null }): number | null {
  const validas = (p.cotas ?? []).filter(VALIDA)
  if (validas.length === 0) return p.credito_desejado ?? null
  return validas.reduce((s, c) => s + (c.valor_carta ?? 0), 0)
}

export function administradorasConsorcio(p: { cotas?: CotaResumo[] | null; administradora?: string | null }): string {
  const nomes = Array.from(new Set((p.cotas ?? []).filter(VALIDA).map(c => c.administradora_nome?.trim()).filter(Boolean) as string[]))
  return nomes.length > 0 ? nomes.join(', ') : (p.administradora?.trim() ?? '')
}
