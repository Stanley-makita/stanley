import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const { email, password } = await request.json()

  const supabase = await createClient()

  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    console.error('[login] signInWithPassword error:', error.message)
    return NextResponse.json({ error: 'E-mail ou senha incorretos.' }, { status: 401 })
  }

  return NextResponse.redirect(new URL('/dashboard', request.url), { status: 303 })
}
