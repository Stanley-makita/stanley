/**
 * `/api/push/dispatch` (Fase 5): recebe o Database Webhook do Supabase pra cada INSERT
 * em `notificacoes`. Precisa: (1) exigir o segredo compartilhado, (2) NUNCA disparar
 * push pra 'mensagem_whatsapp' (já é enviado direto pelo webhook do WhatsApp — duplicaria),
 * (3) disparar normalmente pros outros tipos (lead_atribuido, fase_avancada, etc.).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: {} }))

const enviarPushMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
vi.mock('@/lib/push/enviarPush', () => ({ enviarPushParaUsuario: enviarPushMock }))

const SEGREDO = 'segredo-de-teste'

function montarRequest(body: unknown, segredo?: string) {
  return new NextRequest('http://localhost/api/push/dispatch', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(segredo !== undefined ? { 'x-push-dispatch-secret': segredo } : {}),
    },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  enviarPushMock.mockClear()
  process.env.PUSH_DISPATCH_SECRET = SEGREDO
})

describe('POST /api/push/dispatch', () => {
  it('sem o segredo certo: 401, não envia push', async () => {
    const { POST } = await import('../route')
    const res = await POST(montarRequest({ type: 'INSERT', table: 'notificacoes', record: {} }, 'errado'))
    expect(res.status).toBe(401)
    expect(enviarPushMock).not.toHaveBeenCalled()
  })

  it('tipo mensagem_whatsapp: ignora (push já sai pelo webhook do WhatsApp, evita duplicar)', async () => {
    const { POST } = await import('../route')
    const res = await POST(montarRequest({
      type: 'INSERT', table: 'notificacoes',
      record: { id: 'n1', usuario_id: 'u1', tipo: 'mensagem_whatsapp', titulo: 'x', mensagem: 'x', entidade: 'conversa', entidade_id: 'c1' },
    }, SEGREDO))
    expect(res.status).toBe(200)
    expect(enviarPushMock).not.toHaveBeenCalled()
  })

  it('UPDATE (não INSERT): ignora', async () => {
    const { POST } = await import('../route')
    const res = await POST(montarRequest({
      type: 'UPDATE', table: 'notificacoes',
      record: { id: 'n1', usuario_id: 'u1', tipo: 'lead_atribuido', titulo: 'x', mensagem: null, entidade: null, entidade_id: null },
    }, SEGREDO))
    expect(res.status).toBe(200)
    expect(enviarPushMock).not.toHaveBeenCalled()
  })

  it('lead_atribuido: dispara push com titulo fixo "Fonti" e o deep-link certo', async () => {
    const { POST } = await import('../route')
    const res = await POST(montarRequest({
      type: 'INSERT', table: 'notificacoes',
      record: { id: 'n1', usuario_id: 'u1', tipo: 'lead_atribuido', titulo: 'Lead atribuído a você', mensagem: 'João Silva', entidade: 'lead', entidade_id: 'lead-9' },
    }, SEGREDO))
    expect(res.status).toBe(200)
    expect(enviarPushMock).toHaveBeenCalledWith(
      expect.anything(), 'u1',
      { titulo: 'Fonti', corpo: 'João Silva', url: '/leads/lead-9' },
    )
  })

  it('sem mensagem (só titulo): usa o titulo como corpo do push', async () => {
    const { POST } = await import('../route')
    await POST(montarRequest({
      type: 'INSERT', table: 'notificacoes',
      record: { id: 'n2', usuario_id: 'u1', tipo: 'processo_emitido', titulo: 'Processo emitido!', mensagem: null, entidade: 'processo', entidade_id: 'p1' },
    }, SEGREDO))
    expect(enviarPushMock).toHaveBeenCalledWith(expect.anything(), 'u1', expect.objectContaining({ corpo: 'Processo emitido!' }))
  })
})
