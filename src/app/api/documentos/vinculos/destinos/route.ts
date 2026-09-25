import { NextRequest, NextResponse } from 'next/server'
import { autenticarRota, clienteDoUsuario } from '@/lib/documentos/vinculosServidor'
import { buscarDestinos } from '@/lib/documentos/destinosVinculo'

/** Destinos de "Enviar para…": leads/negócios da pessoa + busca livre (RLS do usuário). */
export async function GET(request: NextRequest) {
  const ctx = await autenticarRota(request)
  if (ctx instanceof NextResponse) return ctx
  const pessoaId = request.nextUrl.searchParams.get('pessoa_id') ?? ''
  const busca = request.nextUrl.searchParams.get('busca') ?? ''
  if (!pessoaId) return NextResponse.json({ error: 'Pedido inválido.' }, { status: 400 })
  try {
    return NextResponse.json({ destinos: await buscarDestinos(clienteDoUsuario(ctx.token), pessoaId, busca) })
  } catch (err) {
    console.error('[documentos/vinculos/destinos]', err)
    return NextResponse.json({ error: 'Não foi possível carregar os destinos.' }, { status: 500 })
  }
}
