import { describe, expect, it, vi } from 'vitest'
import type { ResultadoCompleto } from '@/lib/simuladorFinanciamento/tipos'
import { executarAcaoComPersistencia, imprimirSimulacaoComPersistencia } from '../printFlow'

const resultadoBase: ResultadoCompleto = {
  input: {
    valorImovel: 500000,
    valorEntrada: 100000,
    dataNascimento: '1990-01-01',
    rendaMensal: 12000,
    tipoAmortizacao: 'SAC',
    correntista: true,
    bancosIds: ['caixa'],
  },
  bancos: [],
  analise: {
    score: 80,
    classificacao: 'alta',
    fatores: [],
    comprometimentoRenda: 20,
    maxFinanciavel: 400000,
    rendaMinimaNecessaria: 9000,
  },
  dataSimulacao: '2024-01-01T00:00:00.000Z',
}

describe('imprimirSimulacaoComPersistencia', () => {
  it('salva a simulação antes de gerar o PDF', async () => {
    const salvarAntesImprimir = vi.fn().mockResolvedValue(undefined)
    const gerarPdf = vi.fn().mockResolvedValue(undefined)

    await imprimirSimulacaoComPersistencia({
      resultado: resultadoBase,
      onSalvarAntesImprimir: salvarAntesImprimir,
      gerarPdf,
    })

    expect(salvarAntesImprimir).toHaveBeenCalledWith(resultadoBase)
    expect(gerarPdf).toHaveBeenCalledWith(resultadoBase)
    expect(salvarAntesImprimir.mock.invocationCallOrder[0]).toBeLessThan(gerarPdf.mock.invocationCallOrder[0])
  })
})

describe('executarAcaoComPersistencia', () => {
  it('salva a simulação antes de executar a ação de compartilhamento', async () => {
    const salvarAntesAcao = vi.fn().mockResolvedValue(undefined)
    const compartilhar = vi.fn().mockResolvedValue(undefined)

    await executarAcaoComPersistencia({
      resultado: resultadoBase,
      onSalvarAntesAcao: salvarAntesAcao,
      onExecutarAcao: compartilhar,
    })

    expect(salvarAntesAcao).toHaveBeenCalledWith(resultadoBase)
    expect(compartilhar).toHaveBeenCalledWith(resultadoBase)
    expect(salvarAntesAcao.mock.invocationCallOrder[0]).toBeLessThan(compartilhar.mock.invocationCallOrder[0])
  })
})
