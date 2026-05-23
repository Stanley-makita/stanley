import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')

  if (!token) {
    return NextResponse.json({ valido: false }, { status: 400 })
  }

  // Usa service_role apenas para chamar função SECURITY DEFINER
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data, error } = await supabase.rpc('validar_token_convite', { p_token: token })

  if (error || !data || data.length === 0) {
    return NextResponse.json({ valido: false })
  }

  return NextResponse.json({
    valido: true,
    email: data[0].email,
    perfil: data[0].perfil,
  })
}