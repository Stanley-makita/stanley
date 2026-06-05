/**
 * OCR de documentos via Claude Vision.
 * Suporta imagens (JPEG, PNG, WEBP, GIF) e PDFs.
 * Extrai dados estruturados de RG, CNH e comprovantes.
 */

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export interface OcrResultado {
  tipo_documento: 'rg' | 'cnh' | 'comprovante_endereco' | 'comprovante_renda' | 'extrato_fgts' | 'outro'
  // Campos de RG / CNH / comprovantes
  nome?: string
  cpf?: string
  rg?: string
  data_nascimento?: string    // YYYY-MM-DD
  data_emissao?: string       // YYYY-MM-DD
  orgao_emissor?: string
  filiacao_mae?: string
  filiacao_pai?: string
  endereco_rua?: string
  endereco_numero?: string
  endereco_bairro?: string
  endereco_cidade?: string
  endereco_uf?: string
  endereco_cep?: string
  // Campos exclusivos do extrato FGTS
  cod_empregador?: string
  nro_conta_fgts?: string
  pis_pasep?: string
  saldo_disponivel?: string   // valor numérico como texto, ex: "1234.56"
  data_extrato?: string       // YYYY-MM-DD
  confianca: 'alta' | 'media' | 'baixa'
}

const SYSTEM_PROMPT = `Você é um extrator de dados de documentos brasileiros. Analise a imagem e extraia os dados em JSON.
Responda SOMENTE com JSON válido, sem markdown, sem explicação.

Para documentos comuns (RG, CNH, comprovante):
{
  "tipo_documento": "rg|cnh|comprovante_endereco|comprovante_renda|outro",
  "nome": "nome completo ou null",
  "cpf": "11 dígitos sem pontos/traços ou null",
  "rg": "número do RG ou null",
  "data_nascimento": "YYYY-MM-DD ou null",
  "data_emissao": "YYYY-MM-DD ou null",
  "orgao_emissor": "ex: SSP/PR ou null",
  "filiacao_mae": "nome da mãe ou null",
  "filiacao_pai": "nome do pai ou null",
  "endereco_rua": "logradouro e número ou null",
  "endereco_numero": "número ou null",
  "endereco_bairro": "bairro ou null",
  "endereco_cidade": "cidade ou null",
  "endereco_uf": "UF 2 letras ou null",
  "endereco_cep": "8 dígitos sem traço ou null",
  "confianca": "alta|media|baixa"
}

Para extrato FGTS (Caixa Econômica, com saldo FGTS, conta vinculada, NIS/PIS):
{
  "tipo_documento": "extrato_fgts",
  "nome": "nome do trabalhador ou null",
  "cpf": "11 dígitos sem pontos/traços ou null",
  "pis_pasep": "NIS/PIS/PASEP sem pontos/traços ou null",
  "cod_empregador": "código do empregador ou CNPJ ou null",
  "nro_conta_fgts": "número da conta FGTS ou null",
  "saldo_disponivel": "valor numérico como texto ex: 1234.56 ou null",
  "data_extrato": "YYYY-MM-DD da data de emissão do extrato ou null",
  "confianca": "alta|media|baixa"
}

Regras:
- cpf e pis_pasep: apenas dígitos
- datas: converter qualquer formato para YYYY-MM-DD
- saldo_disponivel: valor numérico como string, sem R$ ou pontos de milhar (ex: "1234.56")
- confiança: alta se campos visíveis lidos claramente; media se incertos; baixa se ilegível
- campos ausentes: null (não invente)
- tipo_documento: baseie-se no layout — extrato FGTS tem "FGTS", "Saldo", "Conta Vinculada" visíveis`

type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
const TIPOS_IMAGEM: ImageMediaType[] = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

function serviceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function processarOcrDocumento(
  supabaseCliente: SupabaseClient,
  documentoId: string,
  empresa_id: string,
): Promise<void> {
  const supabase = serviceSupabase()

  // Busca e valida o documento
  const { data: doc } = await supabase
    .from('documentos_clientes')
    .select('id, storage_path, storage_bucket, mime_type, ocr_status, pessoa_id')
    .eq('id', documentoId)
    .eq('empresa_id', empresa_id)
    .maybeSingle()

  if (!doc || doc.ocr_status !== 'pendente') return

  // Marca como processando
  await supabase.from('documentos_clientes')
    .update({ ocr_status: 'processando' })
    .eq('id', documentoId)

  try {
    // Gera URL assinada e baixa o arquivo
    const { data: urlData } = await supabase.storage
      .from(doc.storage_bucket ?? 'documentos-clientes')
      .createSignedUrl(doc.storage_path, 60)

    if (!urlData?.signedUrl) throw new Error('Não foi possível gerar URL do documento')

    const resp = await fetch(urlData.signedUrl, { signal: AbortSignal.timeout(30000) })
    if (!resp.ok) throw new Error(`Download falhou: ${resp.status}`)

    const buffer = await resp.arrayBuffer()
    const base64 = Buffer.from(buffer).toString('base64')
    const mimeType = doc.mime_type ?? 'image/jpeg'

    // Monta o content block correto para Claude
    let contentBlock: Anthropic.Messages.ContentBlockParam
    if (TIPOS_IMAGEM.includes(mimeType as ImageMediaType)) {
      contentBlock = {
        type: 'image',
        source: { type: 'base64', media_type: mimeType as ImageMediaType, data: base64 },
      }
    } else if (mimeType === 'application/pdf') {
      contentBlock = {
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: base64 },
      } as unknown as Anthropic.Messages.ContentBlockParam
    } else {
      // Tipo não suportado
      await supabase.from('documentos_clientes')
        .update({ ocr_status: 'ignorado' })
        .eq('id', documentoId)
      return
    }

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: [contentBlock, { type: 'text', text: 'Extraia os dados deste documento.' }] }],
    })

    const bloco = response.content[0]
    if (bloco?.type !== 'text') throw new Error('Resposta inesperada do Claude')

    const jsonText = bloco.text.trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')

    const resultado = JSON.parse(jsonText) as OcrResultado

    await supabase.from('documentos_clientes').update({
      ocr_status: 'concluido',
      ocr_dados: resultado,
      classificacao: resultado.tipo_documento,
    }).eq('id', documentoId)

    console.log('[ocr] Documento processado:', documentoId, '| tipo:', resultado.tipo_documento, '| confiança:', resultado.confianca)
  } catch (err) {
    console.error('[ocr] Erro ao processar documento:', documentoId, err)
    await supabase.from('documentos_clientes')
      .update({ ocr_status: 'erro' })
      .eq('id', documentoId)
  }
}
