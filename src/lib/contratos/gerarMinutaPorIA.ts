import type { ResumoNegociacao } from './entenderNegociacao'
import type { PlanoContrato } from './planejarContrato'
import type { Processo } from '@/types/processos'
import { redigirContrato } from './redigirContrato'
import { CHAVES_CLAUSULAS_PROTEGIDAS, injetarClausulasProtegidas } from './clausulasProtegidas'
import { sanitizarMinutaHtml } from './sanitizarMinuta'
import { validarMinutaGerada } from './validarMinutaGerada'
import { construirDadosTemplate } from './resumoParaTemplate'
import { TEMPLATE_COMPRA_VENDA } from './templates/compra-venda'
import { REFERENCIA_COMPRA_VENDA } from './referenciaCompraVenda'

export interface ResultadoGeracaoMinuta {
  html: string
  origem: 'ia'
  referencia: typeof REFERENCIA_COMPRA_VENDA
  avisos: string[]
}

/** Uma redação por solicitação. Falha nunca troca o contrato por um modelo incompleto. */
export async function gerarMinutaPorIA(input: {
  tipoContrato: string
  resumo: ResumoNegociacao
  plano: PlanoContrato
  instrucoesLivres: string | null
  processo: Processo
}): Promise<ResultadoGeracaoMinuta> {
  const { processoAdaptado, compradoresAdaptados, vendedoresAdaptados, extras } =
    construirDadosTemplate(input.resumo, input.processo)
  let bruto = await redigirContrato({ resumo: input.resumo, plano: input.plano, instrucoesLivres: input.instrucoesLivres })
  const problemas: string[] = []
  if (input.resumo.condicao_posse?.trim()) {
    const marcador = '{{DADO:CONDICAO_POSSE}}'
    if (bruto.split(marcador).length !== 2) problemas.push('A condição de posse confirmada não foi preservada no local indicado pelo modelo.')
    const textoSeguro = input.resumo.condicao_posse.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    bruto = bruto.replace(marcador, textoSeguro)
  }
  for (const chave of CHAVES_CLAUSULAS_PROTEGIDAS) {
    if (bruto.split(`{{PROTEGIDA:${chave}}}`).length !== 2) {
      problemas.push(`Cláusula protegida ausente ou repetida: ${chave}.`)
    }
  }
  const html = sanitizarMinutaHtml(injetarClausulasProtegidas(
    bruto, processoAdaptado, compradoresAdaptados, vendedoresAdaptados, undefined, extras,
  ))
  // A numeração do modelo é estável: não aceitar supressão silenciosa de títulos.
  for (const [, titulo] of Array.from(TEMPLATE_COMPRA_VENDA.conteudo.matchAll(/<h3>([\s\S]*?)<\/h3>/g))) {
    const chave = titulo.replace(/\s+/g, ' ').trim()
    const titulosGerados = Array.from(html.matchAll(/<h3>([\s\S]*?)<\/h3>/g), m => m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim())
    if (titulosGerados.filter(t => t === chave).length !== 1) problemas.push(`Cláusula do modelo ausente ou repetida: ${chave}.`)
  }
  problemas.push(...validarMinutaGerada(html, input.resumo).problemas)
  if (/\{\{[^}]+\}\}/.test(html)) problemas.push('A minuta contém variáveis do modelo que não foram preenchidas.')
  for (const email of input.instrucoesLivres?.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi) ?? []) {
    if (!html.toLowerCase().includes(email.toLowerCase())) problemas.push(`E-mail fornecido nas instruções não foi preservado: ${email}.`)
  }
  if (problemas.length > 0) {
    const erro = new Error(`A minuta não passou na conferência e não substituiu o contrato anterior. ${problemas.slice(0, 8).join(' ')}`)
    erro.name = 'ValidacaoContratoError'
    throw erro
  }
  const pendentes = Array.from(html.matchAll(/\[A PREENCHER(?::[^\]]+)?\]/gi), m => m[0])
  return {
    html, origem: 'ia', referencia: REFERENCIA_COMPRA_VENDA,
    avisos: Array.from(new Set(pendentes)).map(p => `Complete antes de assinar: ${p}`),
  }
}
