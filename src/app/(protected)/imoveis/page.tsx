'use client'

import { useState } from 'react'
import { Search, Building2, Plus, Pencil } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
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
      <div className="px-4 py-4 border-b bg-white md:px-6 md:py-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-lg font-semibold text-gray-900 md:text-xl">Imóveis</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {total > 0 ? `${total} imóvel${total !== 1 ? 'is' : ''} cadastrado${total !== 1 ? 's' : ''}` : 'Cadastro de imóveis'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative flex-1 sm:flex-none sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Buscar por matrícula ou endereço..."
                value={busca}
                onChange={(e) => { setBusca(e.target.value); setPagina(1) }}
                className="pl-9 w-full"
              />
            </div>
            <Button
              size="sm"
              className="bg-fonti-primary hover:bg-fonti-primary-hover text-white gap-1.5 shrink-0"
              onClick={abrirCriar}
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Novo Imóvel</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="px-4 py-2.5 border-b bg-white flex items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:px-6">
        <button
          onClick={() => { setTipoFiltro(''); setCategoriaFiltro(''); setPagina(1) }}
          className={cn(
            'text-xs px-3 py-1.5 rounded-full border shrink-0 transition-all',
            !tipoFiltro && !categoriaFiltro
              ? 'border-fonti-primary bg-fonti-primary text-white font-medium'
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
                ? 'border-fonti-primary bg-fonti-primary text-white font-medium'
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
                ? 'border-fonti-primary bg-fonti-primary text-white font-medium'
                : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
            )}
          >
            {CATEGORIA_IMOVEL_LABELS[cat]}
          </button>
        ))}
      </div>

      {/* Tabela */}
      <div className="flex-1 overflow-auto bg-white">
        {isLoading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-10 rounded-lg" />
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
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="border-b bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                <th className="text-left px-4 py-3 font-medium">Endereço</th>
                <th className="text-left px-4 py-3 font-medium">Tipo</th>
                <th className="text-left px-4 py-3 font-medium">Categoria</th>
                <th className="text-left px-4 py-3 font-medium">Condição</th>
                <th className="text-left px-4 py-3 font-medium">Matrícula</th>
                <th className="text-left px-4 py-3 font-medium">Área (m²)</th>
                <th className="text-left px-4 py-3 font-medium">Último processo</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {imoveis.map((imovel) => {
                const endereco = [
                  imovel.rua,
                  imovel.numero,
                  imovel.bairro,
                  imovel.cidade,
                  imovel.uf,
                ].filter(Boolean).join(', ') || '—'

                return (
                  <tr
                    key={imovel.id}
                    className="border-b hover:bg-gray-50 transition-colors cursor-pointer"
                    onClick={() => abrirEditar(imovel)}
                  >
                    <td className="px-4 py-3 max-w-[280px]">
                      <p className="font-medium text-gray-900 truncate">{endereco}</p>
                      {imovel.matricula && (
                        <p className="text-xs text-gray-400 mt-0.5">Matrícula: {imovel.matricula}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {imovel.tipo ? (
                        <Badge variant="outline" className="text-xs">
                          {TIPO_IMOVEL_LABELS[imovel.tipo]}
                        </Badge>
                      ) : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                        {CATEGORIA_IMOVEL_LABELS[imovel.categoria]}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {imovel.condicao === 'novo' ? 'Novo' : imovel.condicao === 'usado' ? 'Usado' : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs">
                      {imovel.matricula ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {imovel.area_construida != null ? `${imovel.area_construida} m²` : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {imovel.ultimo_processo ? (
                        <span className="text-xs text-fonti-primary font-medium">
                          {imovel.ultimo_processo.numero_processo}
                        </span>
                      ) : <span className="text-gray-400 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => abrirEditar(imovel)}
                        className="text-gray-400 hover:text-fonti-primary transition-colors"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
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
