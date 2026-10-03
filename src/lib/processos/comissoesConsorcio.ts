// Comissão do consórcio na tabela de Negócios (03/10/2026): vem do FLUXO FINANCEIRO do consórcio
// (gerar_fluxo_financeiro_consorcio), não de comissao_*_calculada (funções do financiamento — sempre
// nulas no consórcio: não tem banco, e a do comercial pula Consorcio de propósito).
//   Empresa   = soma das parcelas a receber da administradora (% de Configurações › Comissões Consórcio)
//   Comercial = soma das parcelas a pagar ao comercial (regra de Consórcio do RH; sem ela, % da config)
export type ComissoesConsorcio = Record<string, { empresa: number; comercial: number }>

export function somarComissoesConsorcio(
  receber: { processo_id: string; valor_parcela: number | string | null }[],
  pagar: { processo_id: string; valor_parcela: number | string | null }[],
): ComissoesConsorcio {
  const mapa: ComissoesConsorcio = {}
  const item = (id: string) => (mapa[id] ??= { empresa: 0, comercial: 0 })
  for (const r of receber) item(r.processo_id).empresa += Number(r.valor_parcela ?? 0)
  for (const r of pagar) item(r.processo_id).comercial += Number(r.valor_parcela ?? 0)
  for (const v of Object.values(mapa)) {
    v.empresa = Math.round(v.empresa * 100) / 100
    v.comercial = Math.round(v.comercial * 100) / 100
  }
  return mapa
}
