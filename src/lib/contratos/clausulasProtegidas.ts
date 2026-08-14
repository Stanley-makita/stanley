/**
 * Fonte única das cláusulas institucionais protegidas do modelo Compra e
 * Venda (Fase 4) — extraídas de dentro de `templates/compra-venda.ts`
 * (Fase 3), revisadas contra um contrato real da Fontinhas ("Contrato
 * Carolina e Bruna — Wagner"). Mudar o texto abaixo é uma decisão jurídica,
 * não de redação — qualquer alteração deveria ser conferida contra um
 * contrato real aprovado:
 *   - CLÁUSULA QUARTA (sanção penal): base da multa é o valor JÁ PAGO pelos
 *     compradores até a rescisão, não o valor total da negociação.
 *   - CLÁUSULA QUINTA (escritura): outorga condicionada também ao pedido da
 *     instituição financeira, não só à integralização do preço.
 *   - CLÁUSULA DÉCIMA QUINTA (proteção de dados): cita a legislação completa
 *     (CF, CDC, Código Civil, Marco Civil da Internet + decreto, LGPD).
 *
 * Nem o caminho determinístico (`substituirVariaveis`/`templates/compra-
 * venda.ts`) nem a redação por IA (`redigirContrato.ts`, Fase 4) têm
 * controle sobre o título ou o corpo dessas cláusulas — no caminho
 * determinístico o texto é interpolado diretamente pelo template; no
 * caminho da IA, o modelo só marca o ponto de inserção com
 * `{{PROTEGIDA:CHAVE}}` (ver SYSTEM_PROMPT em redigirContrato.ts) e o código
 * substitui esse marcador pelo bloco inteiro depois da resposta, via
 * `injetarClausulasProtegidas` abaixo.
 */
import type { Processo, ProcessoComprador, ProcessoVendedor } from '@/types/processos'
import {
  substituirVariaveis, type ContratoAssessoriaOpcoes, type ExtrasResumoNegociacao,
} from './substituirVariaveis'

export const CLAUSULAS_PROTEGIDAS_COMPRA_VENDA = {
  SANCAO_PENAL: `<h3>CLÁUSULA QUARTA — DA SANÇÃO PENAL</h3>

<p>A parte que, por inadimplência ou desistência das obrigações avençadas, der causa à rescisão contratual, ficará sujeita à multa contratual equivalente a {{multa_percentual_texto}} sobre o valor pago pelo(a) COMPROMISSÁRIO(A) COMPRADOR(A) até então, sem prejuízo das perdas e danos que a parte infratora causar à parte inocente, bem como custas, emolumentos, comissão de corretagem e demais despesas judiciais e extrajudiciais, além de honorários advocatícios relativos à sucumbência.</p>`,

  ESCRITURA: `<h3>CLÁUSULA QUINTA — DA ESCRITURA</h3>

<p>A escritura pública de venda e compra em favor do(a) COMPROMISSÁRIO(A) COMPRADOR(A) será outorgada após a integralização do preço desta avença ou quando solicitada pela instituição financeira, em virtude do financiamento pleiteado, correndo as despesas de escrituração por conta exclusiva do(a) COMPROMISSÁRIO(A) COMPRADOR(A).</p>`,

  BOA_FE: `<h3>CLÁUSULA DÉCIMA PRIMEIRA — DA BOA-FÉ</h3>

<p>As partes firmam o presente instrumento em condições de igualdade, pautando-se nos princípios da probidade e boa-fé, conforme o artigo 422 do Código Civil Brasileiro, não podendo qualquer delas alegar desconhecimento, vício, dolo, coação ou má-fé, uma vez que o instrumento foi redigido pela empresa contratada FONTINHAS ASSESSORIA, conforme vontade mútua das partes, não tendo a respectiva empresa qualquer responsabilidade quanto à negociação havida entre elas.</p>`,

  LGPD: `<h3>CLÁUSULA DÉCIMA QUINTA — DA PROTEÇÃO DE DADOS</h3>

<p>De acordo com a Lei Geral de Proteção de Dados, as partes declaram concordar que os dados fornecidos serão acessados, utilizados e tratados, eletrônica e manualmente, com a finalidade de atingir o objeto da presente contratação (elaboração deste Instrumento Particular de Compromisso de Venda e Compra). Dessa forma, os dados permanecerão armazenados até o encerramento das obrigações contratuais, devendo ser cumprida toda a legislação aplicável sobre privacidade e proteção de dados, incluindo, mas não se limitando, à Constituição Federal, ao Código de Defesa do Consumidor, ao Código Civil, ao Marco Civil da Internet (Lei Federal nº 12.965/14) e seu decreto regulamentador (Decreto nº 8.771/16), à Lei Geral de Proteção de Dados (Lei nº 13.709/18) e às demais normas setoriais ou regras sobre o assunto.</p>`,

  FORO: `<h3>CLÁUSULA DÉCIMA SEXTA — DO FORO</h3>

<p>As partes elegem o foro da Comarca de {{cidade_comarca}} para dirimir quaisquer dúvidas oriundas do presente instrumento, com exclusão de qualquer outro, por mais privilegiado que seja.</p>`,
} as const

export type ChaveClausulaProtegida = keyof typeof CLAUSULAS_PROTEGIDAS_COMPRA_VENDA

export const CHAVES_CLAUSULAS_PROTEGIDAS = Object.keys(CLAUSULAS_PROTEGIDAS_COMPRA_VENDA) as ChaveClausulaProtegida[]

const REGEX_MARCADOR_PROTEGIDA = /\{\{PROTEGIDA:(\w+)\}\}/g

/**
 * Substitui cada marcador cru `{{PROTEGIDA:CHAVE}}` emitido pela IA
 * (ver redigirContrato.ts) pelo BLOCO INTEIRO da cláusula (título + corpo),
 * já com as variáveis internas dele (ex: {{multa_percentual_texto}})
 * resolvidas via substituirVariaveis — a IA nunca escreve nem controla o
 * texto dessas 5 cláusulas, só decide onde elas entram no documento.
 *
 * Marcador com chave desconhecida ou repetido é preservado como texto cru
 * no HTML — não lança erro aqui; fica para `validarMinutaGerada` sinalizar
 * como problema de integridade (marcador não substituído), que é o sinal
 * correto pra disparar a rodada de correção.
 */
export function injetarClausulasProtegidas(
  html: string,
  processo: Processo,
  compradores: ProcessoComprador[],
  vendedores: ProcessoVendedor[],
  opcoes: ContratoAssessoriaOpcoes | undefined,
  extras: ExtrasResumoNegociacao | undefined,
): string {
  const usadas = new Set<string>()
  return html.replace(REGEX_MARCADOR_PROTEGIDA, (marcadorCompleto, chave: string) => {
    if (usadas.has(chave) || !(chave in CLAUSULAS_PROTEGIDAS_COMPRA_VENDA)) return marcadorCompleto
    usadas.add(chave)
    const bloco = CLAUSULAS_PROTEGIDAS_COMPRA_VENDA[chave as ChaveClausulaProtegida]
    return substituirVariaveis(bloco, processo, compradores, vendedores, opcoes, extras)
  })
}
