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
      // !inner + deleted_at IS NULL: Pessoa excluída (soft delete) não aparece nem soma renda.
      const { data, error } = await supabase.from('participacoes')
        .select('id, papel, compoe_renda, ordem, pessoa:pessoas!pessoa_id!inner(id, nome, renda_formal, renda_informal, deleted_at)')
        .eq(coluna, ref!.id)
        .is('pessoa.deleted_at', null)
        .order('ordem', { ascending: true })
      if (error) throw error
      return (data ?? [])
        .map(r => {
          const p = Array.isArray(r.pessoa) ? r.pessoa[0] : r.pessoa
          return {
            ...r,
            pessoa: p ? { id: p.id, nome: p.nome, renda_formal: p.renda_formal, renda_informal: p.renda_informal } : null,
          }
        })
        .filter(r => r.pessoa !== null) as ParticipanteResumo[]
    },
  })
}
