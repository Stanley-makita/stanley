import { describe, it, expect } from 'vitest'
import { encontrarModuloPorRota, MODULOS, ACOES_NAO_CONFIGURAVEIS } from '../modulos'

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

describe('ACOES_NAO_CONFIGURAVEIS', () => {
  it('inclui as ações com regra fixa no servidor (alinhamento RLS/API desta branch)', () => {
    for (const acao of [
      'pessoas.ver', 'pessoas.editar', 'pessoas.merge', 'pessoas.excluir',
      'rh.ver', 'rh.editar',
      'processos.criar', 'processos.editar',
      'leads.criar',
      'biblioteca.publicar', 'biblioteca.excluir',
      'financeiro.editar',
      'usuarios.convidar', 'usuarios.desativar', 'instancias.gerenciar',
    ] as const) {
      expect(ACOES_NAO_CONFIGURAVEIS.has(acao)).toBe(true)
    }
  })

  it('não inclui ações que continuam configuráveis (ex.: leads.ver, processos.ver, biblioteca.ver)', () => {
    for (const acao of ['leads.ver', 'processos.ver', 'biblioteca.ver'] as const) {
      expect(ACOES_NAO_CONFIGURAVEIS.has(acao)).toBe(false)
    }
  })

  it('é exatamente o conjunto de ações com configuravel:false no catálogo', () => {
    const esperado = new Set(
      MODULOS.flatMap((m) => m.acoes.filter((a) => a.configuravel === false).map((a) => a.acao))
    )
    expect(ACOES_NAO_CONFIGURAVEIS).toEqual(esperado)
  })
})
