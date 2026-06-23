export type TipoAmortizacao = 'SAC' | 'PRICE'
export type TipoImovel = 'novo' | 'usado'
export type FinalidadeImovel = 'residencial' | 'comercial'

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
  // Características do imóvel
  tipoImovel?: TipoImovel         // novo ou usado — afeta LTV Caixa (usado = -10pp)
  finalidade?: FinalidadeImovel   // residencial = elegível MCMV; comercial = SBPE apenas
  // FGTS / elegibilidade MCMV
  usaFgts?: boolean               // 3+ anos FGTS → Pró-Cotista elegível
  jaRecebeuSubsidio?: boolean     // true → bloqueia MCMV
  // Itaú / avançado
  valorAvaliacao?: number         // valor de avaliação bancária (se diferente do valorImovel)
  incorporarItbi?: boolean        // incorporar ITBI no valor financiado
  percentualItbi?: number         // % ITBI sobre valor de compra (padrão 5%)
  dataContratacao?: string        // YYYY-MM-DD — base para cálculo de idade (padrão: hoje)
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
  avisoRenda?: boolean
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
