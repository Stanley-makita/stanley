'use client'

import { useState, useCallback, useEffect } from 'react'
import { toast } from 'sonner'

// Mesmos limites usados no composer de WhatsApp (src/components/conversas/PainelComposicao.tsx)
const LIMITE_MB_IMAGEM = 5
const LIMITE_MB_DOCUMENTO = 20

export interface AnexoPendente {
  arquivo: File
  previewUrl: string | null
}

export function useAnexosPendentes() {
  const [pendentes, setPendentes] = useState<AnexoPendente[]>([])

  // Libera as object URLs de preview ao desmontar/trocar, evita vazar memória.
  useEffect(() => {
    return () => { pendentes.forEach(p => { if (p.previewUrl) URL.revokeObjectURL(p.previewUrl) }) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const adicionar = useCallback((arquivo: File) => {
    const ehImagem = arquivo.type.startsWith('image/')
    const limiteMB = ehImagem ? LIMITE_MB_IMAGEM : LIMITE_MB_DOCUMENTO
    if (arquivo.size > limiteMB * 1024 * 1024) {
      toast.error(`Arquivo muito grande (máx. ${limiteMB}MB): ${arquivo.name}`)
      return
    }
    const previewUrl = ehImagem ? URL.createObjectURL(arquivo) : null
    setPendentes(prev => [...prev, { arquivo, previewUrl }])
  }, [])

  const remover = useCallback((index: number) => {
    setPendentes(prev => {
      const alvo = prev[index]
      if (alvo?.previewUrl) URL.revokeObjectURL(alvo.previewUrl)
      return prev.filter((_, i) => i !== index)
    })
  }, [])

  const limpar = useCallback(() => {
    setPendentes(prev => { prev.forEach(p => { if (p.previewUrl) URL.revokeObjectURL(p.previewUrl) }); return [] })
  }, [])

  // Cole uma imagem (print de tela) direto no textarea — mesmo padrão já
  // usado no composer de WhatsApp (PainelComposicao.tsx).
  const onPaste = useCallback((e: React.ClipboardEvent) => {
    const item = Array.from(e.clipboardData.items).find(i => i.type.startsWith('image/'))
    if (!item) return
    const arquivo = item.getAsFile()
    if (!arquivo) return
    e.preventDefault()
    adicionar(arquivo)
  }, [adicionar])

  return { pendentes, adicionar, remover, limpar, onPaste }
}
