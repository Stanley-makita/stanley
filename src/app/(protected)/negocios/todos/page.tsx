'use client'

import { useState } from 'react'
import { VisaoTabela } from '@/components/processos/visoes/VisaoTabela'
import { LayoutGrid, Table2 } from 'lucide-react'

type Visao = 'tabela' | 'cards'

export default function TodosNegociosPage() {
  const [visao, setVisao] = useState<Visao>('tabela')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#253B29]">Todos os Negócios</h1>
          <p className="text-sm text-gray-500">Processos de todos os funis — financiamento, consórcio, contrato e registro</p>
        </div>

        <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
          {([
            { key: 'tabela', label: 'Tabela', Icone: Table2     },
            { key: 'cards',  label: 'Cards',  Icone: LayoutGrid },
          ] as const).map(({ key, label, Icone }) => (
            <button
              key={key}
              onClick={() => setVisao(key)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors ${
                visao === key ? 'bg-[#253B29] text-white' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Icone className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {visao === 'tabela' && <VisaoTabela />}
    </div>
  )
}
