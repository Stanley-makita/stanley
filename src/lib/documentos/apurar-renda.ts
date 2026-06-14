/**
 * Análise de extratos bancários — Pipeline 3 etapas com classificação de movimentações
 *
 * Etapa 1: Extração + classificação (pdf-parse local → Haiku texto | Vision fallback)
 *          Haiku classifica cada lançamento em categoria (receita, transferencia_propria, etc.)
 *          e identifica o tipo de conta (PJ / PF)
 * Etapa 2: Processamento por código — agrupa por mês e categoria, calcula receita real
 *          PJ: receita + liberacao_marketplace = receita operacional
 *          PF: somente receita conta; marketplace, repasse sócio e transferências são excluídos
 * Etapa 3: Haiku interpreta resumo categorizado → JSON com renda e alertas
 */

import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
const TIPOS_IMAGEM: ImageMediaType[] = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

const MIN_CHARS_PDF_PARSE = 200

// ============================================================
// Interfaces públicas
// ============================================================

export type CategoriaCredito =
  | 'receita'
  | 'liberacao_marketplace'
  | 'transferencia_propria'
  | 'repasse_empresa_socio'
  | 'aporte'
  | 'rendimento'
  | 'outros_creditos'
  | 'outros_creditos_atencao'

export type CategoriaDebito =
  | 'despesa_operacional'
  | 'despesa_pessoal'
  | 'transferencia_propria'
  | 'impostos'
  | 'outros_debitos'

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
  total_entradas: number       // total bruto de todos os créditos
  total_receita?: number       // receita operacional considerada (exclui transferências, aportes, etc.)
  total_marketplace?: number   // liberacao_marketplace (incluída em receita para PJ)
  total_excluidos?: number     // soma do que foi excluído da renda
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
  renda_estimada: number
  renda_considerada: number
  tipo_conta?: 'PJ' | 'PF' | 'desconhecido'
  identificacoes: IdentificacaoExtrato[]
  alertas: AlertaExtrato[]
  lancamentos: LancamentoExtrato[]
  observacoes: string | null
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
// Validação de datas
// ============================================================

function validarData(data: string): boolean {
  if (!data?.match(/^\d{4}-\d{2}-\d{2}$/)) return false
  const partes = data.split('-')
  const ano = parseInt(partes[0] ?? '0')
  const mes = parseInt(partes[1] ?? '0')
  const dia = parseInt(partes[2] ?? '0')
  return ano >= 2000 && ano <= 2099 && mes >= 1 && mes <= 12 && dia >= 1 && dia <= 31
}

const MESES_PT = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

function formatMesLabel(mes: string): string {
  const parts = mes.split('-')
  const ano = parts[0] ?? ''
  const mIdx = parseInt(parts[1] ?? '0') - 1
  if (isNaN(mIdx) || mIdx < 0 || mIdx > 11) return `${mes}`
  return `${MESES_PT[mIdx]} ${ano}`
}

// ============================================================
// Prompts
// ============================================================

const PROMPT_LANCAMENTOS = `Você recebe texto de extrato bancário brasileiro.

PRIMEIRA LINHA obrigatória — identifique o tipo de conta:
TIPO_CONTA: PJ   (conta de empresa: CNPJ, razão social, ME, LTDA, EPP, EIRELI, S/A)
TIPO_CONTA: PF   (conta de pessoa física: CPF, nome pessoal)
TIPO_CONTA: desconhecido   (se não for possível identificar)

Depois, para CADA lançamento, escreva UMA linha no formato:
YYYY-MM-DD|DESCRIÇÃO|VALOR|C_ou_D|CATEGORIA

CATEGORIAS DE CRÉDITO (C):
- receita: PIX/TED recebido de clientes, pagamentos de serviços, vendas a terceiros
- liberacao_marketplace: Mercado Pago, Stone, Cielo, PagSeguro, Getnet, Adyen, Rede, "liberação", "recebimento adquirente", "liquidação"
- transferencia_propria: entrada de conta do mesmo titular, "TED própria", PIX de si mesmo, transferência entre contas próprias
- repasse_empresa_socio: valor enviado pela empresa para conta PF do sócio/dono (empresa pagando o dono)
- aporte: empréstimo recebido, aporte de capital, MTU, "captação", "mútuo"
- rendimento: CDB, poupança, LCI, LCA, Tesouro, "rendimento automático", juros creditados
- outros_creditos_atencao: entradas não identificadas que merecem atenção (valor alto, origem desconhecida)
- outros_creditos: entradas diversas de baixo valor ou irrelevantes

CATEGORIAS DE DÉBITO (D):
- despesa_operacional: fornecedores, matéria-prima, serviços contratados, aluguel comercial
- despesa_pessoal: alimentação, farmácia, streaming, transporte, lazer, vestuário
- transferencia_propria: TED/PIX para conta do mesmo titular
- impostos: DAS, DARF, INSS, ISS, CSLL, IRPJ, parcelamentos fiscais, "Receita Federal"
- outros_debitos: débitos não classificados

Regras de extração:
- DATA: normalizar para YYYY-MM-DD, mês 01–12, dia 01–31 — se não conseguir, omitir o lançamento
- DESCRIÇÃO: texto original do extrato, máximo 60 caracteres
- VALOR: número positivo, separador decimal ponto (ex: 1234.56)
- Ignorar linhas de saldo inicial, saldo final, saldo atual, cabeçalhos e rodapés
- Sem explicação — APENAS a linha TIPO_CONTA e as linhas de lançamento`

const PROMPT_INTERPRETACAO = `Você é analista de crédito imobiliário. Com base no resumo financeiro categorizado abaixo, retorne SOMENTE JSON válido, sem markdown:
{
  "renda_considerada": <número — use a receita operacional, não o total bruto>,
  "metodologia": "<1-2 frases explicando o critério usado>",
  "alertas": [{"tipo": "movimentacao_atipica|extrato_incompleto|alta_variacao|credito_extraordinario|baixa_confianca|incompativel_renda_declarada", "descricao": "..."}],
  "confianca": "alta|media|baixa",
  "evidencias_relevantes": [
    {"data": "", "descricao": "...", "tipo": "credito|debito", "valor": <número>, "categoria": "<categoria>"}
  ]
}
Máximo 10 evidencias_relevantes. Foque em receitas recorrentes, não liste despesas cotidianas.`

// ============================================================
// Etapa 1: Extração de lançamentos + tipo de conta
// ============================================================

type TipoConta = 'PJ' | 'PF' | 'desconhecido'

interface ExtratorResult {
  linhasRaw: string[]
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
        // require lazy dentro do try — se falhar, usa Vision fallback sem derrubar o módulo
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const pdfParse = require('pdf-parse') as (b: Buffer) => Promise<{ text: string }>
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
        const linhas = await normalizarViaHaiku({ tipo: 'texto', texto: localText }, doc.label)
        todasLinhas.push(...linhas)
      } else {
        algumFallback = true
        const linhas = await normalizarViaHaiku({ tipo: 'vision', buffer: doc.buffer, mimeType: 'application/pdf' }, doc.label)
        todasLinhas.push(...linhas)
      }
    } else if (TIPOS_IMAGEM.includes(doc.mimeType as ImageMediaType)) {
      algumFallback = true
      console.log(`[apurar-renda] "${doc.label}": imagem → vision`)
      const linhas = await normalizarViaHaiku({ tipo: 'vision', buffer: doc.buffer, mimeType: doc.mimeType }, doc.label)
      todasLinhas.push(...linhas)
    } else {
      console.warn(`[apurar-renda] "${doc.label}": tipo não suportado (${doc.mimeType}), ignorado`)
    }
  }

  return {
    linhasRaw: todasLinhas,
    caminho: algumFallback ? 'vision_fallback' : 'pdf_parse',
    nomesDocumentos: nomes,
    houveFallback: algumFallback,
  }
}

type EntradaHaiku =
  | { tipo: 'texto'; texto: string }
  | { tipo: 'vision'; buffer: Buffer; mimeType: string }

async function normalizarViaHaiku(entrada: EntradaHaiku, label: string): Promise<string[]> {
  let userContent: Anthropic.Messages.ContentBlockParam | string

  if (entrada.tipo === 'texto') {
    userContent = `=== Extrato: ${label} ===\n\n${entrada.texto}\n\nConclua o formato solicitado.`
  } else {
    const base64 = entrada.buffer.toString('base64')
    const docBlock: Anthropic.Messages.ContentBlockParam = entrada.mimeType === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } } as unknown as Anthropic.Messages.ContentBlockParam
      : { type: 'image', source: { type: 'base64', media_type: entrada.mimeType as ImageMediaType, data: base64 } }
    userContent = JSON.stringify([
      { type: 'text', text: `=== Extrato: ${label} ===` },
      docBlock,
      { type: 'text', text: 'Conclua o formato solicitado.' },
    ])
  }

  const messages: Anthropic.Messages.MessageParam[] = entrada.tipo === 'texto'
    ? [{ role: 'user', content: userContent as string }]
    : [{ role: 'user', content: JSON.parse(userContent as string) as Anthropic.Messages.ContentBlockParam[] }]

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4096,
    system: PROMPT_LANCAMENTOS,
    messages,
  })

  const texto = response.content[0]?.type === 'text' ? response.content[0].text : ''
  return texto.trim().split('\n').filter(l => l.includes('|') || l.startsWith('TIPO_CONTA:'))
}

// ============================================================
// Etapa 2: Processamento por código
// ============================================================

interface LancamentoBruto {
  data: string
  descricao: string
  valor: number
  tipo: 'C' | 'D'
  categoria: string
}

interface RecorrenciaDetectada {
  descricaoExemplo: string
  valor: number
  meses: string[]
  categoria: string
  tipoIdentificacao: IdentificacaoExtrato['tipo']
}

interface ProcessamentoLocal {
  tipoConta: TipoConta
  meses: ResumoMes[]
  media_entradas: number
  media_saidas: number
  media_liquida: number
  media_receita: number
  renda_estimada: number
  recorrencias: RecorrenciaDetectada[]
  maiores_creditos: LancamentoBruto[]
  total_lancamentos: number
  periodo_inicio: string | null
  periodo_fim: string | null
}

// Categorias que compõem receita operacional por tipo de conta
function categoriasReceita(tipoConta: TipoConta): Set<string> {
  if (tipoConta === 'PJ') return new Set(['receita', 'liberacao_marketplace'])
  return new Set(['receita'])
}

// Categorias que são excluídas da renda (explicitamente)
const CATEGORIAS_EXCLUIDAS = new Set([
  'transferencia_propria', 'repasse_empresa_socio', 'aporte', 'rendimento',
])

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

function processarLancamentos(linhasRaw: string[]): ProcessamentoLocal {
  // Detectar tipo de conta na primeira linha TIPO_CONTA:
  let tipoConta: TipoConta = 'desconhecido'
  for (const linha of linhasRaw) {
    if (linha.startsWith('TIPO_CONTA:')) {
      const v = linha.replace('TIPO_CONTA:', '').trim()
      if (v === 'PJ') tipoConta = 'PJ'
      else if (v === 'PF') tipoConta = 'PF'
      break
    }
  }

  // Parse de lançamentos com validação estrita de data
  const lancamentos: LancamentoBruto[] = []
  for (const linha of linhasRaw) {
    if (linha.startsWith('TIPO_CONTA:')) continue
    const partes = linha.split('|')
    if (partes.length < 4) continue
    const [dataRaw, descricao, valorStr, tipoRaw, categoriaRaw] = partes
    const data = (dataRaw ?? '').trim()
    if (!validarData(data)) continue
    const valor = parseFloat((valorStr ?? '').replace(',', '.'))
    const tipo = (tipoRaw ?? '').trim().toUpperCase() as 'C' | 'D'
    if (isNaN(valor) || valor <= 0 || (tipo !== 'C' && tipo !== 'D')) continue
    const categoria = (categoriaRaw ?? '').trim() || (tipo === 'C' ? 'outros_creditos' : 'outros_debitos')
    lancamentos.push({ data, descricao: (descricao ?? '').trim(), valor, tipo, categoria })
  }

  const catReceita = categoriasReceita(tipoConta)

  // Agrupar por mês com breakdown de categorias
  interface MesAcc {
    receita: number
    marketplace: number
    excluidos: number
    total_entradas: number
    total_saidas: number
  }
  const mesesMap = new Map<string, MesAcc>()
  for (const l of lancamentos) {
    const mes = l.data.slice(0, 7)
    if (!mesesMap.has(mes)) mesesMap.set(mes, { receita: 0, marketplace: 0, excluidos: 0, total_entradas: 0, total_saidas: 0 })
    const m = mesesMap.get(mes)!
    if (l.tipo === 'C') {
      m.total_entradas += l.valor
      if (catReceita.has(l.categoria)) {
        m.receita += l.valor
        if (l.categoria === 'liberacao_marketplace') m.marketplace += l.valor
      } else if (CATEGORIAS_EXCLUIDAS.has(l.categoria)) {
        m.excluidos += l.valor
      }
    } else {
      m.total_saidas += l.valor
    }
  }

  const meses: ResumoMes[] = Array.from(mesesMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([mes, m]) => ({
      mes,
      mes_label: formatMesLabel(mes),
      total_entradas: r2(m.total_entradas),
      total_receita: r2(m.receita),
      total_marketplace: r2(m.marketplace),
      total_excluidos: r2(m.excluidos),
      total_saidas: r2(m.total_saidas),
      resultado: r2(m.total_entradas - m.total_saidas),
    }))

  const nMeses = meses.length || 1
  const media_entradas = meses.reduce((s, m) => s + m.total_entradas, 0) / nMeses
  const media_receita = meses.reduce((s, m) => s + (m.total_receita ?? 0), 0) / nMeses
  const media_saidas = meses.reduce((s, m) => s + m.total_saidas, 0) / nMeses

  // Detectar recorrências em créditos de receita (excluindo transferências)
  const gruposCredito = new Map<string, Array<{ mes: string; valor: number; descricaoExemplo: string; categoria: string }>>()
  for (const l of lancamentos) {
    if (l.tipo !== 'C') continue
    if (!catReceita.has(l.categoria) && l.categoria !== 'outros_creditos_atencao') continue
    const norm = normalizarDescricao(l.descricao)
    if (!norm || norm.length < 3) continue
    if (!gruposCredito.has(norm)) gruposCredito.set(norm, [])
    gruposCredito.get(norm)!.push({ mes: l.data.slice(0, 7), valor: l.valor, descricaoExemplo: l.descricao, categoria: l.categoria })
  }

  const recorrencias: RecorrenciaDetectada[] = []
  for (const ocorrencias of Array.from(gruposCredito.values())) {
    const mesesUnicos = Array.from(new Set<string>(ocorrencias.map(o => o.mes)))
    if (mesesUnicos.length < 2) continue
    const valorMedio = ocorrencias.reduce((s: number, o: { valor: number }) => s + o.valor, 0) / ocorrencias.length
    const todosSimilares = ocorrencias.every((o: { valor: number }) => Math.abs(o.valor - valorMedio) / valorMedio <= 0.2)
    if (!todosSimilares) continue
    const cat = ocorrencias[0].categoria
    recorrencias.push({
      descricaoExemplo: ocorrencias[0].descricaoExemplo,
      valor: r2(valorMedio),
      meses: mesesUnicos.sort(),
      categoria: cat,
      tipoIdentificacao: valorMedio >= 800 ? 'possivel_salario' : 'transferencia_frequente',
    })
  }
  recorrencias.sort((a, b) => b.valor - a.valor)

  // Estimativa de renda baseada em receita recorrente (não em total de entradas)
  const rendaEstimada = recorrencias
    .filter(r => r.tipoIdentificacao === 'possivel_salario')
    .slice(0, 3)
    .reduce((s, r) => s + r.valor, 0) || r2(media_receita)

  const maiores_creditos = lancamentos
    .filter(l => l.tipo === 'C' && catReceita.has(l.categoria))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 10)

  const todasDatas = lancamentos.map(l => l.data).sort()

  return {
    tipoConta,
    meses,
    media_entradas: r2(media_entradas),
    media_receita: r2(media_receita),
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

function montarResumoParaIA(
  proc: ProcessamentoLocal,
  nomes: string[],
  faturamentoDeclarado?: number,
): string {
  const nMeses = proc.meses.length
  const fmt = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2 })

  const linhasMeses = proc.meses.map(m => {
    const excl = m.total_excluidos && m.total_excluidos > 0 ? ` | Excluídos R$${fmt(m.total_excluidos)}` : ''
    const mkt = m.total_marketplace && m.total_marketplace > 0 ? ` | Marketplace R$${fmt(m.total_marketplace)}` : ''
    return `${m.mes_label}: Receita R$${fmt(m.total_receita ?? 0)}${mkt}${excl} | Total bruto R$${fmt(m.total_entradas)} | Saídas R$${fmt(m.total_saidas)}`
  }).join('\n')

  const linhasRec = proc.recorrencias.slice(0, 6)
    .map(r => `- R$${fmt(r.valor)} em ${r.meses.length}/${nMeses} meses ("${r.descricaoExemplo}") [${r.categoria}]`)
    .join('\n') || '(nenhum padrão recorrente identificado)'

  const linhasMaiores = proc.maiores_creditos.slice(0, 5)
    .map((l, i) => `${i + 1}. R$${fmt(l.valor)} em ${l.data} - ${l.descricao} [${l.categoria}]`)
    .join('\n') || '(nenhum)'

  const linhaFaturamento = faturamentoDeclarado
    ? `\nFATURAMENTO DECLARADO: R$${fmt(faturamentoDeclarado)}/mês`
    : ''

  const alertaFaturamento = faturamentoDeclarado && proc.media_receita > faturamentoDeclarado * 1.25
    ? `\nALERTA AUTOMÁTICO: Receita apurada (R$${fmt(proc.media_receita)}/mês) está acima do faturamento declarado. Possível mistura de contas, repasses ou transferências internas.`
    : ''

  return `DOCUMENTOS: ${nomes.join(', ')}
TIPO DE CONTA DETECTADO: ${proc.tipoConta}
PERÍODO: ${proc.periodo_inicio ?? '?'} a ${proc.periodo_fim ?? '?'} (${nMeses} ${nMeses === 1 ? 'mês' : 'meses'})
LANÇAMENTOS PROCESSADOS: ${proc.total_lancamentos}${linhaFaturamento}${alertaFaturamento}

RESUMO MENSAL (com classificação):
${linhasMeses}

MÉDIAS:
  Receita operacional/mês: R$${fmt(proc.media_receita)} (base para renda)
  Total bruto entradas/mês: R$${fmt(proc.media_entradas)} (inclui transferências e outros)
  Saídas/mês: R$${fmt(proc.media_saidas)}
  Líquida: R$${fmt(proc.media_liquida)}

PADRÕES RECORRENTES NA RECEITA:
${linhasRec}

MAIORES CRÉDITOS DE RECEITA:
${linhasMaiores}

ESTIMATIVA DO SISTEMA: R$${fmt(proc.renda_estimada)}/mês (baseado em receita recorrente — exclui transferências próprias, aportes e repasses)`
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
  opcoes?: { faturamentoDeclarado?: number },
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

  // Etapa 1: Extração + classificação (pdf-parse local ou Vision)
  const { linhasRaw, caminho, nomesDocumentos, houveFallback } = await extrairLancamentos(docsValidos)

  // Etapa 2: Processamento por código
  const proc = processarLancamentos(linhasRaw)

  if (proc.total_lancamentos === 0) {
    throw new Error('Nenhum lançamento válido encontrado nos extratos. Verifique se os arquivos são extratos bancários legíveis.')
  }

  // Alerta automático de divergência com faturamento declarado
  const alertasExtras: AlertaExtrato[] = []
  if (opcoes?.faturamentoDeclarado && proc.media_receita > opcoes.faturamentoDeclarado * 1.25) {
    const fmt = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
    alertasExtras.push({
      tipo: 'incompativel_renda_declarada',
      descricao: `Entradas bancárias acima do faturamento declarado. Receita apurada R$${fmt(proc.media_receita)}/mês vs R$${fmt(opcoes.faturamentoDeclarado)}/mês declarado. Possível mistura de contas, repasses ou transferências internas.`,
    })
  }

  // Etapa 3: Interpretação pela IA
  const resumo = montarResumoParaIA(proc, nomesDocumentos, opcoes?.faturamentoDeclarado)
  const ia = await interpretarRenda(resumo, proc.renda_estimada)

  const elapsed = ((Date.now() - inicio) / 1000).toFixed(1)
  const resultadoParcial = ia.confianca === 'baixa' && ia.metodologia === null
  console.log(
    `[apurar-renda] Concluído em ${elapsed}s | conta: ${proc.tipoConta} | caminho: ${caminho}` +
    ` | docs: ${docsValidos.length} | lançamentos: ${proc.total_lancamentos}` +
    ` | media_receita: R$${proc.media_receita} | fallback_vision: ${houveFallback}` +
    ` | resultado: ${resultadoParcial ? 'parcial' : 'completo'}`,
  )

  const identificacoes: IdentificacaoExtrato[] = proc.recorrencias.map(r => ({
    tipo: r.tipoIdentificacao,
    descricao: `"${r.descricaoExemplo}" — R$ ${r.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} em ${r.meses.length} meses [${r.categoria}]`,
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
    tipo_conta: proc.tipoConta,
    identificacoes,
    alertas: [...alertasExtras, ...(ia.alertas ?? [])],
    lancamentos: (ia.evidencias_relevantes ?? []).slice(0, 10),
    observacoes: ia.metodologia ?? null,
    confianca: ia.confianca ?? 'baixa',
  }
}
