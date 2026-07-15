import type { SupabaseClient } from '@supabase/supabase-js'

// Números brasileiros de celular podem chegar com ou sem o "9" extra depois do DDD — mesma
// normalização usada em src/hooks/conversas/useIniciarConversa.ts (client-side). Espelhada
// aqui porque este helper roda server-side com o client de service role; o hook não pode ser
// reaproveitado diretamente (depende do client de browser autenticado por sessão).
export function variantesTelefoneBR(telefone: string): string[] {
  const digits = telefone.replace(/\D/g, '')
  const semDDI = digits.startsWith('55') ? digits.slice(2) : digits
  const ddd = semDDI.slice(0, 2)
  const resto = semDDI.slice(2)
  const variantes = new Set<string>([`55${ddd}${resto}`])
  if (resto.length === 9 && resto.startsWith('9')) {
    variantes.add(`55${ddd}${resto.slice(1)}`)
  } else if (resto.length === 8) {
    variantes.add(`55${ddd}9${resto}`)
  }
  return Array.from(variantes)
}

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
