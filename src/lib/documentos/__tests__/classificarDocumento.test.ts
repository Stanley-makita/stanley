import { describe, it, expect, vi, beforeEach } from 'vitest'

const estado = vi.hoisted(() => ({
  respostasIA: [] as Array<string | Error>,
  chamadasIA: 0,
  doc: null as null | Record<string, unknown>,
  updatesDocumentos: [] as Array<Record<string, unknown>>,
}))

vi.mock('@anthropic-ai/sdk', () => ({
  default: class AnthropicMock {
    messages = {
      create: async () => {
        estado.chamadasIA++
        const r = estado.respostasIA.shift()
        if (r instanceof Error || r === undefined) throw r ?? new Error('sem resposta')
        return { content: [{ type: 'text', text: r }], stop_reason: 'end_turn' }
      },
    }
  },
}))

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    storage: {
      from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: 'https://x/arquivo' } }) }),
    },
    from(tabela: string) {
      const q: Record<string, unknown> = {}
      q.select = () => q
      q.eq = () => q
      q.is = () => q
      q.maybeSingle = () => Promise.resolve({ data: tabela === 'documentos' ? estado.doc : null, error: null })
      q.update = (v: Record<string, unknown>) => { if (tabela === 'documentos') estado.updatesDocumentos.push(v); return q }
      return q
    },
  },
}))

beforeEach(() => {
  estado.respostasIA = []
  estado.chamadasIA = 0
  estado.updatesDocumentos = []
  estado.doc = { id: 'd1', storage_path: 'a/b.jpg', storage_bucket: 'documentos-clientes', mime_type: 'image/jpeg', classificacao_legado: null }
  vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([1, 2, 3]))))
})

describe('classificarDocumentoPorId', () => {
  it('classifica e grava o tipo', async () => {
    estado.respostasIA = ['{"tipo_documento":"cnh","confianca":"alta"}']
    const { classificarDocumentoPorId } = await import('../ocr')
    const r = await classificarDocumentoPorId('d1', 'empresa-1')
    expect(r).toEqual({ tipo: 'cnh' })
    expect(estado.updatesDocumentos).toContainEqual({ classificacao_legado: 'cnh' })
  })

  it("grava 'outro' (não null) pra não pagar de novo", async () => {
    estado.respostasIA = ['{"tipo_documento":"outro","confianca":"media"}']
    const { classificarDocumentoPorId } = await import('../ocr')
    await classificarDocumentoPorId('d1', 'empresa-1')
    expect(estado.updatesDocumentos).toContainEqual({ classificacao_legado: 'outro' })
  })

  it('tipo já conhecido não chama a IA', async () => {
    estado.doc = { ...estado.doc!, classificacao_legado: 'outro' }
    const { classificarDocumentoPorId } = await import('../ocr')
    const r = await classificarDocumentoPorId('d1', 'empresa-1')
    expect(r).toEqual({ tipo: 'outro' })
    expect(estado.chamadasIA).toBe(0)
  })

  it('áudio não vai pra IA', async () => {
    estado.doc = { ...estado.doc!, mime_type: 'audio/ogg' }
    const { classificarDocumentoPorId } = await import('../ocr')
    const r = await classificarDocumentoPorId('d1', 'empresa-1')
    expect(r).toEqual({ tipo: null, motivo: 'nao_suportado' })
    expect(estado.chamadasIA).toBe(0)
  })

  it('JSON inválido da IA vira erro isolado, sem lançar', async () => {
    estado.respostasIA = ['isto não é json']
    const { classificarDocumentoPorId } = await import('../ocr')
    const r = await classificarDocumentoPorId('d1', 'empresa-1')
    expect(r).toEqual({ tipo: null, motivo: 'erro' })
  })
})
