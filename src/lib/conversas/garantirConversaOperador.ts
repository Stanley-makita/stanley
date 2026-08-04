import type { SupabaseClient } from '@supabase/supabase-js'
import { variantesTelefoneBR, telefoneCanonico } from '@/lib/telefone'

/**
 * Garante que existe uma linha em `conversas` para o telefone de um
 * operador interno (quem manda *consorcio/*simula/*custas), retornando o id
 * pra um UPDATE subsequente gravar o estado pendente (consorcio_pendente,
 * simula_pendente, custas_pendente).
 *
 * Sem isso, salvar*Pendente fazia um UPDATE "cego" filtrando por telefone —
 * se a linha nunca tivesse sido criada antes (operador novo, que nunca
 * mandou mensagem como cliente), o UPDATE afetava 0 linhas silenciosamente
 * (Supabase não retorna erro), o estado nunca era persistido, e a resposta
 * seguinte do operador não achava nada em buscar*Pendente — o fluxo parecia
 * travado na primeira pergunta sem nenhum erro visível.
 */
export async function garantirConversaOperador(
  supabase: SupabaseClient,
  empresa_id: string,
  telefone: string,
): Promise<string> {
  const { data: existente } = await supabase
    .from('conversas')
    .select('id')
    .eq('empresa_id', empresa_id)
    .eq('canal', 'whatsapp')
    .in('contato_telefone', variantesTelefoneBR(telefone))
    .maybeSingle()

  if (existente) return existente.id

  const { data: nova, error } = await supabase
    .from('conversas')
    .insert({
      empresa_id,
      canal: 'whatsapp',
      contato_telefone: telefoneCanonico(telefone),
      status: 'ativo',
      bot_ativo: false,
    })
    .select('id')
    .single()

  if (error) throw error
  return nova.id
}
