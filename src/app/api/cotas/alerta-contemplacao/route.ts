import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase/admin'

// Dispara o alerta de "Alerta em" das cotas de Consórcio: no dia estimado de
// contemplação (processo_cotas.alerta_em), avisa o comercial responsável
// pelo Negócio (processos.comercial_id) via notificação in-app + WhatsApp.
// Dispara uma vez só — alerta_enviado_em marca que já foi feito; editar a
// cota (ver ListaCotas.tsx) reseta essa flag pra permitir novo disparo se a
// data de alerta mudar.
//
// Cron: vercel.json, mesma proteção CRON_SECRET do followup de leads.

async function enviarWhatsApp(telefone: string, texto: string, instanciaToken: string) {
  const telRaw = telefone.replace(/\D/g, '')
  const telEnvio = telRaw.length <= 11 && !telRaw.startsWith('55') ? `55${telRaw}` : telRaw

  const res = await fetch(`${process.env.UAZAPI_API_URL}/send/text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', token: instanciaToken },
    body: JSON.stringify({ number: telEnvio, text: texto, delay: 800 }),
  })
  if (!res.ok) throw new Error(`Uazapi ${res.status}: ${await res.text()}`)
  return res.json()
}

async function buscarInstanciaToken(empresaId: string): Promise<string> {
  const { data } = await supabase
    .from('instancias')
    .select('token')
    .eq('empresa_id', empresaId)
    .eq('ativo', true)
    .limit(1)
    .maybeSingle()
  return data?.token ?? process.env.UAZAPI_INSTANCE_TOKEN ?? ''
}

// Vercel Cron chama via GET (com o header Authorization: Bearer $CRON_SECRET
// preenchido automaticamente, já que CRON_SECRET está configurado como env
// var do projeto). POST fica disponível também, pra teste manual.
export async function GET(req: NextRequest) {
  return processar(req)
}

export async function POST(req: NextRequest) {
  return processar(req)
}

async function processar(req: NextRequest) {
  const authHeader = req.headers.get('authorization') ?? ''
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const hoje = new Date().toISOString().slice(0, 10)

  const { data: cotas, error } = await supabase
    .from('processo_cotas')
    .select(`
      id, empresa_id, processo_id, grupo, cota, administradora_nome, alerta_em,
      processo:processos!processo_id(
        numero_processo, comercial_id,
        lead:leads!lead_id(nome),
        comercial:usuarios!comercial_id(nome, telefone, telefone_whatsapp)
      )
    `)
    .lte('alerta_em', hoje)
    .is('alerta_enviado_em', null)
    .not('alerta_em', 'is', null)
    .neq('status_cota', 'cancelado')

  if (error) {
    console.error('[cotas/alerta-contemplacao] Erro ao buscar cotas:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const resultados: { cotaId: string; ok: boolean; erro?: string }[] = []

  for (const c of cotas ?? []) {
    const processo = c.processo as unknown as {
      numero_processo: string | null
      comercial_id: string | null
      lead: { nome: string } | null
      comercial: { nome: string; telefone: string | null; telefone_whatsapp: string | null } | null
    } | null

    try {
      const clienteNome = processo?.lead?.nome ?? 'Cliente'
      const cotaLabel = [c.administradora_nome, c.grupo && `Grupo ${c.grupo}`, c.cota && `Cota ${c.cota}`].filter(Boolean).join(' · ') || 'Cota sem identificação'

      if (processo?.comercial_id) {
        await supabase.from('notificacoes').insert({
          empresa_id:  c.empresa_id,
          usuario_id:  processo.comercial_id,
          tipo:        'consorcio_alerta_contemplacao',
          titulo:      'Alerta de contemplação — Consórcio',
          mensagem:    `${clienteNome} — ${cotaLabel}. Data estimada de contemplação chegou, hora de verificar com o cliente.`,
          entidade:    'processo',
          entidade_id: c.processo_id,
          severidade:  'info',
          prioridade:  'normal',
          origem:      'cotas_alerta_contemplacao_cron',
        })

        const telComercial = processo.comercial?.telefone_whatsapp ?? processo.comercial?.telefone
        if (telComercial) {
          const instanciaToken = await buscarInstanciaToken(c.empresa_id)
          const msg = [
            `🔔 *Fonti — Alerta de Contemplação (Consórcio)*`,
            ``,
            `Cliente: *${clienteNome}*`,
            `Cota: ${cotaLabel}`,
            ``,
            `A data estimada de contemplação chegou. Vale entrar em contato com o cliente.`,
          ].join('\n')
          await enviarWhatsApp(telComercial, msg, instanciaToken)
        }
      }

      await supabase
        .from('processo_cotas')
        .update({ alerta_enviado_em: new Date().toISOString() })
        .eq('id', c.id)

      resultados.push({ cotaId: c.id, ok: true })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[cotas/alerta-contemplacao] Erro cota ${c.id}:`, msg)
      resultados.push({ cotaId: c.id, ok: false, erro: msg })
    }
  }

  return NextResponse.json({ processados: resultados.length, resultados })
}
