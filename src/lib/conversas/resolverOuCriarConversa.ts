import type { SupabaseClient } from '@supabase/supabase-js'
import { variantesTelefoneBR } from '@/lib/telefone'

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

  const telRaw = telefone.replace(/\D/g, '')
  const tel = telRaw.length <= 11 && !telRaw.startsWith('55') ? `55${telRaw}` : telRaw

  // Reaproveita conversa já existente (mesmo telefone, com ou sem o "9" extra) em vez de
  // criar uma duplicada vazia perdendo o histórico.
  const { data: existente } = await supabase
    .from('conversas')
    .select('id, lead_id, pessoa_id, instancia_id')
    .eq('empresa_id', empresaId)
    .eq('canal', 'whatsapp')
    .in('contato_telefone', variantesTelefoneBR(tel))
    .maybeSingle()

  if (existente) {
    const patch: Record<string, unknown> = {}
    if (!existente.lead_id && leadId) patch.lead_id = leadId
    if (!existente.pessoa_id && pessoaId) patch.pessoa_id = pessoaId
    if (!existente.instancia_id && instanciaId) patch.instancia_id = instanciaId
    if (Object.keys(patch).length > 0) {
      await supabase.from('conversas').update(patch).eq('id', existente.id)
    }
    return existente.id
  }

  const { data: conversa, error } = await supabase
    .from('conversas')
    .insert({
      empresa_id:       empresaId,
      canal:            'whatsapp',
      contato_telefone: tel,
      contato_nome:     nome,
      lead_id:          leadId ?? null,
      pessoa_id:        pessoaId ?? null,
      instancia_id:     instanciaId ?? null,
      status:           'ativo',
      bot_ativo:        false,
    })
    .select('id')
    .single()

  if (error) throw error
  return conversa.id
}
