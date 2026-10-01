import { describe, it, expect } from 'vitest'
import { gerarEmailConfirmacaoValores, type BancoTemplate, type DadosConfirmacaoValores } from '..'

const base: DadosConfirmacaoValores = {
  cliente_nome: 'Cliente', banco_nome: 'Banco', engenharia_laudo: null, compra_venda: null, entrada: null,
  fgts: null, subsidio: null, valor_financiado: null, despesas_financiadas: null, valor_total_financiado: null,
  prazo_meses: null, modalidade: 'Residencial', amortizacao: null, taxa: null, iof: null, tarifa_banco: null,
  observacoes: null, usuario_nome: 'U', usuario_funcao: 'comercial', usuario_email: 'u@x.com',
  usuario_telefone_whatsapp: null, tem_assessoria: true,
}

const BANCOS: BancoTemplate[] = ['CAIXA', 'BANCO_DO_BRASIL', 'BRADESCO', 'ITAU', 'SANTANDER']
const ITBI_COMPLETO = 'Será enviado após a emissão pela prefeitura'
const ITBI_REGRA = '<strong>BOLETO ITBI:</strong> O cálculo e as alíquotas serão de acordo com as regras de cada município.'

describe('e-mail de confirmação de valores — textos fixos', () => {
  it.each(BANCOS)('%s com assessoria: ITBI completo', (banco) => {
    const { corpo } = gerarEmailConfirmacaoValores(banco, base)
    expect(corpo).toContain(ITBI_COMPLETO)
  })

  it.each(BANCOS)('%s sem assessoria: ITBI só com a regra do município', (banco) => {
    const { corpo } = gerarEmailConfirmacaoValores(banco, { ...base, tem_assessoria: false })
    expect(corpo).toContain(ITBI_REGRA)
    expect(corpo).not.toContain(ITBI_COMPLETO)
  })

  it.each([
    ['BRADESCO', 'conta corrente Bradesco'],
    ['ITAU', 'conta Itaú'],
    ['SANTANDER', 'conta corrente Santander'],
    ['BANCO_DO_BRASIL', 'conta corrente Banco do Brasil'],
  ] as [BancoTemplate, string][])('%s: 1ª prestação cobre 30 dias ou vencimento escolhido', (banco, conta) => {
    const { corpo } = gerarEmailConfirmacaoValores(banco, base)
    expect(corpo).toContain(
      `Será debitada da sua ${conta}, 30 dias após a emissão do contrato independente da data de assinatura do mesmo, ou dependendo do Banco, na data de vencimento que você escolheu.`,
    )
    expect(corpo).not.toContain('todo dia 20')
  })
})
