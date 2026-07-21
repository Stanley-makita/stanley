import { NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase/admin'

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
