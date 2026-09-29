import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Lead mais recente da Pessoa: onde ela é titular; senão, onde é coparticipante/cônjuge (V2).
 * Nunca lança: erro de qualquer uma das duas queries é logado (`console.error`) e resolve
 * como `null` — os call sites do bot (*salva) não têm onde exibir esse erro pro operador
 * (o catch externo do webhook não responde a mensagem), então um erro transitório de banco
 * deve degradar pra "sem lead" (comportamento antigo do inline) em vez de derrubar a resposta.
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

  const { data: part, error: eP } = await sb.from('participacoes')
    .select('lead_id, lead:leads!lead_id!inner(deleted_at)')
    .eq('empresa_id', empresaId).eq('pessoa_id', pessoaId)
    .in('papel', ['coparticipante', 'conjuge_anuente'])
    .not('lead_id', 'is', null).is('lead.deleted_at', null)
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (eP) {
    console.error('[leadMaisRecenteDaPessoa] participacoes:', eP.message)
    return null
  }
  return (part?.lead_id as string | undefined) ?? null
}
