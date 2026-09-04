import { describe, it, expect } from 'vitest'
import { aplicarToggle, planejarSalvamento, planejarSalvamentoCustomizado } from '../permissoesMatrizHelpers'
import { MODULOS } from '@/lib/auth/modulos'
import { construirMapaOverrides } from '@/hooks/auth/permissaoResolver'
import { type Acao } from '@/types/auth'

const moduloLeads = MODULOS.find((m) => m.key === 'leads')!
const moduloDashboard = MODULOS.find((m) => m.key === 'dashboard')!
const moduloConfiguracoes = MODULOS.find((m) => m.key === 'configuracoes')!

const acaoVer = moduloLeads.acoes.find((a) => a.acao === 'leads.ver')!
const acaoCriar = moduloLeads.acoes.find((a) => a.acao === 'leads.excluir')!
const acaoEditar = moduloLeads.acoes.find((a) => a.acao === 'leads.editar')!

describe('aplicarToggle', () => {
  it('marcar uma ação diferente de Ver também marca Ver', () => {
    const valorAtual = () => false // tudo desmarcado
    const resultado = aplicarToggle(moduloLeads, acaoCriar, valorAtual, {})
    expect(resultado['leads.excluir']).toBe(true)
    expect(resultado['leads.ver']).toBe(true)
  })

  it('desmarcar Ver desmarca as demais ações configuráveis do módulo', () => {
    const valorAtual = (acao: string) => ({
      'leads.ver': true, 'leads.excluir': true, 'leads.editar': true,
    } as Record<string, boolean>)[acao] ?? false
    const resultado = aplicarToggle(moduloLeads, acaoVer, valorAtual as never, {})
    expect(resultado['leads.ver']).toBe(false)
    expect(resultado['leads.excluir']).toBe(false)
    expect(resultado['leads.editar']).toBe(false)
  })

  it('marcar Ver não mexe nas demais ações', () => {
    const valorAtual = () => false
    const resultado = aplicarToggle(moduloLeads, acaoVer, valorAtual, {})
    expect(resultado['leads.ver']).toBe(true)
    expect(resultado['leads.excluir']).toBeUndefined()
    expect(resultado['leads.editar']).toBeUndefined()
  })

  it('desmarcar uma ação que não é Ver não mexe em Ver nem nas outras', () => {
    const valorAtual = (acao: string) => ({ 'leads.ver': true, 'leads.editar': true } as Record<string, boolean>)[acao] ?? false
    const resultado = aplicarToggle(moduloLeads, acaoEditar, valorAtual as never, {})
    expect(resultado['leads.editar']).toBe(false)
    expect(resultado['leads.ver']).toBeUndefined()
  })

  it('módulo travado (dashboard) nunca é alterado', () => {
    const acaoDashboard = moduloDashboard.acoes[0]
    const valorAtual = () => true
    const resultado = aplicarToggle(moduloDashboard, acaoDashboard, valorAtual, {})
    expect(resultado).toEqual({})
  })

  it('ação não configurável (ex.: instancias.gerenciar — credencial de integração, decisão deliberada) não é alterada', () => {
    const acaoInstancias = moduloConfiguracoes.acoes.find((a) => a.acao === 'instancias.gerenciar')!
    expect(acaoInstancias.configuravel).toBe(false)
    const valorAtual = () => false
    const resultado = aplicarToggle(moduloConfiguracoes, acaoInstancias, valorAtual, {})
    expect(resultado).toEqual({})
  })

  it('preserva pendências de outras ações já existentes no estado', () => {
    const valorAtual = () => false
    const resultado = aplicarToggle(moduloLeads, acaoCriar, valorAtual, { 'imoveis.ver': true } as never)
    expect(resultado['imoveis.ver']).toBe(true)
    expect(resultado['leads.excluir']).toBe(true)
  })

  it('leads.criar agora é configurável (ganhou enforcement em podeServidor) — toggle funciona normalmente', () => {
    const acaoLeadsCriar = moduloLeads.acoes.find((a) => a.acao === 'leads.criar')!
    expect(acaoLeadsCriar.configuravel).not.toBe(false)
    const valorAtual = () => false
    const resultado = aplicarToggle(moduloLeads, acaoLeadsCriar, valorAtual, {})
    expect(resultado['leads.criar']).toBe(true)
    expect(resultado['leads.ver']).toBe(true)
  })
})

describe('planejarSalvamento', () => {
  it('valor igual ao padrão e sem override prévio: não gera nenhuma escrita', () => {
    // comercial já tem leads.ver=true no PERMISSOES_PADRAO — marcar de novo não deve gravar nada
    const overrides = construirMapaOverrides([])
    const plano = planejarSalvamento({ 'leads.ver': true }, 'comercial', overrides)
    expect(plano.upserts).toEqual([])
    expect(plano.deletes).toEqual([])
  })

  it('valor diferente do padrão: gera upsert', () => {
    // comercial não tem biblioteca.ver no padrão — conceder deve gravar um override
    const overrides = construirMapaOverrides([])
    const plano = planejarSalvamento({ 'biblioteca.ver': true }, 'comercial', overrides)
    expect(plano.upserts).toEqual([{ acao: 'biblioteca.ver', permitido: true }])
    expect(plano.deletes).toEqual([])
  })

  it('valor volta a bater com o padrão, mas já existia override: apaga a linha em vez de regravar', () => {
    // já existe um override negando leads.ver pra comercial; usuário volta a marcar
    // (valor = true, que é o padrão) — deve apagar o override, não upsertar um valor redundante
    const overrides = construirMapaOverrides([{ perfil: 'comercial', acao: 'leads.ver', permitido: false }])
    const plano = planejarSalvamento({ 'leads.ver': true }, 'comercial', overrides)
    expect(plano.upserts).toEqual([])
    expect(plano.deletes).toEqual(['leads.ver'])
  })

  it('valor diferente do padrão (mesmo que igual ao override já existente): ainda assim upserta', () => {
    // comercial não tem rh.ver no padrão (false); já existe override concedendo (true);
    // salvar de novo com true precisa upsertar — não é "igual ao padrão", então nunca cai no caminho de delete
    const overrides = construirMapaOverrides([{ perfil: 'comercial', acao: 'rh.ver', permitido: true }])
    const plano = planejarSalvamento({ 'rh.ver': true }, 'comercial', overrides)
    expect(plano.upserts).toEqual([{ acao: 'rh.ver', permitido: true }])
    expect(plano.deletes).toEqual([])
  })

  it('não mistura overrides de outro perfil na decisão', () => {
    const overrides = construirMapaOverrides([{ perfil: 'operacional', acao: 'leads.ver', permitido: false }])
    const plano = planejarSalvamento({ 'leads.ver': true }, 'comercial', overrides)
    // comercial não tinha override próprio — valor já bate com o padrão dele, nada a fazer
    expect(plano.upserts).toEqual([])
    expect(plano.deletes).toEqual([])
  })

  it('lida com múltiplas ações pendentes de uma vez, cada uma com seu destino', () => {
    const overrides = construirMapaOverrides([{ perfil: 'comercial', acao: 'leads.ver', permitido: false }])
    const plano = planejarSalvamento(
      { 'leads.ver': true, 'biblioteca.ver': true },
      'comercial',
      overrides,
    )
    expect(plano.deletes).toEqual(['leads.ver'])
    expect(plano.upserts).toEqual([{ acao: 'biblioteca.ver', permitido: true }])
  })
})

describe('planejarSalvamentoCustomizado', () => {
  it('marcar uma ação como true gera upsert', () => {
    const plano = planejarSalvamentoCustomizado({ 'leads.ver': true }, new Set())
    expect(plano.upserts).toEqual([{ acao: 'leads.ver', permitido: true }])
    expect(plano.deletes).toEqual([])
  })

  it('desmarcar uma ação que não tinha linha no banco não gera nem upsert nem delete', () => {
    const plano = planejarSalvamentoCustomizado({ 'leads.ver': false }, new Set())
    expect(plano.upserts).toEqual([])
    expect(plano.deletes).toEqual([])
  })

  it('desmarcar uma ação que JÁ tinha linha no banco gera delete (evita linha redundante false)', () => {
    const plano = planejarSalvamentoCustomizado({ 'leads.ver': false }, new Set<Acao>(['leads.ver']))
    expect(plano.upserts).toEqual([])
    expect(plano.deletes).toEqual(['leads.ver'])
  })

  it('marcar de novo uma ação que já tinha linha true gera upsert (idempotente)', () => {
    const plano = planejarSalvamentoCustomizado({ 'leads.ver': true }, new Set<Acao>(['leads.ver']))
    expect(plano.upserts).toEqual([{ acao: 'leads.ver', permitido: true }])
  })
})
