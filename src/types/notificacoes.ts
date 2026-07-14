import type { LucideIcon } from 'lucide-react'
import {
  CheckSquare, ArrowRight, UserPlus, FileCheck, CreditCard, MessageSquare,
  Bell, UserPlus2, RefreshCcw, FileText, ScanLine, ScanEye, Phone,
  UserRound, StickyNote, ListTodo, Clock, AlertTriangle, DatabaseBackup,
  RefreshCw, Wifi, ShieldAlert,
} from 'lucide-react'

/**
 * Severidade — estilo visual da notificação (cor, ícone de estado, tempo de
 * permanência do toast). Ver DURACAO_POR_SEVERIDADE abaixo.
 */
export type Severidade = 'info' | 'success' | 'warning' | 'error' | 'critical'

/**
 * Prioridade — dado de negócio independente de severidade, para uso futuro em
 * ordenação, filtros e IA. Não controla nenhum estilo visual nesta sprint
 * (não confundir com Severidade, que é sobre aparência do toast/item).
 */
export type Prioridade = 'low' | 'normal' | 'high' | 'critical'

/**
 * Tipos de notificação. Adicionar um tipo novo = adicionar o literal aqui +
 * uma entrada em NOTIFICACAO_META (ícone/cor/severidade/prioridade/label) —
 * nenhuma migration de banco é necessária, `tipo` é TEXT na tabela desde a
 * migration 20260706_150 (ver docs/central-notificacoes.md).
 */
export type TipoNotificacao =
  // Já existentes, com trigger/RPC ativo hoje.
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
  // Novos desta sprint — só infraestrutura (ícone/cor/label prontos); nenhum
  // trigger/lógica de negócio dispara estes automaticamente ainda.
  | 'lead_novo'
  | 'lead_atualizado'
  | 'novo_processo'
  | 'processo_aprovado'
  | 'processo_registrado'
  | 'novo_documento'
  | 'ocr_concluido'
  | 'ocr_com_erro'
  | 'mensagem_whatsapp'
  | 'novo_cliente'
  | 'nova_observacao'
  | 'nova_tarefa'
  | 'prazo_vencendo'
  | 'erro_critico'
  | 'backup'
  | 'sincronizacao'
  | 'usuario_conectado'
  | 'login_suspeito'
  | 'lead_followup_lembrete'

export type EntidadeNotificacao = 'processo' | 'lead' | 'tarefa' | 'lead_tarefa' | 'solicitacao'

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
  severidade: Severidade
  prioridade: Prioridade
  dados_json: Record<string, unknown> | null
  origem: string | null
  criado_em: string
}

export interface NotificacaoMeta {
  icon: LucideIcon
  /** Classe Tailwind de cor de texto/ícone (ex. 'text-red-500'). */
  cor: string
  severidadePadrao: Severidade
  prioridadePadrao: Prioridade
  label: string
}

/**
 * Fonte única de verdade: ícone + cor + severidade padrão + prioridade
 * padrão + rótulo em PT-BR por tipo. `NotificacaoItem`, `ToastNotificacao` e
 * `CentralNotificacoesConteudo` leem só daqui — nenhum mapa duplicado em
 * outro arquivo.
 */
export const NOTIFICACAO_META: Record<TipoNotificacao, NotificacaoMeta> = {
  tarefa_vencida:          { icon: CheckSquare,   cor: 'text-red-500',       severidadePadrao: 'warning',  prioridadePadrao: 'high',     label: 'Tarefa Vencida' },
  tarefa_atribuida:        { icon: CheckSquare,   cor: 'text-blue-500',      severidadePadrao: 'info',     prioridadePadrao: 'normal',   label: 'Tarefa Atribuída' },
  fase_avancada:           { icon: ArrowRight,    cor: 'text-fonti-accent',  severidadePadrao: 'info',     prioridadePadrao: 'normal',   label: 'Fase Avançada' },
  lead_atribuido:          { icon: UserPlus,      cor: 'text-green-600',    severidadePadrao: 'info',     prioridadePadrao: 'normal',   label: 'Lead Atribuído' },
  processo_emitido:        { icon: FileCheck,     cor: 'text-fonti-primary',severidadePadrao: 'success',  prioridadePadrao: 'high',     label: 'Processo Emitido' },
  cobranca_vencida:        { icon: CreditCard,    cor: 'text-red-500',       severidadePadrao: 'error',    prioridadePadrao: 'high',     label: 'Cobrança Vencida' },
  comentario_mencionado:   { icon: MessageSquare, cor: 'text-purple-500',    severidadePadrao: 'info',     prioridadePadrao: 'normal',   label: 'Menção em Comentário' },
  solicitacao_atribuida:   { icon: Bell,          cor: 'text-blue-500',      severidadePadrao: 'info',     prioridadePadrao: 'normal',   label: 'Solicitação Atribuída' },
  solicitacao_concluida:   { icon: CheckSquare,   cor: 'text-green-600',    severidadePadrao: 'success',  prioridadePadrao: 'normal',   label: 'Solicitação Concluída' },
  solicitacao_sla_vencido: { icon: Bell,          cor: 'text-red-500',       severidadePadrao: 'error',    prioridadePadrao: 'high',     label: 'SLA Vencido' },
  solicitacao_respondida:  { icon: MessageSquare, cor: 'text-fonti-accent',  severidadePadrao: 'info',     prioridadePadrao: 'normal',   label: 'Réplica do Comercial' },
  solicitacao_retorno:     { icon: MessageSquare, cor: 'text-blue-500',      severidadePadrao: 'info',     prioridadePadrao: 'normal',   label: 'Retorno Operacional' },

  lead_novo:           { icon: UserPlus2,     cor: 'text-green-600',    severidadePadrao: 'info',    prioridadePadrao: 'high',   label: 'Novo Lead' },
  lead_atualizado:     { icon: RefreshCcw,    cor: 'text-blue-500',     severidadePadrao: 'info',    prioridadePadrao: 'normal', label: 'Lead Atualizado' },
  novo_processo:       { icon: FileText,      cor: 'text-fonti-primary',severidadePadrao: 'info',    prioridadePadrao: 'normal', label: 'Novo Processo' },
  processo_aprovado:   { icon: FileCheck,     cor: 'text-green-600',    severidadePadrao: 'success', prioridadePadrao: 'high',   label: 'Processo Aprovado' },
  processo_registrado: { icon: FileCheck,     cor: 'text-fonti-primary',severidadePadrao: 'success', prioridadePadrao: 'normal', label: 'Processo Registrado' },
  novo_documento:      { icon: FileText,      cor: 'text-blue-500',     severidadePadrao: 'info',    prioridadePadrao: 'normal', label: 'Novo Documento' },
  ocr_concluido:       { icon: ScanLine,      cor: 'text-green-600',    severidadePadrao: 'success', prioridadePadrao: 'normal', label: 'OCR Concluído' },
  ocr_com_erro:        { icon: ScanEye,       cor: 'text-red-500',      severidadePadrao: 'error',   prioridadePadrao: 'high',   label: 'OCR com Erro' },
  mensagem_whatsapp:   { icon: Phone,         cor: 'text-green-500',    severidadePadrao: 'info',    prioridadePadrao: 'normal', label: 'Mensagem WhatsApp' },
  novo_cliente:        { icon: UserRound,     cor: 'text-green-600',    severidadePadrao: 'info',    prioridadePadrao: 'normal', label: 'Novo Cliente' },
  nova_observacao:     { icon: StickyNote,    cor: 'text-yellow-600',   severidadePadrao: 'info',    prioridadePadrao: 'low',    label: 'Nova Observação' },
  nova_tarefa:         { icon: ListTodo,      cor: 'text-blue-500',     severidadePadrao: 'info',    prioridadePadrao: 'normal', label: 'Nova Tarefa' },
  prazo_vencendo:      { icon: Clock,         cor: 'text-orange-500',   severidadePadrao: 'warning', prioridadePadrao: 'high',   label: 'Prazo Vencendo' },
  erro_critico:        { icon: AlertTriangle, cor: 'text-red-600',      severidadePadrao: 'critical',prioridadePadrao: 'critical', label: 'Erro Crítico' },
  backup:              { icon: DatabaseBackup,cor: 'text-gray-500',     severidadePadrao: 'info',    prioridadePadrao: 'low',    label: 'Backup' },
  sincronizacao:       { icon: RefreshCw,     cor: 'text-blue-500',     severidadePadrao: 'info',    prioridadePadrao: 'low',    label: 'Sincronização' },
  usuario_conectado:   { icon: Wifi,          cor: 'text-green-500',    severidadePadrao: 'info',    prioridadePadrao: 'low',    label: 'Usuário Conectado' },
  login_suspeito:      { icon: ShieldAlert,   cor: 'text-red-600',      severidadePadrao: 'critical',prioridadePadrao: 'critical', label: 'Login Suspeito' },
  lead_followup_lembrete: { icon: Clock,      cor: 'text-amber-600',    severidadePadrao: 'warning', prioridadePadrao: 'high',   label: 'Lembrete de Acompanhamento' },
}

/** Tempo de permanência do toast por severidade. `critical` não fecha sozinho. */
export const DURACAO_POR_SEVERIDADE: Record<Severidade, number> = {
  info: 5000,
  success: 5000,
  warning: 8000,
  error: 10000,
  critical: Infinity,
}

export const SEVERIDADE_LABEL: Record<Severidade, string> = {
  info: 'Informação',
  success: 'Sucesso',
  warning: 'Atenção',
  error: 'Erro',
  critical: 'Crítico',
}
