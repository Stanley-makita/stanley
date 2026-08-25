/**
 * Tipos do Simulador Preliminar de CGI / Home Equity.
 *
 * Módulo isolado do motor de financiamento imobiliário (`simuladorFinanciamento/`) —
 * ver `docs/calibracao-simuladores/` para o levantamento que motivou o isolamento
 * (o Daycoval do financiamento imobiliário é um produto diferente, já calibrado,
 * com taxa/prazo/LTV incompatíveis com este CGI genérico de 5 bancos).
 */

export type BancoCgiId = 'inter' | 'daycoval' | 'cashme' | 'santander' | 'bradesco'
export type SistemaAmortizacaoCgi = 'SAC' | 'PRICE'

export interface InputCgi {
  valorImovel: number
  valorDesejado: number
  /** Ausente → usa PRAZO_MAXIMO_CGI_MESES (240, V1). */
  prazoMeses?: number
  /** Apenas informativo nesta V1 — não usado na elegibilidade. */
  rendaMensal?: number
  /** Apenas informativo nesta V1 — não usado na elegibilidade. */
  idadeAnos?: number
  /** Vazio → simula todos os bancos de `TODOS_BANCOS_CGI`. */
  bancosIds: BancoCgiId[]
}

export interface ResultadoBancoCgi {
  bancoId: BancoCgiId
  bancoNome: string
  cor: string
  corTexto: string
  sistemaAmortizacao: SistemaAmortizacaoCgi
  /** true = taxa pós-fixada (taxa + IPCA), o IPCA não é projetado nesta V1. */
  indexadoIpca: boolean
  valorImovel: number
  valorSolicitado: number
  valorMaximoPeloImovel: number
  valorSimulado: number
  percentualFinanciado: number
  limitadoPeloLtv: boolean
  taxaAnualReferencia: number
  taxaMensal: number
  prazoSolicitado: number
  prazoConsiderado: number
  limitadoPeloPrazo: boolean
  iofEstimado: number
  valorTotalAposIof: number
  /** 1ª parcela — relevante para SAC (decrescente); para PRICE é a parcela fixa. */
  prestacaoEstimada: number
  /** Sempre true nesta V1 — o motor nunca rejeita, só limita e explica. */
  elegivel: boolean
}

export interface ResultadoCgiCompleto {
  input: InputCgi
  bancos: ResultadoBancoCgi[]
  /** "Menor prestação estimada nesta simulação" — nunca chamar de "melhor cenário". */
  bancoMenorPrestacaoId: BancoCgiId | null
  dataSimulacao: string
}
