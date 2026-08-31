import { NextRequest, NextResponse } from 'next/server'

// Endpoint público de recepção de formulários externos — o site institucional
// (WordPress/Elementor) e futuras landing pages não conseguem enviar o header
// x-webhook-secret que /api/leads/webhook exige, então esse endpoint funciona
// como uma casca fina e pública na frente dele: valida uma chave simples pela
// query string (suficiente pra evitar spam de robô, não é um segredo forte —
// não use pra nada que precise de autenticação real) e repassa a chamada,
// já autenticada, pro webhook central.
//
// Uso: POST /api/public/lead-form?source=site&empresa_id=<uuid>&key=<LEAD_FORM_PUBLIC_KEY>
// Body: { nome, email?, telefone, mensagem? }
//
// No Elementor: Ações após envio > Webhook > cola essa URL completa (com
// source/empresa_id/key já na query string) e mapeia os campos do formulário
// pros nomes nome/email/telefone/mensagem no corpo enviado.

const LEAD_FORM_PUBLIC_KEY = process.env.LEAD_FORM_PUBLIC_KEY ?? ''
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET ?? ''

export async function POST(request: NextRequest) {
  const key = request.nextUrl.searchParams.get('key')
  if (!LEAD_FORM_PUBLIC_KEY || key !== LEAD_FORM_PUBLIC_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const empresa_id = request.nextUrl.searchParams.get('empresa_id')
  const source = request.nextUrl.searchParams.get('source') ?? 'site'
  if (!empresa_id) {
    return NextResponse.json({ error: 'empresa_id ausente' }, { status: 400 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const { nome, email, telefone, mensagem } = body as {
    nome?: string
    email?: string
    telefone?: string
    mensagem?: string
  }

  if (!nome?.trim() || !telefone?.trim()) {
    return NextResponse.json({ error: 'nome e telefone são obrigatórios' }, { status: 422 })
  }

  const webhookUrl = new URL('/api/leads/webhook', process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000')
  webhookUrl.searchParams.set('source', source)

  const resposta = await fetch(webhookUrl.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-webhook-secret': WEBHOOK_SECRET },
    body: JSON.stringify({
      nome: nome.trim(),
      telefone: telefone.trim(),
      email: email?.trim() || undefined,
      empresa_id,
      observacoes: mensagem?.trim() || undefined,
    }),
  })

  if (!resposta.ok) {
    const erro = await resposta.text()
    console.error('[lead-form] Erro ao criar lead:', erro)
    return NextResponse.json({ error: 'Erro ao registrar contato' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
