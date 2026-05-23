import type { QueryClient } from '@tanstack/react-query'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Avança a fase do lead para o destino indicado.
 * Nunca regride — só avança se o lead estiver numa fase de ordem menor.
 *
 * @param nomeFaseDestino  Nome exato da fase destino (deve existir na tabela fases do empresa)
 */
export async function avancarFaseLead(
  supabase: SupabaseClient,
  qc: QueryClient,
  leadId: string,
  nomeFaseDestino: string,
): Promise<void> {
  const { data: lead } = await supabase
    .from('leads')
    .select('empresa_id, fase_id, fase:fases!fase_id(nome, ordem)')
    .eq('id', leadId)
    .single()

  if (!lead) return

  const ordemAtual = (lead.fase as { ordem?: number } | null)?.ordem ?? 0

  const { data: destino } = await supabase
    .from('fases')
    .select('id, ordem')
    .eq('modulo', 'leads')
    .eq('empresa_id', lead.empresa_id)
    .ilike('nome', nomeFaseDestino)
    .single()

  if (!destino) return
  if (destino.ordem <= ordemAtual) return

  await supabase
    .from('leads')
    .update({ fase_id: destino.id })
    .eq('id', leadId)

  qc.invalidateQueries({ queryKey: ['lead', leadId] })
  qc.invalidateQueries({ queryKey: ['leads'] })
}
