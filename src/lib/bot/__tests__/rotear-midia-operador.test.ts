import { describe, it, expect } from 'vitest'
import { rotearMidiaOperador } from '../rotear-midia-operador'

// Incidente real (2026-09-25): comercial com *simula pendente mandou *inicio + CNH.pdf
// + *salva — o PDF caía em processarRespostaPendente (texto vazio), era descartado sem
// erro e o *salva respondia "nenhum documento encontrado".
describe('rotearMidiaOperador', () => {
  it('mídia com sessão *fonti inicio aberta vai pra sessão, mesmo com pendência de *simula ativa', () => {
    expect(rotearMidiaOperador({ isMidia: true, temArquivo: true, texto: '', temSessaoFonti: true }))
      .toBe('salvar_na_sessao')
  })

  it('mídia com legenda e sessão aberta também vai pra sessão (arquivo não pode se perder)', () => {
    expect(rotearMidiaOperador({ isMidia: true, temArquivo: true, texto: 'rg do cliente', temSessaoFonti: true }))
      .toBe('salvar_na_sessao')
  })

  it('mídia sem legenda e sem sessão NÃO vira resposta de pendência (*simula/*custas/*consorcio)', () => {
    expect(rotearMidiaOperador({ isMidia: true, temArquivo: true, texto: '', temSessaoFonti: false }))
      .toBe('ignorar_pendencias')
  })

  it('mídia sem legenda cujo download falhou também não vira resposta de pendência', () => {
    expect(rotearMidiaOperador({ isMidia: true, temArquivo: false, texto: '  ', temSessaoFonti: true }))
      .toBe('ignorar_pendencias')
  })

  it('texto puro segue o fluxo normal (pode ser resposta de pendência)', () => {
    expect(rotearMidiaOperador({ isMidia: false, temArquivo: false, texto: 'renda 5000', temSessaoFonti: true }))
      .toBe('fluxo_normal')
  })

  it('mídia com legenda sem sessão segue o fluxo normal (legenda pode ser dado da simulação)', () => {
    expect(rotearMidiaOperador({ isMidia: true, temArquivo: true, texto: 'renda 5000', temSessaoFonti: false }))
      .toBe('fluxo_normal')
  })
})
