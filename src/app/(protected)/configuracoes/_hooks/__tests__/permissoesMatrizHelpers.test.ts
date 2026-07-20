import { describe, it, expect } from 'vitest'
import { aplicarToggle } from '../permissoesMatrizHelpers'
import { MODULOS } from '@/lib/auth/modulos'

const moduloLeads = MODULOS.find((m) => m.key === 'leads')!
const moduloDashboard = MODULOS.find((m) => m.key === 'dashboard')!
const moduloBiblioteca = MODULOS.find((m) => m.key === 'biblioteca')!

const acaoVer = moduloLeads.acoes.find((a) => a.acao === 'leads.ver')!
const acaoCriar = moduloLeads.acoes.find((a) => a.acao === 'leads.criar')!
const acaoEditar = moduloLeads.acoes.find((a) => a.acao === 'leads.editar')!

describe('aplicarToggle', () => {
  it('marcar uma ação diferente de Ver também marca Ver', () => {
    const valorAtual = () => false // tudo desmarcado
    const resultado = aplicarToggle(moduloLeads, acaoCriar, valorAtual, {})
    expect(resultado['leads.criar']).toBe(true)
    expect(resultado['leads.ver']).toBe(true)
  })

  it('desmarcar Ver desmarca as demais ações configuráveis do módulo', () => {
    const valorAtual = (acao: string) => ({
      'leads.ver': true, 'leads.criar': true, 'leads.editar': true, 'leads.excluir': false,
    } as Record<string, boolean>)[acao] ?? false
    const resultado = aplicarToggle(moduloLeads, acaoVer, valorAtual as never, {})
    expect(resultado['leads.ver']).toBe(false)
    expect(resultado['leads.criar']).toBe(false)
    expect(resultado['leads.editar']).toBe(false)
  })

  it('marcar Ver não mexe nas demais ações', () => {
    const valorAtual = () => false
    const resultado = aplicarToggle(moduloLeads, acaoVer, valorAtual, {})
    expect(resultado['leads.ver']).toBe(true)
    expect(resultado['leads.criar']).toBeUndefined()
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

  it('ação não configurável (ex.: biblioteca.publicar) não é alterada', () => {
    const acaoPublicar = moduloBiblioteca.acoes.find((a) => a.acao === 'biblioteca.publicar')!
    expect(acaoPublicar.configuravel).toBe(false)
    const valorAtual = () => false
    const resultado = aplicarToggle(moduloBiblioteca, acaoPublicar, valorAtual, {})
    expect(resultado).toEqual({})
  })

  it('preserva pendências de outras ações já existentes no estado', () => {
    const valorAtual = () => false
    const resultado = aplicarToggle(moduloLeads, acaoCriar, valorAtual, { 'imoveis.ver': true } as never)
    expect(resultado['imoveis.ver']).toBe(true)
    expect(resultado['leads.criar']).toBe(true)
  })
})
