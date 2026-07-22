import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { buscarEnvelope } from '@/lib/clicksign/client'
import { processarFechamentoContratoClicksign } from '@/lib/clicksign/processarFechamento'
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
      .select('id, empresa_id, clicksign_status, clicksign_document_id, clicksign_envelope_id, clicksign_signed_url')
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

    if (envelope.status !== 'closed') {
      return NextResponse.json({ status: envelope.status })
    }

    // Envelope fechado na ClickSign — delega à função comum (mesma usada pelo
    // webhook), que decide sozinha se há trabalho novo a fazer (idempotente
    // se outro caminho já fechou este contrato).
    const resultado = await processarFechamentoContratoClicksign({
      contrato,
      origem: 'polling',
      evento: 'polling_verificacao',
    })

    return NextResponse.json({ status: resultado.status ?? 'closed', signed_url: resultado.signed_url })
  } catch (err: any) {
    console.error('[atualizar-status] Erro:', err)
    return NextResponse.json({ error: err.message ?? 'Erro interno' }, { status: 500 })
  }
}
