'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'

export type TipoValidade = 'credito' | 'engenharia' | 'matricula'

const COLUNA: Record<TipoValidade, string> = {
  credito:    'validade_credito',
  engenharia: 'validade_engenharia',
  matricula:  'validade_matricula',
}

export const LABEL_VALIDADE: Record<TipoValidade, string> = {
  credito:    'Crédito',
  engenharia: 'Engenharia',
  matricula:  'Matrícula',
}

interface Input {
  processoId: string
  tipo: TipoValidade
  data: string | null
}

export function useSalvarValidadeProcesso() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ processoId, tipo, data }: Input) => {
      const { error } = await supabase
        .from('processos')
        .update({ [COLUNA[tipo]]: data })
        .eq('id', processoId)
      if (error) throw error
    },
    onSuccess: (_, { processoId }) => {
      // Invalida tanto o detalhe individual quanto a lista
      qc.invalidateQueries({ queryKey: ['processos', processoId] })
      qc.invalidateQueries({ queryKey: ['processos'] })
      toast.success('Validade atualizada com sucesso.')
    },
    onError: () => {
      toast.error('Não foi possível atualizar a validade. Tente novamente.')
    },
  })
}
