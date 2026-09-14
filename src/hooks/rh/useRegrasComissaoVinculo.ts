'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { RhCategoriaComissao } from '@/types/rh'

// Vínculo funcionário/cargo ↔ regra de comissão por categoria — até 1
// regra ativa por categoria (Financiamento/CGI/Consórcio/Contrato/Outra),
// até 5 no total. resolver_regra_comissao() no banco usa exatamente essa
// tabela (com fallback pro cargo) em todo cálculo de comissão do comercial.

export function useSalvarFuncionarioRegra() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ funcionarioId, categoria, regraId }: {
      funcionarioId: string; categoria: RhCategoriaComissao; regraId: string
    }) => {
      const { error } = await supabase
        .from('rh_funcionario_regras')
        .upsert({ funcionario_id: funcionarioId, regra_id: regraId, categoria }, { onConflict: 'funcionario_id,categoria' })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rh', 'funcionarios'] }),
  })
}

export function useRemoverFuncionarioRegra() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ funcionarioId, categoria }: { funcionarioId: string; categoria: RhCategoriaComissao }) => {
      const { error } = await supabase
        .from('rh_funcionario_regras')
        .delete()
        .eq('funcionario_id', funcionarioId)
        .eq('categoria', categoria)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rh', 'funcionarios'] }),
  })
}

export function useSalvarCargoRegra() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ cargoId, categoria, regraId }: {
      cargoId: string; categoria: RhCategoriaComissao; regraId: string
    }) => {
      const { error } = await supabase
        .from('rh_cargo_regras')
        .upsert({ cargo_id: cargoId, regra_id: regraId, categoria }, { onConflict: 'cargo_id,categoria' })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rh', 'cargos'] }),
  })
}

export function useRemoverCargoRegra() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ cargoId, categoria }: { cargoId: string; categoria: RhCategoriaComissao }) => {
      const { error } = await supabase
        .from('rh_cargo_regras')
        .delete()
        .eq('cargo_id', cargoId)
        .eq('categoria', categoria)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rh', 'cargos'] }),
  })
}
