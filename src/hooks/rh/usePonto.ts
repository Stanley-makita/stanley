'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import type { RhPonto } from '@/types/rh'

export function usePonto(data: string) {
  const { usuario } = useAuth()
  return useQuery({
    queryKey: ['rh', 'ponto', usuario?.empresa_id, data],
    enabled: !!usuario && !!data,
    queryFn: async (): Promise<RhPonto[]> => {
      const { data: rows, error } = await supabase.from('rh_ponto')
        .select('*, funcionario:rh_funcionarios(id, nome)')
        .eq('empresa_id', usuario!.empresa_id)
        .eq('data', data)
        .order('funcionario_id')
      if (error) throw error
      return (rows ?? []) as unknown as RhPonto[]
    },
  })
}

type CampoHorario = 'entrada' | 'inicio_intervalo' | 'fim_intervalo' | 'saida'

export function useRegistrarPonto() {
  const { usuario } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      funcionario_id,
      data,
      campo,
      horario,
    }: {
      funcionario_id: string
      data: string
      campo: CampoHorario
      horario: string
    }) => {
      const { error } = await supabase.from('rh_ponto').upsert(
        {
          empresa_id: usuario!.empresa_id,
          funcionario_id,
          data,
          [campo]: horario,
        },
        { onConflict: 'funcionario_id,data' },
      )
      if (error) throw error
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['rh', 'ponto', usuario?.empresa_id, v.data] }),
  })
}
