import { supabase } from '@/lib/supabase'
import type { LadoNegocio, TitularNovoNegocio, VendedorEscolhido } from './escritaNegocio'

// Chamadas do navegador ao serviço único de participantes do negócio (V2 B2c-C1c). Lança Error com a
// mensagem da rota — os hooks mostram no toast.
async function chamar<T>(caminho: string, method: 'POST' | 'PATCH' | 'DELETE', corpo?: unknown): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(caminho, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  })
  const json = await res.json().catch(() => ({})) as T & { error?: string }
  if (!res.ok) throw new Error(json.error ?? 'Não foi possível salvar.')
  return json
}

export function incluirNoNegocio(processoId: string, lado: LadoNegocio, dados: Record<string, unknown>) {
  return chamar<{ id: string; pessoa_id: string | null }>(`/api/processos/${processoId}/${lado}`, 'POST', dados)
}

export function editarNoNegocio(processoId: string, lado: LadoNegocio, linhaId: string, dados: Record<string, unknown>) {
  return chamar<{ pessoa_id: string | null }>(`/api/processos/${processoId}/${lado}/${linhaId}`, 'PATCH', dados)
}

export function removerDoNegocio(processoId: string, lado: LadoNegocio, linhaId: string) {
  return chamar<{ ok: true }>(`/api/processos/${processoId}/${lado}/${linhaId}`, 'DELETE')
}

export function gravarParticipantesIniciais(processoId: string, corpo: {
  lead_id: string | null; titular: TitularNovoNegocio | null; vendedores?: VendedorEscolhido[] | null
}) {
  return chamar<{ ok: true }>(`/api/processos/${processoId}/participantes-iniciais`, 'POST', corpo)
}
