'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import { type Processo, type StatusProcesso } from '@/types/processos'

export type ProdutoFiltro = 'todos' | 'consorcio' | 'cgi' | 'financiamento' | 'contrato'

const FINANCIAMENTO_MODALIDADES = ['SFI', 'SBPE', 'PMCMV', 'Pro_Cotista']

interface FiltrosProcessos {
  status?: StatusProcesso | 'todos'
  produto?: ProdutoFiltro
  busca?: string
}

export function useProcessos(filtros: FiltrosProcessos = {}) {
  const { usuario } = useAuth()

  return useQuery({
    queryKey: ['processos', usuario?.empresa_id, filtros],
    queryFn: async (): Promise<Processo[]> => {
      let query = supabase
        .from('processos')
        .select(`
          *,
          banco:bancos!banco_id(id, nome),
          operacional:usuarios!operacional_id(id, nome, email),
          comercial:usuarios!comercial_id(id, nome, email),
          fase_atual:fases!fase_atual_id(id, nome, cor),
          compradores:processo_compradores(nome, cpf, principal)
        `)
        .eq('empresa_id', usuario!.empresa_id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })

      if (filtros.status && filtros.status !== 'todos') {
        query = query.eq('status_processo', filtros.status)
      }

      if (filtros.produto && filtros.produto !== 'todos') {
        if (filtros.produto === 'financiamento') {
          query = query.in('modalidade', FINANCIAMENTO_MODALIDADES)
        } else if (filtros.produto === 'consorcio') {
          query = query.eq('modalidade', 'Consorcio')
        } else if (filtros.produto === 'cgi') {
          query = query.eq('modalidade', 'CGI')
        } else if (filtros.produto === 'contrato') {
          query = query.eq('modalidade', 'Contrato')
        }
      }

      if (filtros.busca) {
        query = query.or(
          `nome_imovel.ilike.%${filtros.busca}%,numero_processo.ilike.%${filtros.busca}%`
        )
      }

      const { data, error } = await query
      if (error) throw error
      return data
    },
    staleTime: 1000 * 60 * 2,
    enabled: !!usuario,
  })
}

export function useProcesso(processoId: string) {
  const { usuario } = useAuth()

  return useQuery({
    queryKey: ['processos', processoId],
    queryFn: async (): Promise<Processo> => {
      const { data, error } = await supabase
        .from('processos')
        .select(`
          *,
          banco:bancos!banco_id(id, nome),
          operacional:usuarios!operacional_id(id, nome, email),
          comercial:usuarios!comercial_id(id, nome, email),
          juridico:usuarios!juridico_id(id, nome, email),
          fase_atual:fases!fase_atual_id(id, nome, cor),
          compradores:processo_compradores(id, nome, cpf, principal),
          vendedores:processo_vendedores(id, nome, cpf)
        `)
        .eq('id', processoId)
        .eq('empresa_id', usuario!.empresa_id)
        .single()

      if (error) throw error
      return data
    },
    enabled: !!usuario && !!processoId,
  })
}

export function useAtualizarResponsaveis() {
  const { usuario } = useAuth()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({
      processoId,
      comercial_id,
      operacional_id,
      juridico_id,
    }: {
      processoId: string
      comercial_id: string | null
      operacional_id: string | null
      juridico_id: string | null
    }) => {
      const { error } = await supabase
        .from('processos')
        .update({ comercial_id, operacional_id, juridico_id })
        .eq('id', processoId)
        .eq('empresa_id', usuario!.empresa_id)
      if (error) throw error
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['processos', vars.processoId] })
    },
  })
}