'use client'

import { useState } from 'react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface ColunaAuxiliar<T> {
  key: keyof T
  label: string
  render?: (valor: T[keyof T], linha: T) => ReactNode
}

interface TabelaAuxiliarProps<T extends { id: string }> {
  titulo: string
  descricao?: string
  dados: T[]
  isLoading?: boolean
  colunas: ColunaAuxiliar<T>[]
  renderFormModal: (props: {
    inicial?: T
    onSalvar: (dados: Omit<T, 'id' | 'empresa_id' | 'created_at' | 'updated_at' | 'deleted_at'>) => void
    onCancelar: () => void
    isPending: boolean
  }) => React.ReactNode
  onCriar: (dados: Omit<T, 'id' | 'empresa_id' | 'created_at' | 'updated_at' | 'deleted_at'>) => void
  onEditar: (id: string, dados: Partial<T>) => void
  onExcluir: (id: string) => void
  isPendingCriar?: boolean
  isPendingEditar?: boolean
  isPendingExcluir?: boolean
  rotuloBotaoNovo?: string
  emptyMessage?: string
}

export function TabelaAuxiliar<T extends { id: string }>({
  titulo,
  descricao,
  dados,
  isLoading,
  colunas,
  renderFormModal,
  onCriar,
  onEditar,
  onExcluir,
  isPendingCriar,
  isPendingEditar,
  isPendingExcluir,
  rotuloBotaoNovo = 'Novo',
  emptyMessage = 'Nenhum registro cadastrado.',
}: TabelaAuxiliarProps<T>) {
  const [modalAberto, setModalAberto] = useState(false)
  const [itemEditando, setItemEditando] = useState<T | undefined>(undefined)
  const [confirmandoExclusao, setConfirmandoExclusao] = useState<string | null>(null)

  function abrirCriar() {
    setItemEditando(undefined)
    setModalAberto(true)
  }

  function abrirEditar(item: T) {
    setItemEditando(item)
    setModalAberto(true)
  }

  function fecharModal() {
    setModalAberto(false)
    setItemEditando(undefined)
  }

  function handleSalvar(dados: Omit<T, 'id' | 'empresa_id' | 'created_at' | 'updated_at' | 'deleted_at'>) {
    if (itemEditando) {
      onEditar(itemEditando.id, dados as Partial<T>)
    } else {
      onCriar(dados)
    }
    fecharModal()
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-12 rounded-lg bg-gray-100 animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          {descricao && <p className="text-sm text-gray-500">{descricao}</p>}
          {!descricao && (
            <p className="text-sm text-gray-500">{dados.length} {dados.length === 1 ? 'registro' : 'registros'}</p>
          )}
        </div>
        <Button
          size="sm"
          className="bg-fonti-primary hover:bg-fonti-accent hover:text-fonti-primary text-white"
          onClick={abrirCriar}
        >
          <Plus className="w-4 h-4 mr-1" /> {rotuloBotaoNovo}
        </Button>
      </div>

      {dados.length === 0 ? (
        <div className="text-center py-10 text-gray-400">
          <p className="text-sm">{emptyMessage}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-100">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {colunas.map((col) => (
                  <th key={String(col.key)} className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    {col.label}
                  </th>
                ))}
                <th className="w-20 px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {dados.map((item, idx) => (
                <tr
                  key={item.id}
                  className={cn(
                    'border-b border-gray-50 hover:bg-gray-50 transition-colors group',
                    idx === dados.length - 1 && 'border-b-0'
                  )}
                >
                  {colunas.map((col) => (
                    <td key={String(col.key)} className="px-4 py-3 text-gray-800">
                      {col.render
                        ? col.render(item[col.key], item)
                        : String(item[col.key] ?? '—')}
                    </td>
                  ))}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-gray-400 hover:text-fonti-primary"
                        onClick={() => abrirEditar(item)}
                        disabled={isPendingEditar}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      {confirmandoExclusao === item.id ? (
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-red-600 hover:bg-red-50 px-2"
                            onClick={() => { onExcluir(item.id); setConfirmandoExclusao(null) }}
                            disabled={isPendingExcluir}
                          >
                            Confirmar
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs px-2"
                            onClick={() => setConfirmandoExclusao(null)}
                          >
                            Cancelar
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-gray-400 hover:text-red-500 hover:bg-red-50"
                          onClick={() => setConfirmandoExclusao(item.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={modalAberto} onOpenChange={(open: boolean) => !open && fecharModal()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{itemEditando ? `Editar ${titulo}` : `Novo ${titulo}`}</DialogTitle>
          </DialogHeader>
          {modalAberto && renderFormModal({
            inicial: itemEditando,
            onSalvar: handleSalvar,
            onCancelar: fecharModal,
            isPending: !!(isPendingCriar || isPendingEditar),
          })}
        </DialogContent>
      </Dialog>
    </div>
  )
}
