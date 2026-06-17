import { NextResponse } from 'next/server'

export async function GET() {
  const url = (process.env.CLICKSIGN_API_URL || 'https://sandbox.clicksign.com/api/v3').replace(/\/$/, '')
  const token = (process.env.CLICKSIGN_API_TOKEN || '').trim()

  // Testa a chamada real ao Clicksign
  let clicksignResult: any = null
  try {
    const res = await fetch(`${url}/envelopes?access_token=${token}`, {
      headers: {
        Authorization: token,
        Accept: 'application/vnd.api+json',
      },
    })
    const body = await res.text()
    clicksignResult = { status: res.status, body: body.slice(0, 500) }
  } catch (e: any) {
    clicksignResult = { error: e.message }
  }

  return NextResponse.json({
    configured_url: url,
    token_length: token.length,
    token_prefix: token.slice(0, 8),
    token_suffix: token.slice(-4),
    clicksign: clicksignResult,
  })
}
