'use client'

import { useState } from 'react'
import { Search, Building2, Plus } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { ImovelCard } from '@/components/imoveis/ImovelCard'
import { ImovelFormDrawer } from '@/components/imoveis/ImovelFormDrawer'
import { useImoveis } from '@/hooks/imoveis/useImoveis'
import type { Imovel, TipoImovel, CategoriaImovel } from '@/types/imoveis'
import { TIPO_IMOVEL_LABELS, CATEGORIA_IMOVEL_LABELS } from '@/types/imoveis'

const TIPOS: TipoImovel[] = ['apartamento', 'casa', 'sobrado', 'terreno', 'barracao']
const CATEGORIAS: CategoriaImovel[] = ['residencial', 'comercial', 'industrial', 'rural']

export default function ImoveisPage() {
  const [busca, setBusca] = useState('')
  const [pagina, setPagina] = useState(1)
  const [tipoFiltro, setTipoFiltro] = useState('')
  const [categoriaFiltro, setCategoriaFiltro] = useState('')
  const [drawerAberto, setDrawerAberto] = useState(false)
  const [imovelSelecionado, setImovelSelecionado] = useState<Imovel | undefined>(undefined)

  const PAGE_SIZE = 24

  const { data, isLoading } = useImoveis({
    search: busca,
    tipo: tipoFiltro || undefined,
    categoria: categoriaFiltro || undefined,
    pagina,
  })

  const imoveis = data?.imoveis ?? []
  const total = data?.total ?? 0
  const totalPaginas = Math.ceil(total / PAGE_SIZE)

  function abrirEditar(imovel: Imovel) {
    setImovelSelecionado(imovel)
    setDrawerAberto(true)
  }

  function abrirCriar() {
    setImovelSelecionado(undefined)
    setDrawerAberto(true)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-5 border-b bg-white">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Imóveis</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {total > 0 ? `${total} imóvel${total !== 1 ? 'is' : ''} cadastrado${total !== 1 ? 's' : ''}` : 'Cadastro de imóveis'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Buscar por matrícula ou endereço..."
                value={busca}
                onChange={(e) => { setBusca(e.target.value); setPagina(1) }}
                className="pl-9"
              />
            </div>
            <Button
              size="sm"
              className="bg-[#253B29] hover:bg-[#1a2b1e] text-white gap-1.5 shrink-0"
              onClick={abrirCriar}
            >
              <Plus className="h-4 w-4" />
              Novo Imóvel
            </Button>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="px-6 py-2.5 border-b bg-white flex items-center gap-2 overflow-x-auto scrollbar-none">
        <button
          onClick={() => { setTipoFiltro(''); setCategoriaFiltro(''); setPagina(1) }}
          className={cn(
            'text-xs px-3 py-1.5 rounded-full border shrink-0 transition-all',
            !tipoFiltro && !categoriaFiltro
              ? 'border-[#253B29] bg-[#253B29] text-white font-medium'
              : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
          )}
        >
          Todos
        </button>

        <div className="h-4 w-px bg-gray-200 shrink-0" />

        {TIPOS.map((tipo) => (
          <button
            key={tipo}
            onClick={() => { setTipoFiltro(tipoFiltro === tipo ? '' : tipo); setPagina(1) }}
            className={cn(
              'text-xs px-3 py-1.5 rounded-full border shrink-0 transition-all',
              tipoFiltro === tipo
                ? 'border-[#253B29] bg-[#253B29] text-white font-medium'
                : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
            )}
          >
            {TIPO_IMOVEL_LABELS[tipo]}
          </button>
        ))}

        <div className="h-4 w-px bg-gray-200 shrink-0" />

        {CATEGORIAS.map((cat) => (
          <button
            key={cat}
            onClick={() => { setCategoriaFiltro(categoriaFiltro === cat ? '' : cat); setPagina(1) }}
            className={cn(
              'text-xs px-3 py-1.5 rounded-full border shrink-0 transition-all',
              categoriaFiltro === cat
                ? 'border-[#253B29] bg-[#253B29] text-white font-medium'
                : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
            )}
          >
            {CATEGORIA_IMOVEL_LABELS[cat]}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto bg-gray-50">
        {isLoading ? (
          <div className="p-4 grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <Skeleton key={i} className="h-40 rounded-xl" />
            ))}
          </div>
        ) : imoveis.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400">
            <Building2 className="h-12 w-12 mb-3 opacity-30" />
            <p className="font-medium">
              {busca || tipoFiltro || categoriaFiltro ? 'Nenhum imóvel encontrado' : 'Nenhum imóvel cadastrado ainda'}
            </p>
            <p className="text-sm mt-1">
              {busca || tipoFiltro || categoriaFiltro
                ? 'Tente ajustar os filtros'
                : 'Clique em "Novo Imóvel" para começar'}
            </p>
          </div>
        ) : (
          <div className="p-4 grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {imoveis.map((imovel) => (
              <ImovelCard key={imovel.id} imovel={imovel} onClick={() => abrirEditar(imovel)} />
            ))}
          </div>
        )}
      </div>

      {/* Paginação */}
      {totalPaginas > 1 && (
        <div className="px-6 py-3 border-t bg-white flex items-center justify-between">
          <p className="text-sm text-gray-500">Página {pagina} de {totalPaginas}</p>
          <div className="flex gap-2">
            <button
              onClick={() => setPagina((p) => Math.max(1, p - 1))}
              disabled={pagina === 1}
              className="px-3 py-1.5 text-sm rounded-md border disabled:opacity-40 hover:bg-gray-50 transition-colors"
            >
              Anterior
            </button>
            <button
              onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
              disabled={pagina === totalPaginas}
              className="px-3 py-1.5 text-sm rounded-md border disabled:opacity-40 hover:bg-gray-50 transition-colors"
            >
              Próxima
            </button>
          </div>
        </div>
      )}

      <ImovelFormDrawer
        aberto={drawerAberto}
        onFechar={() => { setDrawerAberto(false); setImovelSelecionado(undefined) }}
        imovel={imovelSelecionado}
      />
    </div>
  )
}
