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
      track_source: 'fonti-crm',
    }),
  })

  if (!res.ok) {
    throw new Error(`Uazapi send/media ${res.status}: ${await res.text()}`)
  }
}

/**
 * Envia uma mensagem de texto simples via Uazapi — usado para avisos intermediários
 * (ex.: "gerando comparação de prazos...") antes de uma etapa demorada do workflow.
 * Normaliza o telefone (adiciona DDI 55 para números nacionais), igual a enviarPDFUazapi.
 * Não lança em caso de falha — um aviso perdido não deve interromper a simulação.
 */
export async function enviarTextoUazapi(
  telefone: string,
  texto: string,
  token: string,
): Promise<void> {
  const telRaw   = telefone.replace(/\D/g, '')
  const telEnvio = telRaw.length <= 11 && !telRaw.startsWith('55') ? `55${telRaw}` : telRaw

  try {
    const res = await fetch(`${process.env.UAZAPI_API_URL}/send/text`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'token': token },
      body: JSON.stringify({
        number:       telEnvio,
        text:         texto,
        track_source: 'fonti-crm',
        delay:        1200,
      }),
    })
    if (!res.ok) {
      console.error('[uazapi-helpers] enviarTextoUazapi falhou:', res.status, await res.text())
    }
  } catch (err) {
    console.error('[uazapi-helpers] enviarTextoUazapi exceção:', err)
  }
}
