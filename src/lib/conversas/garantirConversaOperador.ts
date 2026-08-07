import type { SupabaseClient } from '@supabase/supabase-js'

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
 *
 * Get-or-create via RPC atômica (obter_ou_criar_conversa) em vez de
 * SELECT-then-INSERT — evita criar conversas duplicadas para o mesmo
 * telefone quando chegam mensagens concorrentes.
 */
export async function garantirConversaOperador(
  supabase: SupabaseClient,
  empresa_id: string,
  telefone: string,
): Promise<string> {
  const { data, error } = await supabase.rpc('obter_ou_criar_conversa', {
    p_empresa_id: empresa_id,
    p_canal: 'whatsapp',
    p_telefone: telefone,
    p_bot_ativo: false,
  })

  if (error) throw error
  return data as string
}
