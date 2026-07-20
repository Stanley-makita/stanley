import { describe, it, expect } from 'vitest'
import { encontrarModuloPorRota, MODULOS } from '../modulos'

describe('encontrarModuloPorRota', () => {
  it('resolve rotas exatas', () => {
    expect(encontrarModuloPorRota('/dashboard')?.key).toBe('dashboard')
    expect(encontrarModuloPorRota('/rh')?.key).toBe('rh')
  })

  it('resolve sub-rotas (prefixo com barra)', () => {
    expect(encontrarModuloPorRota('/leads/123')?.key).toBe('leads')
    expect(encontrarModuloPorRota('/configuracoes/usuarios')?.key).toBe('configuracoes')
  })

  it('Negócios cobre tanto /negocios quanto /processos', () => {
    expect(encontrarModuloPorRota('/negocios')?.key).toBe('negocios')
    expect(encontrarModuloPorRota('/negocios/financiamento')?.key).toBe('negocios')
    expect(encontrarModuloPorRota('/processos/123')?.key).toBe('negocios')
  })

  it('não confunde prefixo solto (ex.: /relatorios-x não deve casar com /relatorios)', () => {
    expect(encontrarModuloPorRota('/relatorios-x')).toBeUndefined()
  })

  it('rota não catalogada (ex.: /documentos, placeholder) retorna undefined', () => {
    expect(encontrarModuloPorRota('/documentos')).toBeUndefined()
  })

  it('todo módulo tem ao menos uma ação e a acaoVer está entre as ações declaradas', () => {
    for (const modulo of MODULOS) {
      expect(modulo.acoes.length).toBeGreaterThan(0)
      expect(modulo.acoes.some((a) => a.acao === modulo.acaoVer)).toBe(true)
    }
  })

  it('dashboard é o único módulo travado', () => {
    const travados = MODULOS.filter((m) => m.travado)
    expect(travados.map((m) => m.key)).toEqual(['dashboard'])
  })
})
