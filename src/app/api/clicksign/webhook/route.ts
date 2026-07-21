import { NextRequest, NextResponse } from 'next/server'
import { buscarDocumento } from '@/lib/clicksign/client'
import { salvarPdfAssinadoEmStorage } from '@/lib/clicksign/storage'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    console.log('[Clicksign webhook] payload recebido:', JSON.stringify(body))

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

    console.log('[Clicksign webhook] event:', event, '| documentKey:', documentKey, '| envelopeKey:', envelopeKey)

    if (!documentKey && !envelopeKey) {
      return NextResponse.json({ ok: true })
    }

    if (event === 'close' || event === 'auto_close' || event === 'document_closed') {
      // Busca por document_id primeiro (evento de documento), fallback por envelope_id
      let contrato: { id: string; empresa_id: string; clicksign_document_id: string | null; clicksign_envelope_id?: string | null } | null = null

      if (documentKey) {
        const res = await supabaseAdmin
          .from('processo_contratos')
          .select('id, empresa_id, clicksign_document_id, clicksign_envelope_id')
          .eq('clicksign_document_id', documentKey)
          .maybeSingle()
        contrato = res.data
      }

      if (!contrato && envelopeKey) {
        const res = await supabaseAdmin
          .from('processo_contratos')
          .select('id, empresa_id, clicksign_document_id, clicksign_envelope_id')
          .eq('clicksign_envelope_id', envelopeKey)
          .maybeSingle()
        contrato = res.data
      }

      if (!contrato) {
        console.warn('[Clicksign webhook] contrato não encontrado. documentKey:', documentKey, 'envelopeKey:', envelopeKey)
        return NextResponse.json({ ok: true })
      }

      const envelopeIdParaBusca = contrato.clicksign_envelope_id ?? envelopeKey ?? ''
      let signedUrl: string | null = null

      if (contrato.clicksign_document_id && envelopeIdParaBusca) {
        try {
          const doc = await buscarDocumento(envelopeIdParaBusca, contrato.clicksign_document_id)
          if (doc.signed_url) {
            try {
              signedUrl = await salvarPdfAssinadoEmStorage(
                doc.signed_url,
                contrato.id,
                contrato.empresa_id,
              )
            } catch (storageErr) {
              console.error('[webhook] Erro ao salvar PDF no Storage, usando URL original:', storageErr)
              signedUrl = doc.signed_url
            }
          }
        } catch (e) {
          console.error('[webhook] Erro ao buscar documento assinado:', e)
        }
      }

      await supabaseAdmin
        .from('processo_contratos')
        .update({
          clicksign_status: 'closed',
          clicksign_assinado_em: new Date().toISOString(),
          ...(signedUrl ? { clicksign_signed_url: signedUrl } : {}),
        })
        .eq('id', contrato.id)

      console.log('[Clicksign webhook] contrato atualizado:', contrato.id)
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('Erro webhook Clicksign:', err)
    // Sempre retorna 200 para o Clicksign não reenviar indefinidamente
    return NextResponse.json({ ok: true })
  }
}
