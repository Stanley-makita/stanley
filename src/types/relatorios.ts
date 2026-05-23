export interface ProducaoMensal {
  mes: number
  emissoes: number
  valor_total: number
  leads_criados: number
  leads_convertidos: number
}

export interface RelatorioBanco {
  banco_id: string
  banco_nome: string
  num_contratos: number
  valor_total: number
  pct_total: number
  ticket_medio: number
  comissao_gerada: number
}

export interface RelatorioModalidade {
  modalidade: string
  num_contratos: number
  valor_total: number
  pct_total: number
}

export interface RelatorioEquipeMembro {
  comercial_id: string
  comercial_nome: string
  posicao: number
  num_contratos: number
  valor_emitido: number
  comissao: number
  leads_criados: number
  leads_convertidos: number
  taxa_conversao: number
}

export interface PeriodoRelatorio {
  dataInicio: string // ISO date YYYY-MM-DD
  dataFim: string
}