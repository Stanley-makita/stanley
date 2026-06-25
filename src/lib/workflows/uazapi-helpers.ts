/**
 * uazapi-helpers — funções de envio Uazapi compartilhadas entre workflows.
 *
 * Extraído de workflow-captacao.ts para evitar duplicação no workflow-consulta.
 */

/**
 * Envia um Buffer PDF como documento via Uazapi.
 * Normaliza o telefone (adiciona DDI 55 para números nacionais).
 * Lança erro se a API retornar status não-OK.
 */
export async function enviarPDFUazapi(
  telefone: string,
  pdfBuffer: Buffer,
  token: string,
  nomeArquivo: string,
): Promise<void> {
  const base64  = pdfBuffer.toString('base64')
  const telRaw  = telefone.replace(/\D/g, '')
  const telEnvio = telRaw.length <= 11 && !telRaw.startsWith('55') ? `55${telRaw}` : telRaw

  const res = await fetch(`${process.env.UAZAPI_API_URL}/send/media`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'token': token },
    body: JSON.stringify({
      number:       telEnvio,
      type:         'document',
      file:         `data:application/pdf;base64,${base64}`,
      docName:      nomeArquivo,
      track_source: 'credifon-crm',
    }),
  })

  if (!res.ok) {
    throw new Error(`Uazapi send/media ${res.status}: ${await res.text()}`)
  }
}
