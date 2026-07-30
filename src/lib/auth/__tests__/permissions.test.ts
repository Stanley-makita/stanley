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

  it('comercial tem pessoas.editar (fluxo real diário confirmado), mas não merge/excluir', () => {
    expect(PERMISSOES_PADRAO.comercial).toContain('pessoas.ver')
    expect(PERMISSOES_PADRAO.comercial).toContain('pessoas.editar')
    expect(PERMISSOES_PADRAO.comercial).not.toContain('pessoas.merge')
    expect(PERMISSOES_PADRAO.comercial).not.toContain('pessoas.excluir')
  })

  it('operacional não tem Captação nem processos.criar, mas tem pessoas.editar (mesmo fluxo real do comercial)', () => {
    expect(PERMISSOES_PADRAO.operacional).not.toContain('leads.ver')
    expect(PERMISSOES_PADRAO.operacional).not.toContain('leads.criar')
    expect(PERMISSOES_PADRAO.operacional).not.toContain('processos.criar')
    expect(PERMISSOES_PADRAO.operacional).toContain('processos.ver')
    expect(PERMISSOES_PADRAO.operacional).toContain('processos.editar')
    expect(PERMISSOES_PADRAO.operacional).toContain('pessoas.editar')
    expect(PERMISSOES_PADRAO.operacional).not.toContain('pessoas.merge')
    expect(PERMISSOES_PADRAO.operacional).not.toContain('pessoas.excluir')
  })

  it('juridico não tem Imóveis, Solicitações, Simuladores ou Agenda', () => {
    for (const acao of ['imoveis.ver', 'operacional.ver', 'simuladores.ver', 'agenda.ver'] as const) {
      expect(PERMISSOES_PADRAO.juridico).not.toContain(acao)
    }
  })

  it('apoio só tem dashboard.ver, notificacoes.ver e as duas ações de leads fiéis à RLS atual (revoga leads/processos/pessoas/biblioteca)', () => {
    expect(PERMISSOES_PADRAO.apoio).toEqual(['dashboard.ver', 'notificacoes.ver', 'leads.ver_todas', 'leads.redistribuir'])
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

  it('assistente nasce sem nenhuma permissão fixa (só dashboard.ver + leads.ver_todas fiel ao RLS)', () => {
    expect(PERMISSOES_PADRAO.assistente).toEqual(['dashboard.ver', 'leads.ver_todas'])
  })

  describe('leads.ver_todas / leads.redistribuir — defaults que preservam o comportamento atual (RLS 20260724_186)', () => {
    it('leads.ver_todas: true pra todo perfil que já via tudo hoje (perfil <> comercial), exceto comercial e cliente', () => {
      const veTudo: (keyof typeof PERMISSOES_PADRAO)[] = [
        'admin', 'gestor', 'gerente', 'operacional', 'juridico', 'apoio', 'assistente', 'analista', 'consultor',
      ]
      for (const perfil of veTudo) {
        expect(PERMISSOES_PADRAO[perfil]).toContain('leads.ver_todas')
      }
      expect(PERMISSOES_PADRAO.comercial).not.toContain('leads.ver_todas')
      // cliente é exceção deliberada: perfil desenhado pra zero acesso, sem
      // caminho hoje pra leads.ver — ver comentário em permissions.ts
      expect(PERMISSOES_PADRAO.cliente).not.toContain('leads.ver_todas')
    })

    it('leads.redistribuir: true só pra admin, gestor, gerente, apoio e comercial (bypass/ownership atuais na RLS de UPDATE)', () => {
      const podeRedistribuir: (keyof typeof PERMISSOES_PADRAO)[] = ['admin', 'gestor', 'gerente', 'apoio', 'comercial']
      for (const perfil of podeRedistribuir) {
        expect(PERMISSOES_PADRAO[perfil]).toContain('leads.redistribuir')
      }
      const naoRedistribui: (keyof typeof PERMISSOES_PADRAO)[] = [
        'operacional', 'juridico', 'assistente', 'analista', 'consultor', 'cliente',
      ]
      for (const perfil of naoRedistribui) {
        expect(PERMISSOES_PADRAO[perfil]).not.toContain('leads.redistribuir')
      }
    })
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
