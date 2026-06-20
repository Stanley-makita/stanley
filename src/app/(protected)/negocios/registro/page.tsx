'use client'

import { useState } from 'react'
import { VisaoCards } from '@/components/processos/visoes/VisaoCards'
import { VisaoTabela } from '@/components/processos/visoes/VisaoTabela'
import { NovoProcessoRapidoModal } from '@/components/processos/NovoProcessoRapidoModal'
import { Button } from '@/components/ui/button'
import { usePermissao } from '@/hooks/auth/usePermissao'
import { LayoutGrid, Table2, Plus } from 'lucide-react'

type Visao = 'cards' | 'tabela'

export default function RegistroPage() {
  const [visao, setVisao] = useState<Visao>('tabela')
  const [modalAberto, setModalAberto] = useState(false)
  const { pode } = usePermissao()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-fonti-primary">Registro</h1>
          <p className="text-sm text-gray-500">Acompanhamento de ITBI, cartório e entrega ao banco</p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
            {([
              { key: 'tabela', label: 'Tabela', Icone: Table2     },
              { key: 'cards',  label: 'Cards',  Icone: LayoutGrid },
            ] as const).map(({ key, label, Icone }) => (
              <button
                key={key}
                onClick={() => setVisao(key)}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors ${
                  visao === key ? 'bg-fonti-primary text-white' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <Icone className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>

          {pode('processos.criar') && (
            <Button className="bg-fonti-primary hover:bg-fonti-primary-hover text-white gap-1.5" onClick={() => setModalAberto(true)}>
              <Plus className="h-4 w-4" />
              Novo Processo
            </Button>
          )}
        </div>
      </div>

      {visao === 'cards'  && <VisaoCards modulo="registro" produtoFixo="registro" />}
      {visao === 'tabela' && <VisaoTabela produtoFixo="registro" />}

      <NovoProcessoRapidoModal
        aberto={modalAberto}
        onFechar={() => setModalAberto(false)}
        moduloInicial="registro"
      />
    </div>
  )
}
