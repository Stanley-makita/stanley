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
  /** ISO YYYY-MM-DD. Usada na regra de idade x prazo (ver LIMITE_IDADE_PRAZO_CGI_MESES em
   * constantes.ts) — idade + prazo não pode ultrapassar 80 anos e 3 meses. Ausente → a
   * regra não é aplicada (banco sempre elegível por idade), com ressalva na resposta/PDF
   * de que o prazo está sujeito à validação pela idade do proponente. Nunca inventar. */
  dataNascimento?: string
  /** Vazio → simula todos os bancos de `TODOS_BANCOS_CGI`. */
  bancosIds: BancoCgiId[]
  /** Opcional — não usado pelo bot, usado pelos simuladores web para persistência em
   * simulacoes_central (mesmo padrão de InputConsorcio). */
  nomeCliente?: string
  cpfCliente?: string
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
  /** null = data de nascimento não informada nesta simulação. */
  dataNascimentoUsada: string | null
  /** Teto de prazo do próprio banco (240 nesta V1). */
  prazoMaximoBanco: number
  /** LIMITE_IDADE_PRAZO_CGI_MESES - idade em meses. null quando dataNascimentoUsada é null;
   * pode ser <= 0 (idade já ultrapassa o limite mesmo com prazo curto). */
  prazoMaximoPorIdade: number | null
  /** min(prazoSolicitado, prazoMaximoBanco, prazoMaximoPorIdade). 0 quando inelegível por idade. */
  prazoConsiderado: number
  limitadoPeloPrazoBanco: boolean
  /** true quando prazoMaximoPorIdade é o fator limitante (e ainda > 0). */
  limitadoPelaIdade: boolean
  iofEstimado: number
  valorTotalAposIof: number
  /** 1ª parcela — relevante para SAC (decrescente); para PRICE é a parcela fixa. 0 quando inelegível. */
  prestacaoEstimada: number
  /** false só quando prazoMaximoPorIdade <= 0 (sem prazo possível pela regra de idade). */
  elegivel: boolean
  /** Preenchido só quando elegivel=false. */
  motivoInelegivel?: string
}

export interface ResultadoCgiCompleto {
  input: InputCgi
  bancos: ResultadoBancoCgi[]
  /** "Menor prestação estimada nesta simulação" — nunca chamar de "melhor cenário". */
  bancoMenorPrestacaoId: BancoCgiId | null
  dataSimulacao: string
}
