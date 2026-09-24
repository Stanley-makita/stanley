import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Testes de integração de processarOcrDocumento (spec 2026-09-24, item pendente
 * do review final): cobre o atalho de classificação quando o tipo já é
 * conhecido, e a atribuição de pasta (preencherPastaDeVinculosLeadSemPasta)
 * respeitando o papel de vendedor no lead — mesmo estilo de mock de
 * classificarDocumento.test.ts (Anthropic mockado com fila de respostas,
 * supabase admin como stub encadeável, fetch stubado pro download).
 */
const estado = vi.hoisted(() => ({
  respostasIA: [] as Array<string | Error>,
  chamadasIA: 0,
  doc: null as null | Record<string, unknown>,
  tiposCatalogo: {} as Record<string, string | null>,   // codigo do tipo -> pasta_sugerida_codigo
  pastasCatalogo: {} as Record<string, string>,          // codigo da pasta -> id
  vendedoresPorLead: {} as Record<string, string[]>,     // lead_id -> [pessoa_id]
  vinculosLead: [] as Array<{ id: string; documento_id: string; entidade_id: string; entidade_tipo: string; pasta_id: string | null }>,
  updatesDocumentos: [] as Array<Record<string, unknown>>,
  updatesVinculos: [] as Array<{ id: string; valores: Record<string, unknown> }>,
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

vi.mock('@/lib/supabase/admin', () => {
  function tabelaDocumentos() {
    const filtros: Record<string, unknown> = {}
    const q: Record<string, unknown> = {}
    q.select = () => q
    q.eq = (k: string, v: unknown) => { filtros[k] = v; return q }
    q.is = () => q
    q.maybeSingle = () => Promise.resolve({
      data: estado.doc && estado.doc.id === filtros.id ? estado.doc : null,
      error: null,
    })
    q.update = (v: Record<string, unknown>) => {
      estado.updatesDocumentos.push(v)
      return { eq: () => Promise.resolve({ data: null, error: null }) }
    }
    return q
  }

  function tabelaExtracoesOcr() {
    const q: Record<string, unknown> = {}
    q.insert = () => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 'ext-1' }, error: null }) }) })
    q.update = () => q
    q.eq = () => q
    return q
  }

  function tabelaDocumentoVinculos() {
    const filtros: Record<string, unknown> = {}
    let filtroPastaNull = false
    const q: Record<string, unknown> = {}
    q.select = () => q
    q.eq = (k: string, v: unknown) => { filtros[k] = v; return q }
    q.is = (k: string, v: unknown) => { if (k === 'pasta_id' && v === null) filtroPastaNull = true; return q }
    q.update = (v: Record<string, unknown>) => ({
      eq: (k: string, val: unknown) => {
        filtros[k] = val
        return {
          is: () => {
            const row = estado.vinculosLead.find(r => r.id === filtros.id)
            if (row) Object.assign(row, v)
            estado.updatesVinculos.push({ id: filtros.id as string, valores: v })
            return Promise.resolve({ data: null, error: null })
          },
        }
      },
    })
    // bare await (select().eq()...is()) — duck-typed thenable
    q.then = (resolve: (v: { data: unknown; error: null }) => void) => {
      const rows = estado.vinculosLead.filter(r =>
        (filtros.documento_id === undefined || r.documento_id === filtros.documento_id) &&
        (filtros.entidade_tipo === undefined || r.entidade_tipo === filtros.entidade_tipo) &&
        (!filtroPastaNull || r.pasta_id === null),
      )
      resolve({ data: rows, error: null })
    }
    return q
  }

  function tabelaLeadVendedores() {
    const filtros: Record<string, unknown> = {}
    const q: Record<string, unknown> = {}
    q.select = () => q
    q.eq = (k: string, v: unknown) => { filtros[k] = v; return q }
    q.then = (resolve: (v: { data: unknown; error: null }) => void) => {
      const ids = estado.vendedoresPorLead[filtros.lead_id as string] ?? []
      resolve({ data: ids.map(id => ({ pessoa_id: id })), error: null })
    }
    return q
  }

  function tabelaCatalogoTipos() {
    const filtros: Record<string, unknown> = {}
    const q: Record<string, unknown> = {}
    q.select = () => q
    q.eq = (k: string, v: unknown) => { filtros[k] = v; return q }
    q.maybeSingle = () => {
      const codigo = filtros.codigo as string
      const valor = estado.tiposCatalogo[codigo]
      return Promise.resolve({ data: valor !== undefined ? { pasta_sugerida_codigo: valor } : null, error: null })
    }
    return q
  }

  function tabelaCatalogoPastas() {
    const filtros: Record<string, unknown> = {}
    const q: Record<string, unknown> = {}
    q.select = () => q
    q.eq = (k: string, v: unknown) => { filtros[k] = v; return q }
    q.maybeSingle = () => {
      const id = estado.pastasCatalogo[filtros.codigo as string]
      return Promise.resolve({ data: id ? { id } : null, error: null })
    }
    return q
  }

  return {
    supabaseAdmin: {
      storage: {
        from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: 'https://x/arquivo' } }) }),
      },
      from(tabela: string) {
        switch (tabela) {
          case 'documentos': return tabelaDocumentos()
          case 'extracoes_ocr': return tabelaExtracoesOcr()
          case 'documento_vinculos': return tabelaDocumentoVinculos()
          case 'lead_vendedores': return tabelaLeadVendedores()
          case 'catalogo_tipos_documento': return tabelaCatalogoTipos()
          case 'catalogo_pastas_processo': return tabelaCatalogoPastas()
          default: throw new Error('tabela não mockada em processarOcrDocumento.test.ts: ' + tabela)
        }
      },
    },
  }
})

beforeEach(() => {
  estado.respostasIA = []
  estado.chamadasIA = 0
  estado.doc = {
    id: 'd1', pessoa_id: 'pessoa-1', storage_path: 'a/b.jpg', storage_bucket: 'documentos-clientes',
    mime_type: 'image/jpeg', ocr_status: null, classificacao_legado: null,
  }
  estado.tiposCatalogo = {}
  estado.pastasCatalogo = {}
  estado.vendedoresPorLead = {}
  estado.vinculosLead = []
  estado.updatesDocumentos = []
  estado.updatesVinculos = []
  vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([1, 2, 3]))))
})

// SupabaseClient passado como 1º argumento não é usado pela função (lê/escreve
// só via supabaseAdmin) — um stub vazio basta pra satisfazer o tipo.
const supabaseClienteStub = {} as never

describe('processarOcrDocumento', () => {
  it('tipo já conhecido (cnh): só 1 chamada de IA (extração), sem classificação', async () => {
    estado.doc = { ...estado.doc!, classificacao_legado: 'cnh' }
    estado.respostasIA = ['{"tipo_documento":"cnh","confianca":"alta"}']
    const { processarOcrDocumento } = await import('../ocr')
    const r = await processarOcrDocumento(supabaseClienteStub, 'd1', 'empresa-1')
    expect(r).toEqual({})
    expect(estado.chamadasIA).toBe(1)
    expect(estado.updatesDocumentos).toContainEqual({ status_ocr: 'concluido', classificacao_legado: 'cnh' })
  })

  it('documento do vendedor do lead: vínculo sem pasta recebe a pasta de Vendedor (não a do tipo)', async () => {
    estado.doc = { ...estado.doc!, pessoa_id: 'vendedor-1', classificacao_legado: 'cnh' }
    estado.tiposCatalogo = { cnh: 'comprador' } // pasta sugerida pelo TIPO seria "comprador"
    estado.pastasCatalogo = { comprador: 'pasta-comprador-id', vendedor: 'pasta-vendedor-id' }
    estado.vendedoresPorLead = { 'lead-1': ['vendedor-1'] }
    estado.vinculosLead = [{ id: 'v1', documento_id: 'd1', entidade_id: 'lead-1', entidade_tipo: 'lead', pasta_id: null }]
    estado.respostasIA = ['{"tipo_documento":"cnh","confianca":"alta"}']

    const { processarOcrDocumento } = await import('../ocr')
    await processarOcrDocumento(supabaseClienteStub, 'd1', 'empresa-1')

    expect(estado.updatesVinculos).toContainEqual({ id: 'v1', valores: { pasta_id: 'pasta-vendedor-id' } })
  })

  it('documento da própria Pessoa do lead (tipo cnh): vínculo sem pasta recebe a pasta do TIPO', async () => {
    estado.doc = { ...estado.doc!, pessoa_id: 'pessoa-1', classificacao_legado: 'cnh' }
    estado.tiposCatalogo = { cnh: 'comprador' }
    estado.pastasCatalogo = { comprador: 'pasta-comprador-id' }
    estado.vendedoresPorLead = { 'lead-1': [] }
    estado.vinculosLead = [{ id: 'v2', documento_id: 'd1', entidade_id: 'lead-1', entidade_tipo: 'lead', pasta_id: null }]
    estado.respostasIA = ['{"tipo_documento":"cnh","confianca":"alta"}']

    const { processarOcrDocumento } = await import('../ocr')
    await processarOcrDocumento(supabaseClienteStub, 'd1', 'empresa-1')

    expect(estado.updatesVinculos).toContainEqual({ id: 'v2', valores: { pasta_id: 'pasta-comprador-id' } })
  })

  it('vínculo que já tem pasta não é sobrescrito', async () => {
    estado.doc = { ...estado.doc!, pessoa_id: 'vendedor-1', classificacao_legado: 'cnh' }
    estado.tiposCatalogo = { cnh: 'comprador' }
    estado.pastasCatalogo = { comprador: 'pasta-comprador-id', vendedor: 'pasta-vendedor-id' }
    estado.vendedoresPorLead = { 'lead-1': ['vendedor-1'] }
    estado.vinculosLead = [{ id: 'v3', documento_id: 'd1', entidade_id: 'lead-1', entidade_tipo: 'lead', pasta_id: 'pasta-ja-escolhida' }]
    estado.respostasIA = ['{"tipo_documento":"cnh","confianca":"alta"}']

    const { processarOcrDocumento } = await import('../ocr')
    await processarOcrDocumento(supabaseClienteStub, 'd1', 'empresa-1')

    expect(estado.updatesVinculos).toHaveLength(0)
  })
})
