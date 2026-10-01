import { describe, it, expect } from 'vitest'
import { sugerirDonoDocumento } from '../donoDocumento'

const ps = [
  { pessoaId: 'h', nome: 'Heitor Almeida Souza', cpf: '52998224725' },
  { pessoaId: 'a', nome: 'Afrânio Souza', cpf: null },
  { pessoaId: 'm', nome: 'Maria Souza', cpf: '11144477735' },
]

describe('sugerirDonoDocumento', () => {
  it('CPF extraído igual ao de um participante (com máscara) → esse', () => {
    expect(sugerirDonoDocumento({ cpf: '111.444.777-35', nome: 'MARIA X' }, ps, 'h'))
      .toEqual({ tipo: 'participante', pessoaId: 'm', motivo: 'cpf' })
  })
  it('sem CPF válido: nome igual (acento/caixa/espaços) → esse', () => {
    expect(sugerirDonoDocumento({ cpf: null, nome: '  AFRANIO   souza ' }, ps, 'h'))
      .toEqual({ tipo: 'participante', pessoaId: 'a', motivo: 'nome' })
  })
  it('CPF que ninguém tem, mas nome de participante SEM CPF cadastrado → esse (não duplica)', () => {
    expect(sugerirDonoDocumento({ cpf: '39053344705', nome: 'Afrânio Souza' }, ps, 'h'))
      .toEqual({ tipo: 'participante', pessoaId: 'a', motivo: 'nome' })
  })
  it('CPF que ninguém tem e nome de participante que JÁ tem outro CPF → novo (é outra pessoa)', () => {
    expect(sugerirDonoDocumento({ cpf: '39053344705', nome: 'Maria Souza' }, ps, 'h')).toEqual({ tipo: 'novo' })
  })
  it('CPF válido de ninguém e nome desconhecido → novo participante', () => {
    expect(sugerirDonoDocumento({ cpf: '39053344705', nome: 'Carlos Pereira' }, ps, 'h')).toEqual({ tipo: 'novo' })
  })
  it('nome que não bate com ninguém → novo participante', () => {
    expect(sugerirDonoDocumento({ nome: 'Carlos Pereira' }, ps, 'h')).toEqual({ tipo: 'novo' })
  })
  it('sem nome nem CPF (ex.: comprovante de endereço) → dono atual', () => {
    expect(sugerirDonoDocumento({}, ps, 'a')).toEqual({ tipo: 'participante', pessoaId: 'a', motivo: 'dono_atual' })
  })
  it('sem dado de identificação e dono atual fora da proposta → primeiro participante', () => {
    expect(sugerirDonoDocumento({ cpf: '', nome: '' }, ps, 'x')).toEqual({ tipo: 'participante', pessoaId: 'h', motivo: 'dono_atual' })
  })
  it('CPF inválido é ignorado (cai no nome)', () => {
    expect(sugerirDonoDocumento({ cpf: '11111111111', nome: 'Heitor Almeida Souza' }, ps, 'm'))
      .toEqual({ tipo: 'participante', pessoaId: 'h', motivo: 'nome' })
  })
})
