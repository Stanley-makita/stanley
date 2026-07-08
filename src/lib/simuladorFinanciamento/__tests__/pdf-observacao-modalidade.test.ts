/**
 * Nota de modalidade (ResultadoBanco.observacao) no PDF servidor (usado pelo WhatsApp) —
 * antes desta correção, só o PDF cliente (simulador manual) e o Card do CRM renderizavam
 * essa nota; o PDF anexado nas conversas de WhatsApp nunca explicava por que só a Caixa
 * aparece elegível em modalidades de lote/construção/comercial.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { gerarPDFFinanciamentoBuffer } from '../gerarPDFBuffer'
import { simularTodosBancos, calcularAnalise } from '../engine'
import type { InputFinanciamento, ResultadoCompleto } from '../tipos'

const registrados = vi.hoisted(() => ({ textos: [] as string[] }))

vi.mock('jspdf', async (importOriginal) => {
  const actual = await importOriginal<typeof import('jspdf')>()
  class JsPDFComRegistro extends actual.jsPDF {
    constructor(...args: ConstructorParameters<typeof actual.jsPDF>) {
      super(...args)
      const textoOriginal = this.text.bind(this)
      this.text = ((...args: Parameters<typeof textoOriginal>) => {
        const txt = args[0]
        if (typeof txt === 'string') registrados.textos.push(txt)
        else if (Array.isArray(txt)) registrados.textos.push(...txt.filter((t): t is string => typeof t === 'string'))
        return textoOriginal(...args)
      }) as typeof textoOriginal
    }
  }
  return { ...actual, jsPDF: JsPDFComRegistro }
})

beforeEach(() => {
  registrados.textos = []
})

describe('gerarPDFFinanciamentoBuffer — nota de modalidade', () => {
  it('desenha a nota "Nota:" com a observação de modalidade (lote/construção/comercial)', async () => {
    const input: InputFinanciamento = {
      valorImovel:     300_000,
      valorEntrada:    100_000,
      dataNascimento:  '1990-06-15',
      rendaMensal:     20_000,
      tipoAmortizacao: 'SAC',
      correntista:     false,
      bancosIds:       ['itau', 'caixa'],
      finalidade:      'residencial',
      tipoOperacao:    'lote_urbanizado',
    }
    const bancos = simularTodosBancos(input)
    expect(bancos.some((b) => b.observacao)).toBe(true) // pré-condição do fixture

    const analise = calcularAnalise(input, bancos)
    const resultado: ResultadoCompleto = { input, bancos, analise, dataSimulacao: new Date().toISOString() }

    await gerarPDFFinanciamentoBuffer(resultado)

    expect(registrados.textos).toContain('Nota:')
    expect(registrados.textos.some((t) => t.includes('principal referência operacional'))).toBe(true)
  })

  it('não desenha a nota quando a operação é aquisição simples', async () => {
    const input: InputFinanciamento = {
      valorImovel:     300_000,
      valorEntrada:    100_000,
      dataNascimento:  '1990-06-15',
      rendaMensal:     20_000,
      tipoAmortizacao: 'SAC',
      correntista:     false,
      bancosIds:       ['caixa'],
      finalidade:      'residencial',
    }
    const bancos = simularTodosBancos(input)
    const analise = calcularAnalise(input, bancos)
    const resultado: ResultadoCompleto = { input, bancos, analise, dataSimulacao: new Date().toISOString() }

    await gerarPDFFinanciamentoBuffer(resultado)

    expect(registrados.textos).not.toContain('Nota:')
  })
})
