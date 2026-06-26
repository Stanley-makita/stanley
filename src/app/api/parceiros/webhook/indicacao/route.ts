import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  buscarPessoaPorCpf,
  buscarPessoaPorTelefone,
  buscarOuCriarPessoa,
} from '@/lib/pessoa'

// Webhook para indicações via QR Code / N8N — Campanha Folder Consórcio Itaú
// Produto criado: sempre Consórcio. Subtipo varia por interesse_cliente.
// Auth: x-webhook-secret === process.env.WEBHOOK_SECRET
// POST /api/parceiros/webhook/indicacao

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET ?? ''

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = createClient<any>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type InteresseCliente = 'consorcio_imobiliario' | 'consorcio_veiculo' | 'nao_sabe'

interface IndicacaoPayload {
  empresa_id:          string
  telefone_remetente:  string
  nome_parceiro:       string
  cpf_parceiro?:       string
  imobiliaria?:        string
  nome_cliente:        string
  telefone_cliente:    string
  interesse_cliente:   InteresseCliente
  origem?:             string
  data_hora?:          string
}

export async function POST(request: NextRequest) {
  const secret = request.headers.get('x-webhook-secret')
  if (!secret || secret !== WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: IndicacaoPayload
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const {
    empresa_id,
    telefone_remetente,
    nome_parceiro,
    cpf_parceiro,
    imobiliaria,
    nome_cliente,
    telefone_cliente,
    interesse_cliente,
  } = body

  if (!empresa_id || !telefone_remetente || !nome_parceiro || !nome_cliente || !telefone_cliente) {
    return NextResponse.json(
      { error: 'empresa_id, telefone_remetente, nome_parceiro, nome_cliente e telefone_cliente são obrigatórios' },
      { status: 422 }
    )
  }

  // Registra log inicial — atualizado ao final com resultado
  const { data: logEntry } = await supabase
    .from('webhook_logs')
    .insert({
      empresa_id,
      endpoint:  '/api/parceiros/webhook/indicacao',
      payload:   body,
      status:    'processando',
    })
    .select('id')
    .single()

  const logId = logEntry?.id as string | undefined

  async function finalizarLog(
    status: 'sucesso' | 'erro' | 'ignorado',
    extra: Record<string, unknown> = {}
  ) {
    if (!logId) return
    await supabase.from('webhook_logs').update({ status, ...extra }).eq('id', logId)
  }

  try {
    // ── Validar empresa e obter primeira fase ─────────────────────────────────

    const { data: primeiraFase } = await supabase
      .from('fases')
      .select('id')
      .eq('empresa_id', empresa_id)
      .eq('ativo', true)
      .order('ordem', { ascending: true })
      .limit(1)
      .single()

    if (!primeiraFase) {
      await finalizarLog('erro', { erro_mensagem: 'Empresa não encontrada ou sem fases configuradas' })
      return NextResponse.json(
        { error: 'Empresa não encontrada ou sem fases configuradas' },
        { status: 404 }
      )
    }

    // ── Parceiro: busca por CPF (forte) → telefone → cria ────────────────────

    let pessoaParceiroId: string

    if (cpf_parceiro) {
      const porCpf = await buscarPessoaPorCpf(empresa_id, cpf_parceiro)
      if (porCpf) {
        pessoaParceiroId = porCpf
        await supabase.from('pessoa_telefones').upsert(
          {
            pessoa_id: porCpf,
            empresa_id,
            telefone:  telefone_remetente,
            principal: false,
            whatsapp:  true,
            ativo:     true,
          },
          { onConflict: 'pessoa_id,telefone' }
        )
      } else {
        pessoaParceiroId = await criarPessoaParceiro(
          empresa_id, nome_parceiro, telefone_remetente, cpf_parceiro
        )
      }
    } else {
      const porTel = await buscarPessoaPorTelefone(empresa_id, telefone_remetente)
      pessoaParceiroId = porTel
        ?? await criarPessoaParceiro(empresa_id, nome_parceiro, telefone_remetente)
    }

    // ── Parceiro: busca ou cria registro em parceiros ─────────────────────────

    const { data: parceiroExistente } = await supabase
      .from('parceiros')
      .select('id')
      .eq('empresa_id', empresa_id)
      .eq('pessoa_id', pessoaParceiroId)
      .maybeSingle()

    let parceiroId: string

    if (parceiroExistente) {
      parceiroId = parceiroExistente.id as string
    } else {
      const temImob = !!imobiliaria &&
        imobiliaria.trim() !== '' &&
        imobiliaria.toLowerCase() !== 'não' &&
        imobiliaria.toLowerCase() !== 'nao'

      const { data: novoParceiro, error: parceiroErr } = await supabase
        .from('parceiros')
        .insert({
          empresa_id,
          pessoa_id:       pessoaParceiroId,
          nome:            nome_parceiro,
          telefone:        telefone_remetente,
          tipo:            'pessoa_fisica',
          tipo_parceiro:   temImob ? 'corretor' : 'indicador',
          imobiliaria:     temImob ? imobiliaria : null,
          origem_cadastro: 'qr_code',
          cpf_cnpj:        cpf_parceiro ? cpf_parceiro.replace(/\D/g, '') : null,
          ativo:           true,
        })
        .select('id')
        .single()

      if (parceiroErr || !novoParceiro) {
        throw new Error(`Erro ao criar parceiro: ${parceiroErr?.message}`)
      }
      parceiroId = novoParceiro.id as string
    }

    // ── Cliente: busca ou cria Pessoa ─────────────────────────────────────────

    const pessoaClienteId = await buscarOuCriarPessoa(
      empresa_id, telefone_cliente, nome_cliente
    )

    // ── Lead: deduplicação — aberto = não deletado e não convertido ───────────

    const { data: leadExistente } = await supabase
      .from('leads')
      .select('id, parceiro_id, canal, campanha, produto_subtipo')
      .eq('empresa_id', empresa_id)
      .eq('pessoa_id', pessoaClienteId)
      .eq('produto_interesse', 'consorcio')
      .is('deleted_at', null)
      .is('convertido_em', null)
      .maybeSingle()

    if (leadExistente) {
      const updates: Record<string, unknown> = {}
      if (!leadExistente.parceiro_id)     updates.parceiro_id     = parceiroId
      if (!leadExistente.canal)           updates.canal           = 'qr_code'
      if (!leadExistente.campanha)        updates.campanha        = 'folder_consorcio_itau'
      if (!leadExistente.produto_subtipo) updates.produto_subtipo = interesse_cliente

      if (Object.keys(updates).length > 0) {
        await supabase.from('leads').update(updates).eq('id', leadExistente.id)
      }

      await supabase.from('lead_parceiros').upsert(
        { lead_id: leadExistente.id, parceiro_id: parceiroId },
        { onConflict: 'lead_id,parceiro_id' }
      )

      await supabase.from('lead_historico').insert({
        lead_id:   leadExistente.id,
        empresa_id,
        tipo:      'comentario',
        descricao: [
          'Nova indicação recebida via QR Code (lead já existia)',
          `Parceiro: ${nome_parceiro}${imobiliaria ? ` (${imobiliaria})` : ''}`,
          `Interesse: ${interesse_cliente}`,
        ].join(' | '),
      })

      await finalizarLog('ignorado', { lead_id: leadExistente.id, parceiro_id: parceiroId })
      return NextResponse.json({
        success:      true,
        lead_id:      leadExistente.id as string,
        parceiro_id:  parceiroId,
        deduplicated: true,
      })
    }

    // ── Lead: criar novo ──────────────────────────────────────────────────────

    const { data: novoLead, error: leadErr } = await supabase
      .from('leads')
      .insert({
        empresa_id,
        pessoa_id:         pessoaClienteId,
        nome:              nome_cliente,
        telefone:          telefone_cliente,
        fase_id:           primeiraFase.id,
        produto_interesse: 'consorcio',
        produto_subtipo:   interesse_cliente,
        origem:            'indicacao',
        canal:             'qr_code',
        campanha:          'folder_consorcio_itau',
        parceiro_id:       parceiroId,
        ordem_kanban:      0,
      })
      .select('id')
      .single()

    if (leadErr || !novoLead) {
      throw new Error(`Erro ao criar lead: ${leadErr?.message}`)
    }

    const leadId = novoLead.id as string

    await supabase.from('lead_parceiros').insert({
      lead_id:     leadId,
      parceiro_id: parceiroId,
    })

    await supabase.from('lead_historico').insert({
      lead_id:   leadId,
      empresa_id,
      tipo:      'criacao',
      descricao: [
        'Lead criado via indicação QR Code — Campanha Folder Consórcio Itaú',
        `Parceiro: ${nome_parceiro}${imobiliaria ? ` (${imobiliaria})` : ''}`,
        `Interesse: ${interesse_cliente}`,
        cpf_parceiro ? `CPF parceiro: ${cpf_parceiro}` : null,
      ].filter(Boolean).join(' | '),
    })

    // Não crítico — ignora erros silenciosamente
    try {
      await supabase.from('lead_telefones').upsert(
        { lead_id: leadId, empresa_id, telefone: telefone_cliente, principal: true },
        { onConflict: 'lead_id,telefone' }
      )
    } catch { /* */ }

    await finalizarLog('sucesso', { lead_id: leadId, parceiro_id: parceiroId })
    return NextResponse.json({
      success:      true,
      lead_id:      leadId,
      parceiro_id:  parceiroId,
      deduplicated: false,
    }, { status: 201 })

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[webhook-indicacao]', msg)
    await finalizarLog('erro', { erro_mensagem: msg })
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

async function criarPessoaParceiro(
  empresa_id: string,
  nome: string,
  telefone: string,
  cpf?: string
): Promise<string> {
  const cpfNorm   = cpf ? cpf.replace(/\D/g, '') : null
  const cpfValido = cpfNorm?.length === 11 ? cpfNorm : null

  const { data: pessoa, error } = await supabase
    .from('pessoas')
    .insert({
      empresa_id,
      nome,
      tipo:              'parceiro',
      status_identidade: 'confirmada',
      ...(cpfValido ? { cpf: cpfValido } : {}),
    })
    .select('id')
    .single()

  if (error || !pessoa) {
    throw new Error(`Erro ao criar pessoa do parceiro: ${error?.message}`)
  }

  await supabase.from('pessoa_telefones').insert({
    pessoa_id: pessoa.id as string,
    empresa_id,
    telefone,
    principal: true,
    whatsapp:  true,
    ativo:     true,
  })

  return pessoa.id as string
}
