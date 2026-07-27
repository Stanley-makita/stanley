'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { LeadAnaliseCredito } from '@/types/leads'
import { toast } from 'sonner'

// Análises de crédito pertencem a exatamente um dos dois donos — Lead
// (Captação) ou Processo (negócio já em Financiamento que precisa de nova
// análise sem voltar o cliente pra fase de Lead — ver AbaCreditoProcesso.tsx).
export type DonoAnaliseCredito = { leadId: string } | { processoId: string }

function colunaEId(dono: DonoAnaliseCredito): { coluna: 'lead_id' | 'processo_id'; id: string } {
  return 'leadId' in dono
    ? { coluna: 'lead_id', id: dono.leadId }
    : { coluna: 'processo_id', id: dono.processoId }
}

export function useAnalisesCredito(dono: DonoAnaliseCredito) {
  const qc = useQueryClient()
  const { coluna, id } = colunaEId(dono)

  const { data: analises = [], isLoading } = useQuery({
    queryKey: ['lead-analises-credito', coluna, id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lead_analises_credito')
        .select('*')
        .eq(coluna, id)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as LeadAnaliseCredito[]
    },
    enabled: !!id,
  })

  const invalidar = () => qc.invalidateQueries({ queryKey: ['lead-analises-credito', coluna, id] })

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
    mutationFn: async ({ id: analiseId, ...campos }: Partial<LeadAnaliseCredito> & { id: string }) => {
      const { data, error } = await supabase
        .from('lead_analises_credito')
        .update(campos)
        .eq('id', analiseId)
        .select()
        .single()
      if (error) throw error
      return data as LeadAnaliseCredito
    },
    onSuccess: invalidar,
    onError: (e: any) => toast.error(`Erro ao salvar análise: ${e?.message ?? 'Tente novamente'}`),
  })

  const deletar = useMutation({
    mutationFn: async (analiseId: string) => {
      const { error } = await supabase
        .from('lead_analises_credito')
        .delete()
        .eq('id', analiseId)
      if (error) throw error
    },
    onSuccess: invalidar,
    onError: (e: any) => toast.error(`Erro ao remover análise: ${e?.message ?? 'Tente novamente'}`),
  })

  // Define qual análise é o banco escolhido (exclusivo por lead ou processo)
  const definirBanco = useMutation({
    mutationFn: async (analiseId: string) => {
      // Desmarca todas as análises do mesmo dono
      await supabase
        .from('lead_analises_credito')
        .update({ banco_definido: false })
        .eq(coluna, id)
      // Marca a escolhida
      const { data, error } = await supabase
        .from('lead_analises_credito')
        .update({ banco_definido: true })
        .eq('id', analiseId)
        .select()
        .single()
      if (error) throw error
      return data as LeadAnaliseCredito
    },
    onSuccess: invalidar,
    onError: (e: any) => toast.error(`Erro ao definir banco: ${e?.message ?? 'Tente novamente'}`),
  })

  // Desmarca o banco definido (nenhuma análise passa a ser a decisiva) —
  // diferente de definirBanco, que sempre marca uma; esta só desliga.
  const limparBancoDefinido = useMutation({
    mutationFn: async (analiseId: string) => {
      const { data, error } = await supabase
        .from('lead_analises_credito')
        .update({ banco_definido: false })
        .eq('id', analiseId)
        .select()
        .single()
      if (error) throw error
      return data as LeadAnaliseCredito
    },
    onSuccess: invalidar,
    onError: (e: any) => toast.error(`Erro ao desmarcar banco: ${e?.message ?? 'Tente novamente'}`),
  })

  return { analises, isLoading, criar, editar, deletar, definirBanco, limparBancoDefinido }
}
