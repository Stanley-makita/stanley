/**
 * CPF recusado porque já está noutro cadastro (UNIQUE). Casos reais (23–27/10/2026): Francisco, Mayerlin,
 * Roberto — o OCR criou um 2º cadastro com o CPF, fora de qualquer proposta, e o CPF não entrava no titular.
 */
import { describe, it, expect } from 'vitest'
import { avaliarCadastroSolto } from '../cadastroSolto'
import { participanteMesmoNome } from '../donoDocumento'

describe('avaliarCadastroSolto', () => {
  it('mesmo nome e fora de qualquer proposta: pode juntar', () => {
    expect(avaliarCadastroSolto('Francisco Moraski da Silva', { nome: 'FRANCISCO MORASKI DA SILVA', emProposta: false }))
      .toEqual({ pode: true })
  })

  it('nome parecido (erro de digitação) também pode', () => {
    expect(avaliarCadastroSolto('André Luiz de Oliveira Copulla', { nome: 'ANDRE LUIZ DE OLIVEIRA COPPULA', emProposta: false }))
      .toEqual({ pode: true })
  })

  it('cadastro que está em lead/negócio: não junta sozinho (precisa do Mesclar)', () => {
    expect(avaliarCadastroSolto('Francisco Moraski', { nome: 'Francisco Moraski', emProposta: true }))
      .toEqual({ pode: false, motivo: 'em_proposta' })
  })

  it('nome diferente: é outra pessoa, não junta', () => {
    expect(avaliarCadastroSolto('Maria Souza', { nome: 'João Pereira', emProposta: false }))
      .toEqual({ pode: false, motivo: 'nome_diferente' })
  })
})

describe('participanteMesmoNome', () => {
  const participantes = [
    { pessoaId: 'rob', nome: 'ROBERTO PIMENTEL DA PAIXÃO E SILVA', cpf: null },
    { pessoaId: 'ana', nome: 'Ana Lima', cpf: '52998224725' },
  ]

  it('mesmo nome (acento/caixa) e sem CPF: reaproveita', () => {
    expect(participanteMesmoNome('Roberto Pimentel da Paixao e Silva', '77012275120', participantes)?.pessoaId).toBe('rob')
  })

  it('mesmo nome com OUTRO CPF: é outra pessoa', () => {
    expect(participanteMesmoNome('ANA LIMA', '11144477735', participantes)).toBeNull()
  })

  it('mesmo nome e mesmo CPF: reaproveita', () => {
    expect(participanteMesmoNome('ana lima', '529.982.247-25', participantes)?.pessoaId).toBe('ana')
  })

  it('nome só parecido não reaproveita sozinho (a tela pergunta)', () => {
    expect(participanteMesmoNome('Roberto Pimentel', null, participantes)).toBeNull()
  })
})
