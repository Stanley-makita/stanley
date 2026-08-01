import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase/admin'
import { buscarPessoaPorTelefone } from '@/lib/pessoa'
import { variantesTelefoneBR } from '@/lib/telefone'

/**
 * Recebido pelo MicroSIP na máquina do operacional, via `cmdIncomingCall`
 * (microsip.ini) — dispara um comando local (ex: curl) quando uma chamada
 * chega, passando o número de quem está ligando. `token` identifica de qual
 * usuário é essa máquina (usuarios.token_telefonia — ver migration
 * 20260801_231). Não depende de nenhuma API/webhook da operadora VoIP.
 *
 * Efeito: cria uma notificação (mesma tabela/pipeline de toda a Central de
 * Notificações — ver src/hooks/useNotificacoes.tsx) pro dono do token,
 * identificando o cliente (se o número bater com uma Pessoa cadastrada) e
 * linkando pro Lead aberto dela, se houver.
 */
async function processar(token: string | null, numero: string | null) {
  if (!token || !numero) {
    return NextResponse.json({ error: 'token e numero são obrigatórios' }, { status: 400 })
  }

  const { data: usuario } = await supabase
    .from('usuarios')
    .select('id, empresa_id, nome')
    .eq('token_telefonia', token)
    .eq('ativo', true)
    .maybeSingle()

  if (!usuario) {
    return NextResponse.json({ error: 'Token inválido' }, { status: 404 })
  }

  // Tenta achar a Pessoa pelo número em qualquer uma das variantes (com/sem
  // o "9" do celular) — o número que chega do MicroSIP/central pode vir em
  // formatos diferentes do que foi cadastrado.
  let pessoaId: string | null = null
  for (const variante of variantesTelefoneBR(numero)) {
    pessoaId = await buscarPessoaPorTelefone(usuario.empresa_id, variante)
    if (pessoaId) break
  }

  let nomeCliente: string | null = null
  let leadId: string | null = null
  if (pessoaId) {
    const { data: pessoa } = await supabase.from('pessoas').select('nome').eq('id', pessoaId).maybeSingle()
    nomeCliente = pessoa?.nome ?? null

    const { data: lead } = await supabase
      .from('leads')
      .select('id')
      .eq('pessoa_id', pessoaId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    leadId = lead?.id ?? null
  }

  const { error } = await supabase.from('notificacoes').insert({
    empresa_id: usuario.empresa_id,
    usuario_id: usuario.id,
    tipo: 'chamada_recebida',
    titulo: nomeCliente ? `📞 Ligação de ${nomeCliente}` : '📞 Ligação recebida',
    mensagem: numero,
    entidade: leadId ? 'lead' : null,
    entidade_id: leadId,
    severidade: 'info',
    prioridade: 'high',
    origem: 'microsip',
  })

  if (error) {
    console.error('[telefonia/chamada-recebida] Erro ao criar notificação:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

// GET pra facilitar a chamada por um comando local simples (curl.exe sem
// flags extras já faz GET) a partir do cmdIncomingCall do MicroSIP.
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  return processar(searchParams.get('token'), searchParams.get('numero'))
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  return processar(body.token ?? null, body.numero ?? null)
}
