import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  criarEnvelope,
  uploadDocumento,
  adicionarSignatario,
  adicionarRequirement,
  ativarEnvelope,
  notificarSignatarios,
} from '@/lib/clicksign/client'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      processo_contrato_id: string
      pdf_base64: string
      filename: string
      signatario_nome: string
      signatario_email: string
    }

    const { processo_contrato_id, pdf_base64, filename, signatario_nome, signatario_email } = body

    if (!processo_contrato_id || !pdf_base64 || !signatario_email) {
      return NextResponse.json({ error: 'Campos obrigatórios ausentes.' }, { status: 400 })
    }

    const empresaNome = process.env.CLICKSIGN_EMPRESA_NOME ?? 'Fontinhas Assessoria'
    const empresaEmail = process.env.CLICKSIGN_EMPRESA_EMAIL ?? ''

    if (!empresaEmail) {
      return NextResponse.json({ error: 'CLICKSIGN_EMPRESA_EMAIL não configurado.' }, { status: 500 })
    }

    // 1. Criar envelope
    const envelopeId = await criarEnvelope(filename.replace('.pdf', ''))

    // 2. Upload do documento
    const documentId = await uploadDocumento(envelopeId, pdf_base64, filename)

    // 3. Adicionar signatários
    const signerClienteId = await adicionarSignatario(envelopeId, {
      nome: signatario_nome,
      email: signatario_email,
    })
    const signerEmpresaId = await adicionarSignatario(envelopeId, {
      nome: empresaNome,
      email: empresaEmail,
    })

    // 4. Requisitos com ordem sequencial: cliente (1) → empresa (2)
    await adicionarRequirement(envelopeId, documentId, signerClienteId, 1)
    await adicionarRequirement(envelopeId, documentId, signerEmpresaId, 2)

    // 5. Ativar e notificar
    await ativarEnvelope(envelopeId)
    await notificarSignatarios(envelopeId)

    // 6. Salvar no banco
    const { error: dbError } = await supabaseAdmin
      .from('processo_contratos')
      .update({
        clicksign_envelope_id: envelopeId,
        clicksign_document_id: documentId,
        clicksign_status: 'running',
        clicksign_enviado_em: new Date().toISOString(),
      })
      .eq('id', processo_contrato_id)

    if (dbError) {
      console.error('Erro ao salvar Clicksign no banco:', dbError)
    }

    return NextResponse.json({ ok: true, envelope_id: envelopeId })
  } catch (err: any) {
    console.error('Erro Clicksign enviar:', err)
    return NextResponse.json({ error: err.message ?? 'Erro interno.' }, { status: 500 })
  }
}
