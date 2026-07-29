import { describe, it, expect } from 'vitest'
import { simularConsorcio } from '../engine'
import type { InputConsorcio } from '../tipos'

// Dado de ouro extraído diretamente da planilha Excel "Consórcio x Compra à
// vista" (Itaú Consórcio) via openpyxl — prova de que o port em TS bate com
// o modelo original célula a célula.
const inputOuro: InputConsorcio = {
  valorDisponivelLiquido: 1000000,
  valorBem: 900000,
  valorCarta: 900000,
  mesLanceContemplacao: 14,
  percentualLance: 0.6,
  rendimentoMensal: 0.01,
  percentualLanceEmbutido: 0,
  prazoMeses: 236,
  taxaAdmPercentual: 0.2,
  indiceCorrecaoAnual: 0.03,
  valorizacaoBemAnual: 0.05,
  percentualParcelaReduzida: 0.7,
  fundoReservaPercentual: 0.03,
  aluguelAtivo: true,
  valorAluguelSaidaMensal: 3500,
  valorAluguelEntradaMensal: 0,
}

describe('simularConsorcio — dado de ouro (Excel)', () => {
  const resultado = simularConsorcio(inputOuro)

  it('campos de célula única (agregados)', () => {
    expect(resultado.agregados.taxaAdmReais).toBeCloseTo(207000, 2)
    expect(resultado.agregados.valorComLanceEmbutido).toBeCloseTo(900000, 2)
    expect(resultado.agregados.valorLiquidoDaCarta).toBeCloseTo(900000, 2)
    expect(resultado.agregados.valorizacaoBemMensal).toBeCloseTo(0.0040741237836483535, 6)
  })

  it('resumo (Bloco 3)', () => {
    expect(resultado.resumo.valorDoLance).toBeCloseTo(556200, 2)
    expect(resultado.resumo.lanceEmbutido).toBeCloseTo(0, 2)
    expect(resultado.resumo.lanceProprio).toBeCloseTo(556200, 2)
    expect(resultado.resumo.valorLiquido).toBeCloseTo(927000, 2)
    expect(resultado.resumo.devolucao).toBeCloseTo(27000, 2)
    expect(resultado.resumo.correcaoSaldoDevedor).toBeCloseTo(218800.08201378767, 2)
    expect(resultado.resumo.correcaoValorDaCarta).toBeCloseTo(27000, 2)
    expect(resultado.resumo.custoDeCorrecao).toBeCloseTo(191800.08201378767, 2)
    expect(resultado.resumo.custoDeAdm).toBeCloseTo(207000, 2)
    expect(resultado.resumo.custoTotal).toBeCloseTo(398800.0820137877, 2)
    expect(resultado.resumo.saldoLiquido).toBeCloseTo(324518.2531779661, 1)
  })

  it('comparativo (Patrimônio)', () => {
    expect(resultado.comparativo.patrimonioCompraAVista).toBeCloseTo(2339912.4933362906, 1)
    expect(resultado.comparativo.patrimonioCompraConsorcio).toBeCloseTo(4410881.60084898, 1)
    expect(resultado.comparativo.prazoEmAnos).toBe(20)
    expect(resultado.comparativo.cetAnual).toBeCloseTo(0.06144493847547696, 4)
  })

  it('estrutura das linhas mensais', () => {
    expect(resultado.linhas).toHaveLength(236)
    // carta fica null depois do mês de lance/contemplação (14)
    expect(resultado.linhas[13].carta).not.toBeNull() // mes 14
    expect(resultado.linhas[14].carta).toBeNull()      // mes 15
  })
})

describe('simularConsorcio — casos de borda', () => {
  it('percentualLanceEmbutido > 0 gera lanceEmbutido e lanceProprio distintos', () => {
    const resultado = simularConsorcio({ ...inputOuro, percentualLanceEmbutido: 0.3 })
    expect(resultado.resumo.lanceEmbutido).toBeGreaterThan(0)
    expect(resultado.resumo.lanceProprio).toBeLessThan(resultado.resumo.valorDoLance)
    expect(resultado.resumo.lanceProprio + resultado.resumo.lanceEmbutido).toBeCloseTo(resultado.resumo.valorDoLance, 2)
  })

  it('aluguelAtivo=false zera as colunas de aluguel', () => {
    const resultado = simularConsorcio({ ...inputOuro, aluguelAtivo: false })
    expect(resultado.linhas.every((l) => l.aluguelSaida === 0)).toBe(true)
    expect(resultado.linhas.every((l) => l.aluguelEntrada === 0)).toBe(true)
  })

  it('mesLanceContemplacao=1 (contemplação no primeiro mês)', () => {
    const resultado = simularConsorcio({ ...inputOuro, mesLanceContemplacao: 1 })
    expect(resultado.linhas[0].lance).toBeGreaterThan(0)
    expect(resultado.linhas[0].flagLance).toBe(1)
    // aluguel saída desliga a partir do 2º mês (contemplado no 1º)
    expect(resultado.linhas[1].aluguelSaida).toBe(0)
  })
})
