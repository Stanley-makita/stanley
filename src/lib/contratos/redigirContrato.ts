/**
 * Motor de redação/revisão de contrato por IA (Fase 4 do diagnóstico do
 * Construtor de Contratos — ver artifact "Diagnóstico V2"). Substitui, só
 * para compra_venda, a montagem determinística por regex de
 * `substituirVariaveis()` por uma etapa real de redação: a IA recebe o
 * resumo confirmado + plano + instruções e escreve o instrumento completo,
 * com liberdade de estrutura para N partes, condições compostas e cláusulas
 * adicionais — sem o teto de "quantas variáveis alguém previu no template".
 *
 * ARQUITETURA (decisão da rodada "Opção B" — preparar o motor para o futuro
 * Assistente Conversacional sem implementá-lo ainda): esta função não
 * modela "gerar uma minuta", modela uma RODADA de redação/revisão. Toda
 * rodada recebe resumo/plano/instruções (o contexto fixo da negociação, que
 * não muda entre rodadas) e, opcionalmente, uma `minutaAnterior` + `origem`
 * explicando por que esta rodada existe:
 *
 *   - Sem minutaAnterior/origem → geração inicial (Fase 4 v3, único caso
 *     hoje produzido por qualquer código do sistema).
 *   - origem.tipo === 'validacao_automatica' → rodada de autocorreção
 *     disparada por `validarMinutaGerada` reprovando a minuta anterior (o
 *     único outro caso hoje produzido — ver gerarMinutaPorIA.ts).
 *   - origem.tipo === 'pedido_usuario' → rodada disparada por um pedido em
 *     linguagem natural do operador ("mude só a cláusula de posse").
 *     RESERVADO para a Fase 4.5 (Assistente Conversacional) — o tipo existe
 *     e o prompt sabe montar essa seção, mas NENHUM caller do sistema
 *     produz esse valor hoje (nem a rota HTTP aceita esse campo do corpo da
 *     requisição). Não expor isso é deliberado: a Fase 4.5 ainda não tem
 *     UI, histórico de conversa nem controles de revisão — só o motor.
 *
 * Isso significa que "gerar" e "corrigir/revisar" sempre foram, desde o
 * início, o mesmo motor com uma rodada diferente — não há refatoração
 * pendente para o dia em que o pedido do usuário vier a existir de verdade,
 * só passar a construir esse valor em algum caller novo.
 */

import Anthropic from '@anthropic-ai/sdk'
import type { ResumoNegociacao } from './entenderNegociacao'
import type { PlanoContrato } from './planejarContrato'
import { CHAVES_CLAUSULAS_PROTEGIDAS } from './clausulasProtegidas'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export type OrigemRodadaRedacao =
  | { tipo: 'validacao_automatica'; problemas: string[] }
  /** Reservado para a Fase 4.5 (Assistente Conversacional) — ver comentário
   * de topo do arquivo. Nenhum código do sistema produz este valor hoje. */
  | { tipo: 'pedido_usuario'; texto: string }

export interface RedigirContratoInput {
  resumo: ResumoNegociacao
  plano: PlanoContrato
  instrucoesLivres: string | null
  /** Minuta (já sanitizada) de uma rodada anterior desta mesma negociação —
   * presente em toda rodada de correção/revisão, ausente na geração
   * inicial. Quando presente, `origem` é obrigatório (explica o porquê). */
  minutaAnterior?: string
  origem?: OrigemRodadaRedacao
}

const SYSTEM_PROMPT = `Você é um assistente jurídico que redige o instrumento particular de Compromisso de Venda e Compra de imóvel da Fontinhas Assessoria a partir de um resumo de negociação já revisado e confirmado por um operador humano.

ESTRUTURA FIXA — preserve esta ordem geral do documento; só o conteúdo dentro de cada parte é flexível:
1. Parágrafo de abertura (local, data, referência aos artigos 481 a 504 do Código Civil).
2. Qualificação civil de cada vendedor e de cada comprador (TODAS as partes, nunca só a primeira de cada papel).
3. Frase de transição "Têm entre si justo e acertado o presente compromisso de venda e compra, mediante as cláusulas e condições seguintes:".
4. Cláusulas, cada uma com título em <h3> e corpo em um ou mais <p>.
5. Fechamento, local e data, blocos de assinatura (todos os vendedores, todos os compradores) e bloco de testemunhas.

CLÁUSULAS PROTEGIDAS — nos pontos em que uma cláusula protegida entra, escreva SOMENTE o marcador cru, sozinho numa linha, sem envolver em <h3>/<p> e sem adicionar texto antes/depois dela — o sistema substitui o marcador pelo bloco inteiro (título e corpo) depois da sua resposta; você não escreve o título nem o corpo dessas cláusulas, e não deve tentar. Marcadores disponíveis, cada um usado no máximo uma vez: ${CHAVES_CLAUSULAS_PROTEGIDAS.map((c) => `{{PROTEGIDA:${c}}}`).join(', ')}.

REGRAS DE CONTEÚDO:
- As instruções originais da negociação são fonte de condições específicas e não podem ser ignoradas só porque a informação não tem campo correspondente no resumo estruturado — redija cláusula ou parágrafo próprio para condições que os campos estruturados não cobrem.
- As cláusulas do plano fornecido são o padrão de partida do modelo Fontinhas, não um teto — crie cláusulas ou parágrafos adicionais sempre que as condições específicas desta negociação exigirem (múltiplas partes, condições compostas de posse, corretagem, certidões, testemunhas, parcelas adicionais de pagamento etc.).
- Cada comprador e cada vendedor do resumo precisa aparecer TANTO na qualificação civil quanto no bloco de assinatura correspondente — nunca só em um dos dois, nunca só mencionado em prosa no meio do texto.
- Testemunhas do resumo (quando houver) precisam aparecer no bloco de testemunhas, com os dados disponíveis.
- Corretor do resumo (quando houver) precisa aparecer na cláusula de corretagem.
- Nunca escreva "[A PREENCHER]" ou equivalente por conta própria — se um dado necessário não está no resumo nem nas instruções, redija a cláusula de forma genérica que não dependa dele, ou omita a frase que o exigiria.

FORMATO DE SAÍDA:
- Retorne SOMENTE o HTML do corpo do contrato, sem markdown, sem \`\`\`, sem comentário antes ou depois.
- Use apenas as tags <h3>, <p>, <strong>, <em>, <u>, <br/> — nenhuma outra tag, nenhum atributo (sem style, class, id ou qualquer outro).`

function montarSecaoOrigem(minutaAnterior: string, origem: OrigemRodadaRedacao): string {
  if (origem.tipo === 'validacao_automatica') {
    return `CORREÇÃO NECESSÁRIA — a minuta abaixo foi gerada por você mas reprovou numa validação automática (dados obrigatórios do resumo não encontrados nas seções corretas do documento). Corrija APENAS os problemas listados, mantendo o restante do documento intacto sempre que possível:

Problemas encontrados:
${origem.problemas.map((p) => `- ${p}`).join('\n')}

Minuta anterior:
${minutaAnterior}`
  }
  // origem.tipo === 'pedido_usuario' — reservado para a Fase 4.5, ver
  // comentário de topo do arquivo; nenhum caller atinge este ramo hoje.
  return `PEDIDO DE REVISÃO DO OPERADOR — a minuta abaixo é a versão atual, já revisada e em uso. Aplique SOMENTE a alteração pedida, preservando o restante do documento (incluindo texto, estrutura e cláusulas não mencionadas no pedido) o mais próximo possível do original:

Pedido do operador:
${origem.texto}

Minuta atual:
${minutaAnterior}`
}

export async function redigirContrato(input: RedigirContratoInput): Promise<string> {
  const secoes = [
    `DADOS DA NEGOCIAÇÃO (resumo já confirmado pelo operador):\n${JSON.stringify(input.resumo, null, 2)}`,
    `INSTRUÇÕES ORIGINAIS DA NEGOCIAÇÃO (escritas por um atendente, texto livre):\n${input.instrucoesLivres?.trim() || '(nenhuma instrução adicional registrada)'}`,
    `PLANO DE CLÁUSULAS (ponto de partida, não teto):\n${JSON.stringify(input.plano, null, 2)}`,
  ]
  if (input.minutaAnterior && input.origem) {
    secoes.push(montarSecaoOrigem(input.minutaAnterior, input.origem))
  }
  const contexto = secoes.join('\n\n---\n\n')

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 8000,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: contexto }],
  })

  // Sonnet 5 roda thinking adaptativo por padrão — o(s) primeiro(s) bloco(s)
  // costumam ser 'thinking', não 'text'. A resposta em texto pode vir
  // dividida em mais de um bloco 'text' — junta todos, em vez de pegar só o
  // primeiro, para não cortar o HTML no meio (mesmo padrão de
  // entenderNegociacao.ts/planejarContrato.ts).
  const blocosTexto = response.content.filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
  if (blocosTexto.length === 0) throw new Error('Resposta inesperada da IA ao redigir o contrato.')
  if (response.stop_reason === 'max_tokens') {
    console.error('[redigirContrato] resposta cortada por max_tokens')
    throw new Error('A IA não conseguiu concluir a redação do contrato (resposta muito longa).')
  }

  const bruto = blocosTexto.map((b) => b.text).join('').trim()
  return bruto
    .replace(/^```(?:html)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()
}
