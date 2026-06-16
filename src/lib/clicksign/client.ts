const BASE_URL = process.env.CLICKSIGN_API_URL ?? 'https://sandbox.clicksign.com/api/v3'
const TOKEN = process.env.CLICKSIGN_API_TOKEN ?? ''

function headers() {
  return {
    Authorization: TOKEN,
    'Content-Type': 'application/vnd.api+json',
    Accept: 'application/vnd.api+json',
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: headers(),
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  if (!res.ok) {
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
        content_base64: pdfBase64,
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

export async function adicionarRequirement(
  envelopeId: string,
  documentId: string,
  signerId: string,
  order: number,
): Promise<void> {
  await request('POST', `/envelopes/${envelopeId}/requirements`, {
    data: {
      type: 'requirements',
      attributes: { action_type: 'signature', action_order: order },
      relationships: {
        document: { data: { type: 'documents', id: documentId } },
        signer: { data: { type: 'signers', id: signerId } },
      },
    },
  })
}

export async function ativarEnvelope(envelopeId: string): Promise<void> {
  await request('POST', `/envelopes/${envelopeId}/activate`, {
    data: { type: 'envelopes' },
  })
}

export async function notificarSignatarios(envelopeId: string): Promise<void> {
  await request('POST', `/envelopes/${envelopeId}/notifications`, {
    data: {
      type: 'notifications',
      attributes: { type: 'signature_request' },
    },
  })
}

export async function buscarDocumento(
  envelopeId: string,
  documentId: string,
): Promise<{ status: string; signed_url: string | null }> {
  const res = await request<any>('GET', `/envelopes/${envelopeId}/documents/${documentId}`)
  const attrs = res.data?.attributes ?? {}
  return {
    status: attrs.status ?? '',
    signed_url: attrs.downloads?.signed_file_url ?? null,
  }
}
