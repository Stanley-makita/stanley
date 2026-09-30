import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Lead mais recente da Pessoa: onde ela é titular; senão, onde é coparticipante/cônjuge (V2).
 * No caminho da participação, "mais recente" é pelo `leads.created_at` (não pela data da
 * participação): busca os lead_id candidatos e depois ordena os leads ativos por criação.
 * Nunca lança: erro de qualquer query é logado (`console.error`) e resolve como `null` — os
 * call sites do bot (*salva) não têm onde exibir esse erro pro operador (o catch externo do
 * webhook não responde a mensagem), então um erro transitório de banco deve degradar pra
 * "sem lead" (comportamento antigo do inline) em vez de derrubar a resposta.
 */
export async function leadMaisRecenteDaPessoa(sb: SupabaseClient, empresaId: string, pessoaId: string): Promise<string | null> {
  const { data: comoTitular, error } = await sb.from('leads').select('id')
    .eq('empresa_id', empresaId).eq('pessoa_id', pessoaId).is('deleted_at', null)
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (error) {
    console.error('[leadMaisRecenteDaPessoa] leads:', error.message)
    return null
  }
  if (comoTitular) return comoTitular.id as string

  // Papéis do lado da compra que não são titular (vendedor nunca conta como lead dele).
  const { data: parts, error: eP } = await sb.from('participacoes')
    .select('lead_id')
    .eq('empresa_id', empresaId).eq('pessoa_id', pessoaId)
    .in('papel', ['coparticipante', 'conjuge_anuente'])
    .not('lead_id', 'is', null)
  if (eP) {
    console.error('[leadMaisRecenteDaPessoa] participacoes:', eP.message)
    return null
  }
  const ids = Array.from(new Set(((parts ?? []) as Array<{ lead_id: string | null }>)
    .map(p => p.lead_id).filter((id): id is string => !!id)))
  if (ids.length === 0) return null

  const { data: lead, error: eL } = await sb.from('leads').select('id')
    .eq('empresa_id', empresaId).in('id', ids).is('deleted_at', null)
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (eL) {
    console.error('[leadMaisRecenteDaPessoa] leads (participação):', eL.message)
    return null
  }
  return (lead?.id as string | undefined) ?? null
}
