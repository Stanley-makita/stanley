import { describe, it, expect } from 'vitest'
import {
  comTipoPretendidoSugerido, descreverDespesasResumo, descreverValorDespesas, percentualDespesas, rotuloTipoImovelPretendido, sugerirValorDespesas,
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
