'use client'

import { useRef, useState } from 'react'
import { Upload } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ZonaUploadProps {
  onArquivos: (arquivos: File[]) => void
  disabled?: boolean
}

export function ZonaUpload({ onArquivos, disabled }: ZonaUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [arrastando, setArrastando] = useState(false)

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setArrastando(false)
    if (disabled) return
    const arquivos = Array.from(e.dataTransfer.files)
    if (arquivos.length > 0) onArquivos(arquivos)
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivos = Array.from(e.target.files ?? [])
    if (arquivos.length > 0) onArquivos(arquivos)
    // Reset para permitir enviar o mesmo arquivo novamente
    e.target.value = ''
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setArrastando(true) }}
      onDragLeave={() => setArrastando(false)}
      onDrop={handleDrop}
      onClick={() => !disabled && inputRef.current?.click()}
      className={cn(
        'cursor-pointer rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors sm:px-6 sm:py-8',
        arrastando ? 'border-fonti-accent bg-fonti-accent-hover/30' : 'border-gray-200 hover:border-fonti-primary hover:bg-gray-50',
        disabled && 'opacity-50 pointer-events-none'
      )}
    >
      <Upload className="mx-auto mb-2 h-6 w-6 text-gray-400 sm:h-7 sm:w-7" />
      <p className="text-sm text-gray-600 font-medium">
        <span className="hidden sm:inline">Arraste arquivos aqui ou </span><span className="text-fonti-primary underline">clique para selecionar</span>
      </p>
      <p className="text-xs text-gray-400 mt-1">
        PDF, imagens, planilhas, Word — máximo 20 MB por arquivo
      </p>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".pdf,.png,.jpg,.jpeg,.webp,.xls,.xlsx,.csv,.doc,.docx"
        className="hidden"
        onChange={handleChange}
        disabled={disabled}
      />
    </div>
  )
}
