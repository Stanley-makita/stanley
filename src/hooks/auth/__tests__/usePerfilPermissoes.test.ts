import { describe, it, expect } from 'vitest'
import { resolverPermissao, construirMapaOverrides, type OverrideRow } from '../permissaoResolver'

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
