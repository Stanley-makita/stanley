export type TipoAmortizacao = 'SAC' | 'PRICE'

export type BancoId =
  | 'caixa'
  | 'itau'
  | 'bradesco'
  | 'santander'
  | 'bb'
  | 'inter'
  | 'daycoval'

export interface InputFinanciamento {
  valorImovel: number
  valorEntrada: number
  dataNascimento: string // YYYY-MM-DD
  rendaMensal: number
  tipoAmortizacao: TipoAmortizacao
  correntista: boolean
  bancosIds: BancoId[]
  nomeCliente?: string
  cpfCliente?: string
  // Itaú / avançado
  valorAvaliacao?: number       // valor de avaliação bancária (se diferente do valorImovel)
  incorporarItbi?: boolean      // incorporar ITBI no valor financiado
  percentualItbi?: number       // % ITBI sobre valor de compra (padrão 5%)
  dataContratacao?: string      // YYYY-MM-DD — base para cálculo de idade (padrão: hoje)
}

export interface ResultadoBanco {
  resultadoId: string
  bancoId: BancoId
  bancoNome: string
  corBanco: string
  programa: string
  valorFinanciado: number
  maxFinanciavel30: number
  parcelas: number
  primeiraParcela: number
  ultimaParcela: number
  taxaMensal: number
  taxaAnual: number
  totalJuros: number
  totalSeguros: number
  totalPago: number
  tipoAmortizacao: TipoAmortizacao
  elegivel: boolean
  motivoInelegivel?: string
}

export interface AnalisePredicativa {
  score: number // 0–100
  classificacao: 'alta' | 'moderada' | 'baixa' | 'improvavel'
  fatores: Array<{
    descricao: string
    impacto: 'positivo' | 'negativo' | 'critico'
  }>
  comprometimentoRenda: number // %
  maxFinanciavel: number
  rendaMinimaNecessaria: number
}

export interface ResultadoCompleto {
  input: InputFinanciamento
  bancos: ResultadoBanco[]
  analise: AnalisePredicativa
  dataSimulacao: string
}
