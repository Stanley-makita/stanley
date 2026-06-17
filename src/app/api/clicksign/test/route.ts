import { NextResponse } from 'next/server'

export async function GET() {
  const url = (process.env.CLICKSIGN_API_URL || 'https://sandbox.clicksign.com/api/v3').replace(/\/$/, '')
  const token = (process.env.CLICKSIGN_API_TOKEN || '').trim()

  async function testar(label: string, fetchUrl: string, authHeader?: string) {
    try {
      const res = await fetch(fetchUrl, {
        headers: {
          ...(authHeader ? { Authorization: authHeader } : {}),
          Accept: 'application/vnd.api+json',
        },
      })
      const body = await res.text()
      return { label, status: res.status, ok: res.ok, body: body.slice(0, 200) }
    } catch (e: any) {
      return { label, error: e.message }
    }
  }

  const resultados = await Promise.all([
    testar('query_param_only',    `${url}/envelopes?access_token=${token}`),
    testar('header_bare',         `${url}/envelopes`, token),
    testar('header_Token_prefix', `${url}/envelopes`, `Token ${token}`),
    testar('header_Bearer',       `${url}/envelopes`, `Bearer ${token}`),
  ])

  return NextResponse.json({
    configured_url: url,
    token_length: token.length,
    token_prefix: token.slice(0, 8),
    token_suffix: token.slice(-4),
    resultados,
  })
}
