import { describe, it, expect } from 'vitest'
import { simularConsorcio } from '../engine'
import { gerarPropostaConsorcioBuffer } from '../gerarPropostaBuffer'
import type { InputConsorcio } from '../tipos'

const input: InputConsorcio = {
  valorDisponivelLiquido: 1000000,
  valorBem: 900000,
  valorCarta: 900000,
  mesLanceContemplacao: 14,
  percentualLance: 0.6,
  rendimentoMensal: 0.01,
  percentualLanceEmbutido: 0.3,
  prazoMeses: 221,
  taxaAdmPercentual: 0.23,
  indiceCorrecaoAnual: 0.03,
  valorizacaoBemAnual: 0.06,
  percentualParcelaReduzida: 0.5,
  fundoReservaPercentual: 0.03,
  aluguelAtivo: false,
  nomeCliente: 'Franc e Everton',
  prazoEstimadoContemplacao: '36 a 40 meses',
}

describe('smoke test — gerarPropostaConsorcioBuffer não deve lançar exceção', () => {
  it('variante detalhada gera um PDF não-vazio', async () => {
    const resultado = simularConsorcio(input)
    const buf = await gerarPropostaConsorcioBuffer(resultado, 'detalhada')
    expect(buf.byteLength).toBeGreaterThan(1000)
  })

  it('variante resumida gera um PDF não-vazio', async () => {
    const resultado = simularConsorcio(input)
    const buf = await gerarPropostaConsorcioBuffer(resultado, 'resumida')
    expect(buf.byteLength).toBeGreaterThan(1000)
  })

  it('prazoMeses pequeno (poucos meses) não quebra o layout detalhado', async () => {
    const resultado = simularConsorcio({ ...input, prazoMeses: 8, mesLanceContemplacao: 3 })
    const buf = await gerarPropostaConsorcioBuffer(resultado, 'detalhada')
    expect(buf.byteLength).toBeGreaterThan(1000)
  })
})
