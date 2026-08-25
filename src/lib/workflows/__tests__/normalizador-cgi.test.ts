import { describe, it, expect } from 'vitest'
import { normalizarDadosCaptacao } from '../normalizador-captacao'
import type { DadosCaptacaoRaw } from '../parser-captacao'

const CLASSIFICACAO_AQUISICAO = {
  tipoOperacao: 'aquisicao' as const,
  finalidade: 'residencial' as const,
  pedirEsclarecimento: false,
  pergunta: null,
}

describe('Normalizador — CGI / Home Equity', () => {
  it('produto "CGI" é reconhecido como CGI_HOME_EQUITY', () => {
    const raw: DadosCaptacaoRaw = { produto: 'CGI' }
    const dados = normalizarDadosCaptacao(raw, CLASSIFICACAO_AQUISICAO)
    expect(dados.produto_normalizado).toBe('CGI_HOME_EQUITY')
  })

  it('alias "Crédito com garantia de imóvel" é reconhecido como CGI_HOME_EQUITY', () => {
    const raw: DadosCaptacaoRaw = { produto: 'Crédito com garantia de imóvel' }
    const dados = normalizarDadosCaptacao(raw, CLASSIFICACAO_AQUISICAO)
    expect(dados.produto_normalizado).toBe('CGI_HOME_EQUITY')
  })

  it('alias "Empréstimo com garantia de imóvel" é reconhecido como CGI_HOME_EQUITY', () => {
    const raw: DadosCaptacaoRaw = { produto: 'Empréstimo com garantia de imóvel' }
    const dados = normalizarDadosCaptacao(raw, CLASSIFICACAO_AQUISICAO)
    expect(dados.produto_normalizado).toBe('CGI_HOME_EQUITY')
  })

  it('NÃO deriva entrada/financiado para CGI (imóvel != entrada + financiado)', () => {
    const raw: DadosCaptacaoRaw = {
      produto: 'CGI',
      valor_imovel: 1_000_000,
      valor_financiado: 500_000,
      // valor_entrada ausente — no fluxo de aquisição normal seria derivado como 500_000
    }
    const dados = normalizarDadosCaptacao(raw, CLASSIFICACAO_AQUISICAO)
    expect(dados.valor_imovel).toBe(1_000_000)
    expect(dados.valor_financiado).toBe(500_000)
    expect(dados.valor_entrada).toBeNull()
  })

  it('mesma combinação SEM produto CGI ainda deriva entrada normalmente (não quebrou aquisição)', () => {
    const raw: DadosCaptacaoRaw = {
      produto: null,
      valor_imovel: 1_000_000,
      valor_financiado: 500_000,
    }
    const dados = normalizarDadosCaptacao(raw, CLASSIFICACAO_AQUISICAO)
    expect(dados.valor_entrada).toBe(500_000)
  })

  it('mapeia "CashMe" (ausente do BANCO_ALIAS_MAP do financiamento) em bancos_cgi_ids', () => {
    const raw: DadosCaptacaoRaw = { produto: 'CGI', bancos_raw: ['CashMe', 'Santander'] }
    const dados = normalizarDadosCaptacao(raw, CLASSIFICACAO_AQUISICAO)
    expect(dados.bancos_cgi_ids).toEqual(['cashme', 'santander'])
    // 'cashme' não deve poluir bancos_ids (tipo do financiamento imobiliário)
    expect(dados.bancos_ids).not.toContain('cashme')
  })
})
