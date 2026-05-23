import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function GET(request: NextRequest) {
  const allCookies = request.cookies.getAll()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll() {},
      },
    }
  )

  const { data: { user }, error } = await supabase.auth.getUser()

  return NextResponse.json({
    cookieNames: allCookies.map(c => c.name),
    user: user?.email ?? null,
    error: error?.message ?? null,
  })
}
