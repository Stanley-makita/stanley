import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Único mock necessário para importar route.ts com segurança: `@supabase/supabase-js`
// é chamado no nível de módulo (top-level `createClient(...)`) tanto em route.ts quanto
// em src/lib/pessoa.ts (importado transitivamente) — sem mock, o import falha com
// "supabaseUrl is required" antes mesmo do teste rodar. Os demais imports transitivos
// (agente.ts, fonti-comandos.ts) só constroem um client Anthropic, que não lança erro
// na ausência de API key — não precisam de mock pra este cenário, que retorna antes de
// qualquer um deles ser efetivamente chamado.
const chamadasEscrita: Array<{ tabela: string; metodo: string }> = []
const tabelasConsultadas = new Set<string>()

function criarFakeSupabase() {
  const builder = (tabela: string) => {
    tabelasConsultadas.add(tabela)
    const proxy: Record<string, unknown> = {}
    const encadeavel = () => proxy
    Object.assign(proxy, {
      select: encadeavel,
      eq: encadeavel,
      like: encadeavel,
      in: encadeavel,
      gte: encadeavel,
      limit: encadeavel,
      order: encadeavel,
      insert: (..._args: unknown[]) => {
        chamadasEscrita.push({ tabela, metodo: 'insert' })
        return proxy
      },
      update: (..._args: unknown[]) => {
        chamadasEscrita.push({ tabela, metodo: 'update' })
        return proxy
      },
      upsert: (..._args: unknown[]) => {
        chamadasEscrita.push({ tabela, metodo: 'upsert' })
        return proxy
      },
      delete: () => {
        chamadasEscrita.push({ tabela, metodo: 'delete' })
        return proxy
      },
      // Nenhuma instância é encontrada — é exatamente o cenário sob teste.
      maybeSingle: async () => ({ data: null, error: null }),
      single: async () => ({ data: null, error: null }),
    })
    return proxy
  }

  return {
    from: builder,
    storage: { from: () => ({ upload: async () => ({ error: null }) }) },
  }
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => criarFakeSupabase()),
}))

describe('POST /api/bot/whatsapp/webhook — instância não resolvida', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    chamadasEscrita.length = 0
    tabelasConsultadas.clear()
    fetchMock.mockReset()
    // Cobre baixarMidiaUazapi() e enviarMensagemUazapi() — nenhuma chamada externa deve
    // acontecer neste cenário.
    vi.stubGlobal('fetch', fetchMock)
    process.env.UAZAPI_WEBHOOK_TOKEN = 'segredo-teste'
    // Fallback de empresa DELIBERADAMENTE presente: prova que mesmo com esse fallback
    // disponível, a ausência de instância resolvida ainda bloqueia o processamento (é
    // exatamente o reforço adicionado nesta sprint, não o comportamento antigo).
    process.env.UAZAPI_EMPRESA_ID = 'empresa-fallback-teste'
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.UAZAPI_EMPRESA_ID
  })

  it('evento "messages" válido, instância não resolvida → 200 ok, sem reivindicar evento, sem baixar mídia, sem tocar nenhuma outra entidade', async () => {
    const { POST } = await import('../route')
    const { NextRequest } = await import('next/server')

    const payload = {
      EventType: 'messages',
      token: 'token-que-nao-existe-no-banco',
      message: {
        fromMe: false,
        isGroup: false,
        type: 'text',
        text: 'ola, preciso de ajuda',
        content: 'ola, preciso de ajuda',
        sender_pn: '5511900000000@s.whatsapp.net',
        senderName: 'Teste Automatizado',
        messageid: 'msg-instancia-nao-resolvida-' + Date.now(),
      },
    }

    const request = new NextRequest(
      'http://localhost/api/bot/whatsapp/webhook?token=segredo-teste',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    )

    const response = await POST(request)

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })

    // Nenhum INSERT em fonti_events (nem em nenhuma outra tabela — Pessoa, Conversa,
    // Mensagem, Captação, Documento: nenhuma escrita de nenhum tipo ocorreu).
    expect(chamadasEscrita).toEqual([])

    // Nenhuma chamada externa (download de mídia via baixarMidiaUazapi, envio de
    // resposta via enviarMensagemUazapi, ou qualquer chamada de comando/LLM).
    expect(fetchMock).not.toHaveBeenCalled()

    // Única tabela sequer consultada foi `instancias`, na tentativa de resolução —
    // nenhum outro domínio (pessoas, conversas, fonti_events, documentos) foi lido.
    expect(tabelasConsultadas).toEqual(new Set(['instancias']))
  })
})
