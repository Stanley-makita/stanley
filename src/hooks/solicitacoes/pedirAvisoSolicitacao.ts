import { supabase } from '@/lib/supabase'

async function chamar(rota: string) {
  const { data: { session } } = await supabase.auth.getSession()
  await fetch(rota, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
    keepalive: true,
  })
}

// Push na hora das notificações que a gravação acabou de criar (sininho de quem está do outro lado) —
// ver /api/solicitacoes/[id]/push. Não bloqueia nem falha o salvar.
export async function pedirPushSolicitacao(solicitacaoId: string) {
  try {
    await chamar(`/api/solicitacoes/${solicitacaoId}/push`)
  } catch (err) {
    console.error('[solicitacoes] push não pedido:', err)
  }
}

// Pede ao servidor o aviso por WhatsApp das respostas (quem pediu + comercial do cliente,
// 1 minuto sem novidade — ver /api/solicitacoes/[id]/aviso) e o push imediato. Não bloqueia
// nem falha o salvar: aviso perdido não pode impedir de gravar a resposta.
export async function pedirAvisoSolicitacao(solicitacaoId: string) {
  void pedirPushSolicitacao(solicitacaoId)
  try {
    await chamar(`/api/solicitacoes/${solicitacaoId}/aviso`)
  } catch (err) {
    console.error('[solicitacoes] aviso por WhatsApp não pedido:', err)
  }
}
