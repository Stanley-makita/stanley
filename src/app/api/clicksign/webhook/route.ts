import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { verificarAssinaturaWebhook } from '@/lib/clicksign/verificarAssinaturaWebhook'
import { processarFechamentoContratoClicksign } from '@/lib/clicksign/processarFechamento'

const EVENTOS_FECHAMENTO = ['close', 'auto_close', 'document_closed']

export async function POST(req: NextRequest) {
  // Body bruto capturado ANTES do parse — a assinatura da ClickSign
  // (Content-Hmac) é calculada sobre o texto exatamente como recebido; depois
  // de req.json() esse texto original já teria sido descartado.
  const rawBody = await req.text()

  // ============================================================
  // MODO TRANSITÓRIO (Sprint Segurança Documental — Branch 0B).
  // Remover este bloco (e o `else` de aviso) assim que
  // CLICKSIGN_WEBHOOK_SECRET estiver configurada em produção e um evento
  // real tiver sido validado com sucesso. Até lá, a ausência da variável
  // significa que o novo webhook (com secret) ainda não foi criado na
  // ClickSign — aceitar sem validar evita interromper contratos em
  // andamento, mas cada requisição aceita neste modo gera um alerta
  // explícito nos logs.
  const secret = process.env.CLICKSIGN_WEBHOOK_SECRET
  if (secret) {
    const verificacao = verificarAssinaturaWebhook(rawBody, req.headers.get('content-hmac'), secret)
    if (!verificacao.valido) {
      console.error('[clicksign webhook] assinatura inválida — requisição rejeitada. motivo:', verificacao.motivo)
      return NextResponse.json({ error: 'Assinatura inválida' }, { status: 401 })
    }
  } else {
    console.warn(
      '[clicksign webhook] ATENÇÃO: CLICKSIGN_WEBHOOK_SECRET não configurada — aceitando webhook SEM validar ' +
      'autenticidade (modo transitório da migração da Branch 0B). Configure a variável e valide um evento real ' +
      'assim que possível.'
    )
  }
  // FIM DO MODO TRANSITÓRIO
  // ============================================================

  try {
    const body = JSON.parse(rawBody)

    const event: string | undefined =
      body?.event?.name ??
      body?.name ??
      body?.type

    // Clicksign v3 envia eventos de DOCUMENTO — chave em event.data.document.id
    const documentKey: string | undefined =
      body?.event?.data?.document?.id ??
      body?.event?.data?.document?.key ??
      body?.document?.id ??
      body?.document?.key

    // Fallback: evento de envelope
    const envelopeKey: string | undefined =
      body?.event?.data?.envelope?.id ??
      body?.data?.id ??
      body?.envelope?.id ??
      body?.id

    console.log('[clicksign webhook] event:', event, '| documentKey:', documentKey, '| envelopeKey:', envelopeKey)

    if (!documentKey && !envelopeKey) {
      return NextResponse.json({ ok: true })
    }

    if (!event || !EVENTOS_FECHAMENTO.includes(event)) {
      return NextResponse.json({ ok: true })
    }

    // Busca por document_id primeiro (evento de documento), fallback por envelope_id
    let contrato: {
      id: string
      empresa_id: string
      clicksign_status: string | null
      clicksign_document_id: string | null
      clicksign_envelope_id: string | null
      clicksign_signed_url: string | null
    } | null = null

    if (documentKey) {
      const res = await supabaseAdmin
        .from('processo_contratos')
        .select('id, empresa_id, clicksign_status, clicksign_document_id, clicksign_envelope_id, clicksign_signed_url')
        .eq('clicksign_document_id', documentKey)
        .maybeSingle()
      contrato = res.data
    }

    if (!contrato && envelopeKey) {
      const res = await supabaseAdmin
        .from('processo_contratos')
        .select('id, empresa_id, clicksign_status, clicksign_document_id, clicksign_envelope_id, clicksign_signed_url')
        .eq('clicksign_envelope_id', envelopeKey)
        .maybeSingle()
      contrato = res.data
    }

    if (!contrato) {
      console.warn('[clicksign webhook] contrato não encontrado para o evento recebido')
      return NextResponse.json({ ok: true })
    }

    await processarFechamentoContratoClicksign({
      contrato,
      origem: 'webhook',
      evento: event,
      envelopeIdFallback: envelopeKey ?? null,
    })

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[clicksign webhook] erro ao processar evento:', err?.message ?? err)
    // Sempre retorna 200 para a Clicksign não reenviar indefinidamente um
    // payload que nunca vai processar (ex.: JSON malformado).
    return NextResponse.json({ ok: true })
  }
}
