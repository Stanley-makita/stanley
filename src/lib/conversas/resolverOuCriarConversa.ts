import type { SupabaseClient } from '@supabase/supabase-js'

export interface ResolverOuCriarConversaParams {
  supabase: SupabaseClient
  empresaId: string
  telefone: string
  nome: string
  pessoaId?: string | null
  leadId?: string | null
  instanciaId?: string | null
}

export async function resolverOuCriarConversa(params: ResolverOuCriarConversaParams): Promise<string> {
  const { supabase, empresaId, telefone, nome, pessoaId, leadId, instanciaId } = params

  // Get-or-create atômico via RPC (INSERT ... ON CONFLICT) — evita a corrida de um
  // SELECT-then-INSERT feito em várias chamadas JS separadas, que criava conversas
  // duplicadas para o mesmo telefone quando mensagens chegavam quase ao mesmo tempo.
  const { data, error } = await supabase.rpc('obter_ou_criar_conversa', {
    p_empresa_id: empresaId,
    p_canal: 'whatsapp',
    p_telefone: telefone,
    p_nome: nome,
    p_lead_id: leadId ?? null,
    p_pessoa_id: pessoaId ?? null,
    p_instancia_id: instanciaId ?? null,
    p_bot_ativo: false,
  })

  if (error) throw error
  return data as string
}
