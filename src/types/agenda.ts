export type PrioridadeTarefa = 'alta' | 'media' | 'baixa' | 'urgente'

export type CompromissoLocal = 'sede_fontinhas' | 'externo' | 'online' | 'outro'

export const COMPROMISSO_LOCAL_LABELS: Record<CompromissoLocal, string> = {
  sede_fontinhas: 'Sede Fontinhas',
  externo:        'Externo',
  online:         'Online',
  outro:          'Outro',
}

export interface TarefaAgenda {
  tarefa_id: string
  tarefa_titulo: string
  tarefa_vencimento: string | null  // ISO date
  tarefa_prioridade: PrioridadeTarefa
  concluida: boolean
  concluida_em: string | null
  processo_id: string | null
  processo_nome_imovel: string
  processo_numero: string
  responsavel_id: string
  responsavel_nome: string
  fonte: 'processo' | 'lead' | 'compromisso'
  lead_id?: string | null
  // Só preenchidos quando fonte === 'compromisso' (ver useAgendaTarefas).
  compromisso_local?: CompromissoLocal
  compromisso_descricao?: string | null
  compromisso_hora_inicio?: string | null
  compromisso_hora_fim?: string | null
}
