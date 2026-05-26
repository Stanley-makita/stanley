export type TipoSolicitacao =
  | 'simulacao' | 'analise_credito' | 'reanalise' | 'engenharia' | 'custas'
  | 'documentos' | 'formalizacao' | 'registro' | 'pendencia' | 'atendimento_cliente' | 'outros'

export type StatusSolicitacao =
  | 'pendente' | 'em_andamento' | 'aguardando_resposta' | 'aguardando_cliente' | 'concluido' | 'cancelado'

export type PrioridadeSolicitacao = 'urgente' | 'alta' | 'normal' | 'baixa'

export interface SolicitacaoMensagem {
  id: string
  autor_id: string
  texto: string
  created_at: string
  autor?: { id: string; nome: string } | null
}

export interface SolicitacaoOperacional {
  id: string
  empresa_id: string
  tipo: TipoSolicitacao
  status: StatusSolicitacao
  prioridade: PrioridadeSolicitacao
  responsavel_id: string | null
  solicitante_id: string
  lead_id: string | null
  processo_id: string | null
  pessoa_id: string | null
  conversa_id: string | null
  titulo: string
  descricao: string | null
  retorno_operacional: string | null
  anexo_retorno_path: string | null
  replica_comercial: string | null
  replica_em: string | null
  sla_at: string | null
  concluido_em: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
  // Joins opcionais
  responsavel?: { id: string; nome: string } | null
  solicitante?: { id: string; nome: string } | null
  lead?: { id: string; nome: string } | null
  processo?: {
    id: string
    nome_imovel: string
    numero_processo: string
    modalidade?: string | null
    banco?: { nome: string } | null
  } | null
  pessoa?: { id: string; nome: string } | null
}

export interface SlaConfigOperacional {
  id: string
  empresa_id: string
  tipo: TipoSolicitacao
  horas_sla: number
  ativo: boolean
}

export const TIPO_LABELS: Record<TipoSolicitacao, string> = {
  simulacao: 'Simulação',
  analise_credito: 'Análise de Crédito',
  reanalise: 'Reanálise',
  engenharia: 'Engenharia',
  custas: 'Custas',
  documentos: 'Documentos',
  formalizacao: 'Formalização',
  registro: 'Registro',
  pendencia: 'Pendência',
  atendimento_cliente: 'Atendimento ao Cliente',
  outros: 'Outros',
}

export const PRIORIDADE_CORES: Record<PrioridadeSolicitacao, string> = {
  urgente: 'bg-red-100 text-red-700 border-red-200',
  alta:    'bg-orange-100 text-orange-700 border-orange-200',
  normal:  'bg-blue-100 text-blue-700 border-blue-200',
  baixa:   'bg-gray-100 text-gray-600 border-gray-200',
}

export const PRIORIDADE_DOT: Record<PrioridadeSolicitacao, string> = {
  urgente: 'bg-red-500',
  alta:    'bg-orange-500',
  normal:  'bg-blue-500',
  baixa:   'bg-gray-400',
}

export const STATUS_CORES: Record<StatusSolicitacao, string> = {
  pendente:             'bg-yellow-100 text-yellow-700',
  em_andamento:         'bg-blue-100 text-blue-700',
  aguardando_resposta:  'bg-purple-100 text-purple-700',
  aguardando_cliente:   'bg-orange-100 text-orange-700',
  concluido:            'bg-green-100 text-green-700',
  cancelado:            'bg-gray-100 text-gray-500',
}

export const STATUS_LABELS: Record<StatusSolicitacao, string> = {
  pendente:             'Pendente',
  em_andamento:         'Em andamento',
  aguardando_resposta:  'Aguardando resposta',
  aguardando_cliente:   'Aguardando cliente',
  concluido:            'Concluído',
  cancelado:            'Cancelado',
}

export interface ContextoSolicitacao {
  nomeCliente?: string
  telefone?: string
  // Lead
  renda?: number | null
  produto?: string | null
  valorPretendido?: number | null
  // Processo
  processoNumero?: string
  processoNomeImovel?: string
  processoModalidade?: string
  processoBanco?: string
  processoFaseAtual?: string | null
  processoValorFinanciado?: number | null
  processoCompradorPrincipal?: string | null
  // Sugestão de responsável
  responsavelSugeridoId?: string | null
}

// SLA padrão em horas por tipo (usado para cálculo visual no frontend)
export const SLA_HORAS_PADRAO: Record<TipoSolicitacao, number> = {
  simulacao:          4,
  analise_credito:    24,
  reanalise:          48,
  engenharia:         72,
  custas:             24,
  documentos:         24,
  formalizacao:       48,
  registro:           72,
  pendencia:          12,
  atendimento_cliente: 4,
  outros:             24,
}
