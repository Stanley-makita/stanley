/**
 * OCR de documentos do Construtor de Contratos — via Claude Vision.
 *
 * Isolado de propósito de src/lib/documentos/ocr.ts (usado por captação/
 * comercial/Leads): aquele extrator tem um schema FECHADO de tipos (rg, cnh,
 * comprovante_endereco, comprovante_renda, extrato_fgts, certidões de
 * casamento/nascimento) e descarta sem extrair qualquer coisa fora dessa
 * lista — por isso matrícula, IPTU e certidões de imóvel sempre caíam em
 * "outro" com campos vazios. Contratos precisam justamente desses documentos.
 *
 * Este módulo lê QUALQUER documento, sem lista fechada — a IA nomeia
 * livremente o tipo e os campos que encontrar. Mais pra frente, uma vez que
 * se tenha volume real de exemplos, pode-se travar em schemas específicos
 * (matrícula, IPTU, certidão) igual ao ocr.ts — sem nunca alterar o
 * comportamento usado em captação/comercial.
 *
 * Reaproveita os helpers de baixo nível de ocr.ts (montagem do content block
 * pra Claude, limpeza de JSON) e grava no mesmo par de tabelas
 * (documentos/extracoes_ocr), pra tudo que já lê de lá (ex: a etapa
 * "Compreensão da Negociação") continuar funcionando sem mudança nenhuma.
 */

import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { montarContentBlock, limparJson } from './ocr'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const MODELO = 'claude-sonnet-5'
const PROVIDER = 'claude_vision_contrato'
const VERSAO_PROMPT = 'v1'

const SYSTEM_PROMPT = `Você é um extrator de dados de documentos usados na redação de contratos imobiliários brasileiros (matrícula de imóvel, IPTU, certidões, RG/CNH de partes, comprovantes e outros).

Analise o documento e identifique livremente o tipo (ex: "matricula_imovel", "iptu", "certidao_onus_reais", "rg", "cnh", "comprovante_endereco", ou qualquer outro nome descritivo que fizer sentido) e extraia todos os campos relevantes que encontrar — nomes, CPF/CNPJ, número de matrícula, cartório, área, inscrição imobiliária, valor venal, endereço, ônus/gravames, número de certidão, datas, e qualquer outro dado útil pra redigir um contrato. Não invente dados que não estão no documento.

Retorne SOMENTE o JSON abaixo, sem markdown, sem explicação:

{
  "tipo_documento": "nome curto e descritivo do tipo de documento",
  "dados": { "campo_encontrado_1": "valor ou null", "campo_encontrado_2": "valor ou null" },
  "confianca": "alta|media|baixa"
}`

export async function processarOcrDocumentoContrato(
  documentoId: string,
  empresa_id: string,
  opcoes?: { solicitadoPor?: string | null },
): Promise<{ erro?: string }> {
  const supabase = supabaseAdmin

  const { data: doc } = await supabase
    .from('documentos')
    .select('id, storage_path, storage_bucket, mime_type, ocr_status:status_ocr')
    .eq('id', documentoId)
    .eq('empresa_id', empresa_id)
    .maybeSingle()

  if (!doc || ['concluido', 'aguardando_apuracao'].includes(doc.ocr_status ?? '')) return {}

  await supabase.from('documentos').update({ status_ocr: 'processando' }).eq('id', documentoId)

  const inicio = Date.now()
  const { data: extracao } = await supabase
    .from('extracoes_ocr')
    .insert({
      empresa_id,
      documento_id: documentoId,
      provider: PROVIDER,
      modelo: MODELO,
      versao: VERSAO_PROMPT,
      status: 'processando',
      solicitado_por: opcoes?.solicitadoPor ?? null,
    })
    .select('id')
    .single()
  const extracaoId = extracao?.id as string | undefined

  async function finalizarExtracao(patch: {
    status: 'concluido' | 'erro'
    dados?: unknown
    confianca?: string | null
    erro_mensagem?: string
  }) {
    if (!extracaoId) return
    const vigente = patch.status === 'concluido'
    if (vigente) {
      await supabase.from('extracoes_ocr').update({ vigente: false }).eq('documento_id', documentoId).eq('vigente', true)
    }
    await supabase.from('extracoes_ocr').update({
      status: patch.status,
      dados: patch.dados ?? null,
      confianca: patch.confianca ?? null,
      erro_mensagem: patch.erro_mensagem ?? null,
      concluido_em: new Date().toISOString(),
      tempo_processamento_ms: Date.now() - inicio,
      vigente,
    }).eq('id', extracaoId)
  }

  try {
    const { data: urlData } = await supabase.storage
      .from(doc.storage_bucket ?? 'documentos-clientes')
      .createSignedUrl(doc.storage_path, 120)
    if (!urlData?.signedUrl) throw new Error('Não foi possível gerar URL do documento')

    const resp = await fetch(urlData.signedUrl, { signal: AbortSignal.timeout(30000) })
    if (!resp.ok) throw new Error(`Download falhou: ${resp.status}`)

    const base64 = Buffer.from(await resp.arrayBuffer()).toString('base64')
    const rawMime = doc.mime_type ?? 'image/jpeg'
    const mimeType = rawMime === 'image/jpg' ? 'image/jpeg' : rawMime

    const contentBlock = montarContentBlock(base64, mimeType)
    if (!contentBlock) {
      await supabase.from('documentos').update({ status_ocr: 'ignorado' }).eq('id', documentoId)
      await finalizarExtracao({ status: 'erro', erro_mensagem: `mime_type não suportado: ${mimeType}` })
      return {}
    }

    const resposta = await anthropic.messages.create(
      {
        model: MODELO,
        max_tokens: 3000,
        thinking: { type: 'adaptive' },
        output_config: { effort: 'high' },
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: [contentBlock, { type: 'text', text: 'Extraia os dados deste documento.' }] }],
      },
      { signal: AbortSignal.timeout(90000) },
    )

    const bloco = resposta.content.find((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
    if (!bloco) throw new Error('Resposta inesperada na extração')

    const resultado = JSON.parse(limparJson(bloco.text)) as { tipo_documento: string; dados: Record<string, string | null>; confianca: string }

    await supabase.from('documentos').update({
      status_ocr: 'concluido',
      classificacao_legado: resultado.tipo_documento,
    }).eq('id', documentoId)
    await finalizarExtracao({ status: 'concluido', dados: resultado, confianca: resultado.confianca })

    return {}
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[ocr-contrato] Erro ao processar documento:', documentoId, msg)
    await supabase.from('documentos').update({ status_ocr: 'erro' }).eq('id', documentoId)
    await finalizarExtracao({ status: 'erro', erro_mensagem: msg })
    return { erro: msg }
  }
}
