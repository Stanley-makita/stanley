'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { PapelParticipacao, PropostaRef } from '@/lib/participantes/tipos'

export type ParticipanteResumo = {
  id: string
  papel: PapelParticipacao
  compoe_renda: boolean
  ordem: number
  pessoa: { id: string; nome: string; renda_formal: number | null; renda_informal: number | null }
}

/** Participantes da proposta (RLS decide a visibilidade). Chave sob ['leads', id] / ['processos', id]
 *  para que as invalidações já existentes do lead/processo também recarreguem aqui. */
export function useParticipantes(ref: PropostaRef | null) {
  const supabase = createClient()
  return useQuery({
    queryKey: [ref?.tipo === 'processo' ? 'processos' : 'leads', ref?.id, 'participantes'],
    enabled: !!ref,
    queryFn: async (): Promise<ParticipanteResumo[]> => {
      const coluna = ref!.tipo === 'lead' ? 'lead_id' : 'processo_id'
      const { data, error } = await supabase.from('participacoes')
        .select('id, papel, compoe_renda, ordem, pessoa:pessoas!pessoa_id(id, nome, renda_formal, renda_informal)')
        .eq(coluna, ref!.id)
        .order('ordem', { ascending: true })
      if (error) throw error
      return (data ?? []).map(r => ({ ...r, pessoa: Array.isArray(r.pessoa) ? r.pessoa[0] : r.pessoa })) as ParticipanteResumo[]
    },
  })
}
