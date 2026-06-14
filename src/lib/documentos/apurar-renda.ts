/**
 * Análise de extratos bancários — Pipeline 3 etapas
 *
 * Etapa 1: Extração de lançamentos
 *   Path A (pdf-parse): texto local → Haiku normaliza em pipe-delimited (sem enviar PDF)
 *   Path B (vision):    PDF/imagem → Haiku Vision (fallback para escaneados)
 * Etapa 2: Processamento por código — agrupamento, padrões, cálculos
 * Etapa 3: Haiku interpreta resumo → JSON pequeno com renda e alertas
 */

import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'

// pdf-parse é um módulo CJS sem default export no ESM — usar require
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse') as (buffer: Buffer, options?: object) => Promise<{ text: string; numpages: number }>

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
const TIPOS_IMAGEM: ImageMediaType[] = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

// Mínimo de caracteres para considerar pdf-parse suficiente
const MIN_CHARS_PDF_PARSE = 200

// ============================================================
// Interfaces públicas (backward-compat + novos campos)
// ============================================================

export interface LancamentoExtrato {
  data: string
  descricao: string
  tipo: 'credito' | 'debito'
  valor: number
  categoria: string | null
}

export interface IdentificacaoExtrato {
  tipo: 'possivel_salario' | 'pro_labore' | 'movimentacao_propria' | 'transferencia_frequente' | 'receita_empresa'
  descricao: string
  valor: number
}

export interface AlertaExtrato {
  tipo: 'movimentacao_atipica' | 'extrato_incompleto' | 'alta_variacao' | 'credito_extraordinario' | 'baixa_confianca' | 'incompativel_renda_declarada'
  descricao: string
}

export interface ResumoMes {
  mes: string
  mes_label: string
  total_entradas: number
  total_saidas: number
  resultado: number
}

export interface DocumentoAnalisado {
  nome: string
  banco: string | null
  periodo: string | null
}

export interface ResultadoApuracao {
  documentos_analisados: DocumentoAnalisado[]
  periodo_inicio: string | null
  periodo_fim: string | null
  meses: ResumoMes[]
  media_mensal_entradas: number
  media_mensal_saidas: number
  media_liquida: number
  renda_apurada: number
  renda_estimada: number       // calculado por código (etapa 2)
  renda_considerada: number    // decisão da IA (etapa 3)
  identificacoes: IdentificacaoExtrato[]
  alertas: AlertaExtrato[]
  lancamentos: LancamentoExtrato[]  // evidencias_relevantes da IA (≤10)
  observacoes: string | null        // metodologia da IA
  confianca: 'alta' | 'media' | 'baixa'
}

export interface DocumentoParaAnalise {
  id: string
  nome_original: string
  storage_path: string
  storage_bucket?: string | null
  mime_type?: string | null
}

// ============================================================
// Prompts
// ============================================================

const PROMPT_LANCAMENTOS = `Você recebe texto de extrato bancário brasileiro.
Para CADA lançamento, escreva UMA linha no formato exato:
YYYY-MM-DD|DESCRIÇÃO|VALOR|C_ou_D

Regras:
- DATA: normalizar para YYYY-MM-DD (ex: "05/10/2025" → "2025-10-05")
- DESCRIÇÃO: texto original do extrato, máximo 60 caracteres
- VALOR: número positivo, separador decimal ponto (ex: 1234.56)
- TIPO: C = crédito/entrada, D = débito/saída
- Ignorar linhas de saldo inicial, saldo final e saldo atual
- Ignorar cabeçalhos, títulos e rodapés
- Sem cabeçalho na resposta, sem explicação — APENAS as linhas de lançamento`

const PROMPT_INTERPRETACAO = `Você é analista de crédito imobiliário. Com base no resumo financeiro, retorne SOMENTE JSON válido, sem markdown:
{
  "renda_considerada": <número>,
  "metodologia": "<1-2 frases explicando a decisão>",
  "alertas": [{"tipo": "movimentacao_atipica|extrato_incompleto|alta_variacao|credito_extraordinario|baixa_confianca|incompativel_renda_declarada", "descricao": "..."}],
  "confianca": "alta|media|baixa",
  "evidencias_relevantes": [
    {"data": "", "descricao": "...", "tipo": "credito|debito", "valor": <número>, "categoria": null}
  ]
}
Máximo 10 evidencias_relevantes. Nunca inclua transações cotidianas (alimentação, streaming, transporte, etc).`

// ============================================================
// Etapa 1: Extração de lançamentos
// ============================================================

interface ExtratorResult {
  textoTransacoes: string
  caminho: 'pdf_parse' | 'vision_fallback'
  nomesDocumentos: string[]
  houveFallback: boolean
}

async function extrairLancamentos(
  docs: Array<{ label: string; buffer: Buffer; mimeType: string }>,
): Promise<ExtratorResult> {
  const todasLinhas: string[] = []
  const nomes: string[] = []
  let algumFallback = false

  for (const doc of docs) {
    nomes.push(doc.label)

    if (doc.mimeType === 'application/pdf') {
      let localText: string | null = null
      try {
        const parsed = await pdfParse(doc.buffer)
        const texto = (parsed.text ?? '').trim()
        if (texto.length >= MIN_CHARS_PDF_PARSE) {
          localText = texto
          console.log(`[apurar-renda] "${doc.label}": pdf-parse ok (${texto.length} chars)`)
        } else {
          console.log(`[apurar-renda] "${doc.label}": pdf-parse insuficiente (${texto.length} chars) → vision fallback`)
        }
      } catch (err) {
        console.warn(`[apurar-renda] "${doc.label}": pdf-parse erro → vision fallback:`, String(err).slice(0, 100))
      }

      if (localText) {
        const linhas = await normalizarViaHaikuTexto(localText, doc.label)
        todasLinhas.push(...linhas)
      } else {
        algumFallback = true
        const linhas = await normalizarViaHaikuVision(doc.buffer, 'application/pdf', doc.label)
        todasLinhas.push(...linhas)
      }
    } else if (TIPOS_IMAGEM.includes(doc.mimeType as ImageMediaType)) {
      algumFallback = true
      console.log(`[apurar-renda] "${doc.label}": imagem → vision`)
      const linhas = await normalizarViaHaikuVision(doc.buffer, doc.mimeType, doc.label)
      todasLinhas.push(...linhas)
    } else {
      console.warn(`[apurar-renda] "${doc.label}": tipo não suportado (${doc.mimeType}), ignorado`)
    }
  }

  return {
    textoTransacoes: todasLinhas.join('\n'),
    caminho: algumFallback ? 'vision_fallback' : 'pdf_parse',
    nomesDocumentos: nomes,
    houveFallback: algumFallback,
  }
}

async function normalizarViaHaikuTexto(rawText: string, label: string): Promise<string[]> {
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4096,
    system: PROMPT_LANCAMENTOS,
    messages: [{
      role: 'user',
      content: `=== Extrato: ${label} ===\n\n${rawText}\n\nConverta os lançamentos acima para o formato solicitado.`,
    }],
  })
  const texto = response.content[0]?.type === 'text' ? response.content[0].text : ''
  return texto.trim().split('\n').filter(l => l.includes('|'))
}

async function normalizarViaHaikuVision(buffer: Buffer, mimeType: string, label: string): Promise<string[]> {
  const base64 = buffer.toString('base64')

  const docBlock: Anthropic.Messages.ContentBlockParam = mimeType === 'application/pdf'
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } } as unknown as Anthropic.Messages.ContentBlockParam
    : { type: 'image', source: { type: 'base64', media_type: mimeType as ImageMediaType, data: base64 } }

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4096,
    system: PROMPT_LANCAMENTOS,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: `=== Extrato: ${label} ===` },
        docBlock,
        { type: 'text', text: 'Converta todos os lançamentos para o formato solicitado.' },
      ],
    }],
  })
  const texto = response.content[0]?.type === 'text' ? response.content[0].text : ''
  return texto.trim().split('\n').filter(l => l.includes('|'))
}

// ============================================================
// Etapa 2: Processamento por código
// ============================================================

interface LancamentoBruto {
  data: string
  descricao: string
  valor: number
  tipo: 'C' | 'D'
}

interface RecorrenciaDetectada {
  descricaoExemplo: string
  valor: number
  meses: string[]
  tipoIdentificacao: IdentificacaoExtrato['tipo']
}

interface ProcessamentoLocal {
  meses: ResumoMes[]
  media_entradas: number
  media_saidas: number
  media_liquida: number
  renda_estimada: number
  recorrencias: RecorrenciaDetectada[]
  maiores_creditos: LancamentoBruto[]
  total_lancamentos: number
  periodo_inicio: string | null
  periodo_fim: string | null
}

const MESES_PT = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

function formatMesLabel(mes: string): string {
  const [ano, m] = mes.split('-')
  return `${MESES_PT[parseInt(m) - 1]} ${ano}`
}

function normalizarDescricao(desc: string): string {
  return desc.toLowerCase()
    .replace(/\d+/g, '')
    .replace(/[^\wáéíóúãõâêô\s]/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40)
}

function r2(n: number): number {
  return Math.round(n * 100) / 100
}

function processarLancamentos(texto: string): ProcessamentoLocal {
  const lancamentos: LancamentoBruto[] = []

  for (const linha of texto.trim().split('\n')) {
    const partes = linha.split('|')
    if (partes.length < 4) continue
    const [data, descricao, valorStr, tipoRaw] = partes
    const valor = parseFloat((valorStr ?? '').replace(',', '.'))
    const tipo = (tipoRaw ?? '').trim().toUpperCase() as 'C' | 'D'
    if (!data?.match(/^\d{4}-\d{2}-\d{2}$/) || isNaN(valor) || valor <= 0 || (tipo !== 'C' && tipo !== 'D')) continue
    lancamentos.push({ data: data.trim(), descricao: (descricao ?? '').trim(), valor, tipo })
  }

  // Agrupar por mês
  const mesesMap = new Map<string, { entradas: number; saidas: number }>()
  for (const l of lancamentos) {
    const mes = l.data.slice(0, 7)
    if (!mesesMap.has(mes)) mesesMap.set(mes, { entradas: 0, saidas: 0 })
    const m = mesesMap.get(mes)!
    if (l.tipo === 'C') m.entradas += l.valor
    else m.saidas += l.valor
  }

  const meses: ResumoMes[] = Array.from(mesesMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([mes, m]) => ({
      mes,
      mes_label: formatMesLabel(mes),
      total_entradas: r2(m.entradas),
      total_saidas: r2(m.saidas),
      resultado: r2(m.entradas - m.saidas),
    }))

  const nMeses = meses.length || 1
  const media_entradas = meses.reduce((s, m) => s + m.total_entradas, 0) / nMeses
  const media_saidas = meses.reduce((s, m) => s + m.total_saidas, 0) / nMeses

  // Detectar recorrências: créditos com descrição similar em ≥ 2 meses e valor próximo (±20%)
  const gruposCredito = new Map<string, Array<{ mes: string; valor: number; descricaoExemplo: string }>>()
  for (const l of lancamentos) {
    if (l.tipo !== 'C') continue
    const norm = normalizarDescricao(l.descricao)
    if (!norm || norm.length < 3) continue
    if (!gruposCredito.has(norm)) gruposCredito.set(norm, [])
    gruposCredito.get(norm)!.push({ mes: l.data.slice(0, 7), valor: l.valor, descricaoExemplo: l.descricao })
  }

  const recorrencias: RecorrenciaDetectada[] = []
  for (const ocorrencias of Array.from(gruposCredito.values())) {
    const mesesUnicos = Array.from(new Set<string>(ocorrencias.map(o => o.mes)))
    if (mesesUnicos.length < 2) continue
    const valorMedio = ocorrencias.reduce((s: number, o: { valor: number }) => s + o.valor, 0) / ocorrencias.length
    const todosSimilares = ocorrencias.every((o: { valor: number }) => Math.abs(o.valor - valorMedio) / valorMedio <= 0.2)
    if (!todosSimilares) continue
    recorrencias.push({
      descricaoExemplo: ocorrencias[0].descricaoExemplo,
      valor: r2(valorMedio),
      meses: mesesUnicos.sort(),
      tipoIdentificacao: valorMedio >= 800 ? 'possivel_salario' : 'transferencia_frequente',
    })
  }
  recorrencias.sort((a, b) => b.valor - a.valor)

  // Estimativa de renda: soma dos maiores créditos recorrentes (possível salário), top 3
  const rendaEstimada = recorrencias
    .filter(r => r.tipoIdentificacao === 'possivel_salario')
    .slice(0, 3)
    .reduce((s, r) => s + r.valor, 0) || r2(media_entradas)

  const maiores_creditos = lancamentos
    .filter(l => l.tipo === 'C')
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 10)

  const todasDatas = lancamentos.map(l => l.data).sort()

  return {
    meses,
    media_entradas: r2(media_entradas),
    media_saidas: r2(media_saidas),
    media_liquida: r2(media_entradas - media_saidas),
    renda_estimada: r2(rendaEstimada),
    recorrencias,
    maiores_creditos,
    total_lancamentos: lancamentos.length,
    periodo_inicio: todasDatas[0]?.slice(0, 7) ?? null,
    periodo_fim: todasDatas[todasDatas.length - 1]?.slice(0, 7) ?? null,
  }
}

// ============================================================
// Etapa 3: Interpretação pela IA
// ============================================================

interface InterpretacaoIA {
  renda_considerada: number
  metodologia: string | null
  alertas: AlertaExtrato[]
  confianca: 'alta' | 'media' | 'baixa'
  evidencias_relevantes: LancamentoExtrato[]
}

function montarResumoParaIA(proc: ProcessamentoLocal, nomes: string[]): string {
  const nMeses = proc.meses.length
  const fmt = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2 })

  const linhasMeses = proc.meses
    .map(m => `${m.mes_label}: Entradas R$${fmt(m.total_entradas)} | Saídas R$${fmt(m.total_saidas)} | Saldo R$${fmt(m.resultado)}`)
    .join('\n')

  const linhasRec = proc.recorrencias.slice(0, 5)
    .map(r => `- R$${fmt(r.valor)} em ${r.meses.length}/${nMeses} meses ("${r.descricaoExemplo}") → ${r.tipoIdentificacao}`)
    .join('\n') || '(nenhum padrão recorrente identificado)'

  const linhasMaiores = proc.maiores_creditos.slice(0, 5)
    .map((l, i) => `${i + 1}. R$${fmt(l.valor)} em ${l.data} - ${l.descricao}`)
    .join('\n') || '(nenhum)'

  return `DOCUMENTOS: ${nomes.join(', ')}
PERÍODO: ${proc.periodo_inicio ?? '?'} a ${proc.periodo_fim ?? '?'} (${nMeses} ${nMeses === 1 ? 'mês' : 'meses'} analisados)
LANÇAMENTOS PROCESSADOS: ${proc.total_lancamentos}

RESUMO MENSAL:
${linhasMeses}

MÉDIAS: Entradas R$${fmt(proc.media_entradas)} | Saídas R$${fmt(proc.media_saidas)} | Líquida R$${fmt(proc.media_liquida)}

PADRÕES RECORRENTES DETECTADOS:
${linhasRec}

MAIORES CRÉDITOS INDIVIDUAIS:
${linhasMaiores}

ESTIMATIVA DO SISTEMA: R$${fmt(proc.renda_estimada)}/mês (baseado em créditos recorrentes)`
}

async function interpretarRenda(resumo: string, rendaFallback: number): Promise<InterpretacaoIA> {
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: PROMPT_INTERPRETACAO,
    messages: [{ role: 'user', content: resumo }],
  })

  const texto = response.content[0]?.type === 'text' ? response.content[0].text.trim() : ''
  const textoLimpo = texto
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim()

  try {
    return JSON.parse(textoLimpo) as InterpretacaoIA
  } catch {
    console.error('[apurar-renda] JSON da interpretação inválido. stop_reason:', response.stop_reason, 'preview:', textoLimpo.slice(-200))
    return {
      renda_considerada: rendaFallback,
      metodologia: null,
      alertas: [{ tipo: 'baixa_confianca', descricao: 'Não foi possível gerar interpretação automática. Verifique os extratos manualmente.' }],
      confianca: 'baixa',
      evidencias_relevantes: [],
    }
  }
}

// ============================================================
// Função principal
// ============================================================

export async function analisarExtratosRenda(
  supabase: SupabaseClient,
  documentos: DocumentoParaAnalise[],
): Promise<ResultadoApuracao> {
  const inicio = Date.now()

  if (documentos.length === 0) {
    throw new Error('Nenhum documento fornecido para análise')
  }

  // Download em paralelo
  const downloads = await Promise.all(
    documentos.map(async (doc) => {
      const bucket = doc.storage_bucket ?? 'documentos-clientes'
      const { data: urlData } = await supabase.storage
        .from(bucket)
        .createSignedUrl(doc.storage_path, 120)

      if (!urlData?.signedUrl) {
        console.warn('[apurar-renda] URL não gerada para:', doc.nome_original)
        return null
      }

      const resp = await fetch(urlData.signedUrl, { signal: AbortSignal.timeout(60000) })
      if (!resp.ok) {
        console.warn('[apurar-renda] Download falhou:', doc.nome_original, resp.status)
        return null
      }

      return {
        label: doc.nome_original,
        buffer: Buffer.from(await resp.arrayBuffer()),
        mimeType: doc.mime_type ?? 'application/pdf',
      }
    }),
  )

  const docsValidos = downloads.filter((d): d is NonNullable<typeof downloads[number]> => d !== null)

  if (docsValidos.length === 0) {
    throw new Error('Não foi possível baixar nenhum dos documentos')
  }

  // Etapa 1: Extração
  const { textoTransacoes, caminho, nomesDocumentos, houveFallback } = await extrairLancamentos(docsValidos)

  // Etapa 2: Processamento por código
  const proc = processarLancamentos(textoTransacoes)

  if (proc.total_lancamentos === 0) {
    throw new Error('Nenhum lançamento válido encontrado nos extratos. Verifique se os arquivos são extratos bancários legíveis.')
  }

  // Etapa 3: Interpretação pela IA
  const resumo = montarResumoParaIA(proc, nomesDocumentos)
  const ia = await interpretarRenda(resumo, proc.renda_estimada)

  const elapsed = ((Date.now() - inicio) / 1000).toFixed(1)
  const resultadoParcial = ia.confianca === 'baixa' && ia.metodologia === null
  console.log(
    `[apurar-renda] Concluído em ${elapsed}s | caminho: ${caminho} | docs: ${docsValidos.length}` +
    ` | lançamentos: ${proc.total_lancamentos} | fallback_vision: ${houveFallback} | resultado: ${resultadoParcial ? 'parcial' : 'completo'}`,
  )

  const identificacoes: IdentificacaoExtrato[] = proc.recorrencias.map(r => ({
    tipo: r.tipoIdentificacao,
    descricao: `"${r.descricaoExemplo}" — R$ ${r.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} em ${r.meses.length} meses`,
    valor: r.valor,
  }))

  const rendaFinal = ia.renda_considerada || proc.renda_estimada

  return {
    documentos_analisados: nomesDocumentos.map(nome => ({ nome, banco: null, periodo: null })),
    periodo_inicio: proc.periodo_inicio,
    periodo_fim: proc.periodo_fim,
    meses: proc.meses,
    media_mensal_entradas: proc.media_entradas,
    media_mensal_saidas: proc.media_saidas,
    media_liquida: proc.media_liquida,
    renda_apurada: rendaFinal,
    renda_estimada: proc.renda_estimada,
    renda_considerada: rendaFinal,
    identificacoes,
    alertas: ia.alertas ?? [],
    lancamentos: (ia.evidencias_relevantes ?? []).slice(0, 10),
    observacoes: ia.metodologia ?? null,
    confianca: ia.confianca ?? 'baixa',
  }
}
