import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase/admin'
import { autenticarRota, verificarDestino } from '@/lib/documentos/vinculosServidor'
import { editarLinhaNegocio, incluirLinhaNegocio, removerLinhaNegocio, type LadoNegocio } from './escritaNegocio'

// Handlers das rotas /api/processos/[id]/{compradores,vendedores}[/linhaId] (V2 B2c-C1c): abas Compradores e
// Vendedores do negócio. Permissão processos.editar + negócio visível pela RLS do usuário (verificarDestino).

type Params = { params: { id: string; linhaId?: string } }

async function corpo(request: NextRequest): Promise<Record<string, unknown>> {
  const b = await request.json().catch(() => null)
  return b && typeof b === 'object' && !Array.isArray(b) ? b as Record<string, unknown> : {}
}

export function rotasLinhaNegocio(lado: LadoNegocio) {
  return {
    async POST(request: NextRequest, { params }: Params) {
      const ctx = await autenticarRota(request)
      if (ctx instanceof NextResponse) return ctx
      const negado = await verificarDestino(ctx, 'processo', params.id)
      if (negado) return negado
      const r = await incluirLinhaNegocio(supabase, ctx.usuario.empresa_id, params.id, lado, await corpo(request))
      if ('erro' in r) return NextResponse.json({ error: r.erro }, { status: r.status })
      return NextResponse.json(r)
    },
    async PATCH(request: NextRequest, { params }: Params) {
      const ctx = await autenticarRota(request)
      if (ctx instanceof NextResponse) return ctx
      if (!params.linhaId) return NextResponse.json({ error: 'Informe o participante.' }, { status: 400 })
      const negado = await verificarDestino(ctx, 'processo', params.id)
      if (negado) return negado
      const r = await editarLinhaNegocio(supabase, ctx.usuario.empresa_id, params.id, lado, params.linhaId, await corpo(request))
      if ('erro' in r) return NextResponse.json({ error: r.erro }, { status: r.status })
      return NextResponse.json(r)
    },
    async DELETE(request: NextRequest, { params }: Params) {
      const ctx = await autenticarRota(request)
      if (ctx instanceof NextResponse) return ctx
      if (!params.linhaId) return NextResponse.json({ error: 'Informe o participante.' }, { status: 400 })
      const negado = await verificarDestino(ctx, 'processo', params.id)
      if (negado) return negado
      const r = await removerLinhaNegocio(supabase, ctx.usuario.empresa_id, params.id, lado, params.linhaId)
      if ('erro' in r) return NextResponse.json({ error: r.erro }, { status: r.status })
      return NextResponse.json({ ok: true })
    },
  }
}
