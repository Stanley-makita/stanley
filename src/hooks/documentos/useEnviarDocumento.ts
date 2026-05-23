import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useUsuarioAtual } from '@/hooks/useUsuarioAtual'
import { useQueryClient } from '@tanstack/react-query'
import { UploadProgresso } from '@/types/documentos'

const TAMANHO_MAX = 20 * 1024 * 1024 // 20 MB
const MIME_PERMITIDOS = [
  'application/pdf',
  'image/png', 'image/jpeg', 'image/webp',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]

export function useEnviarDocumento(processoId: string) {
  const supabase = createClient()
  const { data: usuario } = useUsuarioAtual()
  const queryClient = useQueryClient()
  const [progressos, setProgressos] = useState<UploadProgresso[]>([])

  async function enviarArquivos(arquivos: File[]) {
    const validos = arquivos.filter((f) => {
      if (f.size > TAMANHO_MAX) return false
      if (!MIME_PERMITIDOS.includes(f.type)) return false
      return true
    })

    if (validos.length === 0) return

    setProgressos(validos.map((f) => ({ arquivo: f.name, progresso: 0 })))

    await Promise.all(
      validos.map(async (arquivo, idx) => {
        try {
          const nomeUnico = `${crypto.randomUUID()}-${arquivo.name}`
          const path = `${usuario!.empresa_id}/${processoId}/${nomeUnico}`

          // Upload para Storage
          const { error: uploadError } = await supabase.storage
            .from('documentos')
            .upload(path, arquivo, { upsert: false })

          if (uploadError) throw uploadError

          // Simular progresso (Supabase JS v2 não expõe onUploadProgress)
          setProgressos((prev) =>
            prev.map((p, i) => (i === idx ? { ...p, progresso: 90 } : p))
          )

          // Inserir metadados
          const { error: insertError } = await supabase
            .from('processo_documentos')
            .insert({
              empresa_id:  usuario!.empresa_id,
              processo_id: processoId,
              nome:        arquivo.name,
              storage_path: path,
              tamanho:     arquivo.size,
              mime_type:   arquivo.type,
              enviado_por: usuario!.id,
            })

          if (insertError) throw insertError

          setProgressos((prev) =>
            prev.map((p, i) => (i === idx ? { ...p, progresso: 100 } : p))
          )
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Erro no upload'
          setProgressos((prev) =>
            prev.map((p, i) => (i === idx ? { ...p, erro: msg } : p))
          )
        }
      })
    )

    queryClient.invalidateQueries({ queryKey: ['documentos', processoId] })

    // Limpar progressos após 2s
    setTimeout(() => setProgressos([]), 2000)
  }

  return { enviarArquivos, progressos }
}