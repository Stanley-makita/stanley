'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { type ComunicacaoTemplate } from '@/types/comunicacao'

/** Lista os modelos de mensagem ativos do canal WhatsApp da empresa do usuário logado. */
export function useComunicacaoTemplates() {
  return useQuery({
    queryKey: ['comunicacao_templates', 'whatsapp'],
    queryFn: async (): Promise<ComunicacaoTemplate[]> => {
      const { data, error } = await supabase
        .from('comunicacao_templates')
        .select('*')
        .eq('canal', 'whatsapp')
        .eq('ativo', true)
        .order('nome', { ascending: true })

      if (error) throw error
      return data
    },
  })
}
