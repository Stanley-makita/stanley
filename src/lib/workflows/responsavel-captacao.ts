import type { SupabaseClient } from '@supabase/supabase-js'

// Quem atua como comercial é definido pelo CARGO do RH, não só pelo perfil de acesso:
// sócia/comercial com perfil admin (cargo "Consultor Comercial") e comerciais externos
// com perfil customizado (cargo "Comercial Externo") também vendem.
export function cargoEhComercial(nomeCargo: string | null | undefined): boolean {
  return !!nomeCargo && nomeCargo.toLowerCase().includes('comercial')
}

/**
 * Responsável do lead criado por *cria cliente: quem disparou o comando, se for comercial
 * (perfil 'comercial' ou cargo comercial). Recepção/gestor/admin sem cargo comercial
 * criando em nome de terceiros → null (lead fica sem dono até ser distribuído).
 * Falha na consulta do cargo nunca impede a criação do lead — só deixa sem dono.
 */
export async function responsavelDaCaptacao(
  supabase: SupabaseClient,
  usuarioId: string,
  perfil: string | undefined,
): Promise<string | null> {
  if (perfil === 'comercial') return usuarioId

  const { data, error } = await supabase
    .from('usuarios')
    .select('cargo:rh_cargos!cargo_id(nome)')
    .eq('id', usuarioId)
    .abortSignal(AbortSignal.timeout(10_000))
    .maybeSingle()

  if (error) {
    console.error('[workflow-captacao] Falha ao ler o cargo de quem criou o lead:', error)
    return null
  }
  const cargo = (data as { cargo: { nome: string } | null } | null)?.cargo
  return cargoEhComercial(cargo?.nome) ? usuarioId : null
}
