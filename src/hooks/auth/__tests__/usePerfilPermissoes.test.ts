import { describe, it, expect } from 'vitest'
import {
  resolverPermissao, construirMapaOverrides, construirMapaOverridesUsuario,
  type OverrideRow, type UsuarioOverrideRow,
} from '../permissaoResolver'

describe('resolverPermissao', () => {
  it('admin sempre retorna true, mesmo com override tentando negar', () => {
    const overrides = construirMapaOverrides([{ perfil: 'admin', acao: 'rh.editar', permitido: false }])
    expect(resolverPermissao('admin', 'rh.editar', overrides)).toBe(true)
    expect(resolverPermissao('admin', 'usuarios.desativar', overrides)).toBe(true)
  })

  it('admin sempre true mesmo com mapa de overrides vazio (tabela vazia/erro de rede)', () => {
    const overrides = construirMapaOverrides([])
    expect(resolverPermissao('admin', 'qualquer.coisa' as never, overrides)).toBe(true)
  })

  it('override configurado prevalece sobre a matriz padrão (concede algo que o padrão nega)', () => {
    const overrides = construirMapaOverrides([{ perfil: 'comercial', acao: 'biblioteca.ver', permitido: true }])
    expect(resolverPermissao('comercial', 'biblioteca.ver', overrides)).toBe(true)
  })

  it('override configurado prevalece sobre a matriz padrão (nega algo que o padrão concede)', () => {
    const overrides = construirMapaOverrides([{ perfil: 'comercial', acao: 'leads.ver', permitido: false }])
    expect(resolverPermissao('comercial', 'leads.ver', overrides)).toBe(false)
  })

  it('sem override, cai na matriz padrão (PERMISSOES_PADRAO)', () => {
    const overrides = construirMapaOverrides([])
    expect(resolverPermissao('comercial', 'leads.ver', overrides)).toBe(true)
    expect(resolverPermissao('comercial', 'rh.ver', overrides)).toBe(false)
    expect(resolverPermissao('operacional', 'leads.ver', overrides)).toBe(false)
  })

  it('override de um perfil não vaza para outro perfil', () => {
    const overrides = construirMapaOverrides([{ perfil: 'comercial', acao: 'biblioteca.ver', permitido: true }])
    expect(resolverPermissao('operacional', 'biblioteca.ver', overrides)).toBe(false)
  })

  it('dashboard.ver é true por padrão para todos os perfis ativos', () => {
    const overrides = construirMapaOverrides([])
    for (const perfil of ['admin', 'gestor', 'comercial', 'operacional', 'juridico', 'apoio'] as const) {
      expect(resolverPermissao(perfil, 'dashboard.ver', overrides)).toBe(true)
    }
  })

  it('dashboard.ver é sempre true mesmo com um override tentando negá-lo (defesa contra loop de acesso negado)', () => {
    // A tela de configuração nunca permite gravar isso (dashboard é travado no catálogo),
    // mas a resolução também não pode confiar só na UI — um override manual/incorreto
    // não pode bloquear a única rota para onde o RouteGuard redireciona ao negar acesso.
    const overrides = construirMapaOverrides([{ perfil: 'comercial', acao: 'dashboard.ver', permitido: false }])
    expect(resolverPermissao('comercial', 'dashboard.ver', overrides)).toBe(true)
  })

  describe('ações não-configuráveis (regra fixa no servidor, feat/alinhamento-permissoes-servidor)', () => {
    it('ignora um override "fantasma" concedendo pessoas.editar a um perfil que não tem no padrão', () => {
      // apoio não tem pessoas.editar em PERMISSOES_PADRAO; um override salvo antes de
      // pessoas.editar virar configuravel:false (ou por engano) não pode voltar a valer.
      const overrides = construirMapaOverrides([{ perfil: 'apoio', acao: 'pessoas.editar', permitido: true }])
      expect(resolverPermissao('apoio', 'pessoas.editar', overrides)).toBe(false)
    })

    it('ignora um override "fantasma" negando rh.editar a um perfil que tem no padrão (admin)', () => {
      const overrides = construirMapaOverrides([{ perfil: 'admin', acao: 'rh.editar', permitido: false }])
      expect(resolverPermissao('admin', 'rh.editar', overrides)).toBe(true)
    })

    it('rh.ver agora é configurável — um override concedendo a um perfil sem o padrão prevalece', () => {
      const overrides = construirMapaOverrides([{ perfil: 'comercial', acao: 'rh.ver', permitido: true }])
      expect(resolverPermissao('comercial', 'rh.ver', overrides)).toBe(true)
    })

    it('ignora override em processos.criar — sempre reflete a matriz estática', () => {
      const overrides = construirMapaOverrides([{ perfil: 'operacional', acao: 'processos.criar', permitido: true }])
      expect(resolverPermissao('operacional', 'processos.criar', overrides)).toBe(false)
    })

    it('ignora override em leads.criar — sempre reflete a matriz estática', () => {
      const overrides = construirMapaOverrides([{ perfil: 'apoio', acao: 'leads.criar', permitido: true }])
      expect(resolverPermissao('apoio', 'leads.criar', overrides)).toBe(false)
      expect(resolverPermissao('comercial', 'leads.criar', construirMapaOverrides([]))).toBe(true)
    })
  })
})

describe('resolverPermissao — precedência exceção individual → perfil → padrão', () => {
  it('sem overrides de nenhum tipo, cai no padrão (leads.ver_todas: comercial=false, gestor=true)', () => {
    expect(resolverPermissao('comercial', 'leads.ver_todas', construirMapaOverrides([]))).toBe(false)
    expect(resolverPermissao('gestor', 'leads.ver_todas', construirMapaOverrides([]))).toBe(true)
  })

  it('override de perfil prevalece sobre o padrão quando não há exceção individual', () => {
    const overridesPerfil = construirMapaOverrides([{ perfil: 'comercial', acao: 'leads.ver_todas', permitido: true }])
    expect(resolverPermissao('comercial', 'leads.ver_todas', overridesPerfil)).toBe(true)
  })

  it('exceção individual prevalece sobre o override de perfil (amplia acesso)', () => {
    // perfil "assistente" não tem leads.ver_todas restrito por override de empresa,
    // mas mesmo que tivesse, a exceção individual haveria de vencer.
    const overridesPerfil = construirMapaOverrides([{ perfil: 'assistente', acao: 'leads.ver_todas', permitido: false }])
    const overridesUsuario = construirMapaOverridesUsuario([{ acao: 'leads.ver_todas', permitido: true }])
    expect(resolverPermissao('assistente', 'leads.ver_todas', overridesPerfil, overridesUsuario)).toBe(true)
  })

  it('exceção individual prevalece sobre o override de perfil (restringe acesso)', () => {
    const overridesPerfil = construirMapaOverrides([{ perfil: 'gestor', acao: 'leads.ver_todas', permitido: true }])
    const overridesUsuario = construirMapaOverridesUsuario([{ acao: 'leads.ver_todas', permitido: false }])
    expect(resolverPermissao('gestor', 'leads.ver_todas', overridesPerfil, overridesUsuario)).toBe(false)
  })

  it('exceção individual de uma ação não vaza pra outra ação do mesmo usuário', () => {
    const overridesUsuario = construirMapaOverridesUsuario([{ acao: 'leads.ver_todas', permitido: true }])
    expect(resolverPermissao('comercial', 'leads.redistribuir', construirMapaOverrides([]), overridesUsuario)).toBe(true) // padrão: comercial já tem leads.redistribuir
    expect(resolverPermissao('operacional', 'leads.redistribuir', construirMapaOverrides([]), overridesUsuario)).toBe(false) // sem override nem padrão
  })

  it('admin sempre true mesmo com exceção individual tentando negar', () => {
    const overridesUsuario = construirMapaOverridesUsuario([{ acao: 'leads.ver_todas', permitido: false }])
    expect(resolverPermissao('admin', 'leads.ver_todas', construirMapaOverrides([]), overridesUsuario)).toBe(true)
  })

  it('sem overridesUsuario (parâmetro omitido) continua funcionando como antes — compatibilidade com os call sites que só resolvem por perfil', () => {
    const overridesPerfil = construirMapaOverrides([{ perfil: 'comercial', acao: 'leads.ver_todas', permitido: true }])
    expect(resolverPermissao('comercial', 'leads.ver_todas', overridesPerfil)).toBe(true)
  })
})

describe('construirMapaOverridesUsuario', () => {
  it('monta o mapa só com a chave ação (já escopado a um usuário)', () => {
    const rows: UsuarioOverrideRow[] = [
      { acao: 'leads.ver_todas', permitido: true },
      { acao: 'leads.redistribuir', permitido: false },
    ]
    const mapa = construirMapaOverridesUsuario(rows)
    expect(mapa.get('leads.ver_todas')).toBe(true)
    expect(mapa.get('leads.redistribuir')).toBe(false)
    expect(mapa.size).toBe(2)
  })

  it('lista vazia gera mapa vazio', () => {
    expect(construirMapaOverridesUsuario([]).size).toBe(0)
  })
})

describe('construirMapaOverrides', () => {
  it('monta o mapa com a chave perfil:acao', () => {
    const rows: OverrideRow[] = [
      { perfil: 'comercial', acao: 'biblioteca.ver', permitido: true },
      { perfil: 'operacional', acao: 'leads.ver', permitido: false },
    ]
    const mapa = construirMapaOverrides(rows)
    expect(mapa.get('comercial:biblioteca.ver')).toBe(true)
    expect(mapa.get('operacional:leads.ver')).toBe(false)
    expect(mapa.size).toBe(2)
  })

  it('lista vazia gera mapa vazio', () => {
    expect(construirMapaOverrides([]).size).toBe(0)
  })
})
