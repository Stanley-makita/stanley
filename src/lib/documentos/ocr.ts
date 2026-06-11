/**
 * OCR de documentos via Claude Vision.
 * Suporta imagens (JPEG, PNG, WEBP, GIF) e PDFs.
 * Extrai dados estruturados de RG, CNH e comprovantes.
 */

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export interface FgtsContaOcr {
  cod_empregador?: string   // CNPJ ou código do empregador
  nro_conta_fgts?: string   // Nº da conta FGTS
  saldo_disponivel?: string  // valor numérico como texto, ex: "121507.82"
}

export interface OcrResultado {
  tipo_documento: 'rg' | 'cnh' | 'comprovante_endereco' | 'comprovante_renda' | 'extrato_fgts' | 'certidao_casamento' | 'certidao_nascimento' | 'outro'
  // Campos de RG / CNH / comprovantes
  nome?: string
  cpf?: string
  rg?: string
  data_nascimento?: string    // YYYY-MM-DD
  cidade_nascimento?: string
  data_emissao?: string       // YYYY-MM-DD
  orgao_emissor?: string
  filiacao_mae?: string
  filiacao_pai?: string
  // Campos específicos de CNH
  registro_cnh?: string
  validade_cnh?: string              // YYYY-MM-DD
  primeira_habilitacao_cnh?: string  // YYYY-MM-DD
  endereco_rua?: string
  endereco_numero?: string
  endereco_bairro?: string
  endereco_cidade?: string
  endereco_uf?: string
  endereco_cep?: string
  // Campos de certidão de casamento
  estado_civil?: string       // sempre 'casado' para certidão de casamento
  regime_casamento?: string   // ex: 'comunhao_parcial', 'comunhao_universal', 'separacao_total', 'participacao_final'
  data_casamento?: string     // YYYY-MM-DD
  // Campos do extrato FGTS — dados gerais do trabalhador
  pis_pasep?: string
  data_extrato?: string       // YYYY-MM-DD
  // Array de contas (um PDF pode ter múltiplos empregadores)
  contas_fgts?: FgtsContaOcr[]
  confianca: 'alta' | 'media' | 'baixa'
}

const SYSTEM_PROMPT = `Você é um extrator de dados de documentos brasileiros. Analise a imagem e extraia os dados em JSON.
Responda SOMENTE com JSON válido, sem markdown, sem explicação.

Para documentos comuns (RG, CNH, comprovante):
{
  "tipo_documento": "rg|cnh|comprovante_endereco|comprovante_renda|outro",
  "nome": "nome completo ou null",
  "cpf": "11 dígitos sem pontos/traços ou null",
  "rg": "número completo do RG incluindo dígito verificador com traço (ex: 9755869-8) ou null",
  "data_nascimento": "YYYY-MM-DD ou null",
  "cidade_nascimento": "cidade/município de nascimento (campo NATURALIDADE ou LOCAL DE NASCIMENTO) ou null",
  "estado_nascimento": "UF (sigla 2 letras) do estado de nascimento, extraído do campo NATURALIDADE se contiver estado (ex: 'Maringá/PR' → 'PR') ou null",
  "data_emissao": "YYYY-MM-DD data de emissão do documento ou null",
  "orgao_emissor": "órgão expedidor (ex: SESP/PR para RG, DETRAN/PR para CNH) ou null",
  "filiacao_mae": "nome da mãe ou null",
  "filiacao_pai": "nome do pai ou null",
  "registro_cnh": "número de registro da CNH (campo REGISTRO, diferente do nº do documento) ou null",
  "validade_cnh": "YYYY-MM-DD data de validade da habilitação ou null",
  "primeira_habilitacao_cnh": "YYYY-MM-DD data da primeira habilitação (campo 1ª HABILITAÇÃO) ou null",
  "endereco_rua": "logradouro ou null",
  "endereco_numero": "número ou null",
  "endereco_bairro": "bairro ou null",
  "endereco_cidade": "cidade do endereço ou null",
  "endereco_uf": "UF 2 letras ou null",
  "endereco_cep": "8 dígitos sem traço ou null",
  "confianca": "alta|media|baixa"
}

Regras para RG / Novo Documento de Identidade:
- rg: incluir SEMPRE o dígito verificador com traço (ex: "9755869-8"); nunca omitir o dígito
- orgao_emissor: campo ÓRGÃO EXPEDIDOR ou SSP/SESP + UF (ex: "SESP/PR", "SSP/SP", "DETRAN/PR")
- cidade_nascimento: parte da cidade no campo NATURALIDADE (ex: "Maringá/PR" → cidade_nascimento: "Maringá")
- estado_nascimento: parte da UF no campo NATURALIDADE (ex: "Maringá/PR" → estado_nascimento: "PR")
- data_emissao: data de expedição do documento

Regras para CNH:
- registro_cnh: número no campo "REGISTRO" (geralmente 9-11 dígitos, diferente do nº do documento)
- validade_cnh: data de VALIDADE da habilitação, converter para YYYY-MM-DD
- primeira_habilitacao_cnh: campo "1ª HABILITAÇÃO" ou "PRIMEIRA HABILITAÇÃO", YYYY-MM-DD
- orgao_emissor: usar "DETRAN/" + UF emissora (ex: "DETRAN/PR")
- rg: null para CNH (CNH não tem campo RG separado)
- campos ausentes ou não aplicáveis ao tipo: null (não invente)

Regras para comprovante_endereco:
- cpf: null (NÃO extrair CPF de comprovante de endereço — foco é endereço)
- rg: null, data_nascimento: null, filiacao_mae: null, filiacao_pai: null
- orgao_emissor: nome da empresa emissora (ex: "COPEL", "SANEPAR", "CEMIG") ou null
- data_emissao: data de emissão ou vencimento da conta, converter para YYYY-MM-DD ou null

Para certidão de casamento:
{
  "tipo_documento": "certidao_casamento",
  "nome": "nome do(a) cônjuge 1 ou null",
  "cpf": "CPF do(a) cônjuge 1, 11 dígitos sem pontos/traços ou null",
  "data_nascimento": "data de nascimento do(a) cônjuge 1, YYYY-MM-DD ou null",
  "estado_civil": "casado",
  "regime_casamento": "comunhao_parcial|comunhao_universal|separacao_total|participacao_final ou null",
  "data_casamento": "YYYY-MM-DD ou null",
  "confianca": "alta|media|baixa"
}

Regras para certidão de casamento:
- tipo_documento: identificar pelo cabeçalho "CERTIDÃO DE CASAMENTO" ou "CERTIDÃO DE REGISTRO DE CASAMENTO"
- regime_casamento: mapear texto livre para os valores padronizados:
  "comunhão parcial de bens" → "comunhao_parcial"
  "comunhão universal de bens" → "comunhao_universal"
  "separação total de bens" / "separação de bens" → "separacao_total"
  "participação final nos aquestos" → "participacao_final"
- data_casamento: data da celebração do casamento, converter para YYYY-MM-DD
- nome/cpf/data_nascimento: extrair dados do primeiro cônjuge listado
- estado_civil: sempre "casado" para certidão de casamento
- campos ausentes: null (não invente)

Para certidão de nascimento:
{
  "tipo_documento": "certidao_nascimento",
  "nome": "nome completo do registrado ou null",
  "cpf": "CPF se presente no documento, 11 dígitos sem pontos/traços ou null",
  "data_nascimento": "YYYY-MM-DD data em que a pessoa nasceu ou null",
  "cidade_nascimento": "município onde nasceu (campo MUNICÍPIO, NATURALIDADE ou COMARCA) ou null",
  "estado_nascimento": "UF 2 letras do estado onde nasceu ou null",
  "filiacao_mae": "nome da mãe ou null",
  "filiacao_pai": "nome do pai ou null",
  "data_emissao": "YYYY-MM-DD data de emissão da certidão (diferente da data de nascimento) ou null",
  "orgao_emissor": "nome do cartório de registro civil ou null",
  "confianca": "alta|media|baixa"
}

Regras para certidão de nascimento:
- tipo_documento: identificar pelo cabeçalho "CERTIDÃO DE NASCIMENTO" ou "CERTIDÃO DE REGISTRO DE NASCIMENTO"
- data_nascimento: data em que a pessoa nasceu, converter para YYYY-MM-DD
- data_emissao: data em que o cartório emitiu a certidão (diferente da data de nascimento), converter para YYYY-MM-DD
- cidade_nascimento: município de nascimento (campo MUNICÍPIO DE NASCIMENTO, NATURALIDADE ou COMARCA)
- estado_nascimento: UF 2 letras (ex: "PR", "SP")
- cpf: presente apenas em certidões mais recentes; se ausente, null
- orgao_emissor: nome do cartório (ex: "1º Cartório de Registro Civil de Maringá")
- campos ausentes: null (não invente)

Para extrato FGTS (Caixa Econômica Federal — pode ter um ou vários empregadores):
{
  "tipo_documento": "extrato_fgts",
  "nome": "nome do trabalhador ou null",
  "cpf": "11 dígitos sem pontos/traços ou null",
  "pis_pasep": "NIS/PIS/PASEP sem pontos/traços/hífens ou null",
  "data_extrato": "YYYY-MM-DD da data de emissão (campo 'Histórico emitido em' ou 'Data') ou null",
  "contas_fgts": [
    {
      "cod_empregador": "CNPJ ou código de inscrição do empregador, sem pontos/traços ou null",
      "nro_conta_fgts": "número da conta FGTS (campo 'Nº da Conta') ou null",
      "saldo_disponivel": "último valor da coluna TOTAL no extrato desta conta, formato numérico sem R$ ex: '121507.82' ou null"
    }
  ],
  "confianca": "alta|media|baixa"
}

Regras para extrato FGTS:
- pis_pasep: apenas dígitos, sem pontos, traços ou hífens (ex: "13213913536")
- cpf: apenas dígitos
- datas: converter para YYYY-MM-DD (ex: "29/04/2026" → "2026-04-29")
- saldo_disponivel: pegar o ÚLTIMO valor da coluna "TOTAL" das movimentações daquela conta (é o saldo atual); se houver campo "VALOR PARA FINS RESCISÓRIOS", usar esse valor como alternativa
- cod_empregador: extrair do campo "INSCRIÇÃO DO EMPREGADOR" — apenas dígitos se for CNPJ
- nro_conta_fgts: extrair do campo "Nº DA CONTA (COD. ESTABELECIMENTO/CONTA)"
- Se o PDF tiver múltiplos empregadores/contas, incluir todos em contas_fgts
- campos ausentes: null (não invente)
- tipo_documento: documento FGTS tem logo "FGTS" + "CAIXA" e campos de NIS/PIS, conta vinculada`

type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
const TIPOS_IMAGEM: ImageMediaType[] = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

// Tipos que vale fazer extração completa de dados
const TIPOS_ESSENCIAIS = new Set([
  'rg', 'cnh', 'cpf', 'comprovante_endereco', 'certidao_casamento', 'certidao_nascimento', 'extrato_fgts',
])

// Prompt mínimo só para classificar o tipo do documento
const SYSTEM_PROMPT_CLASSIFICAR = `Você é um classificador de documentos brasileiros.
Analise o documento e responda SOMENTE com JSON válido, sem markdown, sem explicação.
{"tipo_documento":"rg|cnh|cpf|comprovante_endereco|comprovante_renda|extrato_fgts|extrato_bancario|certidao_casamento|certidao_nascimento|outro","confianca":"alta|media|baixa"}`

function serviceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

function montarContentBlock(
  base64: string,
  mimeType: string,
): Anthropic.Messages.ContentBlockParam | null {
  if (TIPOS_IMAGEM.includes(mimeType as ImageMediaType)) {
    return {
      type: 'image',
      source: { type: 'base64', media_type: mimeType as ImageMediaType, data: base64 },
    }
  }
  if (mimeType === 'application/pdf') {
    return {
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: base64 },
    } as unknown as Anthropic.Messages.ContentBlockParam
  }
  return null
}

function limparJson(texto: string): string {
  return texto.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
}

export async function processarOcrDocumento(
  supabaseCliente: SupabaseClient,
  documentoId: string,
  empresa_id: string,
): Promise<void> {
  const supabase = serviceSupabase()

  const { data: doc } = await supabase
    .from('documentos_clientes')
    .select('id, storage_path, storage_bucket, mime_type, ocr_status, pessoa_id')
    .eq('id', documentoId)
    .eq('empresa_id', empresa_id)
    .maybeSingle()

  if (!doc || ['concluido', 'aguardando_apuracao'].includes(doc.ocr_status ?? '')) return

  await supabase.from('documentos_clientes')
    .update({ ocr_status: 'processando' })
    .eq('id', documentoId)

  try {
    // Download único — reutilizado nas duas fases
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
      await supabase.from('documentos_clientes').update({ ocr_status: 'ignorado' }).eq('id', documentoId)
      return
    }

    // ── Fase 1: classificação rápida ──────────────────────────────
    const resClassificacao = await anthropic.messages.create(
      {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 120,
        system: SYSTEM_PROMPT_CLASSIFICAR,
        messages: [{ role: 'user', content: [contentBlock, { type: 'text', text: 'Que tipo de documento é este?' }] }],
      },
      { signal: AbortSignal.timeout(45000) },
    )

    const blocoClass = resClassificacao.content[0]
    if (blocoClass?.type !== 'text') throw new Error('Resposta inesperada na classificação')

    const classificacao = JSON.parse(limparJson(blocoClass.text)) as { tipo_documento: string; confianca: string }
    const tipo = classificacao.tipo_documento

    // Extrato bancário detectado em modo auto → encaminha para apuração de renda
    if (tipo === 'extrato_bancario') {
      await supabase.from('documentos_clientes').update({
        ocr_status: 'aguardando_apuracao',
        classificacao: 'extrato_bancario',
      }).eq('id', documentoId)
      console.log('[ocr] Extrato bancário detectado automaticamente:', documentoId)
      return
    }

    // Não é documento essencial — ignora sem extração
    if (!TIPOS_ESSENCIAIS.has(tipo)) {
      await supabase.from('documentos_clientes').update({
        ocr_status: 'ignorado',
        classificacao: tipo === 'outro' ? null : tipo,
      }).eq('id', documentoId)
      console.log('[ocr] Classificado como não-essencial, ignorado:', documentoId, '| tipo:', tipo)
      return
    }

    // ── Fase 2: extração completa (só para tipos essenciais) ──────
    const resExtracao = await anthropic.messages.create(
      {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1500,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: [contentBlock, { type: 'text', text: 'Extraia os dados deste documento.' }] }],
      },
      { signal: AbortSignal.timeout(55000) },
    )

    const blocoExt = resExtracao.content[0]
    if (blocoExt?.type !== 'text') throw new Error('Resposta inesperada na extração')

    const resultado = JSON.parse(limparJson(blocoExt.text)) as OcrResultado

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
