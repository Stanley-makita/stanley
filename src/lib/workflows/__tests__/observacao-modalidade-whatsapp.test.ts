/**
 * A nota de modalidade (ResultadoBanco.observacao, ex.: "Para esta modalidade, a Caixa é
 * o banco operador padrão...") já era renderizada no PDF cliente e no Card do CRM, mas
 * estava ausente no texto do WhatsApp e no PDF servidor — exatamente os dois canais que
 * o cliente do bot recebe. Este teste cobre o texto do WhatsApp (montarRespostaSimulacao).
 */
import { describe, it, expect } from 'vitest'
import { executarSimulacao, montarRespostaSimulacao } from '../motor-simulacao'
import type { DadosCaptacaoNormalizados } from '../normalizador-captacao'

function baseDados(overrides: Partial<DadosCaptacaoNormalizados>): DadosCaptacaoNormalizados {
  return {
    nome: 'Cliente Teste',
    cpf: null,
    telefone: null,
    data_nascimento: '1990-06-15',
    cidade_imovel: 'Maringá',
    tipo_imovel: null,
    valor_imovel: 300_000,
    valor_entrada: 100_000,
    valor_financiado: null,
    renda_formal: 20_000,
    renda_informal: null,
    bancos_ids: ['itau', 'caixa'],
    solicitar_simulacao: true,
    prazo_meses: null,
    tipo_amortizacao: 'SAC',
    amortizacao_por_banco: {},
    correntista: false,
    produto: null,
    fgts_valor: null,
    usa_fgts: false,
    todos_bancos: false,
    modo_calculo: null,
    prazo_maximo: false,
    prazos_detectados: null,
    produto_normalizado: 'AQUISICAO',
    usou_idade_aproximada: false,
    idade_assumida_prazo_maximo: false,
    conflito_valores: false,
    conflito_valores_descricao: null,
    tipo_operacao: 'lote_urbanizado',
    finalidade_efetiva: 'residencial',
    valor_terreno: null,
    valor_obra: null,
    pedir_esclarecimento_operacao: false,
    pergunta_esclarecimento: null,
    valores_ambiguos_brutos: null,
    ...overrides,
  }
}

describe('observação de modalidade no texto do WhatsApp', () => {
  it('inclui a nota de modalidade (lote/construção/comercial) na resposta de texto', async () => {
    const resultado = await executarSimulacao(baseDados({}), {})
    const texto = montarRespostaSimulacao(resultado, { nomeDisplay: 'Cliente Teste' })

    expect(texto).toContain('terreno/lote urbanizado')
    expect(texto).toContain('principal referência operacional')
  })

  it('não inclui nota de modalidade quando a operação é aquisição simples', async () => {
    const resultado = await executarSimulacao(
      baseDados({ tipo_operacao: 'aquisicao', bancos_ids: ['caixa'] }),
      {},
    )
    const texto = montarRespostaSimulacao(resultado, { nomeDisplay: 'Cliente Teste' })

    expect(texto).not.toContain('principal referência operacional')
  })
})
