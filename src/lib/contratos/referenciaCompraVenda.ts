import { TEMPLATE_COMPRA_VENDA } from './templates/compra-venda'
import { CLAUSULAS_PROTEGIDAS_COMPRA_VENDA, CHAVES_CLAUSULAS_PROTEGIDAS } from './clausulasProtegidas'
import type { ResumoNegociacao } from './entenderNegociacao'

/** Fonte do suplemento: Contrato Carolina e Bruna (Wagner), cláusula 2, §1.
 * Não transportar dados pessoais, contas, valores ou certidões do negócio anterior.
 * O acervo completo ainda não é indexado; esta referência é explícita e versionada.
 */
export const REFERENCIA_COMPRA_VENDA = {
  id: 'compra_venda_fontinhas',
  versao: '2026-09-29',
  fonte: 'Modelo interno de compra e venda; financiamento: Contrato Carolina e Bruna (Wagner)',
} as const

export const PARAGRAFO_FINANCIAMENTO = `<p><strong>Parágrafo Primeiro:</strong> Excluem-se as partes de quaisquer responsabilidades cíveis e penais, na hipótese de negativa do agente financeiro em liberar o crédito imobiliário que será utilizado na amortização do preço desta avença, por razão relativa ao crédito (vencimento ou não aprovação do crédito em nome dos compradores), ao imóvel (avaliação menor ou não aprovação do imóvel), por qualquer evento ocorrido junto ao mencionado agente financeiro que venha a bloquear ou atrasar tal transação (recursos para financiamento, quaisquer tipos de atrasos involuntários, ocasionados pelo agente financiador, credor fiduciário ou cartório de registro de imóveis) ou ainda por qualquer certidão positiva em nome do vendedor, do imóvel ou bloqueio judicial, que possam acarretar em riscos à operação. Ocorrendo alguma dessas hipóteses, não será constituída inadimplência, podendo as partes optarem pela rescisão do presente instrumento, sem que seja devido entre eles, qualquer importância a título de multa e/ou indenização.</p>`

export function temFinanciamento(resumo: ResumoNegociacao): boolean {
  return (resumo.valor_financiado ?? 0) > 0 || /^financiado$/i.test(resumo.saldo?.trim() ?? '')
}

export function modeloParaRedacao(resumo: ResumoNegociacao): string {
  let html = TEMPLATE_COMPRA_VENDA.conteudo
  for (const chave of CHAVES_CLAUSULAS_PROTEGIDAS) {
    html = html.replace(CLAUSULAS_PROTEGIDAS_COMPRA_VENDA[chave], `{{PROTEGIDA:${chave}}}`)
  }
  if (resumo.condicao_posse?.trim()) {
    html = html.replace('{{data_posse}}{{condicao_posse_evento}}', '{{DADO:CONDICAO_POSSE}}')
  }
  if (temFinanciamento(resumo)) {
    html = html.replace('{{clausula_pagamento_observacoes}}', `${PARAGRAFO_FINANCIAMENTO}\n{{clausula_pagamento_observacoes}}`)
  }
  return html
}
