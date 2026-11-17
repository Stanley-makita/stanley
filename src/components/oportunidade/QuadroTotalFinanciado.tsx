'use client'

import { totalFinanciado } from '@/lib/oportunidade/tipoEDespesas'

interface Props {
  financiamento: number | null | undefined
  financiarCustas: boolean | null | undefined
  valorCustas: number | null | undefined
}

const brl = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

/**
 * "Valor total financiado" = financiamento + custas (pedido da equipe, 17/11/2026). Só exibição: o valor gravado
 * continua sendo só o financiamento. Some quando não há custas a somar (ver `totalFinanciado`).
 */
export function QuadroTotalFinanciado({ financiamento, financiarCustas, valorCustas }: Props) {
  const t = totalFinanciado(financiamento, financiarCustas, valorCustas)
  if (!t) return null
  return (
    <div className="space-y-1.5 rounded-lg border border-gray-200 p-4">
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <p className="text-[11px] text-gray-400">Valor Financiado</p>
          <p className="font-medium text-gray-700">{brl(financiamento!)}</p>
        </div>
        <div>
          <p className="text-[11px] text-gray-400">Custas financiadas</p>
          <p className="font-medium text-gray-700">+ {brl(t.custas)}</p>
        </div>
      </div>
      <div className="flex h-9 items-center justify-between rounded-md border border-gray-200 bg-gray-50 px-3 text-sm font-semibold text-fonti-primary">
        <span className="font-normal text-gray-500">Valor total financiado</span>
        <span>{brl(t.total)}</span>
      </div>
      <p className="text-[11px] text-gray-400">Custas pagas ao comprador — não alteram a entrada.</p>
    </div>
  )
}
