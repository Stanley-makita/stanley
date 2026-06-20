'use client'

import { useState } from 'react'
import { useDocumentosProcesso } from '@/hooks/documentos/useDocumentosProcesso'
import { useEnviarDocumento } from '@/hooks/documentos/useEnviarDocumento'
import { useExcluirDocumento } from '@/hooks/documentos/useExcluirDocumento'
import { useUsuarioAtual } from '@/hooks/useUsuarioAtual'
import { ZonaUpload } from './ZonaUpload'
import { DocumentoItem } from './DocumentoItem'
import { filtroParaMime } from '@/lib/formatarTamanho'
import { FiltroTipoDoc } from '@/types/documentos'
import { cn } from '@/lib/utils'

const FILTROS: { value: FiltroTipoDoc; label: string }[] = [
  { value: 'todos',    label: 'Todos' },
  { value: 'pdf',      label: 'PDFs' },
  { value: 'imagem',   label: 'Imagens' },
  { value: 'planilha', label: 'Planilhas' },
  { value: 'outro',    label: 'Outros' },
]

interface AbaDocumentosProps {
  processoId: string
}

export function AbaDocumentos({ processoId }: AbaDocumentosProps) {
  const { data: usuario } = useUsuarioAtual()
  const { data: documentos = [], isLoading } = useDocumentosProcesso(processoId)
  const { enviarArquivos, progressos } = useEnviarDocumento(processoId)
  const { mutate: excluir } = useExcluirDocumento(processoId)

  const [filtro, setFiltro] = useState<FiltroTipoDoc>('todos')

  const podeExcluirTudo = usuario?.perfil === 'admin' || usuario?.perfil === 'gerente'

  const documentosFiltrados = documentos.filter((d) =>
    filtroParaMime(filtro)(d.mime_type)
  )

  return (
    <div className="space-y-4">
      {/* Zona de upload */}
      <ZonaUpload onArquivos={enviarArquivos} />

      {/* Progresso de uploads */}
      {progressos.length > 0 && (
        <div className="space-y-2">
          {progressos.map((p) => (
            <div key={p.arquivo} className="space-y-1">
              <div className="flex items-center justify-between text-xs text-gray-600">
                <span className="truncate max-w-[300px]">{p.arquivo}</span>
                <span>{p.erro ? '❌ Erro' : p.progresso === 100 ? '✅' : `${p.progresso}%`}</span>
              </div>
              {!p.erro && (
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-fonti-primary transition-all duration-300"
                    style={{ width: `${p.progresso}%` }}
                  />
                </div>
              )}
              {p.erro && (
                <p className="text-xs text-red-500">{p.erro}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Filtros de tipo */}
      <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
        {FILTROS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFiltro(f.value)}
            className={cn(
              'px-3 py-1 rounded-full text-xs font-medium transition-colors',
              filtro === f.value
                ? 'bg-fonti-primary text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Tabela de documentos */}
      {isLoading ? (
        <div className="py-8 text-center text-gray-400 text-sm">Carregando...</div>
      ) : documentosFiltrados.length === 0 ? (
        <div className="py-8 text-center text-gray-400 text-sm">
          {filtro === 'todos' ? 'Nenhum documento enviado ainda.' : 'Nenhum documento deste tipo.'}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <div className="divide-y md:hidden">
            {documentosFiltrados.map((doc) => (
              <DocumentoItem
                key={doc.id}
                documento={doc}
                mobile
                podeExcluir={podeExcluirTudo || doc.enviado_por === usuario?.id}
                onExcluir={() => excluir({ id: doc.id, storagePath: doc.storage_path })}
              />
            ))}
          </div>
          <table className="hidden w-full text-sm md:table">
            <thead>
              <tr className="bg-fonti-primary text-white">
                <th className="px-4 py-2 text-left">Arquivo</th>
                <th className="px-4 py-2 text-left">Tamanho</th>
                <th className="px-4 py-2 text-left">Enviado por</th>
                <th className="px-4 py-2 text-left">Data</th>
                <th className="px-4 py-2 w-20" />
              </tr>
            </thead>
            <tbody>
              {documentosFiltrados.map((doc) => (
                <DocumentoItem
                  key={doc.id}
                  documento={doc}
                  podeExcluir={podeExcluirTudo || doc.enviado_por === usuario?.id}
                  onExcluir={() => excluir({ id: doc.id, storagePath: doc.storage_path })}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
