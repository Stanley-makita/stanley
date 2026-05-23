import { FolderOpen } from 'lucide-react'

export function AbaDocumentos() {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center">
        <FolderOpen className="h-7 w-7 text-gray-400" />
      </div>
      <p className="text-sm font-medium text-gray-500">Gestão de documentos</p>
      <p className="text-xs text-gray-400">Disponível em breve</p>
    </div>
  )
}