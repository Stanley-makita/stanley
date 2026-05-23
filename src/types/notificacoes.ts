export type TipoNotificacao =
  | 'tarefa_vencida'
  | 'tarefa_atribuida'
  | 'fase_avancada'
  | 'lead_atribuido'
  | 'processo_emitido'
  | 'cobranca_vencida'
  | 'comentario_mencionado'
  | 'solicitacao_atribuida'
  | 'solicitacao_concluida'
  | 'solicitacao_sla_vencido'
  | 'solicitacao_respondida'
  | 'solicitacao_retorno'

export type EntidadeNotificacao = 'processo' | 'lead' | 'tarefa' | 'solicitacao'

export interface Notificacao {
  id: string
  empresa_id: string
  usuario_id: string
  tipo: TipoNotificacao
  titulo: string
  mensagem: string | null
  lida: boolean
  lida_em: string | null
  entidade: EntidadeNotificacao | null
  entidade_id: string | null
  criado_em: string
}