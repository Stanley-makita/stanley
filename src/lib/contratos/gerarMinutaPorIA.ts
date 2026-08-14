/**
 * Entrypoint da Fase 4 v3 — geração INICIAL de minuta por IA. Único caller
 * do motor genérico `redigirContrato()` hoje habilitado a chamá-lo sem uma
 * minuta anterior (rodada 1) e, se a validação reprovar, com uma rodada de
 * autocorreção (rodada 2, origem 'validacao_automatica' — ver
 * redigirContrato.ts para o porquê dessa rodada já nascer genérica).
 *
 * Pipeline (ver Diagnóstico V2 / Fase 4 do Construtor de Contratos):
 *
 *   redigirContrato() → injeta cláusulas protegidas → sanitiza → valida
 *     ├── válida → pronto
 *     └── inválida por conteúdo → 1 retry (rodada de correção) → valida de novo
 *           ├── válida → pronto
 *           └── ainda inválida → fallback determinístico (substituirVariaveis)
 *   falha técnica (rede/timeout/parse) em qualquer chamada → direto pro
 *     fallback, sem retry — nunca insiste numa IA que não respondeu.
 *
 * IMPORTANTE — esta distinção só vale para a geração INICIAL: cair no
 * fallback aqui significa "a IA não conseguiu, mas ainda não existe nenhuma
 * minuta desta negociação, então um ponto de partida determinístico é
 * melhor que nada". Uma futura rodada de REVISÃO conversacional (Fase 4.5)
 * NUNCA deve ter esse mesmo comportamento — se uma correção pedida pelo
 * operador falhar, a resposta certa é preservar a última minuta válida e
 * avisar o erro, nunca substituir silenciosamente o que o operador já
 * estava revisando pelo modelo padrão. Esta função não decide isso sozinha
 * porque ela é, por desenho, só o caminho de geração inicial — uma futura
 * `revisarMinutaPorIA` (Fase 4.5) chamaria `redigirContrato` diretamente,
 * com sua própria política de erro, sem passar por aqui.
 */

import type { ResumoNegociacao } from './entenderNegociacao'
import type { PlanoContrato } from './planejarContrato'
import type { Processo } from '@/types/processos'
import { redigirContrato } from './redigirContrato'
import { injetarClausulasProtegidas } from './clausulasProtegidas'
import { sanitizarMinutaHtml } from './sanitizarMinuta'
import { validarMinutaGerada } from './validarMinutaGerada'
import { construirDadosTemplate } from './resumoParaTemplate'
import { selecionarTemplate } from './selecionarTemplate'
import { substituirVariaveis } from './substituirVariaveis'

export interface ResultadoGeracaoMinuta {
  html: string
  origem: 'ia' | 'fallback'
  avisoFallback?: string
}

export async function gerarMinutaPorIA(input: {
  tipoContrato: string
  resumo: ResumoNegociacao
  plano: PlanoContrato
  instrucoesLivres: string | null
  processo: Processo
}): Promise<ResultadoGeracaoMinuta> {
  const { processoAdaptado, compradoresAdaptados, vendedoresAdaptados, extras } =
    construirDadosTemplate(input.resumo, input.processo)

  const fallback = (motivo: string): ResultadoGeracaoMinuta => {
    console.error(`[gerarMinutaPorIA] caindo no fallback determinístico: ${motivo}`)
    const template = selecionarTemplate(input.tipoContrato)
    const html = substituirVariaveis(
      template.conteudo, processoAdaptado, compradoresAdaptados, vendedoresAdaptados, undefined, extras,
    )
    return {
      html,
      origem: 'fallback',
      avisoFallback: 'A IA não conseguiu redigir a minuta; foi usado o modelo padrão da Fontinhas. Revise com atenção antes de salvar.',
    }
  }

  let bruto1: string
  try {
    bruto1 = await redigirContrato({ resumo: input.resumo, plano: input.plano, instrucoesLivres: input.instrucoesLivres })
  } catch (err) {
    return fallback(`falha técnica na redação inicial (${err instanceof Error ? err.message : 'erro desconhecido'})`)
  }

  const minuta1 = sanitizarMinutaHtml(
    injetarClausulasProtegidas(bruto1, processoAdaptado, compradoresAdaptados, vendedoresAdaptados, undefined, extras),
  )
  const validacao1 = validarMinutaGerada(minuta1, input.resumo)
  if (validacao1.valido) return { html: minuta1, origem: 'ia' }

  let bruto2: string
  try {
    bruto2 = await redigirContrato({
      resumo: input.resumo,
      plano: input.plano,
      instrucoesLivres: input.instrucoesLivres,
      minutaAnterior: minuta1,
      origem: { tipo: 'validacao_automatica', problemas: validacao1.problemas },
    })
  } catch (err) {
    return fallback(`falha técnica na rodada de correção (${err instanceof Error ? err.message : 'erro desconhecido'})`)
  }

  const minuta2 = sanitizarMinutaHtml(
    injetarClausulasProtegidas(bruto2, processoAdaptado, compradoresAdaptados, vendedoresAdaptados, undefined, extras),
  )
  const validacao2 = validarMinutaGerada(minuta2, input.resumo, minuta1)
  if (validacao2.valido) return { html: minuta2, origem: 'ia' }

  return fallback(`minuta reprovou 2x na validação: ${validacao2.problemas.join('; ')}`)
}
