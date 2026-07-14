export interface CamposFinanceirosProcesso {
  banco_id: string | null
  taxa_juros: number | null
  sistema_amortizacao: string | null
  valor_imovel: number | null
  valor_financiado: number | null
  valor_fgts: number | null
}

/** Verdadeiro quando os dados financeiros obrigatorios do processo estao
 * incompletos ou inconsistentes (imovel nao cobre financiado + FGTS).
 * Usado tanto pra bloquear o clique de avancar fase na UI quanto, de forma
 * obrigatoria, dentro de useAvancarFase — pra nao depender so da trava
 * client-side. */
export function dadosFinanceirosIncompletos(p: CamposFinanceirosProcesso): boolean {
  if (!p.banco_id) return true
  if (!p.taxa_juros || p.taxa_juros <= 0) return true
  if (!p.sistema_amortizacao) return true
  if (!p.valor_imovel || p.valor_imovel <= 0) return true
  if (!p.valor_financiado || p.valor_financiado <= 0) return true
  if (p.valor_fgts === null || p.valor_fgts === undefined) return true
  const recursosProprios = p.valor_imovel - p.valor_financiado - (p.valor_fgts ?? 0)
  if (recursosProprios < 0) return true
  return false
}
