/**
 * Análise de extratos bancários via Claude Sonnet.
 * Recebe múltiplos documentos, envia em uma única chamada e retorna análise financeira estruturada.
 */

import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
const TIPOS_IMAGEM: ImageMediaType[] = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

export interface LancamentoExtrato {
  data: string          // YYYY-MM-DD
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
  mes: string            // YYYY-MM
  mes_label: string      // ex: "Setembro 2025"
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

const SYSTEM_PROMPT = `Você é um analista financeiro especializado em análise de extratos bancários brasileiros.
Analise os extratos fornecidos e retorne SOMENTE um JSON válido, sem markdown, sem explicação.

Regras:
- Identifique todas as entradas (créditos) e saídas (débitos) mês a mês
- Agrupe por mês calendário (ex: outubro/2025)
- Calcule totais mensais e médias do período
- Identifique padrões recorrentes (salários, pró-labores, receitas empresariais, transferências frequentes)
- Identifique movimentações entre contas próprias (PIX para mesmo CPF/CNPJ, TED própria)
- Gere alertas para situações que merecem atenção do analista
- O campo renda_apurada deve refletir a média de entradas recorrentes (excluindo extraordinários quando identificados)
- Em lancamentos[], inclua APENAS os lançamentos mais relevantes: salários, entradas recorrentes, créditos extraordinários e débitos atípicos. Máximo de 30 lançamentos no total. NÃO liste lançamentos cotidianos como alimentação, streaming, etc.
- Seja conservador: na dúvida, use confianca "media" ou "baixa"
- Se o extrato for ilegível ou incompleto, use confianca "baixa" e inclua alerta extrato_incompleto

Estrutura obrigatória de retorno:
{
  "documentos_analisados": [{"nome": "string", "banco": "string ou null", "periodo": "string ou null"}],
  "periodo_inicio": "YYYY-MM ou null",
  "periodo_fim": "YYYY-MM ou null",
  "meses": [
    {
      "mes": "YYYY-MM",
      "mes_label": "Nome Mês YYYY",
      "total_entradas": 0.00,
      "total_saidas": 0.00,
      "resultado": 0.00
    }
  ],
  "media_mensal_entradas": 0.00,
  "media_mensal_saidas": 0.00,
  "media_liquida": 0.00,
  "renda_apurada": 0.00,
  "identificacoes": [
    {
      "tipo": "possivel_salario|pro_labore|movimentacao_propria|transferencia_frequente|receita_empresa",
      "descricao": "string",
      "valor": 0.00
    }
  ],
  "alertas": [
    {
      "tipo": "movimentacao_atipica|extrato_incompleto|alta_variacao|credito_extraordinario|baixa_confianca|incompativel_renda_declarada",
      "descricao": "string"
    }
  ],
  "lancamentos": [
    {
      "data": "YYYY-MM-DD",
      "descricao": "string",
      "tipo": "credito|debito",
      "valor": 0.00,
      "categoria": "string ou null"
    }
  ],
  "observacoes": "string ou null",
  "confianca": "alta|media|baixa"
}`

export async function analisarExtratosRenda(
  supabase: SupabaseClient,
  documentos: DocumentoParaAnalise[],
): Promise<ResultadoApuracao> {
  if (documentos.length === 0) {
    throw new Error('Nenhum documento fornecido para análise')
  }

  // Baixa todos os documentos em paralelo
  type BlocoDoc = { label: string; base64: string; mimeType: string } | null

  const resultados = await Promise.all(
    documentos.map(async (doc): Promise<BlocoDoc> => {
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
        console.warn('[apurar-renda] Download falhou para:', doc.nome_original, resp.status)
        return null
      }

      const buffer = await resp.arrayBuffer()
      const base64 = Buffer.from(buffer).toString('base64')
      return { label: doc.nome_original, base64, mimeType: doc.mime_type ?? 'application/pdf' }
    })
  )

  const contentBlocks: Anthropic.Messages.ContentBlockParam[] = []

  for (const item of resultados) {
    if (!item) continue
    const { label, base64, mimeType } = item

    contentBlocks.push({ type: 'text', text: `=== Documento: ${label} ===` })

    if (TIPOS_IMAGEM.includes(mimeType as ImageMediaType)) {
      contentBlocks.push({
        type: 'image',
        source: { type: 'base64', media_type: mimeType as ImageMediaType, data: base64 },
      })
    } else if (mimeType === 'application/pdf') {
      contentBlocks.push({
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: base64 },
      } as unknown as Anthropic.Messages.ContentBlockParam)
    } else {
      console.warn('[apurar-renda] Tipo de mídia não suportado:', mimeType, 'doc:', label)
    }
  }

  if (contentBlocks.length === 0) {
    throw new Error('Não foi possível baixar nenhum dos documentos')
  }

  contentBlocks.push({
    type: 'text',
    text: 'Analise todos os extratos acima e retorne o JSON estruturado conforme instruído.',
  })

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8192,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: contentBlocks }],
  })

  const bloco = response.content[0]
  if (bloco?.type !== 'text') {
    throw new Error('Resposta inesperada do Claude')
  }

  // Detecta resposta truncada (atingiu max_tokens)
  if (response.stop_reason === 'max_tokens') {
    throw new Error('Resposta truncada por limite de tokens. Tente com menos documentos ou extratos menores.')
  }

  const textoLimpo = bloco.text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '')

  let resultado: ResultadoApuracao
  try {
    resultado = JSON.parse(textoLimpo) as ResultadoApuracao
  } catch {
    console.error('[apurar-renda] JSON inválido. stop_reason:', response.stop_reason, 'preview:', textoLimpo.slice(-200))
    throw new Error('A IA retornou um resultado incompleto. Tente novamente.')
  }

  // Garante campos obrigatórios com defaults
  resultado.documentos_analisados = resultado.documentos_analisados ?? []
  resultado.meses = resultado.meses ?? []
  resultado.identificacoes = resultado.identificacoes ?? []
  resultado.alertas = resultado.alertas ?? []
  resultado.lancamentos = resultado.lancamentos ?? []
  resultado.media_mensal_entradas = resultado.media_mensal_entradas ?? 0
  resultado.media_mensal_saidas = resultado.media_mensal_saidas ?? 0
  resultado.media_liquida = resultado.media_liquida ?? 0
  resultado.renda_apurada = resultado.renda_apurada ?? 0
  resultado.confianca = resultado.confianca ?? 'baixa'

  return resultado
}
