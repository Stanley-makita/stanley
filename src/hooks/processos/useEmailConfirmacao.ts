import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export function useEmailConfirmacao(processoId: string) {
  return useQuery({
    queryKey: ['email_confirmacao', processoId],
    queryFn: async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('email_envios')
        .select('id, sent_at, confirmado_em, numero_protocolo, para_email, template')
        .eq('processo_id', processoId)
        .eq('status', 'enviado')
        .order('sent_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      return data
    },
    enabled: !!processoId,
  })
}
