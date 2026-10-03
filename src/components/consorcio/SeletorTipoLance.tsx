'use client'

import { cn } from '@/lib/utils'
import { LABEL_TIPO_LANCE, type TipoLance } from '@/types/consorcio'

// Dois botões (Lance fixo / Lance livre). Clicar no já marcado desmarca (volta a "não informado").
export function SeletorTipoLance({ valor, onChange }: { valor: TipoLance | null; onChange: (v: TipoLance | null) => void }) {
  return (
    <div className="flex gap-1.5" role="radiogroup" aria-label="Tipo de lance">
      {(Object.keys(LABEL_TIPO_LANCE) as TipoLance[]).map((t) => (
        <button
          key={t}
          type="button"
          role="radio"
          aria-checked={valor === t}
          onClick={() => onChange(valor === t ? null : t)}
          className={cn(
            'h-9 flex-1 rounded-md border px-3 text-sm transition-colors',
            valor === t
              ? 'border-fonti-primary bg-fonti-primary text-white'
              : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50',
          )}
        >
          {LABEL_TIPO_LANCE[t]}
        </button>
      ))}
    </div>
  )
}
