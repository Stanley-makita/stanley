import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const revalidate = 60

export async function GET() {
  const { data } = await supabase
    .from('empresas')
    .select('logo_url')
    .not('logo_url', 'is', null)
    .limit(1)
    .single()

  return NextResponse.json({ logo_url: data?.logo_url ?? null })
}
