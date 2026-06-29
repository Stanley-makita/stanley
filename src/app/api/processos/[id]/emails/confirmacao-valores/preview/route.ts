// POST /api/processos/[id]/emails/confirmacao-valores/preview
// Monta assunto e corpo do e-mail de confirmação de valores sem enviar.
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { podeExecutar } from '@/lib/auth/permissions'
import {
  normalizarBancoTemplate,
  gerarEmailConfirmacaoValores,
  type DadosConfirmacaoValores,
} from '@/lib/email/templates/confirmacaoValores'

const supabaseAdmin = createSupabaseAdmin(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

async function resolverUsuarioCompleto() {
  const supabase = await createServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null

  const { data: usuario } = await supabaseAdmin
    .from('usuarios')
    .select('id, empresa_id, perfil, nome, email, telefone_whatsapp')
    .or(`auth_user_id.eq.${user.id},id.eq.${user.id}`)
    .eq('ativo', true)
    .single()

  return usuario
}

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const usuario = await resolverUsuarioCompleto()
    if (!usuario) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    if (!podeExecutar(usuario.perfil, 'processos.ver')) {
      return NextResponse.json({ error: 'Sem permissão para acessar este processo' }, { status: 403 })
    }

    // Verifica que o processo pertence à empresa
    const { data: processo, error: errProcesso } = await supabaseAdmin
      .from('processos')
      .select(`
        id, modalidade, valor_imovel, valor_financiado, valor_entrada,
        valor_fgts, valor_recursos_proprios,
        prazo_amortizacao_meses, sistema_amortizacao,
        banco:bancos!banco_id(id, nome),
        compradores:processo_compradores(nome, email, principal)
      `)
      .eq('id', params.id)
      .eq('empresa_id', usuario.empresa_id)
      .maybeSingle()

    if (errProcesso) {
      console.error('[confirmacao-valores/preview] erro ao buscar processo:', errProcesso)
      return NextResponse.json({ error: errProcesso.message }, { status: 500 })
    }
    if (!processo) return NextResponse.json({ error: 'Processo não encontrado' }, { status: 404 })

    const bancoNome: string = (processo.banco as any)?.nome ?? ''
    const bancoTemplate = normalizarBancoTemplate(bancoNome)
    if (!bancoTemplate) {
      return NextResponse.json(
        { error: `Banco "${bancoNome}" não suportado para confirmação de valores.` },
        { status: 400 }
      )
    }

    const compradorPrincipal = (processo.compradores as any[])?.find((c: any) => c.principal)
      ?? (processo.compradores as any[])?.[0]
    const paraEmail: string = compradorPrincipal?.email ?? ''

    // Busca tarifa do banco em Configurações > Simulador > Tarifas por Banco
    // Preferência: 'residencial'; fallback: qualquer tipo disponível para o banco
    let tarifaBanco: number | null = null
    if (bancoNome) {
      const { data: tarifaRows } = await supabaseAdmin
        .from('simulador_custas_config')
        .select('tipo, valor')
        .eq('empresa_id', usuario.empresa_id)
        .ilike('banco_nome', bancoNome)
        .eq('ativo', true)
        .order('tipo')
      if (tarifaRows && tarifaRows.length > 0) {
        const residencial = tarifaRows.find((r) => r.tipo === 'residencial')
        tarifaBanco = Number((residencial ?? tarifaRows[0]).valor)
      }
    }

    const dados: DadosConfirmacaoValores = {
      cliente_nome:           compradorPrincipal?.nome ?? 'Cliente',
      banco_nome:             bancoNome,
      engenharia_laudo:       (processo as any).valor_imovel,
      compra_venda:           (processo as any).valor_imovel,
      entrada:                (processo as any).valor_entrada,
      fgts:                   (processo as any).valor_fgts,
      subsidio:               null,
      valor_financiado:       (processo as any).valor_financiado,
      despesas_financiadas:   null,
      valor_total_financiado: (processo as any).valor_financiado,
      prazo_meses:            (processo as any).prazo_amortizacao_meses,
      modalidade:             (processo as any).modalidade,
      amortizacao:            (processo as any).sistema_amortizacao,
      taxa:                   null,
      iof:                    null,
      tarifa_banco:           tarifaBanco,
      observacoes:            null,
      usuario_nome:           usuario.nome,
      usuario_funcao:         usuario.perfil,
      usuario_email:          usuario.email,
      usuario_telefone_whatsapp: (usuario as any).telefone_whatsapp ?? null,
    }

    const { assunto, corpo } = gerarEmailConfirmacaoValores(bancoTemplate, dados)

    return NextResponse.json({
      para_email: paraEmail,
      assunto,
      corpo,
      template: bancoTemplate,
      dados,
    })
  } catch (err: any) {
    console.error('[confirmacao-valores/preview]', err)
    return NextResponse.json(
      { error: err?.message ?? 'Erro ao gerar prévia do e-mail' },
      { status: 500 }
    )
  }
}
