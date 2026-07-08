/**
 * Consistência de amortização no PDF: a seção "Dados da Simulação" mostrava o
 * `tipoAmortizacao` GLOBAL do input, enquanto "Melhor Cenário Encontrado" mostrava a
 * amortização do resultado vencedor — podiam divergir (ex.: Caixa elegível só em SAC
 * enquanto o input global pedia PRICE para outro banco da mesma simulação). Este teste
 * garante que as duas seções sempre concordam, usando a mesma técnica de mock de
 * `jspdf` já usada em gerarPDFBuffer.test.ts (grava todo `text()` chamado).
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

describe('gerarPDFFinanciamentoBuffer — consistência de amortização', () => {
  it('"Dados da Simulação" reflete a amortização do Melhor Cenário, não o input global divergente', async () => {
    // Input global pede PRICE, mas o único banco da simulação (Itaú) foi pedido em SAC
    // via amortizacaoPorBanco — o Melhor Cenário deve mostrar SAC.
    const input: InputFinanciamento = {
      valorImovel:     900_000,
      valorEntrada:    350_000,
      dataNascimento:  '1990-06-15',
      rendaMensal:     20_000,
      tipoAmortizacao: 'PRICE',
      amortizacaoPorBanco: { itau: 'SAC' },
      correntista:     false,
      bancosIds:       ['itau'],
      tipoImovel:      'usado',
      finalidade:      'residencial',
    }
    const bancos = simularTodosBancos(input)
    const melhor = bancos.find((b) => b.elegivel)
    expect(melhor?.tipoAmortizacao).toBe('SAC') // pré-condição do fixture

    const analise = calcularAnalise(input, bancos)
    const resultado: ResultadoCompleto = { input, bancos, analise, dataSimulacao: new Date().toISOString() }

    await gerarPDFFinanciamentoBuffer(resultado)

    // Primeira ocorrência = seção "Dados da Simulação" (vem antes de "Detalhes por
    // Banco", que também rotula um campo "Amortização" por banco).
    const idxAmortizacao = registrados.textos.indexOf('Amortização')
    expect(idxAmortizacao).toBeGreaterThanOrEqual(0)
    expect(registrados.textos[idxAmortizacao + 1]).toBe('SAC')
    // O valor global (PRICE) não deve aparecer como a "Amortização" exibida.
    expect(registrados.textos[idxAmortizacao + 1]).not.toBe('PRICE')
  })
})
