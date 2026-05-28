'use client'

import { TarefaFormModal, type TarefaFormData } from '@/components/tarefas/TarefaFormModal'
import { useCriarTarefa } from '@/hooks/processos/useProcessoTarefas'
import { useAuth } from '@/hooks/auth/useAuth'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  processoId: string
}

export function NovaTarefaDialog({ open, onOpenChange, processoId }: Props) {
  const { usuario } = useAuth()
  const criar = useCriarTarefa(processoId)

  async function handleSalvar(dados: TarefaFormData) {
    await criar.mutateAsync({
      ...dados,
      responsavel_id: dados.responsavel_id || usuario?.id,
    })
    onOpenChange(false)
  }

  return (
    <TarefaFormModal
      aberto={open}
      onFechar={() => onOpenChange(false)}
      onSalvar={handleSalvar}
      isPending={criar.isPending}
    />
  )
}
