import { DadosConfirmacaoValores } from './types'
import { fmt, assinatura, layoutEmail, tabelaValores, itemBoletoItbi, itemPrimeiraPrestacao } from './_helpers'

export function gerarEmailBancoDoBrasil(dados: DadosConfirmacaoValores): { assunto: string; corpo: string } {
  const assunto = `Confirmação de Valores — ${dados.cliente_nome} — Banco do Brasil`

  const linhas: [string, string][] = [
    ['Engenharia (Laudo de Avaliação Banco)', fmt(dados.engenharia_laudo)],
    ['Compra e Venda (Escritura)', fmt(dados.compra_venda)],
    ['Entrada', fmt(dados.entrada)],
    ['FGTS', fmt(dados.fgts)],
    ['Valor Financiado', fmt(dados.valor_financiado)],
    ['Despesas Financiadas', fmt(dados.despesas_financiadas)],
    ['Valor Total Financiado', fmt(dados.valor_total_financiado)],
    ['Prazo', dados.prazo_meses ? `${dados.prazo_meses} meses` : '—'],
    ['Modalidade', dados.modalidade],
    ['Amortização', dados.amortizacao ?? '—'],
    ['Taxa', dados.taxa ?? '—'],
  ]

  const tarifaTexto = dados.tarifa_banco ? fmt(dados.tarifa_banco) : 'R$ _________'

  const corpo = `
<p>Segue abaixo a relação com os valores do seu financiamento junto ao Banco do Brasil.
Pedimos que verifique e retorne com o <strong>"Aceite"</strong> caso esteja tudo correto ou nos informe em caso de alguma divergência.</p>

${tabelaValores(linhas)}

${dados.observacoes ? `<p><strong>Observações:</strong><br>${dados.observacoes}</p>` : ''}

<p style="margin-top:16px;"><strong>Observações Importantes:</strong></p>

<p>*<strong>CRÉDITO:</strong> As condições do financiamento, inclusive a taxa de juros, até a emissão do contrato, pode ser alteradas ou canceladas a qualquer momento pelo Banco do Brasil.</p>

${itemBoletoItbi(dados.tem_assessoria)}

<p>*<strong>TARIFA DO BANCO:</strong> ${tarifaTexto} será debitada da sua conta corrente Banco do Brasil na emissão do contrato, recomendamos a já deixar esse valor em conta, visto que, a emissão do contrato pode ocorrer a qualquer momento a partir da confirmação deste e-mail.</p>

${itemPrimeiraPrestacao('conta corrente Banco do Brasil')}
`.trim()

  return {
    assunto,
    corpo: layoutEmail('Banco do Brasil', corpo, assinatura(dados.usuario_nome, dados.usuario_funcao, dados.usuario_email, dados.usuario_telefone_whatsapp)),
  }
}
