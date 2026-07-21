import { describe, it, expect } from 'vitest'
import { PERMISSOES_PADRAO, podeExecutarPadrao, podeExecutar } from '../permissions'

describe('PERMISSOES_PADRAO — matriz oficial', () => {
  it('admin tem todas as ações', () => {
    expect(PERMISSOES_PADRAO.admin).toContain('rh.editar')
    expect(PERMISSOES_PADRAO.admin).toContain('usuarios.desativar')
    expect(PERMISSOES_PADRAO.admin).toContain('instancias.gerenciar')
  })

  it('gestor tem tudo exceto rh.editar/usuarios.desativar/instancias.gerenciar', () => {
    expect(PERMISSOES_PADRAO.gestor).not.toContain('rh.editar')
    expect(PERMISSOES_PADRAO.gestor).not.toContain('usuarios.desativar')
    expect(PERMISSOES_PADRAO.gestor).not.toContain('instancias.gerenciar')
    expect(PERMISSOES_PADRAO.gestor).toContain('leads.ver')
    expect(PERMISSOES_PADRAO.gestor).toContain('biblioteca.ver')
  })

  it('comercial não tem ações que não existiam antes (sem promoção indevida)', () => {
    expect(PERMISSOES_PADRAO.comercial).toContain('pessoas.ver')
    expect(PERMISSOES_PADRAO.comercial).not.toContain('pessoas.editar')
    expect(PERMISSOES_PADRAO.comercial).not.toContain('pessoas.merge')
    expect(PERMISSOES_PADRAO.comercial).not.toContain('pessoas.excluir')
  })

  it('operacional não tem Captação nem processos.criar', () => {
    expect(PERMISSOES_PADRAO.operacional).not.toContain('leads.ver')
    expect(PERMISSOES_PADRAO.operacional).not.toContain('leads.criar')
    expect(PERMISSOES_PADRAO.operacional).not.toContain('processos.criar')
    expect(PERMISSOES_PADRAO.operacional).toContain('processos.ver')
    expect(PERMISSOES_PADRAO.operacional).toContain('processos.editar')
  })

  it('juridico não tem Imóveis, Solicitações, Simuladores ou Agenda', () => {
    for (const acao of ['imoveis.ver', 'operacional.ver', 'simuladores.ver', 'agenda.ver'] as const) {
      expect(PERMISSOES_PADRAO.juridico).not.toContain(acao)
    }
  })

  it('apoio só tem dashboard.ver e notificacoes.ver (revoga leads/processos/pessoas/biblioteca)', () => {
    expect(PERMISSOES_PADRAO.apoio).toEqual(['dashboard.ver', 'notificacoes.ver'])
  })

  it('biblioteca.ver não é concedida a nenhum perfil operacional (comercial/operacional/juridico/apoio)', () => {
    for (const perfil of ['comercial', 'operacional', 'juridico', 'apoio'] as const) {
      expect(PERMISSOES_PADRAO[perfil]).not.toContain('biblioteca.ver')
    }
  })

  it('relatorios.ver, rh.ver, financeiro.ver, gestao.ver, configuracoes.ver só para admin/gestor', () => {
    const restritos = ['relatorios.ver', 'rh.ver', 'financeiro.ver', 'gestao.ver', 'configuracoes.ver'] as const
    for (const perfil of ['comercial', 'operacional', 'juridico', 'apoio'] as const) {
      for (const acao of restritos) {
        expect(PERMISSOES_PADRAO[perfil]).not.toContain(acao)
      }
    }
  })

  it('cliente continua sem nenhuma permissão', () => {
    expect(PERMISSOES_PADRAO.cliente).toEqual([])
  })
})

describe('podeExecutarPadrao / podeExecutar (alias legado, usado por rotas de API)', () => {
  it('são a mesma função (rotas de API existentes continuam com o mesmo comportamento)', () => {
    expect(podeExecutar).toBe(podeExecutarPadrao)
  })

  it('checa a matriz oficial corretamente', () => {
    expect(podeExecutarPadrao('comercial', 'leads.editar')).toBe(true)
    expect(podeExecutarPadrao('operacional', 'leads.editar')).toBe(false)
  })
})
