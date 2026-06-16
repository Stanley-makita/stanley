import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { buscarDocumento } from '@/lib/clicksign/client'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const envelopeId: string | undefined =
      body?.data?.id ??
      body?.envelope?.id ??
      body?.id

    const event: string | undefined =
      body?.event?.name ??
      body?.name ??
      body?.type

    if (!envelopeId) {
      return NextResponse.json({ ok: true })
    }

    if (event === 'close' || event === 'envelope_closed') {
      const { data: contrato, error: findError } = await supabaseAdmin
        .from('processo_contratos')
        .select('id, clicksign_document_id')
        .eq('clicksign_envelope_id', envelopeId)
        .maybeSingle()

      if (findError || !contrato) {
        console.warn('Webhook Clicksign: envelope não encontrado:', envelopeId)
        return NextResponse.json({ ok: true })
      }

      let signedUrl: string | null = null

      if (contrato.clicksign_document_id) {
        try {
          const doc = await buscarDocumento(envelopeId, contrato.clicksign_document_id)
          signedUrl = doc.signed_url
        } catch (e) {
          console.error('Erro ao buscar documento assinado:', e)
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
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('Erro webhook Clicksign:', err)
    // Sempre retorna 200 para o Clicksign não reenviar indefinidamente
    return NextResponse.json({ ok: true })
  }
}
