import { LoginForm } from './LoginForm'

const FALLBACK_LOGO = '/logo-fonti-horizontal.png'

async function getLogoUrl(): Promise<string> {
  try {
    const vercelUrl = process.env.VERCEL_URL
    const appUrl = process.env.NEXT_PUBLIC_APP_URL
    const base = appUrl ?? (vercelUrl ? `https://${vercelUrl}` : 'http://localhost:3000')
    const res = await fetch(`${base}/api/empresa-logo`, { next: { revalidate: 60 } })
    if (!res.ok) return FALLBACK_LOGO
    const data = await res.json()
    return data.logo_url ?? FALLBACK_LOGO
  } catch {
    return FALLBACK_LOGO
  }
}

export default async function LoginPage() {
  const logoUrl = await getLogoUrl()
  return <LoginForm logoUrl={logoUrl} />
}
