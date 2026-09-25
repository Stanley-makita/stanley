import { describe, it, expect } from 'vitest'
import { rotearMidiaOperador } from '../rotear-midia-operador'

// Incidentes reais (2026-09-25): PDF do comercial descartado com *simula pendente (mesmo
// após *inicio) e descartado/salvo na pessoa errada sem *inicio — *salva não achava nada.
describe('rotearMidiaOperador', () => {
  it('arquivo de comercial sempre vai pra sessão (com ou sem *inicio, com ou sem pendência)', () => {
    expect(rotearMidiaOperador({ isMidia: true, temArquivo: true, texto: '' }))
      .toBe('salvar_na_sessao')
  })

  it('arquivo com legenda também vai pra sessão (arquivo não pode se perder)', () => {
    expect(rotearMidiaOperador({ isMidia: true, temArquivo: true, texto: 'rg do cliente' }))
      .toBe('salvar_na_sessao')
  })

  it('mídia sem arquivo e sem legenda NÃO vira resposta de pendência (*simula/*custas/*consorcio)', () => {
    expect(rotearMidiaOperador({ isMidia: true, temArquivo: false, texto: '  ' }))
      .toBe('ignorar_pendencias')
  })

  it('mídia sem arquivo com legenda segue o fluxo normal (legenda pode ser dado da simulação)', () => {
    expect(rotearMidiaOperador({ isMidia: true, temArquivo: false, texto: 'renda 5000' }))
      .toBe('fluxo_normal')
  })

  it('texto puro segue o fluxo normal (pode ser resposta de pendência)', () => {
    expect(rotearMidiaOperador({ isMidia: false, temArquivo: false, texto: 'renda 5000' }))
      .toBe('fluxo_normal')
  })
})
