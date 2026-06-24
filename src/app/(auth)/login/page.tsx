import { createClient } from '@supabase/supabase-js'
import { LoginForm } from './LoginForm'

const FALLBACK_LOGO = '/logo-fonti-horizontal.png'

async function getLogoUrl(): Promise<string> {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const { data } = await supabase
      .from('empresas')
      .select('logo_url')
      .not('logo_url', 'is', null)
      .limit(1)
      .single()
    return data?.logo_url ?? FALLBACK_LOGO
  } catch {
    return FALLBACK_LOGO
  }
}

export const dynamic = 'force-dynamic'

export default async function LoginPage() {
  const logoUrl = await getLogoUrl()
  return <LoginForm logoUrl={logoUrl} />
}
