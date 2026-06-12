'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import { toast } from 'sonner'

export interface AbaConfig {
  id: string
  label: string
}

export const ABAS_DEFAULT: AbaConfig[] = [
  { id: 'resumo',       label: 'Resumo' },
  { id: 'credito',      label: 'Crédito' },
  { id: 'formularios',  label: 'Formulários' },
  { id: 'processos',    label: 'Processos' },
  { id: 'simulador',    label: 'Simulador' },
  { id: 'solicitacoes', label: 'Solicitações' },
  { id: 'historico',    label: 'Histórico' },
  { id: 'documentos',   label: 'Documentos' },
]

const VALID_IDS = new Set(ABAS_DEFAULT.map(a => a.id))

function mergeComDefault(abas: AbaConfig[]): AbaConfig[] {
  const validas = abas.filter(a => VALID_IDS.has(a.id))
  const configurados = new Set(validas.map(a => a.id))
  const ausentes = ABAS_DEFAULT.filter(a => !configurados.has(a.id))
  return [...validas, ...ausentes]
}

export function useConfigAbas(): AbaConfig[] {
  const { usuario } = useAuth()

  const { data } = useQuery({
    queryKey: ['config', 'abas', usuario?.empresa_id],
    enabled: !!usuario,
    staleTime: Infinity,
    queryFn: async (): Promise<AbaConfig[]> => {
      const { data, error } = await supabase
        .from('lead_aba_config')
        .select('abas')
        .eq('empresa_id', usuario!.empresa_id)
        .maybeSingle()

      if (error) throw error
      if (!data || !Array.isArray(data.abas) || data.abas.length === 0) {
        return ABAS_DEFAULT
      }

      return mergeComDefault(data.abas as AbaConfig[])
    },
  })

  return data ?? ABAS_DEFAULT
}

export function useSalvarConfigAbas() {
  const { usuario } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (abas: AbaConfig[]) => {
      const { error } = await supabase
        .from('lead_aba_config')
        .upsert({
          empresa_id: usuario!.empresa_id,
          abas,
          updated_at: new Date().toISOString(),
        })

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['config', 'abas', usuario?.empresa_id] })
      toast.success('Ordem das abas salva!', {
        className: 'border-l-4 border-l-[#C2AA6A] bg-[#E7E0C4] text-[#253B29]',
      })
    },
    onError: (err: any) => {
      toast.error(`Erro ao salvar: ${err?.message ?? 'Tente novamente'}`)
    },
  })
}
