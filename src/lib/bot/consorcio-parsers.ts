/**
 * Parsers determinísticos para o fluxo de perguntas do *consorcio.
 *
 * Mesmo espírito de custas-parsers.ts (Q&A fixo, não parsing livre via LLM)
 * — arquivo novo em vez de editar custas-parsers.ts, pra não arriscar nada
 * no fluxo do *custas. `parseValorReais` (valores em R$) é reaproveitado de
 * lá diretamente, sem duplicar.
 */

function normalizarTexto(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w\s%,.]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Extrai um número inteiro positivo de texto livre — usado pra mês/prazo em
 * meses, onde os parsers de dinheiro (parseValorReais/parseValorOuZero) não
 * servem: extrairNumero (state-machine.ts) rejeita qualquer valor abaixo de
 * 100, pensado pra valores em reais, não pra "36 meses".
 */
// Teto de 999 — achado real de auditoria: sem limite superior, um fat-finger tipo
// "99999999" (meses) passava direto pro simulador/PDF sem nenhum alerta. 999 meses (83
// anos) já é folgado o suficiente pra nunca rejeitar um prazo/mês real de consórcio.
const TETO_INTEIRO = 999

export function parseInteiro(texto: string): number | null {
  const n = normalizarTexto(texto)
  const match = n.match(/\d+/)
  if (!match) return null
  const valor = parseInt(match[0], 10)
  return isNaN(valor) || valor <= 0 || valor > TETO_INTEIRO ? null : valor
}

/**
 * Extrai um percentual de texto livre ("23", "23%", "23,5", "3,0%") e
 * retorna como fração 0-1 (23% → 0.23). Aceita 0 (ex.: fundo de reserva sem
 * cobrança) mas não negativo.
 */
// Teto de 100% — achado real de auditoria: sem limite superior, "500" digitado achando
// que era 5% virava 500% direto em taxa_adm/indice_correcao/fundo_reserva/
// parcela_reduzida, sem nenhum alerta, indo parar no PDF do cliente.
const TETO_PERCENTUAL = 100

export function parsePercentual(texto: string): number | null {
  const n = normalizarTexto(texto).replace('%', '').replace(',', '.')
  const match = n.match(/-?\d+(\.\d+)?/)
  if (!match) return null
  const valor = parseFloat(match[0])
  return isNaN(valor) || valor < 0 || valor > TETO_PERCENTUAL ? null : valor / 100
}

const POSITIVOS = new Set([
  'sim', 's', 'isso', 'isto', 'correto', 'certo', 'positivo',
  'claro', 'ok', 'blz', 'beleza', 'confere', 'aceito', 'aceita', 'confirma', 'confirmo',
])

/**
 * Extrai a escolha do indexador ("1"=Fixo / "2"=Variável) — passo logo após
 * o Índice de correção. Aceita o número ou a palavra (fixo/variavel), pra
 * não travar quem digitar por extenso em vez do número.
 */
export function parseIndexadorFixo(texto: string): boolean | null {
  const n = normalizarTexto(texto)
  if (n === '1' || /\bfix[oa]\b/.test(n)) return true
  if (n === '2' || /\bvari[aá]ve?l\b/.test(n)) return false
  return null
}

/**
 * Extrai o tipo de bem ("1"=Imóvel / "2"=Auto) — primeiro passo do
 * *consorcio, decide o título da Versão Proposta. Aceita o número ou a
 * palavra por extenso.
 */
export function parseTipoBem(texto: string): 'imovel' | 'auto' | null {
  const n = normalizarTexto(texto)
  if (n === '1' || /\b(imovel|imoveis|casa|apartamento|apto|terreno)\b/.test(n)) return 'imovel'
  if (n === '2' || /\b(auto|automovel|carro|veiculo|moto|caminhao)\b/.test(n)) return 'auto'
  return null
}

/**
 * Resolve uma resposta a uma pergunta com valor sugerido: texto vazio ou uma
 * confirmação ("sim"/"ok"/etc.) aceita a sugestão; qualquer outra coisa tenta
 * parsear como um valor novo via `parser`. Usado nos passos que mostram
 * sugestão editável (valor da carta, % da parcela reduzida).
 */
export function parseComSugestao<T>(
  texto: string,
  sugestao: T,
  parser: (t: string) => T | null,
): T | null {
  const t = texto.trim()
  if (!t || POSITIVOS.has(normalizarTexto(t))) return sugestao
  return parser(texto)
}
