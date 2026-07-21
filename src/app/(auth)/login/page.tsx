import { LoginForm } from './LoginForm'
import { supabaseAdmin as supabase } from '@/lib/supabase/admin'

const FALLBACK_LOGO = '/logo-fonti-horizontal.png'

async function getLogoUrl(): Promise<string> {
  try {
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
