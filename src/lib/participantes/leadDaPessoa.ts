import type { SupabaseClient } from '@supabase/supabase-js'

/** Lead mais recente da Pessoa: onde ela é titular; senão, onde é coparticipante/cônjuge (V2). */
export async function leadMaisRecenteDaPessoa(sb: SupabaseClient, empresaId: string, pessoaId: string): Promise<string | null> {
  const { data: comoTitular, error } = await sb.from('leads').select('id')
    .eq('empresa_id', empresaId).eq('pessoa_id', pessoaId).is('deleted_at', null)
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (error) throw new Error(`leads: ${error.message}`)
  if (comoTitular) return comoTitular.id as string

  const { data: part, error: eP } = await sb.from('participacoes')
    .select('lead_id, lead:leads!lead_id!inner(deleted_at)')
    .eq('empresa_id', empresaId).eq('pessoa_id', pessoaId)
    .in('papel', ['coparticipante', 'conjuge_anuente'])
    .not('lead_id', 'is', null).is('lead.deleted_at', null)
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (eP) throw new Error(`participacoes: ${eP.message}`)
  return (part?.lead_id as string | undefined) ?? null
}
