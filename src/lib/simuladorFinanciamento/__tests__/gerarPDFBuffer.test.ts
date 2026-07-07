/**
 * Comparação de Cenários no PDF (SAC×PRICE automático da Caixa) — Fase 4 pós-migração.
 * Ver docs/calibracao-simuladores/migracao-motor-agnostico-fase-4-caixa.md.
 *
 * Usa o motor real (simularTodosBancos/calcularAnalise) para montar o fixture, em vez de
 * um objeto ResultadoCompleto forjado à mão — evita testar contra uma forma de dado que
 * não corresponde ao que a produção realmente gera. `jspdf` é mockado com uma subclasse
 * que grava toda chamada de `text()` antes de delegar para a implementação real (não há
 * biblioteca de extração de texto de PDF no projeto) — assim confirmamos que a seção
 * "Comparação de Cenários" e os rótulos SAC/PRICE foram desenhados, sem parar de exercitar
 * o gerador real.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { gerarPDFFinanciamentoBuffer } from '../gerarPDFBuffer'
import { simularTodosBancos, calcularAnalise } from '../engine'
import type { InputFinanciamento, ResultadoCompleto } from '../tipos'

const registrados = vi.hoisted(() => ({ textos: [] as string[] }))

vi.mock('jspdf', async (importOriginal) => {
  const actual = await importOriginal<typeof import('jspdf')>()
  // jsPDF atribui `text` como propriedade própria da instância dentro do próprio
  // construtor (não no prototype) — uma subclasse com `text(...)` no prototype nunca
  // seria chamada, porque a propriedade própria da instância tem precedência. Por isso
  // o wrap acontece depois do `super()`, envolvendo a função real já atribuída.
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

const INPUT_CAIXA_SAC_PRICE_ELEGIVEIS: InputFinanciamento = {
  valorImovel:     500_000,
  valorEntrada:    150_000, // financiado 70% — dentro do LTV máximo do SAC (80%) e do PRICE (70%)
  dataNascimento:  '1990-06-15',
  rendaMensal:     20_000,
  tipoAmortizacao: 'SAC',
  correntista:     false,
  bancosIds:       ['caixa'],
  tipoImovel:      'novo',
  finalidade:      'residencial',
}

function montarResultadoCompleto(input: InputFinanciamento): ResultadoCompleto {
  const bancos = simularTodosBancos(input)
  const analise = calcularAnalise(input, bancos)
  return { input, bancos, analise, dataSimulacao: new Date().toISOString() }
}

beforeEach(() => {
  registrados.textos = []
})

describe('gerarPDFFinanciamentoBuffer — Comparação de Cenários', () => {
  it('desenha a seção "Comparação de Cenários" com os rótulos SAC e PRICE quando ambos são elegíveis', async () => {
    const resultado = montarResultadoCompleto(INPUT_CAIXA_SAC_PRICE_ELEGIVEIS)
    // Pré-condição do fixture: os dois cenários da Caixa/SBPE precisam estar elegíveis,
    // senão o teste passaria "por acidente" sem a seção ser desenhada.
    const porId = new Map(resultado.bancos.map((r) => [r.resultadoId, r]))
    expect(porId.get('caixa-sbpe-sac')?.elegivel).toBe(true)
    expect(porId.get('caixa-sbpe-price')?.elegivel).toBe(true)

    await expect(gerarPDFFinanciamentoBuffer(resultado)).resolves.toBeInstanceOf(Buffer)

    expect(registrados.textos.some((t) => t.includes('Comparação de Cenários'))).toBe(true)
    expect(registrados.textos).toContain('SAC')
    expect(registrados.textos).toContain('PRICE')
  })

  it('não desenha a seção quando só um cenário da Caixa é elegível', async () => {
    // valorEntrada 120_000 sobre 500_000 → financiado 76%: dentro dos 80% do SAC, fora
    // dos 70% do PRICE — só o SAC fica elegível para o programa SBPE.
    const input: InputFinanciamento = { ...INPUT_CAIXA_SAC_PRICE_ELEGIVEIS, valorEntrada: 120_000 }
    const resultado = montarResultadoCompleto(input)
    const porId = new Map(resultado.bancos.map((r) => [r.resultadoId, r]))
    expect(porId.get('caixa-sbpe-sac')?.elegivel).toBe(true)
    expect(porId.has('caixa-sbpe-price')).toBe(false)

    await gerarPDFFinanciamentoBuffer(resultado)

    expect(registrados.textos.some((t) => t.includes('Comparação de Cenários'))).toBe(false)
  })
})
