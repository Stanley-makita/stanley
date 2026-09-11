'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import type { RhFuncionario, RhStatusFuncionario } from '@/types/rh'

const JOINS = `*, cargo:rh_cargos(id, nome, nivel_comissao, departamento:rh_departamentos(id, nome)), regra_comissao:rh_regras_comissao(id, nome, tipo_calculo)`

export function useFuncionarios(filtros: { status?: RhStatusFuncionario } = {}) {
  const { usuario } = useAuth()
  return useQuery({
    queryKey: ['rh', 'funcionarios', usuario?.empresa_id, filtros],
    enabled: !!usuario,
    queryFn: async (): Promise<RhFuncionario[]> => {
      let q = supabase.from('rh_funcionarios')
        .select(JOINS)
        .eq('empresa_id', usuario!.empresa_id)
        .order('nome')
      if (filtros.status) q = q.eq('status', filtros.status)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as unknown as RhFuncionario[]
    },
  })
}

// Funcionários ativos que ainda não estão vinculados a nenhum usuário de
// login (usuarios.funcionario_id) — usado no dropdown "vincular funcionário
// existente" do formulário de Usuário, pra não oferecer quem já tem login.
export function useFuncionariosDisponiveis(funcionarioIdAtual?: string | null) {
  const { usuario } = useAuth()
  return useQuery({
    queryKey: ['rh', 'funcionarios', 'disponiveis', usuario?.empresa_id, funcionarioIdAtual],
    enabled: !!usuario,
    queryFn: async (): Promise<RhFuncionario[]> => {
      const { data: vinculados, error: erroVinculados } = await supabase
        .from('usuarios')
        .select('funcionario_id')
        .eq('empresa_id', usuario!.empresa_id)
        .is('deleted_at', null)
        .not('funcionario_id', 'is', null)
      if (erroVinculados) throw erroVinculados

      const idsVinculados = (vinculados ?? [])
        .map((u) => u.funcionario_id as string)
        .filter((id) => id !== funcionarioIdAtual)

      let q = supabase.from('rh_funcionarios')
        .select(JOINS)
        .eq('empresa_id', usuario!.empresa_id)
        .eq('status', 'ativo')
        .order('nome')
      if (idsVinculados.length > 0) q = q.not('id', 'in', `(${idsVinculados.join(',')})`)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as unknown as RhFuncionario[]
    },
  })
}

export function useCriarFuncionario() {
  const { usuario } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (dados: Omit<RhFuncionario, 'id' | 'empresa_id' | 'created_at' | 'updated_at' | 'cargo' | 'regra_comissao'>) => {
      const { data, error } = await supabase.from('rh_funcionarios')
        .insert({ ...dados, empresa_id: usuario!.empresa_id })
        .select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rh', 'funcionarios'] }),
  })
}

export function useAtualizarFuncionario() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...dados }: Partial<RhFuncionario> & { id: string }) => {
      const { error } = await supabase.from('rh_funcionarios').update(dados).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rh', 'funcionarios'] }),
  })
}

export function useExcluirFuncionario() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('rh_funcionarios').update({ status: 'inativo' }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rh', 'funcionarios'] }),
  })
}
