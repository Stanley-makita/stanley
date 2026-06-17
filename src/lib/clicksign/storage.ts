import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function salvarPdfAssinadoEmStorage(
  signedFileUrl: string,
  contratoId: string,
  empresaId: string,
): Promise<string> {
  const res = await fetch(signedFileUrl)
  if (!res.ok) throw new Error(`Falha ao baixar PDF assinado: ${res.status}`)
  const bytes = await res.arrayBuffer()

  const path = `contratos/${empresaId}/${contratoId}.pdf`
  const { error: uploadError } = await supabaseAdmin.storage
    .from('documentos')
    .upload(path, bytes, { contentType: 'application/pdf', upsert: true })
  if (uploadError) throw uploadError

  const { data, error: urlError } = await supabaseAdmin.storage
    .from('documentos')
    .createSignedUrl(path, 60 * 60 * 24 * 365 * 10)
  if (urlError || !data) throw urlError ?? new Error('Falha ao gerar URL assinada')

  return data.signedUrl
}
