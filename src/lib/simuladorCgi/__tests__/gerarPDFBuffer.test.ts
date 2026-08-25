import { describe, it, expect } from 'vitest'
import { gerarPDFCgiBuffer } from '../gerarPDFBuffer'
import { executarSimulacaoCgi } from '../engine'

describe('gerarPDFCgiBuffer', () => {
  it('gera um PDF válido (buffer não vazio, assinatura %PDF)', async () => {
    const resultado = executarSimulacaoCgi({ valorImovel: 1_000_000, valorDesejado: 500_000, prazoMeses: 180, bancosIds: [] })
    const buffer = await gerarPDFCgiBuffer(resultado, { clienteNome: 'Cliente Teste', responsavelNome: 'Operador Teste' })
    expect(buffer.length).toBeGreaterThan(0)
    expect(buffer.subarray(0, 4).toString('ascii')).toBe('%PDF')
  })

  it('não lança erro quando há bancos limitados por LTV/prazo', async () => {
    const resultado = executarSimulacaoCgi({ valorImovel: 500_000, valorDesejado: 900_000, prazoMeses: 300, bancosIds: [] })
    const buffer = await gerarPDFCgiBuffer(resultado, {})
    expect(buffer.length).toBeGreaterThan(0)
  })
})
