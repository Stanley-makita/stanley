/**
 * Validação determinística da minuta redigida por IA (Fase 4) — por
 * SEÇÃO/PAPEL, não por busca de substring no HTML inteiro. Isso é o que
 * teria pego o caso real "Yovanny some da qualificação e da assinatura, mas
 * aparece em prosa no meio do texto": uma busca global por nome aprovaria
 * essa minuta (o nome "aparece" em algum lugar); aqui só conta se o nome
 * está dentro do bloco estrutural certo (qualificação E assinatura, as
 * duas, não uma OU outra).
 *
 * Também serve de base para a futura Fase 4.5 (Assistente Conversacional):
 * quando `minutaAnterior` é informada, devolve também quais cláusulas
 * `<h3>` mudaram entre as duas versões — dado que a comparação por seção já
 * precisa calcular internamente, exposto de graça para uma futura tela de
 * diff não precisar recalcular nada.
 */
import type { ResumoNegociacao } from './entenderNegociacao'

export interface ResultadoValidacaoMinuta {
  valido: boolean
  problemas: string[]
  /** Só preenchido quando `minutaAnterior` foi passada para
   * validarMinutaGerada — títulos das cláusulas cujo conteúdo mudou (inclui
   * cláusulas novas e removidas). Metadado informativo, nunca afeta
   * `valido`/`problemas` — comparar com a versão anterior não é uma regra
   * de validação, é contexto para revisão humana. */
  clausulasAlteradas?: string[]
}

interface SecaoClausula { titulo: string; inicio: number; fim: number }

function extrairSecoesClausula(html: string): SecaoClausula[] {
  const secoes: SecaoClausula[] = []
  const regexTitulo = /<h3>([\s\S]*?)<\/h3>/g
  const matches = Array.from(html.matchAll(regexTitulo))
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]
    const inicio = m.index ?? 0
    const fim = i + 1 < matches.length ? (matches[i + 1].index ?? html.length) : html.length
    secoes.push({ titulo: normalizar(m[1]), inicio, fim })
  }
  return secoes
}

function normalizar(s: string): string {
  return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function delimitarSecoes(html: string) {
  const secoesClausula = extrairSecoesClausula(html)
  const matchesH3 = Array.from(html.matchAll(/<h3>[\s\S]*?<\/h3>/g))
  const primeiroH3 = matchesH3.length > 0 ? (matchesH3[0].index ?? 0) : -1
  const qualificacao = primeiroH3 === -1 ? html : html.slice(0, primeiroH3)

  // "Fim do último <h3>...</h3>" é logo após a TAG de título da última
  // cláusula, não o fim do conteúdo dela — não há marcador estrutural que
  // diga onde o corpo da última cláusula termina e o fechamento/assinaturas
  // começam, então tratamos tudo dali até "Testemunhas" (ou fim do
  // documento) como o bloco de assinaturas. Isso inclui de sobra o próprio
  // parágrafo da última cláusula, o que é seguro: só torna a checagem de
  // presença de nome menos estrita nessa borda, nunca mais estrita (nunca
  // perde um nome que devia contar como "está na assinatura").
  const ultimoH3 = matchesH3.length > 0 ? matchesH3[matchesH3.length - 1] : null
  const fimUltimoTituloH3 = ultimoH3 ? (ultimoH3.index ?? 0) + ultimoH3[0].length : 0

  const idxTestemunhas = html.search(/testemunhas/i)
  const fimAssinaturas = idxTestemunhas === -1 ? html.length : idxTestemunhas
  const assinaturas = html.slice(fimUltimoTituloH3, Math.max(fimUltimoTituloH3, fimAssinaturas))
  const testemunhas = idxTestemunhas === -1 ? '' : html.slice(idxTestemunhas)

  const secaoCorretagem = secoesClausula.find((s) => /corretagem/i.test(s.titulo))
  const corretagem = secaoCorretagem ? html.slice(secaoCorretagem.inicio, secaoCorretagem.fim) : ''

  return {
    secoesClausula,
    qualificacao: normalizar(qualificacao),
    assinaturas: normalizar(assinaturas),
    testemunhas: normalizar(testemunhas),
    corretagem: normalizar(corretagem),
    documentoInteiro: normalizar(html),
  }
}

function contemTexto(texto: string, alvo: string | null | undefined): boolean {
  if (!alvo?.trim()) return false
  return texto.toLowerCase().includes(alvo.trim().toLowerCase())
}

/** Compara dígitos, não o valor formatado — tolera variação de formatação
 * da IA (espaço, símbolo, casas decimais) sem deixar de pegar um valor
 * realmente ausente. */
function contemValor(documentoInteiro: string, valor: number): boolean {
  const digitosAlvo = Math.round(valor).toString()
  if (digitosAlvo === '0') return true
  const digitosDocumento = documentoInteiro.replace(/\D/g, '')
  return digitosDocumento.includes(digitosAlvo)
}

/** Cláusulas cujo conteúdo (normalizado) mudou entre duas versões — usada
 * tanto pelo retry interno (comparação minuta-corrigida vs anterior, hoje
 * só para diagnóstico em log) quanto, futuramente, pela tela de diff do
 * Assistente Conversacional (Fase 4.5). */
function calcularClausulasAlteradas(htmlAnterior: string, htmlNovo: string): string[] {
  const secoesAntes = new Map(extrairSecoesClausula(htmlAnterior).map((s) => [s.titulo, s]))
  const secoesDepois = new Map(extrairSecoesClausula(htmlNovo).map((s) => [s.titulo, s]))
  const alteradas = new Set<string>()

  for (const [titulo, secao] of Array.from(secoesDepois)) {
    const secaoAntes = secoesAntes.get(titulo)
    if (!secaoAntes) { alteradas.add(titulo); continue }
    const conteudoAntes = normalizar(htmlAnterior.slice(secaoAntes.inicio, secaoAntes.fim))
    const conteudoDepois = normalizar(htmlNovo.slice(secao.inicio, secao.fim))
    if (conteudoAntes !== conteudoDepois) alteradas.add(titulo)
  }
  for (const titulo of Array.from(secoesAntes.keys())) {
    if (!secoesDepois.has(titulo)) alteradas.add(titulo)
  }
  return Array.from(alteradas)
}

export function validarMinutaGerada(
  html: string,
  resumo: ResumoNegociacao,
  minutaAnterior?: string,
): ResultadoValidacaoMinuta {
  const problemas: string[] = []
  const { qualificacao, assinaturas, testemunhas, corretagem, documentoInteiro } = delimitarSecoes(html)

  for (const c of resumo.compradores) {
    if (!c.nome?.trim()) continue
    if (!contemTexto(qualificacao, c.nome)) problemas.push(`Comprador "${c.nome}" não aparece na qualificação das partes.`)
    if (!contemTexto(assinaturas, c.nome)) problemas.push(`Comprador "${c.nome}" não tem bloco de assinatura.`)
  }
  for (const v of resumo.vendedores) {
    if (!v.nome?.trim()) continue
    if (!contemTexto(qualificacao, v.nome)) problemas.push(`Vendedor "${v.nome}" não aparece na qualificação das partes.`)
    if (!contemTexto(assinaturas, v.nome)) problemas.push(`Vendedor "${v.nome}" não tem bloco de assinatura.`)
  }
  for (const t of resumo.testemunhas) {
    if (!t.nome?.trim()) continue
    if (!contemTexto(testemunhas, t.nome)) problemas.push(`Testemunha "${t.nome}" não aparece no bloco de testemunhas.`)
  }
  if (resumo.corretor?.nome?.trim() && !contemTexto(corretagem, resumo.corretor.nome)) {
    problemas.push(`Corretor "${resumo.corretor.nome}" não aparece na cláusula de corretagem.`)
  }

  if (resumo.valor != null && !contemValor(documentoInteiro, resumo.valor)) {
    problemas.push('Valor total da negociação não aparece no documento.')
  }
  if (resumo.condicao_posse?.trim() && !contemTexto(documentoInteiro, resumo.condicao_posse)) {
    problemas.push('Condição de posse informada não aparece no documento.')
  }
  if (resumo.comissao?.valor != null && !contemValor(documentoInteiro, resumo.comissao.valor)) {
    problemas.push('Valor da comissão de corretagem não aparece no documento.')
  }
  for (const cert of resumo.certidoes) {
    if (cert.numero?.trim() && !contemTexto(documentoInteiro, cert.numero)) {
      problemas.push(`Certidão nº ${cert.numero} não aparece no documento.`)
    }
  }

  // Integridade: marcador de cláusula protegida sobrando (não foi
  // substituído — ver injetarClausulasProtegidas) ou placeholder cru que a
  // IA nunca deveria usar (SYSTEM_PROMPT de redigirContrato.ts instrui a
  // nunca escrever isso; se aparece, é sinal de que a IA não conseguiu
  // resolver um dado que o resumo tinha).
  if (/\{\{PROTEGIDA:\w+\}\}/.test(html)) {
    problemas.push('Marcador de cláusula protegida não foi substituído (sobrou {{PROTEGIDA:...}} no documento).')
  }
  if (/\[A PREENCHER\]/i.test(documentoInteiro)) {
    problemas.push('Minuta contém "[A PREENCHER]" — a redação por IA não deve usar esse placeholder.')
  }

  const resultado: ResultadoValidacaoMinuta = { valido: problemas.length === 0, problemas }
  if (minutaAnterior !== undefined) {
    resultado.clausulasAlteradas = calcularClausulasAlteradas(minutaAnterior, html)
  }
  return resultado
}
