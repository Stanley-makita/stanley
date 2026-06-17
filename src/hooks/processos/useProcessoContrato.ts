'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import { toast } from 'sonner'

export interface ProcessoContrato {
  id: string
  empresa_id: string
  processo_id: string
  tipo_modelo: string
  titulo: string
  conteudo_html: string
  criado_por: string
  versao: number
  created_at: string
  updated_at: string
  clicksign_status: string | null
  clicksign_signed_url: string | null
  clicksign_enviado_em: string | null
  clicksign_assinado_em: string | null
}

export function useProcessoContratos(processoId: string) {
  const { usuario } = useAuth()

  return useQuery({
    queryKey: ['processo-contratos', processoId],
    queryFn: async (): Promise<ProcessoContrato[]> => {
      const { data, error } = await supabase
        .from('processo_contratos')
        .select('*')
        .eq('processo_id', processoId)
        .eq('empresa_id', usuario!.empresa_id)
        .order('created_at', { ascending: true })

      if (error) throw error
      return data ?? []
    },
    enabled: !!usuario?.empresa_id && !!processoId,
  })
}

export function useSalvarContrato(processoId: string) {
  const { usuario } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (payload: {
      id?: string
      tipo_modelo: string
      titulo: string
      conteudo_html: string
    }): Promise<string> => {
      if (payload.id) {
        const { error } = await supabase
          .from('processo_contratos')
          .update({
            titulo: payload.titulo,
            conteudo_html: payload.conteudo_html,
            updated_at: new Date().toISOString(),
          })
          .eq('id', payload.id)
        if (error) throw error
        return payload.id
      }

      // Novo contrato: calcular próxima versão
      const { data: existentes } = await supabase
        .from('processo_contratos')
        .select('versao')
        .eq('processo_id', processoId)
      const maxVersao = Math.max(0, ...(existentes ?? []).map((c) => c.versao ?? 1))

      const { data, error } = await supabase
        .from('processo_contratos')
        .insert({
          processo_id: processoId,
          empresa_id: usuario!.empresa_id,
          criado_por: usuario!.id,
          tipo_modelo: payload.tipo_modelo,
          titulo: payload.titulo,
          conteudo_html: payload.conteudo_html,
          versao: maxVersao + 1,
        })
        .select('id')
        .single()
      if (error) throw error
      return data.id as string
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['processo-contratos', processoId] })
      toast.success('Contrato salvo com sucesso.')
    },
    onError: () => {
      toast.error('Não foi possível salvar o contrato. Tente novamente.')
    },
  })
}
