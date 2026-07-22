import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { podeExecutar } from '@/lib/auth/permissions'
import {
  criarEnvelope,
  uploadDocumento,
  adicionarSignatario,
  adicionarRequistoQualificacao,
  adicionarRequisitoAutenticacao,
  ativarEnvelope,
  notificarSignatarios,
} from '@/lib/clicksign/client'

export async function POST(req: NextRequest) {
  try {
    // 1-2. Sessão autenticada — sem ela, 401.
    const supabase = await createServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    // 3-4. Usuário interno ativo (empresa_id + perfil) — mesmo padrão de
    // formularios/route.ts. Sessão válida sem usuário interno ativo é 403,
    // não 401 (a sessão em si é legítima; falta vínculo/ativação interna).
    const { data: usuario } = await supabaseAdmin
      .from('usuarios')
      .select('empresa_id, perfil')
      .or(`auth_user_id.eq.${user.id},id.eq.${user.id}`)
      .eq('ativo', true)
      .single()

    if (!usuario?.empresa_id) {
      return NextResponse.json({ error: 'Usuário sem empresa vinculada' }, { status: 403 })
    }

    // 5-6. Permissão para enviar contrato à assinatura.
    if (!podeExecutar(usuario.perfil, 'processos.editar')) {
      return NextResponse.json({ error: 'Sem permissão para enviar contrato para assinatura' }, { status: 403 })
    }

    const body = await req.json() as {
      processo_contrato_id: string
      pdf_base64: string
      filename: string
      // Campos legados — podem continuar chegando por compatibilidade com o
      // front atual, mas nunca são usados: nome/e-mail do signatário são
      // sempre resolvidos no servidor a partir do comprador principal.
      signatario_nome?: string
      signatario_email?: string
    }

    const { processo_contrato_id, pdf_base64, filename } = body

    if (!processo_contrato_id || !pdf_base64) {
      return NextResponse.json({ error: 'Campos obrigatórios ausentes.' }, { status: 400 })
    }

    // Busca o contrato já escopado por empresa — contrato inexistente ou de
    // outra empresa recebe a mesma resposta (404), sem revelar qual dos dois casos ocorreu.
    const { data: contrato } = await supabaseAdmin
      .from('processo_contratos')
      .select('id, processo_id, empresa_id')
      .eq('id', processo_contrato_id)
      .eq('empresa_id', usuario.empresa_id)
      .maybeSingle()

    if (!contrato) {
      return NextResponse.json({ error: 'Contrato não encontrado' }, { status: 404 })
    }

    // Comprador principal resolvido no servidor (mesmo padrão de
    // formularios/route.ts) — nome/e-mail do signatário nunca vêm do body.
    const { data: comprador } = await supabaseAdmin
      .from('processo_compradores')
      .select('nome, email')
      .eq('processo_id', contrato.processo_id)
      .eq('empresa_id', contrato.empresa_id)
      .eq('principal', true)
      .maybeSingle()

    if (!comprador?.nome || !comprador?.email) {
      return NextResponse.json(
        { error: 'Comprador principal sem nome ou e-mail cadastrado. Cadastre antes de enviar para assinatura.' },
        { status: 400 },
      )
    }

    // Signatário da empresa: já vinha de configuração do servidor (variáveis
    // de ambiente), nunca do body — preservado sem alteração.
    const empresaNome = process.env.CLICKSIGN_EMPRESA_NOME ?? 'Fontinhas Assessoria'
    const empresaEmail = process.env.CLICKSIGN_EMPRESA_EMAIL ?? ''

    if (!empresaEmail) {
      return NextResponse.json({ error: 'CLICKSIGN_EMPRESA_EMAIL não configurado.' }, { status: 500 })
    }

    // Só a partir daqui há qualquer chamada externa ao Clicksign.
    // 1. Criar envelope
    const envelopeId = await criarEnvelope(filename.replace('.pdf', ''))

    // 2. Upload do documento
    const documentId = await uploadDocumento(envelopeId, pdf_base64, filename)

    // 3. Adicionar signatários (dados resolvidos no servidor acima)
    const signerClienteId = await adicionarSignatario(envelopeId, {
      nome: comprador.nome,
      email: comprador.email,
    })
    const signerEmpresaId = await adicionarSignatario(envelopeId, {
      nome: empresaNome,
      email: empresaEmail,
    })

    // 4. Requisitos: qualificação (assinar) + autenticação (e-mail) para cada signatário
    await adicionarRequistoQualificacao(envelopeId, documentId, signerClienteId)
    await adicionarRequisitoAutenticacao(envelopeId, documentId, signerClienteId)
    await adicionarRequistoQualificacao(envelopeId, documentId, signerEmpresaId)
    await adicionarRequisitoAutenticacao(envelopeId, documentId, signerEmpresaId)

    // 5. Ativar e notificar
    await ativarEnvelope(envelopeId)
    await notificarSignatarios(envelopeId)

    // 6. Salvar no banco — defesa em profundidade: reaplica empresa_id no
    // update final, não reutiliza só o id bruto recebido no body.
    const { error: dbError } = await supabaseAdmin
      .from('processo_contratos')
      .update({
        clicksign_envelope_id: envelopeId,
        clicksign_document_id: documentId,
        clicksign_status: 'running',
        clicksign_enviado_em: new Date().toISOString(),
      })
      .eq('id', contrato.id)
      .eq('empresa_id', usuario.empresa_id)

    if (dbError) {
      console.error('Erro ao salvar Clicksign no banco:', dbError)
    }

    return NextResponse.json({ ok: true, envelope_id: envelopeId })
  } catch (err: any) {
    console.error('Erro Clicksign enviar:', err)
    return NextResponse.json({ error: err.message ?? 'Erro interno.' }, { status: 500 })
  }
}
