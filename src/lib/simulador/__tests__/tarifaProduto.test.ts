import { describe, it, expect } from 'vitest'
import { calcularCustas } from '../calcular'
import type { EntradaSimulador, SimuladorCustasConfig } from '@/types/simulador'

const BASE: EntradaSimulador = {
  tipoImovel: 'Residencial', cidade: 'Maringá', valorCV: 1_600_000, valorFinanciado: 1_200_000,
  valorTerreno: 0, servicoRegistro: 1_230, valorCertidoes: 123.22, contratoParticular: 500,
  primeiraAquisicao: 'nao', isentoFunRejus: 'nao', banco: 'Caixa Econômica Federal',
  modalidade: 'aquisicao_pronto', produto: 'SBPE', iof: 0, iofVisivel: false,
}
const CFG = { valor: 3_600 } as SimuladorCustasConfig
const tarifa = (e: EntradaSimulador) => calcularCustas(e, undefined, CFG).linhas.find(l => l.id === 'tarifa')!

describe('Tarifa Banco por produto (regra do Ministério das Cidades)', () => {
  it('PMCMV: 1,5% do valor financiado, ignorando a tarifa configurada', () => {
    const t = tarifa({ ...BASE, produto: 'PMCMV', valorCV: 300_000, valorFinanciado: 240_000 })
    expect(t.semDesconto).toBe(3_600)
    expect(t.comDesconto).toBe(3_600)
    expect(t.visivel).toBe(true)
  })
  it('Pró-Cotista: 1,5% do valor financiado, em qualquer banco', () => {
    expect(tarifa({ ...BASE, produto: 'Pro_Cotista' }).semDesconto).toBe(18_000)
    expect(tarifa({ ...BASE, produto: 'Pro_Cotista', banco: 'Santander' }).semDesconto).toBe(18_000)
  })
  it('vale mesmo sem tarifa cadastrada para o banco', () => {
    const r = calcularCustas({ ...BASE, produto: 'PMCMV', valorFinanciado: 200_000 }, undefined, undefined)
    expect(r.linhas.find(l => l.id === 'tarifa')!.semDesconto).toBe(3_000)
  })
  it('SBPE continua usando a tarifa de Configurações > Simulador', () => {
    expect(tarifa(BASE).semDesconto).toBe(3_600)
  })
  it('Reciprocidade compara com a tarifa do produto (PMCMV, C&V ≤ 500k, tarifa > 3.600 → R$ 1.000)', () => {
    const r = calcularCustas({ ...BASE, produto: 'PMCMV', valorCV: 400_000, valorFinanciado: 300_000 }, undefined, CFG)
    expect(r.linhas.find(l => l.id === 'tarifa')!.semDesconto).toBe(4_500)
    expect(r.linhas.find(l => l.id === 'reciprocidade')!.semDesconto).toBe(1_000)
  })
})
