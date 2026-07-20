/**
 * Parsers determinísticos para o fluxo de perguntas do *custas.
 *
 * Ao contrário do *simula (parsing livre via LLM), o *custas é um Q&A
 * fixo — cada resposta corresponde a uma pergunta conhecida, então basta
 * um parser simples e determinístico por tipo de campo.
 */

import { extrairNumero } from './state-machine'

function normalizarTexto(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const POSITIVOS = new Set([
  'sim', 's', '1', 'isso', 'isto', 'correto', 'certo', 'positivo',
  'claro', 'ok', 'blz', 'beleza', 'confere',
])

const NEGATIVOS = new Set([
  'nao', 'n', '2', 'negativo', 'errado',
])

/** Interpreta uma resposta de pergunta sim/não. Aceita "1"/"2" como alternativa numérica. */
export function parseSimNao(texto: string): 'sim' | 'nao' | null {
  const n = normalizarTexto(texto)
  if (POSITIVOS.has(n) || /👍|✅/.test(texto)) return 'sim'
  if (NEGATIVOS.has(n) || /👎|❌/.test(texto)) return 'nao'
  return null
}

/**
 * Resolve uma resposta de menu numerado contra uma lista de opções.
 * Aceita o número da opção ("1", "2 ") ou um trecho do próprio rótulo
 * (case/acento-insensível, substring).
 * Retorna o índice (0-based) da opção escolhida, ou null se não reconhecida.
 */
export function parseMenuOpcao(texto: string, opcoes: string[]): number | null {
  const t = normalizarTexto(texto)

  const numMatch = t.match(/^(\d+)\b/)
  if (numMatch) {
    const idx = parseInt(numMatch[1], 10) - 1
    if (idx >= 0 && idx < opcoes.length) return idx
  }

  const opcoesNorm = opcoes.map(normalizarTexto)
  const porInicio = opcoesNorm.findIndex((o) => t.startsWith(o) || o.startsWith(t))
  if (porInicio !== -1) return porInicio

  const porInclusao = opcoesNorm.findIndex((o) => t.includes(o) || o.includes(t))
  if (porInclusao !== -1) return porInclusao

  return null
}

/** Extrai um valor em reais de texto livre ("300 mil", "R$ 300.000,00", "300k"). */
export function parseValorReais(texto: string): number | null {
  return extrairNumero(texto)
}

/**
 * Como parseValorReais, mas aceita explicitamente "0"/"não tem"/"sem"/"nenhum"
 * como zero — usado em campos opcionais (serviço de registro, certidões,
 * contrato particular) onde extrairNumero rejeitaria valores abaixo de 100.
 */
export function parseValorOuZero(texto: string): number | null {
  const n = normalizarTexto(texto)
  if (n === '0' || /^(nao tem|nao ha|nenhum|nenhuma|sem|zero)\b/.test(n)) return 0
  return extrairNumero(texto)
}
