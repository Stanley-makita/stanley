export type ModalidadeProcesso =
  | 'SFI' | 'SBPE' | 'PMCMV' | 'Pro_Cotista' | 'CGI' | 'Contrato' | 'Consorcio' | 'Registro'

export type StatusEmissao = 'emitido' | 'nao_emitido'
export type ChanceEmissao = 'certeza' | 'incerteza'
export type StatusProcesso = 'em_analise' | 'aprovado' | 'pendente' | 'reprovado' | 'cancelado'

export interface Processo {
  id: string
  empresa_id: string
  numero_processo: string
  numero_proposta?: string | null
  lead_id?: string | null
  pessoa_id?: string | null
  nome_imovel: string
  modalidade: ModalidadeProcesso
  status_processo: StatusProcesso
  status_emissao: StatusEmissao
  chance_emissao: ChanceEmissao
  // Valores
  valor_imovel: number | null
  valor_financiado: number | null
  valor_entrada: number | null
  // Banco
  banco_id: string | null
  // Contrato
  numero_contrato?: string | null
  data_contrato?: string | null
  // Assessoria
  tem_assessoria: boolean
  valor_assessoria?: number | null
  comissao_comercial: number | null
  comissao_empresa: number | null
  // Responsáveis
  operacional_id: string | null
  comercial_id: string | null
  juridico_id?: string | null
  corretor_nome: string | null
  corretor_creci: string | null
  // Consórcio
  administradora?: string | null
  grupo_consorcio?: string | null
  cota_consorcio?: string | null
  valor_carta?: number | null
  parcela_consorcio?: number | null
  prazo_meses?: number | null
  credito_desejado?: number | null
  carta_sugerida?: number | null
  justificativa_carta?: string | null
  // Imóvel vinculado (referência + campos denormalizados editáveis por processo)
  imovel_id?: string | null
  imovel_matricula?: string | null
  imovel_tipo?: string | null
  imovel_categoria?: string | null
  imovel_area_construida?: number | null
  imovel_area_terreno?: number | null
  imovel_rua?: string | null
  imovel_numero?: string | null
  imovel_complemento?: string | null
  imovel_bairro?: string | null
  imovel_cidade?: string | null
  imovel_uf?: string | null
  imovel_registro_id?: string | null
  // Fases e datas
  fase_atual_id: string | null
  data_inicio: string
  created_at: string
  updated_at: string
  deleted_at: string | null
  // Joins
  banco?: { id: string; nome: string } | null
  operacional?: { id: string; nome: string; email: string } | null
  comercial?: { id: string; nome: string; email: string } | null
  juridico?: { id: string; nome: string; email: string } | null
  fase_atual?: { id: string; nome: string; cor: string | null } | null
  compradores?: { id: string; nome: string; cpf: string | null; principal: boolean }[]
  vendedores?:  { id: string; nome: string; cpf: string | null }[]
}

export interface ProcessoComentario {
  id: string
  processo_id: string
  empresa_id: string
  usuario_id: string | null
  tipo: 'observacao' | 'alteracao' | 'solicitacao'
  texto: string
  notificar_cliente: boolean
  created_at: string
  usuario?: { nome: string } | null
}

export interface ProcessoTarefa {
  id: string
  processo_id: string
  empresa_id: string
  titulo: string
  prioridade: 'alta' | 'media' | 'baixa'
  status: 'pendente' | 'em_andamento' | 'concluida'
  concluida: boolean
  concluida_em: string | null
  responsavel_id: string | null
  data_prazo: string | null
  created_at: string
  updated_at: string
  responsavel?: { nome: string } | null
}

export interface ProcessoCobranca {
  id: string
  processo_id: string
  empresa_id: string
  usuario_id: string | null
  descricao: string
  valor: number
  data_vencimento: string
  data_pagamento: string | null
  status: 'pendente' | 'pago' | 'cancelado'
  created_at: string
}

export interface ProcessoComprador {
  id: string
  processo_id: string
  empresa_id: string
  nome: string
  cpf: string | null
  email: string | null
  telefone: string | null
  renda_mensal: number | null
  principal: boolean
  created_at: string
}

export interface ProcessoFinanceiro {
  id: string
  empresa_id: string
  processo_id: string
  descricao: string
  valor: number
  tipo: 'receita_empresa' | 'custo_empresa' | 'repasse_cliente' | 'deposito_cliente'
  situacao: 'pendente' | 'pago' | 'cancelado'
  pago_em: string | null
  observacao: string | null
  criado_por: string | null
  created_at: string
  updated_at: string
}

export interface ProcessoVendedor {
  id: string
  processo_id: string
  empresa_id: string
  nome: string
  cpf: string | null
  email: string | null
  telefone: string | null
  banco: string | null
  agencia: string | null
  conta: string | null
  estado_civil: string | null
  conjuge_nome: string | null
  conjuge_cpf: string | null
  conjuge_rg: string | null
  conjuge_data_nasc: string | null
  conjuge_papel: 'conjuge' | 'proprietario' | null
  created_at: string
}

export interface ProcessoSimulacao {
  id: string
  processo_id: string
  empresa_id: string
  descricao: string
  arquivo_path: string | null
  arquivo_nome: string | null
  arquivo_mime: string | null
  criado_em: string
  usuario_id: string | null
  usuario?: { nome: string } | null
}

export interface ProcessoFaseHistorico {
  id: string
  processo_id: string
  fase_id: string
  usuario_id: string | null
  entrou_em: string
  observacao: string | null
  fase?: { id: string; nome: string; cor: string | null } | null
  usuario?: { nome: string } | null
}

export type TimelineItem =
  | { tipo: 'comentario'; data: string; payload: ProcessoComentario }
  | { tipo: 'fase'; data: string; payload: ProcessoFaseHistorico }
  | { tipo: 'tarefa_criada'; data: string; payload: ProcessoTarefa }
  | { tipo: 'tarefa_concluida'; data: string; payload: ProcessoTarefa }

export interface ProcessoMovimento {
  id: string
  processo_id: string
  empresa_id: string
  usuario_id: string | null
  tipo: 'credito' | 'debito'
  descricao: string
  valor: number
  data_movimento: string
  created_at: string
  usuario?: { nome: string } | null
}

export interface ProcessoCusta {
  id: string
  processo_id: string
  empresa_id: string
  usuario_id: string | null
  descricao: string
  valor: number
  data_custa: string
  pago: boolean
  created_at: string
}

export interface ResumoEstoque {
  certeza_total: number
  certeza_valor: number
  incerteza_total: number
  incerteza_valor: number
  total_estoque: number
  total_valor: number
}

export interface PerformanceBanco {
  banco_nome: string
  banco_cor: string | null
  realizado: number
  percentual_valor: number
  num_contratos: number
  percentual_contratos: number
}

export interface EmissaoSemana {
  emitidos: number
  producao: number
  emitidos_ate: string
  percentual_valor: number
  percentual_contratos: number
}
