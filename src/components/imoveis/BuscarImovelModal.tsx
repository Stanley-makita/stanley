'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Search, Plus, MapPin } from 'lucide-react'
import { useBuscarImoveis } from '@/hooks/imoveis/useImoveis'
import type { Imovel, TipoImovel } from '@/types/imoveis'
import { TIPO_IMOVEL_LABELS, CATEGORIA_IMOVEL_LABELS } from '@/types/imoveis'
import { cn } from '@/lib/utils'

function enderecoResumido(imovel: Imovel): string {
  const partes: string[] = []
  if (imovel.rua) partes.push(imovel.numero ? `${imovel.rua}, ${imovel.numero}` : imovel.rua)
  if (imovel.bairro) partes.push(imovel.bairro)
  if (imovel.cidade) partes.push(imovel.cidade)
  return partes.join(' — ') || 'Endereço não informado'
}

const TIPO_CORES: Partial<Record<TipoImovel, string>> = {
  apartamento: 'border-blue-200 bg-blue-50 text-blue-700',
  casa:        'border-blue-200 bg-blue-50 text-blue-700',
  sobrado:     'border-blue-200 bg-blue-50 text-blue-700',
  terreno:     'border-amber-200 bg-amber-50 text-amber-700',
  barracao:    'border-gray-200 bg-gray-50 text-gray-600',
}

interface Props {
  aberto: boolean
  onFechar: () => void
  onSelecionar: (imovel: Imovel) => void
  onCadastrarNovo: () => void
}

export function BuscarImovelModal({ aberto, onFechar, onSelecionar, onCadastrarNovo }: Props) {
  const [inputValue, setInputValue] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(inputValue), 300)
    return () => clearTimeout(timer)
  }, [inputValue])

  useEffect(() => {
    if (!aberto) {
      setInputValue('')
      setDebouncedQuery('')
    }
  }, [aberto])

  const { data: resultados = [], isFetching } = useBuscarImoveis(debouncedQuery)

  function handleSelecionar(imovel: Imovel) {
    onSelecionar(imovel)
    onFechar()
  }

  function handleCadastrarNovo() {
    onCadastrarNovo()
    onFechar()
  }

  const mostraResultados = debouncedQuery.trim().length >= 2

  return (
    <Dialog open={aberto} onOpenChange={(open) => !open && onFechar()}>
      <DialogContent className="w-[calc(100vw-1rem)] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Buscar Imóvel Cadastrado</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Buscar por matrícula, rua, bairro ou cidade..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              className="pl-9"
              autoFocus
            />
          </div>

          {!mostraResultados && (
            <p className="text-sm text-gray-400 text-center py-4">
              Digite ao menos 2 caracteres para buscar
            </p>
          )}

          {mostraResultados && isFetching && (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-16 rounded-lg bg-gray-100 animate-pulse" />
              ))}
            </div>
          )}

          {mostraResultados && !isFetching && resultados.length === 0 && (
            <div className="text-center py-6 space-y-3">
              <MapPin className="h-8 w-8 mx-auto text-gray-300" />
              <p className="text-sm text-gray-500">Nenhum imóvel encontrado</p>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCadastrarNovo}
                className="gap-1"
              >
                <Plus className="h-3.5 w-3.5" /> Cadastrar novo imóvel
              </Button>
            </div>
          )}

          {mostraResultados && !isFetching && resultados.length > 0 && (
            <div className="space-y-1 max-h-72 overflow-y-auto">
              {resultados.map((imovel) => (
                <button
                  key={imovel.id}
                  onClick={() => handleSelecionar(imovel)}
                  className="w-full text-left p-3 rounded-lg hover:bg-gray-50 border border-transparent hover:border-gray-100 transition-all"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{enderecoResumido(imovel)}</p>
                      {imovel.matricula && (
                        <p className="text-xs text-gray-400">Matrícula: {imovel.matricula}</p>
                      )}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {imovel.tipo && (
                        <Badge variant="outline" className={cn('text-[10px] py-0', TIPO_CORES[imovel.tipo])}>
                          {TIPO_IMOVEL_LABELS[imovel.tipo]}
                        </Badge>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          <div className="flex justify-between items-center pt-2 border-t border-gray-100">
            <Button variant="ghost" size="sm" onClick={handleCadastrarNovo} className="gap-1 text-fonti-primary">
              <Plus className="h-3.5 w-3.5" /> Cadastrar novo imóvel
            </Button>
            <Button variant="outline" size="sm" onClick={onFechar}>Fechar</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
