import type { SupabaseClient } from '@supabase/supabase-js'

// Quem recebe o aviso (sino + toast + push) de uma mensagem nova do Instagram.
// Regra (decisão do Marcio, 06/10/2026):
// 1. Conversa já tem dono (`conversas.responsavel_avisos_id`, quem respondeu
//    ou criou/vinculou o Lead) → só ele.
// 2. Sem dono → usuários marcados em Configurações › Canais de Captação
//    (`canais_leads_config.instagram_atendentes`).
// 3. Lista vazia (ou ninguém dela ativo) → admin/gestor ativos, pra nenhuma
//    mensagem ficar sem ninguém avisado.
// Sempre filtrado por usuário ativo da mesma empresa.

export const PERFIS_FALLBACK_AVISO_INSTAGRAM = ['admin', 'gestor'] as const

interface UsuarioAtivo {
  id: string
  perfil: string | null
}

export function escolherDestinatariosAviso(params: {
  responsavelAvisosId: string | null
  atendentesConfigurados: string[]
  usuariosAtivos: UsuarioAtivo[]
}): string[] {
  const ativos = new Set(params.usuariosAtivos.map((u) => u.id))

  if (params.responsavelAvisosId && ativos.has(params.responsavelAvisosId)) {
    return [params.responsavelAvisosId]
  }

  const daLista = params.atendentesConfigurados.filter((id, i, lista) => ativos.has(id) && lista.indexOf(id) === i)
  if (daLista.length > 0) return daLista

  return params.usuariosAtivos
    .filter((u) => (PERFIS_FALLBACK_AVISO_INSTAGRAM as readonly string[]).includes(u.perfil ?? ''))
    .map((u) => u.id)
}

export async function buscarDestinatariosAviso(
  supabase: SupabaseClient,
  empresaId: string,
  responsavelAvisosId: string | null,
): Promise<string[]> {
  const [{ data: config, error: erroConfig }, { data: usuarios, error: erroUsuarios }] = await Promise.all([
    supabase
      .from('canais_leads_config')
      .select('instagram_atendentes')
      .eq('empresa_id', empresaId)
      .abortSignal(AbortSignal.timeout(10_000))
      .maybeSingle(),
    supabase
      .from('usuarios')
      .select('id, perfil')
      .eq('empresa_id', empresaId)
      .eq('ativo', true)
      .abortSignal(AbortSignal.timeout(10_000)),
  ])
  if (erroConfig) console.error('[instagram-aviso] erro ao ler canais_leads_config:', erroConfig)
  if (erroUsuarios) console.error('[instagram-aviso] erro ao ler usuarios:', erroUsuarios)

  return escolherDestinatariosAviso({
    responsavelAvisosId,
    atendentesConfigurados: (config?.instagram_atendentes as string[] | null) ?? [],
    usuariosAtivos: (usuarios ?? []) as UsuarioAtivo[],
  })
}

/**
 * Marca o usuário como dono da conversa do Instagram pros avisos — só se ela
 * ainda não tiver dono (o primeiro que pega fica; transferência não mexe aqui).
 * Nunca lança: falhar aqui não pode impedir o envio/vínculo que chamou.
 */
export async function assumirAvisosConversaInstagram(
  supabase: SupabaseClient,
  conversaId: string,
  usuarioId: string,
): Promise<void> {
  const { error } = await supabase
    .from('conversas')
    .update({ responsavel_avisos_id: usuarioId })
    .eq('id', conversaId)
    .eq('canal', 'instagram')
    .is('responsavel_avisos_id', null)
  if (error) console.error('[instagram-aviso] erro ao definir dono dos avisos:', error)
}
