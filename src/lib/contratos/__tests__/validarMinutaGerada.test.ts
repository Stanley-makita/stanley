import { describe, it, expect } from 'vitest'
import { validarMinutaGerada } from '../validarMinutaGerada'
import type { ResumoNegociacao } from '../entenderNegociacao'

function resumoBase(overrides: Partial<ResumoNegociacao> = {}): ResumoNegociacao {
  return {
    compradores: [],
    vendedores: [],
    imovel: { descricao: null, endereco: null, matricula: null, cartorio: null, area: null, cadastro_prefeitura: null, cidade: null, uf: null },
    valor: null,
    entrada: null,
    saldo: null,
    valor_financiado: null,
    banco_financiador: null,
    prazo_posse_dias: null,
    condicao_posse: null,
    multa_percentual: null,
    cidade: null,
    clausula_pagamento_complementar: null,
    painel_inteligencia: [],
    testemunhas: [],
    corretor: null,
    comissao: null,
    certidoes: [],
    ...overrides,
  }
}

function pessoa(nome: string) {
  return {
    nome, cpf: '111.111.111-11', rg: null, orgao_emissor_rg: null, cnh: null,
    estado_civil: null, regime_casamento: null, profissao: null, nacionalidade: null,
    data_nascimento: null, endereco: null,
  }
}

const MINUTA_COMPLETA = `<p>abertura</p>
<p><strong>COMPROMITENTE VENDEDOR(A):</strong> Carla Vendedora.</p>
<p><strong>COMPROMISSÁRIO(A) COMPRADOR(A):</strong> Maria Compradora; e Yovanny Comprador.</p>
<h3>CLÁUSULA PRIMEIRA — DO OBJETO</h3>
<p>texto</p>
<h3>CLÁUSULA DÉCIMA QUARTA — DA CORRETAGEM</h3>
<p>Corretor João Corretor, CPF 000.</p>
<h3>CLÁUSULA DÉCIMA SEXTA — DO FORO</h3>
<p>foro</p>
<p>Carla Vendedora — assinatura</p>
<p>Maria Compradora — assinatura</p>
<p>Yovanny Comprador — assinatura</p>
<p>Testemunhas:</p>
<p>Ana Testemunha</p>
`

describe('validarMinutaGerada — validação por seção/papel', () => {
  it('aprova quando todo comprador/vendedor está em qualificação E assinatura', () => {
    const resumo = resumoBase({
      compradores: [pessoa('Maria Compradora'), pessoa('Yovanny Comprador')],
      vendedores: [pessoa('Carla Vendedora')],
    })
    const resultado = validarMinutaGerada(MINUTA_COMPLETA, resumo)
    expect(resultado.valido).toBe(true)
    expect(resultado.problemas).toEqual([])
  })

  it('regressão Yovanny: nome só num parágrafo de meio de texto (fora de qualificação/assinatura) reprova', () => {
    const minutaComYovannySoNoMeio = `<p>abertura</p>
<p><strong>COMPROMITENTE VENDEDOR(A):</strong> Carla Vendedora.</p>
<p><strong>COMPROMISSÁRIO(A) COMPRADOR(A):</strong> Maria Compradora.</p>
<h3>CLÁUSULA PRIMEIRA — DO OBJETO</h3>
<p>O imóvel foi visitado por Maria Compradora e por Yovanny Comprador antes da assinatura.</p>
<h3>CLÁUSULA DÉCIMA SEXTA — DO FORO</h3>
<p>foro</p>
<p>Carla Vendedora — assinatura</p>
<p>Maria Compradora — assinatura</p>
`
    const resumo = resumoBase({
      compradores: [pessoa('Maria Compradora'), pessoa('Yovanny Comprador')],
      vendedores: [pessoa('Carla Vendedora')],
    })
    const resultado = validarMinutaGerada(minutaComYovannySoNoMeio, resumo)
    expect(resultado.valido).toBe(false)
    expect(resultado.problemas.some((p) => p.includes('Yovanny Comprador') && p.includes('qualificação'))).toBe(true)
    expect(resultado.problemas.some((p) => p.includes('Yovanny Comprador') && p.includes('assinatura'))).toBe(true)
  })

  it('reprova testemunha ausente do bloco de testemunhas', () => {
    const resumo = resumoBase({
      compradores: [pessoa('Maria Compradora')],
      vendedores: [pessoa('Carla Vendedora')],
      testemunhas: [{ nome: 'Pedro Testemunha', cpf: null, rg: null, profissao: null, endereco: null, email: null }],
    })
    const minutaSemTestemunha = MINUTA_COMPLETA.replace('Ana Testemunha', 'Nenhuma testemunha listada')
    const resultado = validarMinutaGerada(minutaSemTestemunha, resumo)
    expect(resultado.valido).toBe(false)
    expect(resultado.problemas.some((p) => p.includes('Pedro Testemunha'))).toBe(true)
  })

  it('reprova corretor ausente da cláusula de corretagem', () => {
    const resumo = resumoBase({
      compradores: [pessoa('Maria Compradora')],
      vendedores: [pessoa('Carla Vendedora')],
      corretor: { nome: 'Fernanda Corretora', cpf: null, creci: null, email: null, telefone: null },
    })
    const resultado = validarMinutaGerada(MINUTA_COMPLETA, resumo)
    expect(resultado.valido).toBe(false)
    expect(resultado.problemas.some((p) => p.includes('Fernanda Corretora'))).toBe(true)
  })

  it('reprova marcador de cláusula protegida não substituído', () => {
    const resumo = resumoBase({ compradores: [pessoa('Maria Compradora')], vendedores: [pessoa('Carla Vendedora')] })
    const minutaComMarcadorSobrando = MINUTA_COMPLETA.replace('<h3>CLÁUSULA DÉCIMA SEXTA — DO FORO</h3>\n<p>foro</p>', '{{PROTEGIDA:FORO}}')
    const resultado = validarMinutaGerada(minutaComMarcadorSobrando, resumo)
    expect(resultado.valido).toBe(false)
    expect(resultado.problemas.some((p) => p.includes('PROTEGIDA'))).toBe(true)
  })

  it('reprova "[A PREENCHER]" na minuta gerada por IA', () => {
    const resumo = resumoBase({ compradores: [pessoa('Maria Compradora')], vendedores: [pessoa('Carla Vendedora')] })
    const minutaComPlaceholder = MINUTA_COMPLETA.replace('foro', '[A PREENCHER]')
    const resultado = validarMinutaGerada(minutaComPlaceholder, resumo)
    expect(resultado.valido).toBe(false)
    expect(resultado.problemas.some((p) => p.includes('A PREENCHER'))).toBe(true)
  })

  it('aprova sem testemunhas/corretor quando o resumo não os tem', () => {
    const resumo = resumoBase({ compradores: [pessoa('Maria Compradora')], vendedores: [pessoa('Carla Vendedora')] })
    const resultado = validarMinutaGerada(MINUTA_COMPLETA, resumo)
    expect(resultado.valido).toBe(true)
  })

  it('detecta valor total ausente do documento', () => {
    const resumo = resumoBase({
      compradores: [pessoa('Maria Compradora')], vendedores: [pessoa('Carla Vendedora')], valor: 780000,
    })
    const resultado = validarMinutaGerada(MINUTA_COMPLETA, resumo)
    expect(resultado.valido).toBe(false)
    expect(resultado.problemas.some((p) => p.includes('Valor total'))).toBe(true)
  })

  it('aprova valor total presente em qualquer formatação de moeda', () => {
    const resumo = resumoBase({
      compradores: [pessoa('Maria Compradora')], vendedores: [pessoa('Carla Vendedora')], valor: 780000,
    })
    const minutaComValor = MINUTA_COMPLETA.replace('<p>texto</p>', '<p>preço de R$ 780.000,00 (setecentos e oitenta mil reais)</p>')
    const resultado = validarMinutaGerada(minutaComValor, resumo)
    expect(resultado.valido).toBe(true)
  })
})

describe('validarMinutaGerada — comparação com minuta anterior (base pra diff, Fase 4.5)', () => {
  it('identifica cláusulas alteradas quando minutaAnterior é informada', () => {
    const resumo = resumoBase({ compradores: [pessoa('Maria Compradora')], vendedores: [pessoa('Carla Vendedora')] })
    const minutaNova = MINUTA_COMPLETA.replace('<p>foro</p>', '<p>foro alterado</p>')
    const resultado = validarMinutaGerada(minutaNova, resumo, MINUTA_COMPLETA)
    expect(resultado.clausulasAlteradas).toContain('CLÁUSULA DÉCIMA SEXTA — DO FORO')
    expect(resultado.clausulasAlteradas).not.toContain('CLÁUSULA PRIMEIRA — DO OBJETO')
  })

  it('sem minutaAnterior, clausulasAlteradas fica indefinido (não calcula à toa)', () => {
    const resumo = resumoBase({ compradores: [pessoa('Maria Compradora')], vendedores: [pessoa('Carla Vendedora')] })
    const resultado = validarMinutaGerada(MINUTA_COMPLETA, resumo)
    expect(resultado.clausulasAlteradas).toBeUndefined()
  })
})
