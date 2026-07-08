export type TipoAmortizacao = 'SAC' | 'PRICE'
export type TipoImovel = 'novo' | 'usado'
export type FinalidadeImovel = 'residencial' | 'comercial'

export type TipoOperacao =
  | 'aquisicao'                    // aquisição imóvel pronto (padrão)
  | 'comercial'                    // imóvel comercial / misto
  | 'lote_urbanizado'              // terreno / lote / data / gleba isolado
  | 'construcao_terreno_proprio'   // cliente já tem o terreno, vai construir
  | 'terreno_mais_construcao'      // compra o terreno e executa obra

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
  // false quando o cliente não informou renda (rendaMensal é 0 só por ausência de dado,
  // não porque a renda real é zero). undefined é tratado como true (renda informada) —
  // preserva o comportamento do formulário manual do simulador, que sempre informa renda.
  rendaInformada?: boolean
  // true quando a idade usada no cálculo não veio de uma data de nascimento completa e
  // confirmada (ex.: cliente informou só "32 anos", ou "prazo máximo" foi pedido sem
  // nascimento e o Motor assumiu uma idade compatível). Prazo, parcela e elegibilidade
  // calculados a partir dela são estimativas, não dado documental confirmado.
  idadeEstimada?: boolean
  tipoAmortizacao: TipoAmortizacao
  // Amortização específica por banco — só preenchido quando o pedido tinha amortizações
  // diferentes por banco (ex.: "Itaú sac, Caixa sac e price"). Um banco ausente do mapa
  // usa `tipoAmortizacao` (o padrão/global) como fallback. Lido só em simularTodosBancos.
  amortizacaoPorBanco?: Partial<Record<BancoId, TipoAmortizacao>>
  correntista: boolean
  bancosIds: BancoId[]
  nomeCliente?: string
  cpfCliente?: string
  // Tipo de operação — define a modalidade e controla elegibilidade por banco
  tipoOperacao?: TipoOperacao
  // Características do imóvel
  tipoImovel?: TipoImovel         // novo ou usado — afeta LTV Caixa (usado = -10pp)
  finalidade?: FinalidadeImovel   // residencial = elegível MCMV; comercial = SBPE apenas
  // Valores decompostos para operações de construção (substituem valorImovel no input bruto)
  valorTerreno?: number           // valor do terreno (próprio ou a comprar)
  valorObra?: number              // orçamento estimado da obra
  // FGTS / elegibilidade MCMV
  usaFgts?: boolean               // 3+ anos FGTS → Pró-Cotista elegível
  jaRecebeuSubsidio?: boolean     // true → bloqueia MCMV
  // Itaú / avançado
  valorAvaliacao?: number         // valor de avaliação bancária (se diferente do valorImovel)
  incorporarItbi?: boolean        // incorporar ITBI no valor financiado
  percentualItbi?: number         // % ITBI sobre valor de compra (padrão 5%)
  dataContratacao?: string        // YYYY-MM-DD — base para cálculo de idade (padrão: hoje)
  // Prazo customizado pedido pelo operador no formulário manual do simulador — não lido
  // pelo motor diretamente; o chamador (SimuladorFinanciamento.tsx) o transforma num
  // BancoSimOverrides.prazoMaximoMeses por banco antes de chamar simularTodosBancos,
  // mesmo padrão já usado pelo fluxo de WhatsApp (motor-simulacao.ts, dados.prazo_meses).
  // undefined = calcula o prazo máximo permitido por banco (comportamento padrão).
  prazoMeses?: number
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
  observacao?: string              // nota contextual por modalidade (lote, construção, comercial)
}

export interface AnalisePredicativa {
  score: number // 0–100
  classificacao: 'alta' | 'moderada' | 'baixa' | 'improvavel'
  fatores: Array<{
    descricao: string
    impacto: 'positivo' | 'negativo' | 'critico'
  }>
  comprometimentoRenda: number | null // %; null quando a renda não foi informada
  maxFinanciavel: number | null       // null quando a renda não foi informada
  rendaMinimaNecessaria: number
}

export interface ResultadoCompleto {
  input: InputFinanciamento
  bancos: ResultadoBanco[]
  analise: AnalisePredicativa
  dataSimulacao: string
}
