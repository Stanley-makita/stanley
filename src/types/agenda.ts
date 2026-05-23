export type PrioridadeTarefa = 'alta' | 'media' | 'baixa'

export interface TarefaAgenda {
  tarefa_id: string
  tarefa_titulo: string
  tarefa_vencimento: string | null  // ISO date
  tarefa_prioridade: PrioridadeTarefa
  concluida: boolean
  concluida_em: string | null
  processo_id: string
  processo_nome_imovel: string
  processo_numero: string
  responsavel_id: string
  responsavel_nome: string
}