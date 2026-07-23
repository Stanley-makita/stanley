/**
 * OCR de documentos via Claude Vision.
 * Suporta imagens (JPEG, PNG, WEBP, GIF) e PDFs.
 * Extrai dados estruturados de RG, CNH e comprovantes.
 */

import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import { supabaseAdmin } from '@/lib/supabase/admin'

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
  estado_nascimento?: string  // UF 2 letras do estado de nascimento
  data_emissao?: string       // YYYY-MM-DD
  orgao_emissor?: string
  filiacao_mae?: string
  filiacao_pai?: string
  // Campos do RG embutido na CNH (campo 4c DOC.IDENTIDADE / ORG.EMISSOR / UF)
  rg_orgao_emissor?: string   // órgão emissor do RG (ex: "SESP", "SSP")
  rg_uf_emissor?: string      // UF emissora do RG (ex: "PR", "SP")
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
  "rg_orgao_emissor": "órgão emissor do RG extraído do campo '4c ORG.EMISSOR' da CNH (ex: 'SESP', 'SSP', 'PC') ou null",
  "rg_uf_emissor": "UF do orgão emissor do RG extraído do campo 'UF' dentro de 4c da CNH (ex: 'PR', 'SP') ou null",
  "registro_cnh": "número de registro da CNH EXCLUSIVAMENTE do campo '5 Nº REGISTRO' (9-11 dígitos) ou null",
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

Regras para CNH (ATENÇÃO — campos numerados com risco de confusão):
- cpf: extrair EXCLUSIVAMENTE do campo "4d CPF" ou "CPF". NUNCA usar o valor de "4c DOC.IDENTIDADE" como CPF. O número do documento de identidade (RG) e o CPF são campos diferentes na CNH.
- rg: extrair do campo "4c DOC. IDENTIDADE" — é o número do RG da pessoa. Copie EXATAMENTE os dígitos impressos nesse campo da CNH, sem adicionar, inventar ou completar um dígito verificador que não esteja visivelmente impresso ali (a regra de sempre incluir dígito verificador com traço vale só para RG extraído de um documento de RG avulso, não para este campo da CNH). NÃO é o CPF nem o Nº Registro da CNH.
- rg_orgao_emissor: extrair do subcampo "ORG.EMISSOR" dentro de 4c (ex: "SESP", "SSP", "PC"). Apenas o nome do órgão, sem a UF.
- rg_uf_emissor: extrair da coluna "UF" dentro de 4c (ex: "PR", "SP"). Apenas 2 letras.
- registro_cnh: extrair EXCLUSIVAMENTE do campo "5 Nº REGISTRO" ou "N REGISTRO" (geralmente 9-11 dígitos). Este número NÃO é o RG nem o CPF.
- orgao_emissor: órgão emissor da CNH = "DETRAN/" + UF (ex: "DETRAN/PR"). É diferente do orgao_emissor do RG.
- data_emissao: campo "4a DATA EMISSÃO" da CNH, converter para YYYY-MM-DD
- validade_cnh: campo "4b VALIDADE", converter para YYYY-MM-DD
- primeira_habilitacao_cnh: campo "1ª HABILITAÇÃO", converter para YYYY-MM-DD
- cidade_nascimento: parte do município no campo "DATA, LOCAL E UF DE NASCIMENTO" (ex: "PAICANDU/PR" → "PAICANDU")
- estado_nascimento: parte da UF no campo de nascimento (ex: "PAICANDU/PR" → "PR")
- campos ausentes ou não aplicáveis: null (não invente)

IMPORTANTE — leitura cuidadosa (documentos brasileiros têm campos numerados densos e áreas de máquina que fazem os dois principais modelos multimodais confundirem os valores):
- A CNH tem, além dos campos numerados na frente, uma faixa MRZ (código de leitura de máquina — várias linhas de letras/números tipo "I<BRA...") e um código de barras vertical na margem lateral. NUNCA extrair cpf, rg ou registro_cnh dessas duas áreas — são formatos de máquina, não os campos oficiais 4c/4d/5.
- Antes de responder, releia cada campo numerado (4a, 4b, 4c, 4d, 5, 9, 1ª HABILITAÇÃO) e cada data individualmente, e confirme dígito por dígito e letra por letra contra a imagem. Nomes de pai/mãe devem ser copiados exatamente como aparecem, sem trocar, adicionar ou omitir letras.
- Se um campo estiver visível mas houver dúvida entre duas leituras, escolha a mais provável (não retorne null por incerteza) — retorne null apenas quando o campo estiver de fato ausente do documento.

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
  'rg', 'cnh', 'cpf', 'comprovante_endereco', 'comprovante_renda', 'certidao_casamento', 'certidao_nascimento', 'extrato_fgts',
])

// Prompt mínimo só para classificar o tipo do documento
const SYSTEM_PROMPT_CLASSIFICAR = `Você é um classificador de documentos brasileiros.
Analise o documento e responda SOMENTE com JSON válido, sem markdown, sem explicação.
{"tipo_documento":"rg|cnh|cpf|comprovante_endereco|comprovante_renda|extrato_fgts|extrato_bancario|certidao_casamento|certidao_nascimento|outro","confianca":"alta|media|baixa"}`

function serviceSupabase() {
  return supabaseAdmin
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

const PROVIDER = 'claude_vision'
// Classificação é uma tarefa fácil (tipo de documento em 1 palavra) — Haiku
// resolve bem e barato/rápido. Extração completa precisa ler campos numerados
// densos e pequenos (CPF vs RG vs Nº Registro, MRZ, código de barras) sem
// confundir — Haiku errava a maioria desses campos em testes com CNH real;
// Sonnet + thinking chegou a 10/10 campos essenciais no mesmo documento.
const MODELO_CLASSIFICACAO = 'claude-haiku-4-5-20251001'
const MODELO_EXTRACAO = 'claude-sonnet-5'
const VERSAO_PROMPT = 'v2'

export async function processarOcrDocumento(
  supabaseCliente: SupabaseClient,
  documentoId: string,
  empresa_id: string,
  opcoes?: { solicitadoPor?: string | null },
): Promise<{ erro?: string }> {
  const supabase = serviceSupabase()

  // Modelo definitivo: lê e escreve exclusivamente em `documentos`.
  const { data: doc } = await supabase
    .from('documentos')
    .select('id, storage_path, storage_bucket, mime_type, ocr_status:status_ocr')
    .eq('id', documentoId)
    .eq('empresa_id', empresa_id)
    .maybeSingle()

  if (!doc || ['concluido', 'aguardando_apuracao'].includes(doc.ocr_status ?? '')) return {}

  await supabase.from('documentos')
    .update({ status_ocr: 'processando' })
    .eq('id', documentoId)

  // Histórico de OCR: cada execução vira uma linha em extracoes_ocr (dados brutos
  // ficam só lá — `documentos` guarda apenas o status resumido).
  const inicio = Date.now()
  const { data: extracao } = await supabase
    .from('extracoes_ocr')
    .insert({
      empresa_id,
      documento_id: documentoId,
      provider: PROVIDER,
      modelo: MODELO_EXTRACAO,
      versao: VERSAO_PROMPT,
      status: 'processando',
      solicitado_por: opcoes?.solicitadoPor ?? null,
    })
    .select('id')
    .single()
  const extracaoId = extracao?.id as string | undefined

  async function finalizarExtracao(patch: {
    status: 'concluido' | 'erro' | 'ignorado'
    dados?: unknown
    confianca?: string | null
    erro_mensagem?: string
  }) {
    if (!extracaoId) return
    const vigente = patch.status === 'concluido'
    if (vigente) {
      // Só pode existir uma extração vigente por documento
      await supabase.from('extracoes_ocr')
        .update({ vigente: false })
        .eq('documento_id', documentoId)
        .eq('vigente', true)
    }
    await supabase.from('extracoes_ocr')
      .update({
        status: patch.status,
        dados: patch.dados ?? null,
        confianca: patch.confianca ?? null,
        erro_mensagem: patch.erro_mensagem ?? null,
        concluido_em: new Date().toISOString(),
        tempo_processamento_ms: Date.now() - inicio,
        vigente,
      })
      .eq('id', extracaoId)
  }

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
      await supabase.from('documentos').update({ status_ocr: 'ignorado' }).eq('id', documentoId)
      await finalizarExtracao({ status: 'ignorado', erro_mensagem: `mime_type não suportado: ${mimeType}` })
      console.log('[ocr] mime_type não suportado, ignorado:', documentoId, '| mime:', mimeType)
      return {}
    }

    // ── Fase 1: classificação rápida ──────────────────────────────
    const resClassificacao = await anthropic.messages.create(
      {
        model: MODELO_CLASSIFICACAO,
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
      await supabase.from('documentos').update({
        status_ocr: 'aguardando_apuracao',
        classificacao_legado: 'extrato_bancario',
      }).eq('id', documentoId)
      await finalizarExtracao({ status: 'ignorado', dados: classificacao, confianca: classificacao.confianca })
      console.log('[ocr] Extrato bancário detectado automaticamente:', documentoId)
      return {}
    }

    // Não é documento essencial — ignora sem extração
    if (!TIPOS_ESSENCIAIS.has(tipo)) {
      await supabase.from('documentos').update({
        status_ocr: 'ignorado',
        classificacao_legado: tipo === 'outro' ? null : tipo,
      }).eq('id', documentoId)
      await finalizarExtracao({ status: 'ignorado', dados: classificacao, confianca: classificacao.confianca })
      console.log('[ocr] Classificado como não-essencial, ignorado:', documentoId, '| tipo:', tipo)
      return {}
    }

    // ── Fase 2: extração completa (só para tipos essenciais) ──────
    // thinking "adaptive" + effort "high": deixa o modelo raciocinar antes de
    // responder, conferindo campo por campo — é o que faz a diferença em
    // documentos com campos numerados densos (CNH). Ver testes na sprint de
    // calibração: sem thinking, Haiku errava a maioria dos campos essenciais
    // (chegou a ler dígitos da faixa MRZ como CPF); com Sonnet + thinking,
    // 10/10 campos essenciais corretos no mesmo documento real.
    const resExtracao = await anthropic.messages.create(
      {
        model: MODELO_EXTRACAO,
        max_tokens: 4000,
        thinking: { type: 'adaptive' },
        output_config: { effort: 'high' },
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: [contentBlock, { type: 'text', text: 'Extraia os dados deste documento.' }] }],
      },
      { signal: AbortSignal.timeout(90000) },
    )

    const blocoExt = resExtracao.content.find((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
    if (!blocoExt) throw new Error('Resposta inesperada na extração')

    const resultado = JSON.parse(limparJson(blocoExt.text)) as OcrResultado

    await supabase.from('documentos').update({
      status_ocr: 'concluido',
      classificacao_legado: resultado.tipo_documento,
    }).eq('id', documentoId)
    await finalizarExtracao({ status: 'concluido', dados: resultado, confianca: resultado.confianca })

    console.log('[ocr] Documento processado:', documentoId, '| tipo:', resultado.tipo_documento, '| confiança:', resultado.confianca)
    return {}
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[ocr] Erro ao processar documento:', documentoId, msg)
    await supabase.from('documentos')
      .update({ status_ocr: 'erro' })
      .eq('id', documentoId)
    await finalizarExtracao({ status: 'erro', erro_mensagem: msg })
    return { erro: msg }
  }
}
