export type StatusComissao = 'a_receber' | 'recebido' | 'cancelado'
export type TipoLancamento = 'receita' | 'despesa'

export interface Comissao {
  id: string
  empresa_id: string
  processo_id: string
  comercial_id: string
  valor_bruto: number
  percentual_comercial: number
  valor_comercial: number
  valor_empresa: number
  status: StatusComissao
  data_emissao: string
  data_recebimento: string | null
  competencia_mes: number
  competencia_ano: number
  observacao: string | null
  created_at: string
  updated_at: string
  // Joins
  processo?: { numero_processo: string; nome_imovel: string; banco?: { nome: string; cor: string | null } }
  comercial?: { nome: string }
}

export interface FinanceiroLancamento {
  id: string
  empresa_id: string
  tipo: TipoLancamento
  categoria: string
  descricao: string
  valor: number
  data_lancamento: string
  competencia_mes: number
  competencia_ano: number
  usuario_id: string
  created_at: string
  updated_at: string
  usuario?: { nome: string }
}

export interface KpisFinanceiro {
  receita_mes: number
  a_receber: number
  despesas_mes: number
  resultado_liquido: number
}

export interface RelatorioComercial {
  comercial_id: string
  comercial_nome: string
  num_contratos: number
  valor_emitido: number
  comissao_gerada: number
  comissao_recebida: number
}