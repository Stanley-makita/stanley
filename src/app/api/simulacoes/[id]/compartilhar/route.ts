import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { ResultadoCompleto } from '@/lib/simuladorFinanciamento/tipos'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

async function resolveUsuario(token: string) {
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return null
  const { data: usuario } = await supabase
    .from('usuarios')
    .select('id, empresa_id, nome')
    .eq('auth_user_id', user.id)
    .single()
  return usuario ?? null
}

function normalizarTelefone(tel: string): string {
  const digits = tel.replace(/\D/g, '')
  if (digits.startsWith('55') && digits.length >= 12) return digits
  return `55${digits}`
}

async function gerarCustasBuffer(json: Record<string, unknown>): Promise<Buffer> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const BRL = (n: number) =>
    n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  const mL = 15; const mR = 15; const W = 210; const usableW = W - mL - mR
  let y = 20

  doc.setFillColor(37, 59, 41)
  doc.rect(mL, y, usableW, 12, 'F')
  doc.setFontSize(13)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(255, 255, 255)
  doc.text('Simulação de Custas — Fonti Sistema de Crédito', mL + 4, y + 8)
  y += 20

  const entrada = json.entrada as Record<string, unknown> | undefined
  if (entrada) {
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(80, 80, 80)
    if (entrada.cidade) doc.text(`Cidade: ${entrada.cidade}`, mL, y)
    if (typeof entrada.valorCV === 'number') doc.text(`C&V: ${BRL(entrada.valorCV)}`, mL + 60, y)
    if (typeof entrada.valorFinanciado === 'number') doc.text(`Financiado: ${BRL(entrada.valorFinanciado)}`, mL + 110, y)
    y += 10
  }

  const linhas = json.linhas as Array<{ label: string; comDesconto: number; visivel: boolean }> | undefined
  const visiveis = linhas?.filter(l => l.visivel) ?? []

  if (visiveis.length > 0) {
    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    doc.setFillColor(37, 59, 41)
    doc.rect(mL, y, usableW, 7, 'F')
    doc.setTextColor(255, 255, 255)
    doc.text('Item', mL + 2, y + 5)
    doc.text('Valor', W - mR - 2, y + 5, { align: 'right' })
    y += 9

    doc.setFont('helvetica', 'normal')
    doc.setTextColor(40, 40, 40)
    for (const l of visiveis) {
      doc.setFontSize(8)
      doc.text(l.label, mL + 2, y + 4)
      doc.text(BRL(l.comDesconto), W - mR - 2, y + 4, { align: 'right' })
      doc.setDrawColor(220, 220, 220)
      doc.line(mL, y + 7, W - mR, y + 7)
      y += 8
    }
    y += 4
  }

  const totalCom = typeof json.totalComDesconto === 'number' ? json.totalComDesconto : null
  const totalSem = typeof json.totalSemDesconto === 'number' ? json.totalSemDesconto : null

  if (totalCom !== null || totalSem !== null) {
    doc.setFillColor(231, 224, 196)
    doc.rect(mL, y, usableW, 14, 'F')
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(37, 59, 41)
    if (totalSem !== null) {
      doc.text(`Total sem desconto: ${BRL(totalSem)}`, mL + 4, y + 5)
    }
    if (totalCom !== null) {
      doc.setFontSize(11)
      doc.text(`Total com desconto: ${BRL(totalCom)}`, mL + 4, y + 12)
    }
  }

  return Buffer.from(doc.output('arraybuffer'))
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '').trim() ?? ''
  const usuario = await resolveUsuario(token)
  if (!usuario) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const simulacaoId = params.id

  let body: { tipo: 'financiamento' | 'custas'; telefone: string; mensagem?: string; nome_destino?: string }
  try { body = await request.json() }
  catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const { tipo, telefone, mensagem, nome_destino } = body
  if (!telefone) return NextResponse.json({ error: 'telefone é obrigatório' }, { status: 422 })
  if (!tipo) return NextResponse.json({ error: 'tipo é obrigatório' }, { status: 422 })

  // ── Buscar simulação ───────────────────────────────────────────────────────
  let resultadoJson: Record<string, unknown> | null = null
  let leadId: string | null = null
  let processoId: string | null = null
  let nomeCliente: string | null = null
  let nomeSim: string = 'Simulação'

  if (tipo === 'financiamento') {
    const { data: sim, error } = await supabase
      .from('simulacoes_central')
      .select('resultado_json, lead_id, processo_id, nome_cliente, banco')
      .eq('id', simulacaoId)
      .eq('tipo', 'financiamento')
      .single()

    if (error || !sim) return NextResponse.json({ error: 'Simulação não encontrada' }, { status: 404 })

    // Verifica autorização via lead ou empresa
    if (sim.lead_id) {
      const { data: lead } = await supabase.from('leads').select('empresa_id').eq('id', sim.lead_id).single()
      if (lead?.empresa_id !== usuario.empresa_id) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
    }

    resultadoJson = sim.resultado_json as Record<string, unknown>
    leadId = sim.lead_id
    processoId = sim.processo_id
    nomeCliente = sim.nome_cliente
    nomeSim = `Simulação Financiamento${sim.banco ? ` — ${sim.banco}` : ''}${nomeCliente ? ` | ${nomeCliente}` : ''}`
  } else {
    // custas → processo_custas_simulacoes
    const { data: sim, error } = await supabase
      .from('processo_custas_simulacoes')
      .select('resultado_json, lead_id, processo_id, banco_nome')
      .eq('id', simulacaoId)
      .single()

    if (error || !sim) return NextResponse.json({ error: 'Simulação não encontrada' }, { status: 404 })

    if (sim.lead_id) {
      const { data: lead } = await supabase.from('leads').select('empresa_id').eq('id', sim.lead_id).single()
      if (lead?.empresa_id !== usuario.empresa_id) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })
    }

    resultadoJson = sim.resultado_json as Record<string, unknown>
    leadId = sim.lead_id
    processoId = sim.processo_id
    nomeSim = `Simulação de Custas${sim.banco_nome ? ` — ${sim.banco_nome}` : ''}`
  }

  if (!resultadoJson) return NextResponse.json({ error: 'Dados da simulação ausentes' }, { status: 422 })

  // ── Gerar PDF buffer ───────────────────────────────────────────────────────
  let pdfBuffer: Buffer
  try {
    if (tipo === 'financiamento') {
      const { gerarPDFFinanciamentoBuffer } = await import('@/lib/simuladorFinanciamento/gerarPDFBuffer')
      pdfBuffer = await gerarPDFFinanciamentoBuffer(resultadoJson as unknown as ResultadoCompleto, {
        clienteNome: nomeCliente ?? undefined,
        responsavelNome: usuario.nome,
      })
    } else {
      pdfBuffer = await gerarCustasBuffer(resultadoJson)
    }
  } catch (err) {
    console.error('[compartilhar-sim] Erro ao gerar PDF:', err)
    return NextResponse.json({ error: 'Erro ao gerar PDF da simulação.' }, { status: 500 })
  }

  if (pdfBuffer.byteLength > 25_000_000) {
    return NextResponse.json({ error: 'PDF muito grande para enviar pelo WhatsApp (máx 25 MB).' }, { status: 413 })
  }

  const base64 = pdfBuffer.toString('base64')
  const telefoneFormatado = normalizarTelefone(telefone)
  const dígitosDestino = telefoneFormatado.replace('55', '')

  // ── Resolver instância WhatsApp ────────────────────────────────────────────
  const { data: conversa } = await supabase
    .from('conversas')
    .select('id, instancia_id')
    .eq('empresa_id', usuario.empresa_id)
    .or(`contato_telefone.ilike.%${dígitosDestino}%,contato_telefone.eq.${telefoneFormatado}`)
    .eq('arquivada', false)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let instanceToken = process.env.UAZAPI_INSTANCE_TOKEN ?? ''
  if (conversa?.instancia_id) {
    const { data: inst } = await supabase
      .from('instancias').select('token').eq('id', conversa.instancia_id).eq('ativo', true).maybeSingle()
    if (inst?.token) instanceToken = inst.token
  } else {
    const { data: inst } = await supabase
      .from('instancias').select('token').eq('empresa_id', usuario.empresa_id).eq('ativo', true)
      .order('created_at', { ascending: true }).limit(1).maybeSingle()
    if (inst?.token) instanceToken = inst.token
  }

  // ── Enviar via Uazapi ──────────────────────────────────────────────────────
  const nomeArquivo = `${nomeSim}.pdf`
  const uazapiBody: Record<string, unknown> = {
    number: telefoneFormatado,
    type: 'document',
    file: base64,
    docName: nomeArquivo,
    track_source: 'crm-humano',
  }
  if (mensagem?.trim()) uazapiBody.text = mensagem.trim()

  let uazapiResult: Record<string, unknown> = {}
  try {
    const res = await fetch(`${process.env.UAZAPI_API_URL}/send/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'token': instanceToken },
      body: JSON.stringify(uazapiBody),
    })
    if (!res.ok) {
      const txt = await res.text()
      console.error('[compartilhar-sim] Uazapi error:', res.status, txt)
      return NextResponse.json({ error: 'Falha ao enviar via WhatsApp. Tente novamente.' }, { status: 502 })
    }
    uazapiResult = await res.json()
  } catch (err) {
    console.error('[compartilhar-sim] Uazapi exception:', err)
    return NextResponse.json({ error: 'Falha ao enviar via WhatsApp. Tente novamente.' }, { status: 502 })
  }

  const conversaId = conversa?.id ?? null

  // ── Salvar mensagem na conversa ────────────────────────────────────────────
  if (conversaId) {
    await supabase.from('mensagens').insert({
      conversa_id: conversaId,
      origem:      'humano',
      conteudo:    mensagem?.trim() ?? '',
      metadata: {
        tipo_midia:        'document',
        uazapi_message_id: uazapiResult?.messageid ?? null,
        nome_arquivo:      nomeArquivo,
        atendente:         usuario.nome,
      },
    })
    await supabase.from('conversas').update({ updated_at: new Date().toISOString() }).eq('id', conversaId)
  }

  // ── Histórico do lead ──────────────────────────────────────────────────────
  const destino = nome_destino?.trim() ? nome_destino.trim() : telefone
  const textoHistorico = `Simulação "${nomeSim}" enviada para ${destino} via WhatsApp.`

  if (leadId) {
    await supabase.from('lead_historico').insert({
      lead_id:    leadId,
      empresa_id: usuario.empresa_id,
      usuario_id: usuario.id,
      tipo:       'comentario',
      descricao:  textoHistorico,
    })
  }
  if (processoId) {
    await supabase.from('processo_comentarios').insert({
      empresa_id:        usuario.empresa_id,
      processo_id:       processoId,
      usuario_id:        usuario.id,
      tipo:              'alteracao',
      texto:             textoHistorico,
      notificar_cliente: false,
    })
  }

  return NextResponse.json({ ok: true, conversa_id: conversaId })
}
