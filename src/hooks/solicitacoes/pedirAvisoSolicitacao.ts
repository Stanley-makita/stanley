import { supabase } from '@/lib/supabase'

// Pede ao servidor o aviso por WhatsApp das respostas (quem pediu + comercial do cliente,
// 1 minuto sem novidade — ver /api/solicitacoes/[id]/aviso). Não bloqueia nem falha o
// salvar: aviso perdido não pode impedir de gravar a resposta.
export async function pedirAvisoSolicitacao(solicitacaoId: string) {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    await fetch(`/api/solicitacoes/${solicitacaoId}/aviso`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
      keepalive: true,
    })
  } catch (err) {
    console.error('[solicitacoes] aviso por WhatsApp não pedido:', err)
  }
}
