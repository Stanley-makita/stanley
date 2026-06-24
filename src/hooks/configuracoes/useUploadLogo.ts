'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useUsuarioAtual } from '@/hooks/useUsuarioAtual'
import { toast } from 'sonner'

export function useUploadLogo() {
  const supabase = createClient()
  const { data: usuario } = useUsuarioAtual()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (arquivo: File) => {
      if (!usuario?.empresa_id) throw new Error('Empresa não identificada')

      const ext = arquivo.name.split('.').pop()?.toLowerCase() ?? 'png'
      const path = `logos/${usuario.empresa_id}/logo.${ext}`

      const { error: uploadError } = await supabase.storage
        .from('empresa-assets')
        .upload(path, arquivo, { upsert: true, contentType: arquivo.type })

      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage
        .from('empresa-assets')
        .getPublicUrl(path)

      const { error: updateError } = await supabase
        .from('empresas')
        .update({ logo_url: publicUrl, logo_path: path })
        .eq('id', usuario.empresa_id)

      if (updateError) throw updateError

      return publicUrl
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['empresa-personalizacao', usuario?.empresa_id] })
      toast.success('Logo atualizada com sucesso!')
    },
    onError: (err: any) => {
      toast.error(err?.message ?? 'Erro ao fazer upload da logo')
    },
  })
}
