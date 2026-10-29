import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase/admin'
import { autenticarRota } from '@/lib/documentos/vinculosServidor'
import { carregarRecibo } from '@/lib/financeiro/reciboServidor'
import { gerarReciboPdf, numeroRecibo } from '@/lib/financeiro/recibo'
import { variantesTelefoneBR } from '@/lib/telefone'
import { buscarInstanciaTokenEmpresa, enviarPDFUazapi, resolverInstanceToken } from '@/lib/workflows/uazapi-helpers'

type Params = { params: { id: string; lancamentoId: string } }

// GET          → PDF do recibo (pré-visualizar/baixar)
// GET ?dados=1 → JSON com os padrões do modal (titular, telefone, nome/CPF salvos)
export async function GET(request: NextRequest, { params }: Params) {
  const ctx = await autenticarRota(request)
  if (ctx instanceof NextResponse) return ctx

  const r = await carregarRecibo(ctx, params.id, params.lancamentoId)
  if (r instanceof NextResponse) return r

  if (request.nextUrl.searchParams.get('dados')) {
    return NextResponse.json({
      numero: numeroRecibo(r.dados.numero),
      titular: r.titular,
      telefoneTitular: r.telefoneTitular,
      reciboNome: r.reciboNome,
      reciboCpf: r.reciboCpf,
    })
  }

  const pdf = await gerarReciboPdf(r.dados)
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="recibo-${numeroRecibo(r.dados.numero)}.pdf"`,
      'Cache-Control': 'no-store',
    },
  })
}

// POST { telefone } → envia o PDF pelo WhatsApp e registra no histórico do negócio.
export async function POST(request: NextRequest, { params }: Params) {
  const ctx = await autenticarRota(request)
  if (ctx instanceof NextResponse) return ctx

  let body: { telefone?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }
  const digitos = (body.telefone ?? '').replace(/\D/g, '')
  if (digitos.length < 10) return NextResponse.json({ error: 'Informe um telefone com DDD.' }, { status: 422 })

  const r = await carregarRecibo(ctx, params.id, params.lancamentoId)
  if (r instanceof NextResponse) return r

  const variantes = variantesTelefoneBR(digitos)
  const { data: conversa } = await supabase
    .from('conversas')
    .select('id')
    .eq('empresa_id', ctx.usuario.empresa_id)
    .in('contato_telefone', variantes)
    .order('updated_at', { ascending: false })
    .limit(1)
    .abortSignal(AbortSignal.timeout(10_000))
    .maybeSingle()

  const token = conversa
    ? await resolverInstanceToken(supabase, (conversa as { id: string }).id)
    : await buscarInstanciaTokenEmpresa(supabase, ctx.usuario.empresa_id)

  const numero = numeroRecibo(r.dados.numero)
  try {
    const pdf = await gerarReciboPdf(r.dados)
    await enviarPDFUazapi(variantes[0], pdf, token, `Recibo ${numero}.pdf`)
  } catch (err) {
    console.error('[recibo] falha ao enviar:', err)
    return NextResponse.json({ error: 'Falha ao enviar pelo WhatsApp. Tente novamente.' }, { status: 502 })
  }

  await supabase.from('processo_comentarios').insert({
    empresa_id: ctx.usuario.empresa_id,
    processo_id: params.id,
    usuario_id: ctx.usuario.id,
    tipo: 'alteracao',
    texto: `Recibo nº ${numero} (${r.dados.descricao}) enviado por WhatsApp para ${r.dados.pagadorNome} (${variantes[0]}).`,
    notificar_cliente: false,
  })

  return NextResponse.json({ ok: true })
}
