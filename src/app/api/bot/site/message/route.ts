import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { processarMensagem } from '@/lib/bot/agente'
import type { MensagemHistorico } from '@/lib/bot/agente'
import { processarEstado } from '@/lib/bot/state-machine'
import type { BotEstado, BotDados } from '@/lib/bot/state-machine'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function parseMoeda(valor: string | number | undefined | null): number | null {
  if (valor == null || valor === '') return null
  const num = parseFloat(String(valor).replace(/[R$\s.]/g, '').replace(',', '.'))
  return isNaN(num) ? null : num
}

function mapProduto(produto: string | undefined | null): string | null {
  if (!produto) return null
  const p = produto.toLowerCase()
  if (p.includes('financ')) return 'Financiamento Imobiliário'
  if (p.includes('cons'))   return 'Consórcio'
  if (p.includes('cgi'))    return 'CGI'
  if (p.includes('contrat')) return 'Contrato'
  return produto
}

export async function POST(request: NextRequest) {
  let body: { mensagem: string; session_id: string; empresa_id: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const { mensagem, session_id, empresa_id } = body
  if (!mensagem?.trim() || !session_id || !empresa_id) {
    return NextResponse.json(
      { error: 'mensagem, session_id e empresa_id são obrigatórios' },
      { status: 422 }
    )
  }

  // Busca ou cria conversa para este session_id
  let conversa_id: string
  const { data: conversaExistente } = await supabase
    .from('conversas')
    .select('id, bot_ativo, bot_estado, bot_dados')
    .eq('empresa_id', empresa_id)
    .eq('canal', 'site')
    .eq('contato_telefone', session_id)
    .single()

  if (conversaExistente) {
    conversa_id = conversaExistente.id
    if (!conversaExistente.bot_ativo) {
      return NextResponse.json({
        resposta: 'Um de nossos assessores está cuidando desta conversa. Em breve você será atendido.',
        bot_ativo: false,
      })
    }
  } else {
    const { data: nova, error } = await supabase
      .from('conversas')
      .insert({ empresa_id, canal: 'site', contato_telefone: session_id, status: 'ativo', bot_ativo: true })
      .select('id')
      .single()
    if (error || !nova) {
      console.error('[site-chat] Erro ao criar conversa:', error)
      return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
    }
    conversa_id = nova.id
  }

  // Carrega histórico (últimas 10 mensagens)
  const { data: historicoDB } = await supabase
    .from('mensagens')
    .select('origem, conteudo')
    .eq('conversa_id', conversa_id)
    .order('created_at', { ascending: true })
    .limit(10)

  const historico: MensagemHistorico[] = (historicoDB ?? []).map((m) => ({
    role: m.origem === 'cliente' ? 'user' : 'assistant',
    content: m.conteudo,
  }))

  // Salva mensagem do cliente
  await supabase.from('mensagens').insert({
    conversa_id,
    origem: 'cliente',
    conteudo: mensagem.trim(),
  })

  // Roda a state machine
  const botEstadoAtual: BotEstado = (conversaExistente as { bot_estado?: string } | null)?.bot_estado as BotEstado ?? 'INICIO'
  const botDadosAtuais: BotDados = (conversaExistente as { bot_dados?: BotDados } | null)?.bot_dados ?? {}
  const transicao = processarEstado(botEstadoAtual, botDadosAtuais, mensagem.trim())

  const extraidoComSucesso =
    transicao.criarLead ||
    transicao.novoEstado !== botEstadoAtual ||
    transicao.novosDados.aguardando !== botDadosAtuais.aguardando

  console.log('[BOT STATE site]', transicao.novoEstado, JSON.stringify(transicao.novosDados), '| extraido:', extraidoComSucesso)

  // Processa com agente Claude
  let resultado
  try {
    resultado = await processarMensagem(mensagem.trim(), historico, undefined, undefined, transicao, extraidoComSucesso)
  } catch (err) {
    console.error('[site-chat] Erro no agente:', err)
    return NextResponse.json({ error: 'Erro ao processar mensagem' }, { status: 500 })
  }

  // Salva estado atualizado
  await supabase.from('conversas')
    .update({ bot_estado: transicao.novoEstado, bot_dados: transicao.novosDados })
    .eq('id', conversa_id)

  // Salva resposta do bot
  await supabase.from('mensagens').insert({
    conversa_id,
    origem: 'bot',
    conteudo: resultado.resposta,
  })

  // Cria lead quando state machine sinaliza CONCLUIDO
  if (transicao.criarLead) {
    const { nome, produto, valor_imovel, renda_mensal } = transicao.novosDados

    if (nome && produto) {
      const webhookUrl = new URL('/api/leads/webhook', process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000')
      webhookUrl.searchParams.set('source', 'site')

      await fetch(webhookUrl.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-webhook-secret': process.env.WEBHOOK_SECRET ?? '',
        },
        body: JSON.stringify({
          nome,
          telefone: session_id,
          empresa_id,
          origem: 'site',
          produto_interesse: mapProduto(produto),
          valor_pretendido:  parseMoeda(valor_imovel),
          renda_formal:      parseMoeda(renda_mensal),
        }),
      })

      await supabase
        .from('conversas')
        .update({ status: 'qualificado', contato_nome: nome })
        .eq('id', conversa_id)
    }
  }

  return NextResponse.json({ resposta: resultado.resposta, bot_ativo: true })
}
