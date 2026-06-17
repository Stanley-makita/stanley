import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const BASE_URL = (process.env.CLICKSIGN_API_URL || 'https://app.clicksign.com/api/v3').replace(/\/$/, '')
const TOKEN = (process.env.CLICKSIGN_API_TOKEN || '').trim()

// GET /api/clicksign/debug-doc?contrato_id=UUID
// Retorna o response RAW do Clicksign para diagnóstico
export async function GET(req: NextRequest) {
  const contratoId = req.nextUrl.searchParams.get('contrato_id')
  if (!contratoId) {
    return NextResponse.json({ error: 'contrato_id obrigatório' }, { status: 400 })
  }

  const { data: contrato } = await supabaseAdmin
    .from('processo_contratos')
    .select('clicksign_envelope_id, clicksign_document_id, clicksign_status')
    .eq('id', contratoId)
    .maybeSingle()

  if (!contrato?.clicksign_envelope_id) {
    // Listar todos os contratos com Clicksign para ajudar a encontrar o ID correto
    const { data: todos } = await supabaseAdmin
      .from('processo_contratos')
      .select('id, titulo, clicksign_status, clicksign_envelope_id, clicksign_signed_url')
      .not('clicksign_envelope_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(10)

    return NextResponse.json({
      error: 'ID não encontrado ou sem envelope Clicksign',
      contrato_id_recebido: contratoId,
      contratos_com_clicksign: todos ?? [],
    }, { status: 404 })
  }

  const results: Record<string, any> = {
    contrato: {
      envelope_id: contrato.clicksign_envelope_id,
      document_id: contrato.clicksign_document_id,
      status: contrato.clicksign_status,
    },
  }

  // Endpoint 1: GET /envelopes/{id}
  try {
    const r1 = await fetch(`${BASE_URL}/envelopes/${contrato.clicksign_envelope_id}?access_token=${TOKEN}`, {
      headers: { Authorization: TOKEN, Accept: 'application/vnd.api+json' },
    })
    results.envelope = await r1.json()
  } catch (e: any) {
    results.envelope_error = e.message
  }

  // Endpoint 2: GET /envelopes/{id}/documents/{docId}
  if (contrato.clicksign_document_id) {
    try {
      const r2 = await fetch(
        `${BASE_URL}/envelopes/${contrato.clicksign_envelope_id}/documents/${contrato.clicksign_document_id}?access_token=${TOKEN}`,
        { headers: { Authorization: TOKEN, Accept: 'application/vnd.api+json' } },
      )
      results.document = await r2.json()
    } catch (e: any) {
      results.document_error = e.message
    }
  }

  return NextResponse.json(results)
}
