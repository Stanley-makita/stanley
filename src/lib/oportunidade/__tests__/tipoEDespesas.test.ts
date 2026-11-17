import { describe, it, expect } from 'vitest'
import {
  comTipoPretendidoSugerido, descreverDespesasResumo, descreverValorDespesas, dicaCustasFinanciadas, percentualDespesas, rotuloTipoImovelPretendido, sugerirValorDespesas,
  totalFinanciado,
  tipoPretendidoDoImovelCadastrado,
} from '../tipoEDespesas'

describe('despesas financiadas', () => {
  it('sugere 5% do valor do imóvel (caso da tela: R$ 340.000 → R$ 17.000)', () => {
    expect(sugerirValorDespesas(340000)).toBe(17000)
    expect(sugerirValorDespesas(333333)).toBe(16666.65)
    expect(sugerirValorDespesas(null)).toBeNull()
    expect(sugerirValorDespesas(0)).toBeNull()
  })
  it('percentual do valor digitado', () => {
    expect(percentualDespesas(10000, 340000)).toBe(2.94)
    expect(percentualDespesas(17000, 340000)).toBe(5)
    expect(percentualDespesas(10000, null)).toBeNull()
  })
  it('descreve: 5% simples; outro valor mostra o percentual; acima de 5% avisa', () => {
    expect(descreverValorDespesas(17000, 340000)).toEqual({ texto: '5% do valor do imóvel', acimaDoLimite: false })
    expect(descreverValorDespesas(10000, 340000)).toEqual({ texto: 'Este valor é 2,94% do valor do imóvel', acimaDoLimite: false })
    expect(descreverValorDespesas(20400, 340000)).toEqual({
      texto: 'Este valor é 6% do valor do imóvel — acima do limite de 5%', acimaDoLimite: true,
    })
    expect(descreverValorDespesas(10000, null)).toBeNull()
  })
})

describe('tipo de imóvel pretendido', () => {
  it('rótulo por extenso (antes o Resumo mostrava "apartamento" cru)', () => {
    expect(rotuloTipoImovelPretendido('apartamento')).toBe('Apartamento')
    expect(rotuloTipoImovelPretendido('rural')).toBe('Rural')
    expect(rotuloTipoImovelPretendido(null)).toBeNull()
  })
  it('sugestão a partir do imóvel cadastrado', () => {
    expect(tipoPretendidoDoImovelCadastrado('sobrado')).toBe('casa')
    expect(tipoPretendidoDoImovelCadastrado('barracao')).toBe('comercial')
    expect(tipoPretendidoDoImovelCadastrado('terreno')).toBe('terreno')
    expect(tipoPretendidoDoImovelCadastrado(null)).toBeNull()
  })
})

describe('descreverDespesasResumo', () => {
  it('as três situações', () => {
    expect(descreverDespesasResumo(null, null, 340000)).toBe('Não definido')
    expect(descreverDespesasResumo(false, null, 340000)).toBe('Não vai financiar')
    expect(descreverDespesasResumo(true, 17000, 340000)).toMatch(/^Vai financiar — R\$\s17\.000,00 \(5% do imóvel\)$/)
    expect(descreverDespesasResumo(true, null, 340000)).toBe('Vai financiar — valor não informado')
  })
})

describe('comTipoPretendidoSugerido', () => {
  it('vazio → sugere pelo imóvel vinculado; já escolhido → não mexe; sem tipo no imóvel → nada', () => {
    expect(comTipoPretendidoSugerido({ imovel_tipo: 'sobrado' }, null)).toEqual({ imovel_tipo: 'sobrado', tipo_imovel: 'casa' })
    expect(comTipoPretendidoSugerido({ imovel_tipo: 'sobrado' }, 'comercial')).toEqual({ imovel_tipo: 'sobrado' })
    expect(comTipoPretendidoSugerido({ imovel_tipo: null }, null)).toEqual({ imovel_tipo: null })
  })
})

describe('valor total financiado (financiamento + custas)', () => {
  it('soma as custas ao financiamento quando vai financiar', () => {
    expect(totalFinanciado(481000, true, 34570.77)).toEqual({ custas: 34570.77, total: 515570.77 })
  })
  it('sem custas a somar → null (não vai financiar, não definido, sem valor, valor 0)', () => {
    expect(totalFinanciado(481000, false, 34570)).toBeNull()
    expect(totalFinanciado(481000, null, 34570)).toBeNull()
    expect(totalFinanciado(481000, true, null)).toBeNull()
    expect(totalFinanciado(481000, true, 0)).toBeNull()
  })
  it('sem financiamento informado → null (não mostra custas sozinhas)', () => {
    expect(totalFinanciado(null, true, 34570)).toBeNull()
    // campo apagado no drawer vira NaN (strParaNum) — não pode mostrar "R$ NaN"
    expect(totalFinanciado(NaN, true, 34570)).toBeNull()
    expect(totalFinanciado(481000, true, NaN)).toBeNull()
  })
  it('arredonda a centavos', () => {
    expect(totalFinanciado(0.1, true, 0.2)?.total).toBe(0.3)
  })
})

describe('dica de custas financiadas (Emissões)', () => {
  const brl = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
  it('mostra custas e total', () => {
    expect(dicaCustasFinanciadas(848000, true, 53000)).toBe(
      `Custas financiadas: ${brl(53000)} · Total financiado: ${brl(901000)}`,
    )
  })
  it('sem custas → null', () => {
    expect(dicaCustasFinanciadas(848000, false, 53000)).toBeNull()
  })
})
