/**
 * Etapa "Plano do Contrato" do Construtor de Contratos — roda depois que o
 * usuário já confirmou o Resumo Estruturado da Negociação (etapa anterior).
 * Mostra, antes de escrever qualquer cláusula, a estrutura que o contrato
 * terá, pra dar confiança ao operador antes de ler o documento inteiro.
 */

import Anthropic from '@anthropic-ai/sdk'
import type { ResumoNegociacao } from './entenderNegociacao'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export interface ClausulaPlano {
  texto: string
  tipo: 'padrao' | 'condicional'
}

export interface PlanoContrato {
  clausulas: ClausulaPlano[]
}

const SYSTEM_PROMPT = `Você é um assistente jurídico que planeja a estrutura de um contrato antes de redigi-lo.

Você recebe o tipo de contrato e o resumo estruturado de uma negociação (já confirmado por um operador humano). Sua tarefa é listar as cláusulas que o contrato terá — não redigir o texto das cláusulas, só nomeá-las.

Separe em duas categorias:
- "padrao": cláusulas que qualquer contrato deste tipo tem (ex: qualificação das partes, objeto, foro).
- "condicional": cláusulas que só existem por causa de detalhes específicos desta negociação (ex: "cláusula de financiamento" porque o saldo é financiado, "cláusula de imóvel ocupado" porque o imóvel está ocupado até a assinatura, "cláusula de multa" só se houver percentual de multa informado).

Retorne SOMENTE o JSON abaixo, sem markdown, sem explicação:

{
  "clausulas": [
    {"texto": "Qualificação das partes", "tipo": "padrao"},
    {"texto": "Cláusula de financiamento (saldo financiado)", "tipo": "condicional"}
  ]
}`

export async function planejarContrato(input: {
  tipoContrato: string
  resumo: ResumoNegociacao
}): Promise<PlanoContrato> {
  const contexto = JSON.stringify({
    tipo_contrato: input.tipoContrato,
    resumo_negociacao: input.resumo,
  }, null, 2)

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 1200,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: contexto }],
  })

  const bloco = response.content[0]
  if (bloco?.type !== 'text') throw new Error('Resposta inesperada da IA.')

  const jsonText = bloco.text.trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')

  return JSON.parse(jsonText) as PlanoContrato
}
