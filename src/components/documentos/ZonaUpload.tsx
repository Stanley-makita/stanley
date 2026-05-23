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
        'border-2 border-dashed rounded-lg px-6 py-8 text-center cursor-pointer transition-colors',
        arrastando ? 'border-[#C2AA6A] bg-[#E7E0C4]/30' : 'border-gray-200 hover:border-[#253B29] hover:bg-gray-50',
        disabled && 'opacity-50 pointer-events-none'
      )}
    >
      <Upload className="w-7 h-7 mx-auto mb-2 text-gray-400" />
      <p className="text-sm text-gray-600 font-medium">
        Arraste arquivos aqui ou <span className="text-[#253B29] underline">clique para selecionar</span>
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