/**
 * Testes com resposta de IA MOCKADA (não ao vivo) — provam a lógica de
 * pipeline (redigir → injetar cláusulas protegidas → sanitizar → validar →
 * retry → fallback) de forma determinística, sem depender da qualidade real
 * do modelo. Segue o mesmo padrão de mock de @anthropic-ai/sdk usado em
 * src/lib/workflows/__tests__/cria-cliente-pendencia.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ResumoNegociacao } from '../entenderNegociacao'
import type { PlanoContrato } from '../planejarContrato'
import type { Processo } from '@/types/processos'
import { gerarMinutaPorIA } from '../gerarMinutaPorIA'

const filaRespostas = vi.hoisted(() => ({ itens: [] as string[] }))

vi.mock('@anthropic-ai/sdk', () => ({
  default: class AnthropicMock {
    messages = {
      create: async () => {
        // Fila vazia simula falha técnica (rede/timeout) — nunca "texto
        // vazio válido", que seria um caso de conteúdo, não de infra.
        if (filaRespostas.itens.length === 0) throw new Error('Erro de rede simulado')
        const texto = filaRespostas.itens.shift() as string
        return { content: [{ type: 'text', text: texto }], stop_reason: 'end_turn' }
      },
    }
  },
}))

function resumo(overrides: Partial<ResumoNegociacao> = {}): ResumoNegociacao {
  return {
    compradores: [
      { nome: 'Maria Compradora', cpf: '111.111.111-11', rg: null, orgao_emissor_rg: null, cnh: null, estado_civil: null, regime_casamento: null, profissao: null, nacionalidade: null, data_nascimento: null, endereco: null },
      { nome: 'Yovanny Comprador', cpf: '222.222.222-22', rg: null, orgao_emissor_rg: null, cnh: null, estado_civil: null, regime_casamento: null, profissao: null, nacionalidade: null, data_nascimento: null, endereco: null },
    ],
    vendedores: [
      { nome: 'Carla Vendedora', cpf: '333.333.333-33', rg: null, orgao_emissor_rg: null, cnh: null, estado_civil: null, regime_casamento: null, profissao: null, nacionalidade: null, data_nascimento: null, endereco: null },
    ],
    imovel: { descricao: 'apartamento', endereco: 'Rua Teste, 1', matricula: '123', cartorio: '1º Ofício', area: '80m²', cadastro_prefeitura: '456', cidade: 'Maringá', uf: 'PR' },
    valor: 780000,
    entrada: 80000,
    saldo: 'financiado',
    valor_financiado: 550000,
    banco_financiador: 'Caixa Econômica Federal',
    prazo_posse_dias: 30,
    condicao_posse: null,
    multa_percentual: 10,
    cidade: 'Maringá',
    clausula_pagamento_complementar: null,
    painel_inteligencia: [],
    testemunhas: [],
    corretor: null,
    comissao: null,
    certidoes: [],
    ...overrides,
  }
}

const plano: PlanoContrato = { clausulas: [{ texto: 'Qualificação das partes', tipo: 'padrao' }] }
const processo = { id: 'p1', empresa_id: 'e1', valor_imovel: 780000, valor_entrada: 80000, valor_financiado: 550000, numero_processo: '1', nome_imovel: null, banco: null, corretor_nome: null, corretor_creci: null } as unknown as Processo

const MINUTA_HTML_COMPLETA = `<p>abertura</p>
<p><strong>COMPROMITENTE VENDEDOR(A):</strong> Carla Vendedora.</p>
<p><strong>COMPROMISSÁRIO(A) COMPRADOR(A):</strong> Maria Compradora; e Yovanny Comprador.</p>
<h3>CLÁUSULA PRIMEIRA — DO OBJETO</h3>
<p>O preço é de R$ 780.000,00.</p>
{{PROTEGIDA:FORO}}
<p>Carla Vendedora — assinatura</p>
<p>Maria Compradora — assinatura</p>
<p>Yovanny Comprador — assinatura</p>
`

const MINUTA_HTML_INCOMPLETA = `<p>abertura</p>
<p><strong>COMPROMITENTE VENDEDOR(A):</strong> Carla Vendedora.</p>
<p><strong>COMPROMISSÁRIO(A) COMPRADOR(A):</strong> Maria Compradora.</p>
<h3>CLÁUSULA PRIMEIRA — DO OBJETO</h3>
<p>O preço é de R$ 780.000,00.</p>
{{PROTEGIDA:FORO}}
<p>Carla Vendedora — assinatura</p>
<p>Maria Compradora — assinatura</p>
`

beforeEach(() => {
  filaRespostas.itens = []
})

describe('gerarMinutaPorIA — pipeline com IA mockada', () => {
  it('resposta incompleta (falta 2º comprador) reprova por seção; retry com lista exata de problemas; 2ª resposta completa → sucesso', async () => {
    filaRespostas.itens = [MINUTA_HTML_INCOMPLETA, MINUTA_HTML_COMPLETA]

    const resultado = await gerarMinutaPorIA({
      tipoContrato: 'compra_venda', resumo: resumo(), plano, instrucoesLivres: null, processo,
    })

    expect(resultado.origem).toBe('ia')
    expect(resultado.html).toContain('Yovanny Comprador')
    expect(resultado.html).not.toContain('{{PROTEGIDA:FORO}}')
    expect(resultado.html).toContain('CLÁUSULA DÉCIMA SEXTA — DO FORO')
    expect(filaRespostas.itens).toHaveLength(0) // consumiu exatamente 2 chamadas, nem mais nem menos
  })

  it('primeira E segunda resposta incompletas → cai no fallback determinístico, sem travar', async () => {
    filaRespostas.itens = [MINUTA_HTML_INCOMPLETA, MINUTA_HTML_INCOMPLETA]

    const resultado = await gerarMinutaPorIA({
      tipoContrato: 'compra_venda', resumo: resumo(), plano, instrucoesLivres: null, processo,
    })

    expect(resultado.origem).toBe('fallback')
    expect(resultado.avisoFallback).toBeTruthy()
    // fallback determinístico (substituirVariaveis) qualifica os DOIS compradores
    expect(resultado.html).toContain('Yovanny Comprador')
    expect(resultado.html).toContain('Maria Compradora')
  })

  it('falha técnica (resposta sem bloco de texto) cai direto no fallback, sem consumir retry', async () => {
    filaRespostas.itens = [] // fila vazia → create() devolve texto '', sem bloco 'text' útil

    const resultado = await gerarMinutaPorIA({
      tipoContrato: 'compra_venda', resumo: resumo(), plano, instrucoesLivres: null, processo,
    })

    expect(resultado.origem).toBe('fallback')
  })

  it('minuta completa já na 1ª resposta não dispara retry nenhum', async () => {
    filaRespostas.itens = [MINUTA_HTML_COMPLETA, MINUTA_HTML_COMPLETA]

    const resultado = await gerarMinutaPorIA({
      tipoContrato: 'compra_venda', resumo: resumo(), plano, instrucoesLivres: null, processo,
    })

    expect(resultado.origem).toBe('ia')
    expect(filaRespostas.itens).toHaveLength(1) // só consumiu a 1ª, a 2ª sobrou na fila
  })
})
