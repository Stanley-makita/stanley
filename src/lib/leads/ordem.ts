import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Retorna o valor de ordem_kanban para inserir um novo lead NO TOPO da fase.
 * Calcula MIN(ordem_kanban) - 1 dos leads existentes, garantindo que o novo
 * lead apareça acima de todos os outros na coluna kanban.
 */
export async function obterOrdemTopo(
  supabase: SupabaseClient,
  empresa_id: string,
  fase_id: string,
): Promise<number> {
  const { data } = await supabase
    .from('leads')
    .select('ordem_kanban')
    .eq('empresa_id', empresa_id)
    .eq('fase_id', fase_id)
    .is('deleted_at', null)
    .order('ordem_kanban', { ascending: true })
    .limit(1)
    .maybeSingle()
  return data ? data.ordem_kanban - 1 : 0
}
