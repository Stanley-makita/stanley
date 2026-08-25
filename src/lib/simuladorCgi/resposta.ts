import { notaTaxaCgi, notaLimitadoPelaIdadeCgi, NOTA_IDADE_NAO_INFORMADA_CGI, BANCOS_CGI_CONFIG } from './constantes'
import type { ResultadoBancoCgi, ResultadoCgiCompleto } from './tipos'

const fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

function linhaBancoInelegivel(b: ResultadoBancoCgi): string {
  return [
    `• *${b.bancoNome}* — não elegível nesta simulação`,
    `  ⚠️ ${b.motivoInelegivel}`,
  ].join('\n')
}

function linhaBanco(b: ResultadoBancoCgi, ehMenorPrestacao: boolean): string {
  if (!b.elegivel) return linhaBancoInelegivel(b)

  const badge = ehMenorPrestacao ? ' _(menor prestação estimada nesta simulação)_' : ''
  const linhas = [
    `• *${b.bancoNome}*${badge} — ${b.sistemaAmortizacao}`,
    `  Valor simulado: ${fmt.format(b.valorSimulado)} (${(b.percentualFinanciado * 100).toFixed(1)}% do imóvel)`,
    `  Prestação estimada: ${fmt.format(b.prestacaoEstimada)} | Prazo: ${b.prazoConsiderado} meses`,
    `  IOF estimado: ${fmt.format(b.iofEstimado)} (à parte, não incluído na prestação)`,
    `  ${notaTaxaCgi(BANCOS_CGI_CONFIG[b.bancoId])}`,
  ]
  if (b.limitadoPeloLtv) {
    linhas.push(`  ⚠️ Valor solicitado (${fmt.format(b.valorSolicitado)}) excede o limite preliminar de LTV — simulado o máximo de ${fmt.format(b.valorMaximoPeloImovel)}.`)
  }
  if (b.limitadoPeloPrazoBanco) {
    linhas.push(`  ⚠️ Prazo solicitado (${b.prazoSolicitado} meses) excede o teto deste banco (${b.prazoMaximoBanco} meses).`)
  }
  if (b.limitadoPelaIdade) {
    linhas.push(`  ⚠️ ${notaLimitadoPelaIdadeCgi(b.prazoConsiderado)}`)
  }
  return linhas.join('\n')
}

export function montarRespostaSimulacaoCgi(resultado: ResultadoCgiCompleto): string {
  const { input, bancos, bancoMenorPrestacaoId } = resultado
  const idadeInformada = input.dataNascimento != null

  const linhas: string[] = [
    `📊 *Simulação Preliminar — CGI / Home Equity*`,
    `Imóvel em garantia: ${fmt.format(input.valorImovel)} | Crédito solicitado: ${fmt.format(input.valorDesejado)}`,
    '',
    `🏦 *Bancos:*`,
    bancos.map((b) => linhaBanco(b, b.bancoId === bancoMenorPrestacaoId)).join('\n\n'),
    '',
  ]

  if (!idadeInformada) {
    linhas.push(`ℹ️ _${NOTA_IDADE_NAO_INFORMADA_CGI}_`, '')
  }

  linhas.push(`⚠️ _Simulação preliminar e comparativa — taxas de referência, sujeitas a análise de crédito, imóvel, relacionamento e política vigente de cada instituição. Não representa aprovação de crédito._`)

  return linhas.join('\n')
}
