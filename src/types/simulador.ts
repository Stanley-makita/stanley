export type TipoImovel = 'Residencial' | 'Comercial'

export type Modalidade =
  | 'aquisicao_pronto'     // Aquisição Imóvel Pronto
  | 'terreno_construcao'   // Terreno e Construção
  | 'construcao_proprio'   // Construção em Terreno Próprio
  | 'aquisicao_terreno'    // Aquisição de Terreno
  | 'cgi'                  // CGI

export const MODALIDADE_LABELS: Record<Modalidade, string> = {
  aquisicao_pronto: 'Aquisição Imóvel Pronto',
  terreno_construcao: 'Terreno e Construção',
  construcao_proprio: 'Construção em Terreno Próprio',
  aquisicao_terreno: 'Aquisição de Terreno',
  cgi: 'CGI',
}

export type Produto = 'SBPE' | 'PMCMV' | 'Pro_Cotista'
export type SimNaoPerguntar = 'sim' | 'nao' | 'perguntar'

export interface EntradaSimulador {
  tipoImovel: TipoImovel
  cidade: string
  valorCV: number            // Valor de Compra e Venda
  valorFinanciado: number
  valorTerreno: number       // só para Terreno e Construção
  servicoRegistro: number
  valorCertidoes: number
  contratoParticular: number
  primeiraAquisicao: SimNaoPerguntar
  isentoFunRejus: SimNaoPerguntar
  banco: string
  modalidade: Modalidade
  produto: Produto
  iof: number
  iofVisivel: boolean
}

export interface LinhaResultado {
  id: string
  label: string
  semDesconto: number
  comDesconto: number
  visivel: boolean
  descricaoPDF: string
}

export interface ResultadoSimulador {
  entrada: EntradaSimulador
  linhas: LinhaResultado[]
  totalSemDesconto: number
  totalComDesconto: number
  percentualSemDesconto: number
  percentualComDesconto: number
}

// ── Config DB types ────────────────────────────────────────────────────────

export interface SimuladorItbiConfig {
  id?: string
  municipio: string
  aliquota: number
  temDesconto: boolean
  aliquotaDesconto?: number
  limiteDesconto?: number
}

export interface SimuladorCustasConfig {
  id?: string
  bancoNome: string
  tipo: 'residencial' | 'comercial'
  valor: number
}

export interface SimuladorConfigGeral {
  funrejus_percentual: number
  funrejus_minimo: number
  funrejus_maximo: number
  registro_percentual: number
  iof_percentual: number
  engenharia_caixa: number
  reciprocidade_r1_limite: number
  reciprocidade_r1_valor: number
  reciprocidade_r2_limite: number
  reciprocidade_r2_valor: number
  reciprocidade_r3_limite: number
  reciprocidade_r3_valor: number
  reciprocidade_r4_limite: number
  reciprocidade_r4_valor: number
  reciprocidade_r5_limite: number
  reciprocidade_r5_valor: number
  reciprocidade_r6_limite: number
  reciprocidade_r6_valor: number
  reciprocidade_r7_valor: number
}

export const SIMULADOR_CONFIG_DEFAULTS: SimuladorConfigGeral = {
  funrejus_percentual: 0.002,
  funrejus_minimo: 0,
  funrejus_maximo: Infinity,
  registro_percentual: 0.01,
  iof_percentual: 0.0038,
  engenharia_caixa: 750,
  reciprocidade_r1_limite: 100000,   reciprocidade_r1_valor: 3500,
  reciprocidade_r2_limite: 150000,   reciprocidade_r2_valor: 4500,
  reciprocidade_r3_limite: 200000,   reciprocidade_r3_valor: 5000,
  reciprocidade_r4_limite: 250000,   reciprocidade_r4_valor: 5800,
  reciprocidade_r5_limite: 300000,   reciprocidade_r5_valor: 6500,
  reciprocidade_r6_limite: 350000,   reciprocidade_r6_valor: 7000,
  reciprocidade_r7_valor: 8000,
}

export interface ProcessoCustasSimulacao {
  id: string
  processo_id: string | null
  lead_id: string | null
  banco_nome: string
  municipio: string
  valor_imovel: number
  valor_financiado: number
  tem_desconto_itbi: boolean
  resultado_json: ResultadoSimulador
  total_custas: number
  created_at: string
}
