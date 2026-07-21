import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { buscarDocumento, buscarEnvelope } from '@/lib/clicksign/client'
import { salvarPdfAssinadoEmStorage } from '@/lib/clicksign/storage'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  try {
    // Autenticação via sessão do usuário logado
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    // Resolver empresa_id do usuário
    const { data: usuario } = await supabaseAdmin
      .from('usuarios')
      .select('empresa_id')
      .or(`auth_user_id.eq.${user.id},id.eq.${user.id}`)
      .eq('ativo', true)
      .single()

    if (!usuario?.empresa_id) {
      return NextResponse.json({ error: 'Usuário sem empresa vinculada' }, { status: 403 })
    }

    const { processo_contrato_id } = await req.json() as { processo_contrato_id?: string }

    if (!processo_contrato_id) {
      return NextResponse.json({ error: 'processo_contrato_id obrigatório' }, { status: 400 })
    }

    // Buscar contrato e validar que pertence à empresa do usuário logado
    const { data: contrato, error: contratoError } = await supabaseAdmin
      .from('processo_contratos')
      .select('id, empresa_id, clicksign_envelope_id, clicksign_document_id, clicksign_status, clicksign_signed_url')
      .eq('id', processo_contrato_id)
      .eq('empresa_id', usuario.empresa_id)
      .maybeSingle()

    if (contratoError || !contrato) {
      return NextResponse.json({ error: 'Contrato não encontrado' }, { status: 404 })
    }

    if (!contrato.clicksign_envelope_id) {
      return NextResponse.json({ status: contrato.clicksign_status ?? null })
    }

    // Consultar status atual do envelope diretamente no Clicksign
    const envelope = await buscarEnvelope(contrato.clicksign_envelope_id)

    const jaFechado = envelope.status === 'closed'
    const semUrlStorage = !contrato.clicksign_signed_url || contrato.clicksign_signed_url.includes('clicksign')
    const deveAtualizar = jaFechado && (contrato.clicksign_status !== 'closed' || semUrlStorage)

    if (deveAtualizar) {
      let signedUrl: string | null = null

      if (contrato.clicksign_document_id) {
        try {
          const doc = await buscarDocumento(contrato.clicksign_envelope_id, contrato.clicksign_document_id)
          if (doc.signed_url) {
            try {
              signedUrl = await salvarPdfAssinadoEmStorage(
                doc.signed_url,
                contrato.id,
                contrato.empresa_id,
              )
            } catch (storageErr) {
              console.error('[atualizar-status] Erro ao salvar PDF no Storage, usando URL original:', storageErr)
              signedUrl = doc.signed_url
            }
          }
        } catch (e) {
          console.error('[atualizar-status] Erro ao buscar documento assinado:', e)
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

      return NextResponse.json({ status: 'closed', signed_url: signedUrl })
    }

    return NextResponse.json({ status: envelope.status })
  } catch (err: any) {
    console.error('[atualizar-status] Erro:', err)
    return NextResponse.json({ error: err.message ?? 'Erro interno' }, { status: 500 })
  }
}
