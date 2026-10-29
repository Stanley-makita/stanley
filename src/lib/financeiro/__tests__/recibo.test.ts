import { describe, expect, it } from 'vitest'
import { enderecoEmpresa, gerarReciboPdf, localEData, numeroRecibo, textoRecibo, type DadosRecibo } from '../recibo'

const EMPRESA = {
  nome: 'Fontinhas Assessoria',
  razao_social: 'Fontinhas Assessoria Ltda',
  cnpj: '77.543.700/0001-57',
  telefone: '(44) 3262-1685',
  email: null,
  endereco_rua: 'Av. Brasil',
  endereco_numero: '100',
  endereco_complemento: 'Sala 2',
  endereco_bairro: 'Centro',
  endereco_cidade: 'Maringá',
  endereco_uf: 'PR',
  endereco_cep: '87000-000',
}

const BASE: DadosRecibo = {
  numero: 1,
  valor: 350,
  descricao: 'kit certidões para o processo',
  recebidoEm: new Date('2026-10-29T15:00:00-03:00'),
  pagadorNome: 'ÉRICA ROSA DE LIMA',
  pagadorCpf: '12345678909',
  processoNumero: '#proc-140',
  empresa: EMPRESA,
}

describe('recibo', () => {
  it('frase traz pagador, CPF formatado, valor, extenso e descrição', () => {
    expect(textoRecibo(BASE)).toBe(
      'Recebemos de ÉRICA ROSA DE LIMA, CPF 123.456.789-09, a quantia de R$ 350,00 (trezentos e cinquenta reais), referente a kit certidões para o processo.',
    )
  })

  it('sem CPF, só o nome', () => {
    expect(textoRecibo({ ...BASE, pagadorNome: 'João da Silva', pagadorCpf: null })).toMatch(/^Recebemos de João da Silva, a quantia/)
  })

  it('centavos no extenso', () => {
    expect(textoRecibo({ ...BASE, valor: 1250.5 })).toContain('R$ 1.250,50 (mil e duzentos e cinquenta reais e cinquenta centavos)')
  })

  it('local e data com a cidade da empresa; sem cidade, só a data', () => {
    expect(localEData(BASE)).toBe('Maringá, 29 de outubro de 2026')
    expect(localEData({ ...BASE, empresa: { ...EMPRESA, endereco_cidade: null } })).toBe('29 de outubro de 2026')
  })

  it('número com 4 dígitos e endereço em uma linha', () => {
    expect(numeroRecibo(7)).toBe('0007')
    expect(enderecoEmpresa(EMPRESA)).toBe('Av. Brasil, 100 - Sala 2 · Centro · Maringá/PR · CEP 87000-000')
    expect(enderecoEmpresa({ ...EMPRESA, endereco_rua: null, endereco_numero: null, endereco_complemento: null, endereco_bairro: null, endereco_cidade: null, endereco_uf: null, endereco_cep: null })).toBeNull()
  })

  it('gera um PDF válido (com e sem logo inválida)', async () => {
    const buf = await gerarReciboPdf(BASE)
    expect(buf.subarray(0, 4).toString()).toBe('%PDF')
    const semLogo = await gerarReciboPdf({ ...BASE, logoDataUrl: 'data:image/png;base64,xxx' })
    expect(semLogo.subarray(0, 4).toString()).toBe('%PDF')
  })
})
