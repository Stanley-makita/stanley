import { supabaseAdmin } from '@/lib/supabase/admin'
import { buscarDocumento } from '@/lib/clicksign/client'
import { salvarPdfAssinadoEmStorage } from '@/lib/clicksign/storage'

// Função comum de fechamento de contrato ClickSign — usada tanto por
// /api/clicksign/webhook (evento real) quanto por
// /api/clicksign/atualizar-status (polling manual). Antes desta função, as
// duas rotas duplicavam a mesma lógica (buscar documento assinado, salvar no
// Storage, atualizar processo_contratos), sem nenhuma proteção contra as
// duas rodando ao mesmo tempo para o mesmo contrato.
//
// A reivindicação atômica (clicksign_fechamentos, UNIQUE por
// processo_contrato_id) protege especificamente a transição running->closed
// — é o único ponto onde webhook e polling podem colidir tentando fechar o
// MESMO contrato ao mesmo tempo. A busca/gravação da URL assinada, depois
// que o contrato já está closed, é naturalmente segura de repetir (upsert no
// Storage, UPDATE idempotente da mesma coluna) e não precisa de reivindicação.

export type OrigemFechamento = 'webhook' | 'polling'

export interface ContratoParaFechar {
  id: string
  empresa_id: string
  clicksign_status: string | null
  clicksign_envelope_id: string | null
  clicksign_document_id: string | null
  clicksign_signed_url: string | null
}

export interface ProcessarFechamentoParams {
  contrato: ContratoParaFechar
  origem: OrigemFechamento
  evento: string
  /** Usado quando o contrato ainda não tem clicksign_envelope_id salvo (ex.: webhook resolvido só por document_id). */
  envelopeIdFallback?: string | null
}

export interface ResultadoFechamento {
  status: string | null
  signed_url: string | null
  /** true quando nenhum trabalho novo foi feito (já fechado, ou reivindicado por outra chamada concorrente). */
  idempotente: boolean
}

async function reivindicarFechamento(
  processoContratoId: string,
  evento: string,
  origem: OrigemFechamento,
): Promise<string | null> {
  const tentarInserir = () =>
    supabaseAdmin
      .from('clicksign_fechamentos')
      .insert({ processo_contrato_id: processoContratoId, evento, origem })
      .select('id')
      .single()

  let { data, error } = await tentarInserir()

  if (error?.code === '23505') {
    const { data: existente, error: erroSelect } = await supabaseAdmin
      .from('clicksign_fechamentos')
      .select('id, status')
      .eq('processo_contrato_id', processoContratoId)
      .maybeSingle()

    // Um 23505 garante que a linha existe — se a busca não encontrar nada
    // (ou falhar), é um erro real (corrida rara na deleção, problema de rede
    // etc.), não "já reivindicado". Não deve ser tratado como no-op silencioso.
    if (erroSelect) throw erroSelect
    if (!existente) throw new Error('conflito de reivindicação sem linha correspondente em clicksign_fechamentos')

    if (existente.status !== 'falhou') {
      // Já em processamento ou já processado por outra chamada — não reivindica.
      return null
    }

    // Tentativa anterior falhou — libera para uma nova tentativa.
    await supabaseAdmin.from('clicksign_fechamentos').delete().eq('id', existente.id)
    ;({ data, error } = await tentarInserir())
    if (error) throw error
  } else if (error) {
    throw error
  }

  return data?.id ?? null
}

async function marcarEventoFechamento(
  eventoId: string,
  status: 'processado' | 'falhou',
  detalheFalha?: string,
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('clicksign_fechamentos')
    .update({ status, detalhe_falha: detalheFalha ?? null, updated_at: new Date().toISOString() })
    .eq('id', eventoId)

  if (error) {
    console.error('[clicksign] falha ao atualizar status do evento (best-effort, ignorado):', error.message)
  }
}

export async function processarFechamentoContratoClicksign(
  params: ProcessarFechamentoParams,
): Promise<ResultadoFechamento> {
  const { contrato, origem, evento, envelopeIdFallback } = params

  // Já concluído (estado + URL) — nada a fazer.
  if (contrato.clicksign_status === 'closed' && contrato.clicksign_signed_url) {
    return { status: 'closed', signed_url: contrato.clicksign_signed_url, idempotente: true }
  }

  // Estado desconhecido (null/draft/cancelled/etc.) — não processa uma
  // transição não mapeada; evita mover o contrato para um estado inesperado.
  if (contrato.clicksign_status !== 'closed' && contrato.clicksign_status !== 'running') {
    return { status: contrato.clicksign_status, signed_url: contrato.clicksign_signed_url, idempotente: true }
  }

  let statusFinal = contrato.clicksign_status
  let jaFechadoAgora = contrato.clicksign_status === 'closed'

  if (!jaFechadoAgora) {
    const eventoId = await reivindicarFechamento(contrato.id, evento, origem)
    if (!eventoId) {
      // Outra chamada (webhook ou polling) já está fechando ou já fechou
      // este contrato — não repete o trabalho.
      return { status: contrato.clicksign_status, signed_url: contrato.clicksign_signed_url, idempotente: true }
    }

    try {
      // CAS: só transiciona se ainda estiver 'running' — defesa em
      // profundidade além da reivindicação acima, e impede regressão para
      // qualquer estado que não seja explicitamente esta transição.
      const { data: atualizado, error: erroCas } = await supabaseAdmin
        .from('processo_contratos')
        .update({ clicksign_status: 'closed', clicksign_assinado_em: new Date().toISOString() })
        .eq('id', contrato.id)
        .eq('empresa_id', contrato.empresa_id)
        .eq('clicksign_status', 'running')
        .select('id')
        .maybeSingle()

      if (erroCas) throw erroCas

      if (!atualizado) {
        // Perdeu a corrida: outro caminho já fechou entre a leitura e agora.
        await marcarEventoFechamento(eventoId, 'processado')
        return { status: 'closed', signed_url: contrato.clicksign_signed_url, idempotente: true }
      }

      jaFechadoAgora = true
      statusFinal = 'closed'
      await marcarEventoFechamento(eventoId, 'processado')
    } catch (err: any) {
      await marcarEventoFechamento(eventoId, 'falhou', err?.message ?? String(err))
      throw err
    }
  }

  // Busca/salva a URL assinada. Seguro de repetir mesmo sem reivindicação:
  // upsert no Storage, UPDATE apenas da própria coluna clicksign_signed_url.
  let signedUrl = contrato.clicksign_signed_url
  const envelopeId = contrato.clicksign_envelope_id ?? envelopeIdFallback ?? ''

  if (!signedUrl && contrato.clicksign_document_id && envelopeId) {
    try {
      const doc = await buscarDocumento(envelopeId, contrato.clicksign_document_id)
      if (doc.signed_url) {
        try {
          signedUrl = await salvarPdfAssinadoEmStorage(doc.signed_url, contrato.id, contrato.empresa_id)
        } catch (storageErr) {
          console.error('[clicksign] erro ao salvar PDF assinado no Storage, usando URL original:', storageErr)
          signedUrl = doc.signed_url
        }
        const { error: erroUrlUpdate } = await supabaseAdmin
          .from('processo_contratos')
          .update({ clicksign_signed_url: signedUrl })
          .eq('id', contrato.id)
          .eq('empresa_id', contrato.empresa_id)

        if (erroUrlUpdate) {
          console.error('[clicksign] falha ao gravar clicksign_signed_url (best-effort, ignorado):', erroUrlUpdate.message)
        }
      }
    } catch (e) {
      console.error('[clicksign] erro ao buscar documento assinado:', e)
    }
  }

  return { status: statusFinal, signed_url: signedUrl, idempotente: false }
}
