export type ModalidadeProcesso =
  | 'SFI' | 'SBPE' | 'PMCMV' | 'Pro_Cotista' | 'CGI' | 'Contrato' | 'Consorcio' | 'Registro'

export type StatusEmissao = 'emitido' | 'nao_emitido'
export type ChanceEmissao = 'certeza' | 'incerteza'
export type StatusProcesso = 'em_analise' | 'aprovado' | 'pendente' | 'reprovado' | 'cancelado'

export type TipoContrato =
  | 'compra_venda' | 'locacao' | 'permuta' | 'cessao_direitos'
  | 'confissao_divida' | 'distrato' | 'aditivo' | 'prestacao_servico' | 'outros'

export const TIPO_CONTRATO_LABELS: Record<TipoContrato, string> = {
  compra_venda:      'Compra e Venda',
  locacao:           'Locação',
  permuta:           'Permuta',
  cessao_direitos:   'Cessão de Direitos',
  confissao_divida:  'Confissão de Dívida',
  distrato:          'Distrato',
  aditivo:           'Aditivo',
  prestacao_servico: 'Prestação de Serviço',
  outros:            'Outros',
}

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
  valor_fgts?: number | null
  valor_recursos_proprios?: number | null
  taxa_juros?: number | null
  // Validades
  validade_credito?: string | null
  validade_engenharia?: string | null
  validade_matricula?: string | null
  // Data em que o crédito foi aprovado — referência da Validade do Crédito,
  // mas o operador escolhe se uma nova aprovação atualiza a validade ou não
  // (ver Aba Crédito de Processos)
  data_credito?: string | null
  // Banco
  banco_id: string | null
  // Contrato
  tipo_contrato?: TipoContrato | null
  valor_contrato?: number | null
  numero_contrato?: string | null
  data_contrato?: string | null
  // Assessoria
  tem_assessoria: boolean
  valor_assessoria?: number | null
  comissao_comercial: number | null
  comissao_empresa: number | null
  comissao_juridico?: number | null
  // Computed columns (funções SQL comissao_comercial_calculada/comissao_empresa_calculada,
  // migration 237) — NULL antes de status_emissao='emitido'; comercial vem da regra
  // do RH (faixa de produção mensal), empresa vem de comissoes_padrao (banco).
  comissao_comercial_calculada?: number | null
  comissao_empresa_calculada?: number | null
  // Responsáveis
  operacional_id: string | null
  comercial_id: string | null
  juridico_id?: string | null
  corretor_nome: string | null
  corretor_creci: string | null
  // Origem comercial (fotografia do Lead no momento da criação)
  parceiro_id?: string | null
  origem?: string | null
  campanha?: string | null
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
  bem_referencia_descricao?: string | null
  parcela_reduzida_percentual?: number | null
  prazo_grupo_meses?: number | null
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
  data_emissao?: string | null
  enviado_conformidade_em?: string | null
  conformidade_aprovada_em?: string | null
  conformidade_reprovada_em?: string | null
  // Fluxo Registro <-> Liberação de Recursos (troca de modalidade, ver
  // useEnviarParaFluxoRegistro/useEnviarParaLiberacaoRecursos)
  modalidade_origem?: ModalidadeProcesso | null
  assinado_em?: string | null
  // Checklist item com acao_ao_completar='processo_concluido' marcado — trava
  // o processo (só leitura) e exibe o status "Processo Concluído".
  concluido_em?: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
  // Joins
  banco?: { id: string; nome: string } | null
  operacional?: { id: string; nome: string; email: string } | null
  comercial?: { id: string; nome: string; email: string } | null
  juridico?: { id: string; nome: string; email: string } | null
  fase_atual?: { id: string; nome: string; cor: string | null } | null
  compradores?: { id: string; nome: string; cpf: string | null; telefone: string | null; principal: boolean; pessoa_id: string | null }[]
  vendedores?:  { id: string; nome: string; cpf: string | null }[]
  parceiro?: { id: string; nome: string; tipo_parceiro: string | null; imobiliaria: string | null } | null
  corretores?:  { id: string; papel: string; principal: boolean; corretor?: { id: string; nome: string } | null }[]
  imobiliarias?: { id: string; papel: string; imobiliaria?: { id: string; nome: string } | null }[]
}

export interface ProcessoComentario {
  id: string
  processo_id: string
  empresa_id: string
  usuario_id: string | null
  tipo: 'observacao' | 'alteracao' | 'solicitacao' | 'comunicacao_cliente'
  texto: string
  notificar_cliente: boolean
  created_at: string
  usuario?: { nome: string } | null
  anexos?: import('@/lib/documentos/anexoEntidade').AnexoEntidade[]
}

export interface ProcessoTarefa {
  id: string
  processo_id: string
  empresa_id: string
  titulo: string
  descricao?: string | null
  categoria?: string | null
  prioridade: 'alta' | 'media' | 'baixa' | 'urgente'
  status: 'pendente' | 'em_andamento' | 'concluida'
  concluida: boolean
  concluida_em: string | null
  responsavel_id: string | null
  data_prazo: string | null
  horario_inicio?: string | null
  horario_termino?: string | null
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

export interface PessoaDetalhes {
  rg: string | null
  registro_cnh: string | null
  profissao: string | null
  nacionalidade: string | null
  data_nascimento: string | null
  data_emissao: string | null
  orgao_emissor: string | null
  estado_civil: string | null
  regime_casamento: string | null
  data_casamento: string | null
  conjuge_nome: string | null
  conjuge_cpf: string | null
  conjuge_data_nascimento: string | null
  endereco_rua: string | null
  endereco_numero: string | null
  endereco_bairro: string | null
  endereco_cidade: string | null
  endereco_uf: string | null
  endereco_cep: string | null
}

export interface ProcessoComprador {
  id: string
  processo_id: string
  empresa_id: string
  pessoa_id?: string | null
  nome: string
  cpf: string | null
  email: string | null
  telefone: string | null
  renda_mensal: number | null
  principal: boolean
  created_at: string
  pessoa?: PessoaDetalhes | null
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
  pessoa_id?: string | null
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
  pessoa?: PessoaDetalhes | null
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
