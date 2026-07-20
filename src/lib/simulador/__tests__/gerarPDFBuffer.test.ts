/**
 * Mesma abordagem de simuladorFinanciamento/__tests__/gerarPDFBuffer.test.ts: `jspdf` é
 * mockado com uma subclasse que grava toda chamada de `text()` antes de delegar para a
 * implementação real — confirma que as seções esperadas foram desenhadas sem depender de
 * uma biblioteca de extração de texto de PDF.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { gerarPDFCustasBuffer } from '../gerarPDFBuffer'
import { calcularCustas } from '../calcular'
import type { EntradaSimulador } from '@/types/simulador'

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

const ENTRADA_BASE: EntradaSimulador = {
  tipoImovel: 'Residencial',
  cidade: 'Maringá',
  valorCV: 300_000,
  valorFinanciado: 240_000,
  valorTerreno: 0,
  servicoRegistro: 1_500,
  valorCertidoes: 800,
  contratoParticular: 1_200,
  primeiraAquisicao: 'sim',
  isentoFunRejus: 'nao',
  banco: 'Caixa Econômica Federal',
  modalidade: 'aquisicao_pronto',
  produto: 'SBPE',
  iof: 0,
  iofVisivel: false,
}

beforeEach(() => {
  registrados.textos = []
})

describe('gerarPDFCustasBuffer', () => {
  it('gera um Buffer válido a partir de um resultado de calcularCustas', async () => {
    const resultado = calcularCustas(ENTRADA_BASE, undefined, undefined)

    const buffer = await gerarPDFCustasBuffer(resultado, {
      responsavelNome: 'Marcio Fontinhas',
      valorAssessoria: ENTRADA_BASE.servicoRegistro,
      valorContratoServico: ENTRADA_BASE.contratoParticular,
    })

    expect(buffer).toBeInstanceOf(Buffer)
    expect(buffer.byteLength).toBeGreaterThan(0)
  })

  it('desenha as seções de dados da operação e estimativa de custas', async () => {
    const resultado = calcularCustas(ENTRADA_BASE, undefined, undefined)

    await gerarPDFCustasBuffer(resultado)

    expect(registrados.textos.some((t) => t.includes('Dados da operacao'))).toBe(true)
    expect(registrados.textos.some((t) => t.includes('Estimativa de custas'))).toBe(true)
    expect(registrados.textos).toContain('ITBI')
    expect(registrados.textos).toContain('ESTIMATIVA TOTAL')
  })

  it('zera a linha de Reciprocidade no PDF mesmo quando o cálculo em tela mostra valor', async () => {
    const resultado = calcularCustas(ENTRADA_BASE, undefined, undefined)
    const reciprocidade = resultado.linhas.find((l) => l.id === 'reciprocidade')
    expect(reciprocidade?.comDesconto).toBeGreaterThan(0)

    await gerarPDFCustasBuffer(resultado)

    // A linha "Reciprocidade" ainda aparece (rótulo), mas o valor R$0,00 deve estar presente
    // ao lado dela — a descrição alternativa do PDF é o sinal mais direto de que a linha
    // ajustada (zerada) foi usada em vez da original.
    expect(registrados.textos).toContain('Reciprocidade')
    expect(registrados.textos.some((t) => t.includes('negociado'))).toBe(true)
  })
})
