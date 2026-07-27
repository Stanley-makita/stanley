/**
 * Etapa "Compreensão da Negociação" do Construtor de Contratos.
 *
 * Consolida tipo de contrato + descrição livre + dados já extraídos por OCR
 * dos documentos anexados (ver src/lib/documentos/ocr.ts) num resumo
 * estruturado, junto com um checklist ("Painel de Inteligência") do que foi
 * entendido vs o que falta. NUNCA decide sozinho — o usuário sempre revisa e
 * confirma este resumo antes de qualquer minuta ser construída (mesma
 * filosofia de useOcrSugestoes: IA propõe, operador confirma).
 */

import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export interface DocumentoOcrResumo {
  nome_arquivo: string
  tipo_documento: string | null
  dados: Record<string, unknown> | null
}

export interface PessoaResumo {
  nome: string | null
  cpf: string | null
  rg: string | null
  estado_civil: string | null
  endereco: string | null
}

export interface ImovelResumo {
  endereco: string | null
  matricula: string | null
  cidade: string | null
  uf: string | null
}

export interface ChecklistItem {
  texto: string
  status: 'ok' | 'atencao'
}

export interface ResumoNegociacao {
  compradores: PessoaResumo[]
  vendedores: PessoaResumo[]
  imovel: ImovelResumo
  valor: number | null
  entrada: number | null
  saldo: string | null
  prazo_posse_dias: number | null
  multa_percentual: number | null
  cidade: string | null
  observacoes_adicionais: string | null
  painel_inteligencia: ChecklistItem[]
}

const SYSTEM_PROMPT = `Você é um assistente jurídico que ajuda a compreender negociações imobiliárias antes de um contrato ser redigido.

Você recebe: o tipo de contrato, o valor_servico_fontinhas, uma descrição livre da negociação escrita por um atendente, e os dados já extraídos (via OCR) dos documentos anexados (compradores, vendedores, imóvel).

IMPORTANTE sobre valor_servico_fontinhas: é o valor cobrado pela Fontinhas (a assessoria) pelo SERVIÇO de intermediação/assessoria deste contrato — NUNCA é o valor do imóvel ou da negociação entre comprador e vendedor. Ignore-o completamente ao montar o campo "valor" do resumo (que é o valor da negociação/imóvel) e NUNCA o compare com valores descritos no texto livre ou extraídos dos documentos — não são a mesma grandeza e não devem gerar item de "atencao" no painel_inteligencia.

Sua única tarefa é CONSOLIDAR essas informações num resumo estruturado. Você NÃO inventa dados que não foram informados nem extraídos — se um campo não aparece em nenhuma fonte, retorne null. Você NÃO redige cláusulas nem texto de contrato aqui.

Além do resumo, monte um "painel_inteligencia": uma lista curta de itens de checklist, cada um com "texto" e "status" ("ok" se o dado foi encontrado/está completo, "atencao" se falta algo importante — ex: falta documento de uma parte, CPF ausente, imóvel sem matrícula). Seja específico no texto (ex: "Falta documento do vendedor", não "Falta informação").

Marque "atencao" também quando houver DIVERGÊNCIA entre o que os documentos (OCR) mostram e o que a descrição livre diz — ex: valor do documento diferente do valor descrito, nome diferente, endereço diferente — e quando um dado parecer de BAIXA CONFIANÇA (extraído de forma ambígua ou incompleta do OCR). Nesses casos, descreva a divergência/incerteza específica no texto do item (ex: "Valor no documento (R$ 430.000) diverge do valor descrito (R$ 450.000)").

Retorne SOMENTE o JSON abaixo, sem markdown, sem explicação:

{
  "compradores": [{"nome": "...", "cpf": "...", "rg": "...", "estado_civil": "...", "endereco": "..."}],
  "vendedores": [{"nome": "...", "cpf": "...", "rg": "...", "estado_civil": "...", "endereco": "..."}],
  "imovel": {"endereco": "...", "matricula": "...", "cidade": "...", "uf": "..."},
  "valor": numero_ou_null,
  "entrada": numero_ou_null,
  "saldo": "financiado|a_vista|texto_livre_ou_null",
  "prazo_posse_dias": numero_ou_null,
  "multa_percentual": numero_ou_null,
  "cidade": "..._ou_null",
  "observacoes_adicionais": "..._ou_null",
  "painel_inteligencia": [{"texto": "...", "status": "ok|atencao"}]
}

Campos de pessoa (compradores/vendedores) sem nenhum dado disponível: use null nos subcampos, mas ainda assim gere um item de painel_inteligencia com status "atencao" avisando que falta o documento dessa parte, se a descrição mencionar a parte mas não houver documento correspondente.`

export async function entenderNegociacao(input: {
  tipoContrato: string | null
  valorContrato: number | null
  descricao: string
  documentos: DocumentoOcrResumo[]
}): Promise<ResumoNegociacao> {
  const contexto = JSON.stringify({
    tipo_contrato: input.tipoContrato,
    valor_servico_fontinhas: input.valorContrato,
    descricao: input.descricao,
    documentos_ocr: input.documentos,
  }, null, 2)

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 8000,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: contexto }],
  })

  // Sonnet 5 roda thinking adaptativo por padrão — o(s) primeiro(s) bloco(s)
  // costumam ser 'thinking', não 'text' (mesmo motivo do .find() em ocr.ts).
  // A resposta em texto pode vir dividida em mais de um bloco 'text' — junta
  // todos, em vez de pegar só o primeiro, para não cortar o JSON no meio.
  const blocosTexto = response.content.filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
  if (blocosTexto.length === 0) throw new Error('Resposta inesperada da IA.')
  if (response.stop_reason === 'max_tokens') {
    console.error('[entenderNegociacao] resposta cortada por max_tokens')
    throw new Error('A IA não conseguiu concluir a análise (resposta muito longa). Tente novamente.')
  }

  const bruto = blocosTexto.map((b) => b.text).join('').trim()
  const semFences = bruto
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')

  try {
    return JSON.parse(semFences) as ResumoNegociacao
  } catch {
    // Fallback: às vezes a IA acrescenta um comentário antes/depois do JSON —
    // tenta isolar só o trecho entre a primeira { e a última }.
    const inicio = semFences.indexOf('{')
    const fim = semFences.lastIndexOf('}')
    if (inicio === -1 || fim === -1) {
      console.error('[entenderNegociacao] resposta sem JSON reconhecível:', bruto)
      throw new Error('A IA não devolveu um resumo em formato reconhecível.')
    }
    try {
      return JSON.parse(semFences.slice(inicio, fim + 1)) as ResumoNegociacao
    } catch {
      console.error('[entenderNegociacao] falha ao parsear JSON da IA:', bruto)
      throw new Error('A IA não devolveu um resumo em formato reconhecível.')
    }
  }
}
