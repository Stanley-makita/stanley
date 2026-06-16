import { type NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // API routes: deixa passar sem redirecionar (auth feita dentro da rota via Bearer token)
  if (pathname.startsWith('/api/')) {
    return supabaseResponse
  }

  // Páginas públicas: acessíveis sem autenticação (links enviados para clientes)
  if (pathname.startsWith('/confirmar')) {
    return supabaseResponse
  }

  // Páginas de auth: se já logado, redireciona para dashboard
  const authPages = ['/login', '/esqueci-senha', '/redefinir-senha', '/convite']
  if (authPages.some((r) => pathname.startsWith(r))) {
    if (user) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
    return supabaseResponse
  }

  // Área protegida
  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Verificar se usuário está ativo (lê app_metadata do JWT)
  const appMeta = user.app_metadata as { perfil?: string; ativo?: boolean; empresa_id?: string } | undefined
  if (appMeta?.ativo === false) {
    await supabase.auth.signOut()
    return NextResponse.redirect(new URL('/login?erro=conta_desativada', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
