'use client'

import { Badge } from '@/components/ui/badge'
import { Car, Maximize2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Imovel, TipoImovel, CategoriaImovel } from '@/types/imoveis'
import { TIPO_IMOVEL_LABELS, CATEGORIA_IMOVEL_LABELS } from '@/types/imoveis'

const TIPO_CORES: Record<TipoImovel, string> = {
  apartamento: 'border-blue-200 bg-blue-50 text-blue-700',
  casa:        'border-blue-200 bg-blue-50 text-blue-700',
  sobrado:     'border-blue-200 bg-blue-50 text-blue-700',
  terreno:     'border-amber-200 bg-amber-50 text-amber-700',
  barracao:    'border-gray-200 bg-gray-50 text-gray-600',
}

const CATEGORIA_CORES: Record<CategoriaImovel, string> = {
  residencial: 'border-green-200 bg-green-50 text-green-700',
  comercial:   'border-blue-200 bg-blue-50 text-blue-700',
  industrial:  'border-orange-200 bg-orange-50 text-orange-700',
  rural:       'border-teal-200 bg-teal-50 text-teal-700',
}

interface Props {
  imovel: Imovel
  onClick: () => void
}

function enderecoResumido(imovel: Imovel): string {
  const partes: string[] = []
  if (imovel.rua) {
    partes.push(imovel.numero ? `${imovel.rua}, ${imovel.numero}` : imovel.rua)
  }
  if (imovel.bairro) partes.push(imovel.bairro)
  if (imovel.cidade) partes.push(imovel.cidade)
  return partes.join(' — ') || 'Endereço não informado'
}

export function ImovelCard({ imovel, onClick }: Props) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md hover:border-fonti-primary/20 transition-all p-4 flex flex-col gap-3"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {imovel.tipo && (
            <Badge variant="outline" className={cn('text-xs', TIPO_CORES[imovel.tipo])}>
              {TIPO_IMOVEL_LABELS[imovel.tipo]}
            </Badge>
          )}
          <Badge variant="outline" className={cn('text-xs', CATEGORIA_CORES[imovel.categoria])}>
            {CATEGORIA_IMOVEL_LABELS[imovel.categoria]}
          </Badge>
        </div>
        {imovel.condicao && (
          <span className="text-[10px] text-gray-400 whitespace-nowrap capitalize shrink-0">
            {imovel.condicao}
          </span>
        )}
      </div>

      <div>
        <p className="text-sm font-medium text-gray-800 line-clamp-2 leading-snug">
          {enderecoResumido(imovel)}
        </p>
        {imovel.matricula && (
          <p className="text-xs text-gray-400 mt-0.5">Matrícula: {imovel.matricula}</p>
        )}
      </div>

      <div className="flex items-center gap-3 text-xs text-gray-500 mt-auto">
        {imovel.area_construida && (
          <span className="flex items-center gap-1">
            <Maximize2 className="h-3 w-3" />
            {imovel.area_construida} m²
          </span>
        )}
        {imovel.garagem && (
          <span className="flex items-center gap-1 text-fonti-primary">
            <Car className="h-3 w-3" />
            Garagem
          </span>
        )}
        {imovel.ultimo_processo && (
          <span className="ml-auto text-fonti-primary font-medium">
            {imovel.ultimo_processo.numero_processo}
          </span>
        )}
      </div>
    </button>
  )
}
