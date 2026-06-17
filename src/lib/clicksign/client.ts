const BASE_URL = (process.env.CLICKSIGN_API_URL || 'https://app.clicksign.com/api/v3').replace(/\/$/, '')
const TOKEN = (process.env.CLICKSIGN_API_TOKEN || '').trim()

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const url = `${BASE_URL}${path}?access_token=${TOKEN}`
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: TOKEN,
      'Content-Type': 'application/vnd.api+json',
      Accept: 'application/vnd.api+json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  if (!res.ok) {
    console.error(`[Clicksign] ${method} ${path} → ${res.status} | body=${text}`)
    throw new Error(`Clicksign ${method} ${path} → ${res.status}: ${text}`)
  }
  return text ? JSON.parse(text) : ({} as T)
}

export async function criarEnvelope(nome: string): Promise<string> {
  const res = await request<any>('POST', '/envelopes', {
    data: { type: 'envelopes', attributes: { name: nome } },
  })
  return res.data.id as string
}

export async function uploadDocumento(
  envelopeId: string,
  pdfBase64: string,
  filename: string,
): Promise<string> {
  const res = await request<any>('POST', `/envelopes/${envelopeId}/documents`, {
    data: {
      type: 'documents',
      attributes: {
        filename,
        content_base64: pdfBase64.startsWith('data:') ? pdfBase64 : `data:application/pdf;base64,${pdfBase64}`,
      },
    },
  })
  return res.data.id as string
}

export async function adicionarSignatario(
  envelopeId: string,
  signatario: { nome: string; email: string },
): Promise<string> {
  const res = await request<any>('POST', `/envelopes/${envelopeId}/signers`, {
    data: {
      type: 'signers',
      attributes: { name: signatario.nome, email: signatario.email },
    },
  })
  return res.data.id as string
}

// Requisito de qualificação: o signatário deve aceitar/assinar
export async function adicionarRequistoQualificacao(
  envelopeId: string,
  documentId: string,
  signerId: string,
): Promise<void> {
  await request('POST', `/envelopes/${envelopeId}/requirements`, {
    data: {
      type: 'requirements',
      attributes: { action: 'agree', role: 'sign' },
      relationships: {
        document: { data: { type: 'documents', id: documentId } },
        signer: { data: { type: 'signers', id: signerId } },
      },
    },
  })
}

// Requisito de autenticação: valida identidade via e-mail (obrigatório para ativar)
export async function adicionarRequisitoAutenticacao(
  envelopeId: string,
  documentId: string,
  signerId: string,
): Promise<void> {
  await request('POST', `/envelopes/${envelopeId}/requirements`, {
    data: {
      type: 'requirements',
      attributes: { action: 'provide_evidence', auth: 'email' },
      relationships: {
        document: { data: { type: 'documents', id: documentId } },
        signer: { data: { type: 'signers', id: signerId } },
      },
    },
  })
}

// Ativa o envelope: muda status de draft → running via PATCH
export async function ativarEnvelope(envelopeId: string): Promise<void> {
  await request('PATCH', `/envelopes/${envelopeId}`, {
    data: {
      id: envelopeId,
      type: 'envelopes',
      attributes: { status: 'running' },
    },
  })
}

export async function notificarSignatarios(envelopeId: string): Promise<void> {
  await request('POST', `/envelopes/${envelopeId}/notifications`, {
    data: {
      type: 'notifications',
      attributes: { message: null },
    },
  })
}

export async function buscarDocumento(
  envelopeId: string,
  documentId: string,
): Promise<{ status: string; signed_url: string | null }> {
  const res = await request<any>('GET', `/envelopes/${envelopeId}/documents/${documentId}`)
  const attrs = res.data?.attributes ?? {}

  // Log em partes para evitar truncamento no Vercel
  console.log('[buscarDocumento] status:', attrs.status)
  console.log('[buscarDocumento] downloads:', JSON.stringify(attrs.downloads))
  console.log('[buscarDocumento] metadata keys:', JSON.stringify(Object.keys(attrs.metadata ?? {})))
  console.log('[buscarDocumento] top-level keys:', JSON.stringify(Object.keys(attrs)))
  console.log('[buscarDocumento] res.data keys:', JSON.stringify(Object.keys(res.data ?? {})))
  console.log('[buscarDocumento] links:', JSON.stringify(res.data?.links))

  // Tenta múltiplos caminhos possíveis do PDF assinado na API Clicksign v3
  const signed_url =
    attrs.downloads?.signed_file_url ??
    attrs.downloads?.file_url ??
    attrs.signed_file_url ??
    attrs.file_url ??
    res.data?.links?.self ??
    null

  return {
    status: attrs.status ?? '',
    signed_url,
  }
}

export async function buscarEnvelope(envelopeId: string): Promise<{ status: string }> {
  const res = await request<any>('GET', `/envelopes/${envelopeId}`)
  return {
    status: res.data?.attributes?.status ?? '',
  }
}
