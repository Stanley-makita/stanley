'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface ContratoClicksignStatus {
  clicksign_envelope_id: string | null
  clicksign_document_id: string | null
  clicksign_status: string | null
  clicksign_signed_url: string | null
  clicksign_enviado_em: string | null
  clicksign_assinado_em: string | null
}

export function useContratoClicksign(contratoId: string | null) {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['contrato_clicksign', contratoId],
    queryFn: async (): Promise<ContratoClicksignStatus | null> => {
      if (!contratoId) return null
      const { data, error } = await supabase
        .from('processo_contratos')
        .select('clicksign_envelope_id, clicksign_document_id, clicksign_status, clicksign_signed_url, clicksign_enviado_em, clicksign_assinado_em')
        .eq('id', contratoId)
        .maybeSingle()
      if (error) throw error
      return data as ContratoClicksignStatus | null
    },
    enabled: !!contratoId,
    refetchInterval: (query) => {
      const status = query.state.data?.clicksign_status
      // Polling a cada 30s enquanto aguarda assinatura
      return status === 'running' ? 30_000 : false
    },
  })

  function invalidar() {
    queryClient.invalidateQueries({ queryKey: ['contrato_clicksign', contratoId] })
  }

  return { ...query, invalidar }
}
