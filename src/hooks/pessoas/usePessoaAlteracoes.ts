'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { type PessoaAlteracao } from '@/types/pessoas'

export function usePessoaAlteracoes(pessoaId: string) {
  return useQuery({
    queryKey: ['pessoas', pessoaId, 'alteracoes'],
    queryFn: async (): Promise<PessoaAlteracao[]> => {
      const { data, error } = await supabase
        .from('pessoas_alteracoes')
        .select('*, usuario:usuarios!usuario_id(nome)')
        .eq('pessoa_id', pessoaId)
        .order('alterado_em', { ascending: false })
        .limit(50)

      if (error) throw error
      return data
    },
    enabled: !!pessoaId,
  })
}
