import { describe, it, expect } from 'vitest'
import { tituloDocumento, nomeExibicaoAoRenomear } from '../tituloDocumento'

const doc = (nome_exibicao: string | null = null) => ({ nome_original: 'HOLERITE AGOSTO.pdf', nome_exibicao })

describe('tituloDocumento', () => {
  it('sem nome dado: mostra o tipo detectado', () => {
    expect(tituloDocumento(doc(), 'Comprovante de Renda')).toBe('Comprovante de Renda')
  })
  it('sem nome dado e sem tipo: mostra o nome do arquivo', () => {
    expect(tituloDocumento(doc(), null)).toBe('HOLERITE AGOSTO.pdf')
  })
  it('com nome dado: mostra o nome dado', () => {
    expect(tituloDocumento(doc('Holerite agosto — Vanderlei'), 'Comprovante de Renda')).toBe('Holerite agosto — Vanderlei')
  })
})

describe('nomeExibicaoAoRenomear', () => {
  it('nome novo é gravado', () => {
    expect(nomeExibicaoAoRenomear(doc(), 'Comprovante de Renda', ' Holerite agosto ')).toBe('Holerite agosto')
  })
  it('sem alteração (padrão) não grava nada', () => {
    expect(nomeExibicaoAoRenomear(doc(), 'Comprovante de Renda', 'Comprovante de Renda')).toBeUndefined()
  })
  it('apagar o nome volta ao padrão', () => {
    expect(nomeExibicaoAoRenomear(doc('X'), 'Comprovante de Renda', '  ')).toBeNull()
  })
  it('digitar o próprio tipo volta ao padrão', () => {
    expect(nomeExibicaoAoRenomear(doc('X'), 'Comprovante de Renda', 'Comprovante de Renda')).toBeNull()
  })
  it('mesmo nome já dado não grava nada', () => {
    expect(nomeExibicaoAoRenomear(doc('X'), 'Comprovante de Renda', 'X')).toBeUndefined()
  })
})
