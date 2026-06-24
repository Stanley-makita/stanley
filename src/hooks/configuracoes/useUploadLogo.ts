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
      // Filename único por upload — garante URL diferente e quebra cache automático
      const path = `logos/${usuario.empresa_id}/logo-${Date.now()}.${ext}`

      // Busca o path antigo antes de substituir
      const { data: empresaAtual } = await supabase
        .from('empresas')
        .select('logo_path')
        .eq('id', usuario.empresa_id)
        .single()

      const { error: uploadError } = await supabase.storage
        .from('empresa-assets')
        .upload(path, arquivo, { upsert: false, contentType: arquivo.type })

      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage
        .from('empresa-assets')
        .getPublicUrl(path)

      const { error: updateError } = await supabase
        .from('empresas')
        .update({ logo_url: publicUrl, logo_path: path })
        .eq('id', usuario.empresa_id)

      if (updateError) throw updateError

      // Remove arquivo antigo do Storage (limpeza)
      if (empresaAtual?.logo_path && empresaAtual.logo_path !== path) {
        await supabase.storage.from('empresa-assets').remove([empresaAtual.logo_path])
      }

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
