'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { LeadAnaliseCredito } from '@/types/leads'
import { toast } from 'sonner'

export function useAnalisesCredito(leadId: string) {
  const qc = useQueryClient()

  const { data: analises = [], isLoading } = useQuery({
    queryKey: ['lead-analises-credito', leadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lead_analises_credito')
        .select('*')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as LeadAnaliseCredito[]
    },
    enabled: !!leadId,
  })

  const invalidar = () => qc.invalidateQueries({ queryKey: ['lead-analises-credito', leadId] })

  type CriarInput = Omit<LeadAnaliseCredito, 'id' | 'created_at' | 'updated_at'>

  const criar = useMutation({
    mutationFn: async (input: CriarInput) => {
      const { data, error } = await supabase
        .from('lead_analises_credito')
        .insert(input)
        .select()
        .single()
      if (error) throw error
      return data as LeadAnaliseCredito
    },
    onSuccess: invalidar,
    onError: (e: any) => toast.error(`Erro ao criar análise: ${e?.message ?? 'Tente novamente'}`),
  })

  const editar = useMutation({
    mutationFn: async ({ id, ...campos }: Partial<LeadAnaliseCredito> & { id: string }) => {
      const { data, error } = await supabase
        .from('lead_analises_credito')
        .update(campos)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data as LeadAnaliseCredito
    },
    onSuccess: invalidar,
    onError: (e: any) => toast.error(`Erro ao salvar análise: ${e?.message ?? 'Tente novamente'}`),
  })

  const deletar = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('lead_analises_credito')
        .delete()
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidar,
    onError: (e: any) => toast.error(`Erro ao remover análise: ${e?.message ?? 'Tente novamente'}`),
  })

  return { analises, isLoading, criar, editar, deletar }
}
