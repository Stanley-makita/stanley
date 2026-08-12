import { describe, it, expect } from 'vitest'
import { substituirVariaveis, percentualTexto, valorPorExtenso } from '../substituirVariaveis'
import type { Processo, ProcessoComprador, ProcessoVendedor } from '@/types/processos'

const processoBase = {
  id: 'p1', empresa_id: 'e1', valor_imovel: 780000, valor_entrada: 80000, valor_financiado: 550000,
  numero_processo: '1', nome_imovel: null, banco: null, corretor_nome: null, corretor_creci: null,
} as unknown as Processo

function comprador(nome: string, cpf: string): ProcessoComprador {
  return {
    id: '', processo_id: 'p1', empresa_id: 'e1', nome, cpf, email: `${nome}@teste.com`,
    telefone: null, renda_mensal: null, principal: true, created_at: '',
    pessoa: {
      rg: '1', registro_cnh: null, profissao: 'advogado(a)', nacionalidade: 'brasileiro(a)',
      data_nascimento: null, data_emissao: null, orgao_emissor: null, estado_civil: 'solteiro(a)',
      regime_casamento: null, data_casamento: null, conjuge_nome: null, conjuge_cpf: null,
      conjuge_data_nascimento: null, endereco_rua: 'Rua Teste', endereco_numero: '1',
      endereco_bairro: null, endereco_cidade: 'Maringá', endereco_uf: 'PR', endereco_cep: null,
    },
  }
}

describe('substituirVariaveis — múltiplos compradores/vendedores (Fase 0)', () => {
  it('qualifica e assina TODOS os compradores, não só o primeiro', () => {
    const compradores = [comprador('Maria', '111.111.111-11'), comprador('Yovanny', '222.222.222-22')]
    const vendedores: ProcessoVendedor[] = []
    const html = substituirVariaveis(
      '{{compradores_qualificacao}} | {{compradores_assinaturas}}',
      processoBase, compradores, vendedores,
    )
    expect(html).toContain('Maria')
    expect(html).toContain('Yovanny')
    expect(html).toContain('CPF nº 111.111.111-11')
    expect(html).toContain('CPF nº 222.222.222-22')
    // dois blocos de assinatura, um por comprador
    expect(html.match(/CPF: 111\.111\.111-11/g)?.length).toBe(1)
    expect(html.match(/CPF: 222\.222\.222-22/g)?.length).toBe(1)
  })

  it('mantém {{comprador_nome}} (singular) apontando pro primeiro — compatibilidade com outros templates', () => {
    const compradores = [comprador('Maria', '111.111.111-11'), comprador('Yovanny', '222.222.222-22')]
    const html = substituirVariaveis('{{comprador_nome}}', processoBase, compradores, [])
    expect(html).toBe('Maria')
  })

  it('sem nenhum comprador, cai em [A PREENCHER] em vez de quebrar', () => {
    const html = substituirVariaveis('{{compradores_qualificacao}}', processoBase, [], [])
    expect(html).toContain('[A PREENCHER]')
  })
})

describe('percentualTexto', () => {
  it('inteiro vira numeral + extenso', () => {
    expect(percentualTexto(10)).toBe('10% (dez por cento)')
    expect(percentualTexto(15)).toBe('15% (quinze por cento)')
  })

  it('fracionário só sai numérico', () => {
    expect(percentualTexto(10.5)).toBe('10,50%')
  })
})

describe('substituirVariaveis — extras da Fase 1 (schema expandido)', () => {
  it('lista_certidoes só aparece quando informado nos extras', () => {
    const semExtras = substituirVariaveis('{{lista_certidoes}}', processoBase, [], [])
    expect(semExtras).toBe('[A PREENCHER]')

    const comExtras = substituirVariaveis('{{lista_certidoes}}', processoBase, [], [], undefined, {
      listaCertidoes: 'Certidão de Situação Jurídica nº 21471/2024',
    })
    expect(comExtras).toBe('Certidão de Situação Jurídica nº 21471/2024')
  })

  it('corretor/comissão vêm do resumo, não só do cadastro do processo', () => {
    const html = substituirVariaveis(
      '{{corretor_nome}} {{corretor_cpf}} {{valor_comissao}} {{corretagem_responsavel}}{{corretagem_momento_pagamento}}',
      processoBase, [], [], undefined,
      {
        corretorNome: 'Ricardo Henrique Martins',
        corretorCpf: '321.654.987-20',
        valorComissao: 'R$ 23.400,00',
        corretagemResponsavel: 'do(a) COMPROMITENTE VENDEDOR(A)',
        corretagemMomentoPagamento: ', devida na assinatura do contrato de financiamento',
      },
    )
    expect(html).toBe('Ricardo Henrique Martins 321.654.987-20 R$ 23.400,00 do(a) COMPROMITENTE VENDEDOR(A), devida na assinatura do contrato de financiamento')
  })

  it('testemunhas vêm dos extras quando informadas', () => {
    const html = substituirVariaveis('{{testemunha1_nome}}/{{testemunha1_cpf}}', processoBase, [], [], undefined, {
      testemunha1Nome: 'Carlos Eduardo Moreira',
      testemunha1Cpf: '123.456.789-09',
    })
    expect(html).toBe('Carlos Eduardo Moreira/123.456.789-09')
  })

  it('condicao_posse_evento some quando a posse vem de condição composta (não escritura+quitação)', () => {
    const padrao = substituirVariaveis('{{data_posse}}{{condicao_posse_evento}}', processoBase, [], [])
    expect(padrao).toBe('[A PREENCHER], mediante a assinatura da escritura pública de venda e compra e quitação integral do preço')

    const composta = substituirVariaveis('{{data_posse}}{{condicao_posse_evento}}', processoBase, [], [], undefined, {
      dataPosse: 'no dia da assinatura do contrato de financiamento',
      condicaoPosseComposta: true,
    })
    expect(composta).toBe('no dia da assinatura do contrato de financiamento')
  })
})

describe('valorPorExtenso — regressão do bug " e oitenta mil reais"', () => {
  it('não deixa "e" solto quando a centena é zero (ex: 80 mil)', () => {
    expect(valorPorExtenso(80000)).toBe('oitenta mil reais')
  })

  it('usa "cento" (não "cem") quando há resto — ex: 150', () => {
    expect(valorPorExtenso(150)).toBe('cento e cinquenta reais')
  })

  it('"cem" sozinho continua correto pro número exato 100', () => {
    expect(valorPorExtenso(100)).toBe('cem reais')
  })

  it('caso real do teste: R$ 780.000,00', () => {
    expect(valorPorExtenso(780000)).toBe('setecentos e oitenta mil reais')
  })
})

describe('substituirVariaveis — multa percentual (Fase 0)', () => {
  it('usa 10% (dez por cento) por padrão quando não informado nos extras', () => {
    const html = substituirVariaveis('{{multa_percentual_texto}}', processoBase, [], [])
    expect(html).toBe('10% (dez por cento)')
  })

  it('usa o percentual informado quando presente nos extras', () => {
    const html = substituirVariaveis('{{multa_percentual_texto}}', processoBase, [], [], undefined, {
      multaPercentualTexto: '20% (vinte por cento)',
    })
    expect(html).toBe('20% (vinte por cento)')
  })
})
