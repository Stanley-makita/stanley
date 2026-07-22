import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Banco em memória simplificado — cobre só os métodos usados pelo código
// real (from/select/insert/update/delete/eq/single/maybeSingle + await direto,
// já que o código chama `await supabaseAdmin.from(...).update(...).eq(...)`
// sem `.single()` em alguns pontos).
// ---------------------------------------------------------------------------

interface FakeDb {
  contratos: Map<string, any>
  eventos: Map<string, any> // chave: processo_contrato_id
  forcarErroCasUmaVez: boolean
  forcarErroUpdateUrlUmaVez: boolean
}

function criarFakeSupabaseAdmin(db: FakeDb) {
  let eventoSeq = 0

  function from(table: string) {
    let op: 'select' | 'insert' | 'update' | 'delete' = 'select'
    let payload: any = null
    const filtros: [string, any][] = []

    async function executar() {
      if (table === 'clicksign_fechamentos') {
        if (op === 'insert') {
          const contratoId = payload.processo_contrato_id
          if (db.eventos.has(contratoId)) {
            return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } }
          }
          const row = {
            id: `evento-${++eventoSeq}`,
            processo_contrato_id: contratoId,
            evento: payload.evento,
            origem: payload.origem,
            status: 'processando',
            detalhe_falha: null,
          }
          db.eventos.set(contratoId, row)
          return { data: { id: row.id }, error: null }
        }
        if (op === 'select') {
          const porContrato = filtros.find(([c]) => c === 'processo_contrato_id')?.[1]
          const porId = filtros.find(([c]) => c === 'id')?.[1]
          let row: any = null
          if (porContrato) row = db.eventos.get(porContrato) ?? null
          if (porId) row = Array.from(db.eventos.values()).find((e) => e.id === porId) ?? null
          return { data: row, error: null }
        }
        if (op === 'update') {
          const porId = filtros.find(([c]) => c === 'id')?.[1]
          const row = Array.from(db.eventos.values()).find((e) => e.id === porId)
          if (row) Object.assign(row, payload)
          return { data: null, error: null }
        }
        if (op === 'delete') {
          const porId = filtros.find(([c]) => c === 'id')?.[1]
          const row = Array.from(db.eventos.values()).find((e) => e.id === porId)
          if (row) db.eventos.delete(row.processo_contrato_id)
          return { data: null, error: null }
        }
      }

      if (table === 'processo_contratos' && op === 'update') {
        const porId = filtros.find(([c]) => c === 'id')?.[1]
        const statusFiltro = filtros.find(([c]) => c === 'clicksign_status')?.[1]
        const row = db.contratos.get(porId)
        if (!row) return { data: null, error: null }

        if (statusFiltro !== undefined && row.clicksign_status !== statusFiltro) {
          // CAS não bateu — outro caminho já mudou o estado.
          return { data: null, error: null }
        }

        if (db.forcarErroCasUmaVez && statusFiltro !== undefined) {
          db.forcarErroCasUmaVez = false
          return { data: null, error: { message: 'erro simulado de rede' } }
        }

        if (db.forcarErroUpdateUrlUmaVez && statusFiltro === undefined && 'clicksign_signed_url' in payload) {
          db.forcarErroUpdateUrlUmaVez = false
          return { data: null, error: { message: 'erro simulado ao gravar url' } }
        }

        Object.assign(row, payload)
        return { data: { id: row.id }, error: null }
      }

      return { data: null, error: null }
    }

    const builder: any = {
      select: () => builder,
      insert: (obj: any) => { op = 'insert'; payload = obj; return builder },
      update: (obj: any) => { op = 'update'; payload = obj; return builder },
      delete: () => { op = 'delete'; return builder },
      eq: (col: string, val: any) => { filtros.push([col, val]); return builder },
      single: () => executar(),
      maybeSingle: () => executar(),
      then: (resolve: any, reject: any) => executar().then(resolve, reject),
    }
    return builder
  }

  return { from }
}

let db: FakeDb

vi.mock('@/lib/supabase/admin', () => ({
  get supabaseAdmin() {
    return criarFakeSupabaseAdmin(db)
  },
}))

const buscarDocumentoMock = vi.fn((..._args: any[]) =>
  Promise.resolve({ status: 'closed', signed_url: 'https://clicksign.example/raw-signed.pdf' }),
)
const salvarPdfAssinadoEmStorageMock = vi.fn((..._args: any[]) =>
  Promise.resolve('https://supabase.example/signed/contrato.pdf'),
)

vi.mock('@/lib/clicksign/client', () => ({
  buscarDocumento: buscarDocumentoMock,
}))

vi.mock('@/lib/clicksign/storage', () => ({
  salvarPdfAssinadoEmStorage: salvarPdfAssinadoEmStorageMock,
}))

function contratoRunning(id: string) {
  return {
    id,
    empresa_id: 'empresa-1',
    clicksign_status: 'running' as string | null,
    clicksign_envelope_id: 'envelope-1',
    clicksign_document_id: 'document-1',
    clicksign_signed_url: null as string | null,
  }
}

describe('processarFechamentoContratoClicksign', () => {
  beforeEach(() => {
    db = { contratos: new Map(), eventos: new Map(), forcarErroCasUmaVez: false, forcarErroUpdateUrlUmaVez: false }
    buscarDocumentoMock.mockClear()
    salvarPdfAssinadoEmStorageMock.mockClear()
  })

  it('idempotente: contrato já fechado com URL — não chama ClickSign nem reivindica evento', async () => {
    const { processarFechamentoContratoClicksign } = await import('../processarFechamento')
    const contrato = {
      id: 'contrato-1',
      empresa_id: 'empresa-1',
      clicksign_status: 'closed',
      clicksign_envelope_id: 'envelope-1',
      clicksign_document_id: 'document-1',
      clicksign_signed_url: 'https://ja-existe.pdf',
    }

    const resultado = await processarFechamentoContratoClicksign({ contrato, origem: 'webhook', evento: 'close' })

    expect(resultado).toEqual({ status: 'closed', signed_url: 'https://ja-existe.pdf', idempotente: true })
    expect(buscarDocumentoMock).not.toHaveBeenCalled()
    expect(db.eventos.size).toBe(0)
  })

  it('estado desconhecido (nem running nem closed) não é processado', async () => {
    const { processarFechamentoContratoClicksign } = await import('../processarFechamento')
    const contrato = { ...contratoRunning('contrato-2'), clicksign_status: null }

    const resultado = await processarFechamentoContratoClicksign({ contrato, origem: 'webhook', evento: 'close' })

    expect(resultado.idempotente).toBe(true)
    expect(buscarDocumentoMock).not.toHaveBeenCalled()
    expect(db.eventos.size).toBe(0)
  })

  it('fluxo completo: running -> closed, busca documento e salva URL', async () => {
    const { processarFechamentoContratoClicksign } = await import('../processarFechamento')
    const contrato = contratoRunning('contrato-3')
    db.contratos.set(contrato.id, { ...contrato })

    const resultado = await processarFechamentoContratoClicksign({ contrato, origem: 'webhook', evento: 'close' })

    expect(resultado.idempotente).toBe(false)
    expect(resultado.status).toBe('closed')
    expect(resultado.signed_url).toBe('https://supabase.example/signed/contrato.pdf')
    expect(buscarDocumentoMock).toHaveBeenCalledWith('envelope-1', 'document-1')
    expect(salvarPdfAssinadoEmStorageMock).toHaveBeenCalledWith(
      'https://clicksign.example/raw-signed.pdf', 'contrato-3', 'empresa-1',
    )
    expect(db.contratos.get('contrato-3').clicksign_status).toBe('closed')
    expect(db.contratos.get('contrato-3').clicksign_signed_url).toBe('https://supabase.example/signed/contrato.pdf')
    expect(db.eventos.get('contrato-3').status).toBe('processado')
  })

  it('reivindicação concorrente: segunda chamada para o mesmo contrato é idempotente e não repete download/upload', async () => {
    const { processarFechamentoContratoClicksign } = await import('../processarFechamento')
    const contrato = contratoRunning('contrato-4')
    db.contratos.set(contrato.id, { ...contrato })

    const primeira = await processarFechamentoContratoClicksign({ contrato, origem: 'webhook', evento: 'close' })
    // Segunda chamada usa o MESMO snapshot "running" (simulando duas
    // requisições concorrentes que leram o contrato antes de qualquer uma
    // delas terminar de processar).
    const segunda = await processarFechamentoContratoClicksign({ contrato, origem: 'polling', evento: 'polling_verificacao' })

    expect(primeira.idempotente).toBe(false)
    expect(segunda.idempotente).toBe(true)
    expect(buscarDocumentoMock).toHaveBeenCalledTimes(1)
    expect(salvarPdfAssinadoEmStorageMock).toHaveBeenCalledTimes(1)
  })

  it('CAS perde a corrida (contrato já fechado no banco entre a leitura e a tentativa) — idempotente', async () => {
    const { processarFechamentoContratoClicksign } = await import('../processarFechamento')
    const contrato = contratoRunning('contrato-5')
    // Banco já está 'closed' (outra chamada fechou primeiro), mas o snapshot
    // recebido pela função ainda diz 'running' — cenário real de corrida.
    db.contratos.set(contrato.id, { ...contrato, clicksign_status: 'closed', clicksign_signed_url: 'https://ja-fechado.pdf' })

    const resultado = await processarFechamentoContratoClicksign({ contrato, origem: 'webhook', evento: 'close' })

    expect(resultado).toEqual({ status: 'closed', signed_url: null, idempotente: true })
    expect(buscarDocumentoMock).not.toHaveBeenCalled()
    expect(db.eventos.get('contrato-5').status).toBe('processado')
  })

  it('falha na transição (erro simulado) marca o evento como falhou e relança o erro', async () => {
    const { processarFechamentoContratoClicksign } = await import('../processarFechamento')
    const contrato = contratoRunning('contrato-6')
    db.contratos.set(contrato.id, { ...contrato })
    db.forcarErroCasUmaVez = true

    await expect(
      processarFechamentoContratoClicksign({ contrato, origem: 'webhook', evento: 'close' }),
    ).rejects.toThrow('erro simulado de rede')

    expect(db.eventos.get('contrato-6').status).toBe('falhou')
    expect(buscarDocumentoMock).not.toHaveBeenCalled()
  })

  it('depois de uma falha registrada, uma nova tentativa consegue reivindicar de novo', async () => {
    const { processarFechamentoContratoClicksign } = await import('../processarFechamento')
    const contrato = contratoRunning('contrato-7')
    db.contratos.set(contrato.id, { ...contrato })
    db.forcarErroCasUmaVez = true

    await expect(
      processarFechamentoContratoClicksign({ contrato, origem: 'webhook', evento: 'close' }),
    ).rejects.toThrow()
    expect(db.eventos.get('contrato-7').status).toBe('falhou')

    // Nova tentativa (ex.: reenvio do webhook) — desta vez sem erro simulado.
    const resultado = await processarFechamentoContratoClicksign({ contrato, origem: 'webhook', evento: 'close' })

    expect(resultado.idempotente).toBe(false)
    expect(resultado.status).toBe('closed')
    expect(db.eventos.get('contrato-7').status).toBe('processado')
  })

  it('usa envelopeIdFallback quando o contrato ainda não tem clicksign_envelope_id salvo', async () => {
    const { processarFechamentoContratoClicksign } = await import('../processarFechamento')
    const contrato = { ...contratoRunning('contrato-8'), clicksign_envelope_id: null }
    db.contratos.set(contrato.id, { ...contrato })

    await processarFechamentoContratoClicksign({
      contrato,
      origem: 'webhook',
      evento: 'close',
      envelopeIdFallback: 'envelope-vindo-do-payload',
    })

    expect(buscarDocumentoMock).toHaveBeenCalledWith('envelope-vindo-do-payload', 'document-1')
  })

  it('contrato já closed mas sem PDF: pula a reivindicação e tenta buscar/salvar a URL direto', async () => {
    const { processarFechamentoContratoClicksign } = await import('../processarFechamento')
    const contrato = { ...contratoRunning('contrato-9'), clicksign_status: 'closed' as const, clicksign_signed_url: null }
    db.contratos.set(contrato.id, { ...contrato })

    const resultado = await processarFechamentoContratoClicksign({ contrato, origem: 'polling', evento: 'polling_verificacao' })

    expect(resultado.idempotente).toBe(false)
    expect(resultado.signed_url).toBe('https://supabase.example/signed/contrato.pdf')
    expect(db.eventos.size).toBe(0) // nunca reivindicou — estado já era 'closed'
    expect(buscarDocumentoMock).toHaveBeenCalledTimes(1)
  })

  it('falha no download propaga o erro (permite retry do chamador) — transição já concluída não é desfeita', async () => {
    buscarDocumentoMock.mockRejectedValueOnce(new Error('timeout ao buscar documento'))
    const { processarFechamentoContratoClicksign } = await import('../processarFechamento')
    const contrato = contratoRunning('contrato-10')
    db.contratos.set(contrato.id, { ...contrato })

    await expect(
      processarFechamentoContratoClicksign({ contrato, origem: 'webhook', evento: 'close' }),
    ).rejects.toThrow('timeout ao buscar documento')

    // Transição running->closed já havia sido concluída (marcada 'processado')
    // antes da tentativa de busca do documento — a falha no download não a desfaz.
    expect(db.eventos.get('contrato-10').status).toBe('processado')
    expect(db.contratos.get('contrato-10').clicksign_status).toBe('closed')
    expect(db.contratos.get('contrato-10').clicksign_signed_url).toBeNull()

    // Nova tentativa (ex.: reenvio do webhook, ou polling manual) com o
    // estado fresco do banco (closed, sem URL) recupera sozinha, sem
    // precisar da tabela de eventos e sem repetir a transição de estado.
    const contratoFresco = { ...contrato, clicksign_status: 'closed' as const, clicksign_signed_url: null }
    const resultado2 = await processarFechamentoContratoClicksign({ contrato: contratoFresco, origem: 'polling', evento: 'polling_verificacao' })
    expect(resultado2.signed_url).toBe('https://supabase.example/signed/contrato.pdf')
  })

  it('falha ao gravar clicksign_signed_url no banco propaga o erro', async () => {
    const { processarFechamentoContratoClicksign } = await import('../processarFechamento')
    const contrato = { ...contratoRunning('contrato-12'), clicksign_status: 'closed' as const, clicksign_signed_url: null }
    // Não registra o contrato em db.contratos — o UPDATE final não encontra
    // linha (row undefined), simulando uma falha de gravação; o mock
    // devolve {data:null,error:null} nesse caso hoje, então forçamos um erro
    // explícito via um contrato id sentinela reconhecido pelo fake DB.
    db.contratos.set(contrato.id, { ...contrato })
    db.forcarErroUpdateUrlUmaVez = true

    await expect(
      processarFechamentoContratoClicksign({ contrato, origem: 'polling', evento: 'polling_verificacao' }),
    ).rejects.toThrow('erro simulado ao gravar url')
  })

  it('falha ao salvar no Storage cai no fallback: usa a URL crua da ClickSign', async () => {
    salvarPdfAssinadoEmStorageMock.mockRejectedValueOnce(new Error('bucket indisponível'))
    const { processarFechamentoContratoClicksign } = await import('../processarFechamento')
    const contrato = contratoRunning('contrato-11')
    db.contratos.set(contrato.id, { ...contrato })

    const resultado = await processarFechamentoContratoClicksign({ contrato, origem: 'webhook', evento: 'close' })

    expect(resultado.signed_url).toBe('https://clicksign.example/raw-signed.pdf')
    expect(db.contratos.get('contrato-11').clicksign_signed_url).toBe('https://clicksign.example/raw-signed.pdf')
  })
})
