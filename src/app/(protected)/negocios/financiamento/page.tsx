'use client'

import { useState } from 'react'
import { VisaoCards } from '@/components/processos/visoes/VisaoCards'
import { VisaoTabela } from '@/components/processos/visoes/VisaoTabela'
import { VisaoEmissoes } from '@/components/processos/visoes/VisaoEmissoes'
import { NovoProcessoRapidoModal } from '@/components/processos/NovoProcessoRapidoModal'
import { Button } from '@/components/ui/button'
import { usePermissao } from '@/hooks/auth/usePermissao'
import { useAuth } from '@/hooks/auth/useAuth'
import { LayoutGrid, Table2, BarChart2, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

type Visao = 'cards' | 'tabela' | 'emissoes'

export default function FinanciamentoPage() {
  const [visao, setVisao] = useState<Visao>('tabela')
  const [modalAberto, setModalAberto] = useState(false)
  const [apenasOwn, setApenasOwn] = useState(false)
  const { pode } = usePermissao()
  const { usuario } = useAuth()

  const responsavelId = apenasOwn ? (usuario?.id ?? undefined) : undefined

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-fonti-primary">Financiamento</h1>
          <p className="text-sm text-gray-500">Pipeline de financiamento imobiliário e CGI</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Toggle Meus / Equipe */}
          <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
            <button
              onClick={() => setApenasOwn(false)}
              className={cn(
                'px-3 py-2 text-sm font-medium transition-colors',
                !apenasOwn ? 'bg-fonti-primary text-white' : 'text-gray-600 hover:bg-gray-50',
              )}
            >
              Equipe
            </button>
            <button
              onClick={() => setApenasOwn(true)}
              className={cn(
                'px-3 py-2 text-sm font-medium transition-colors',
                apenasOwn ? 'bg-fonti-primary text-white' : 'text-gray-600 hover:bg-gray-50',
              )}
            >
              Meus
            </button>
          </div>

          <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
            {([
              { key: 'tabela',   label: 'Tabela',   Icone: Table2     },
              { key: 'cards',    label: 'Cards',    Icone: LayoutGrid },
              { key: 'emissoes', label: 'Emissões', Icone: BarChart2  },
            ] as const).map(({ key, label, Icone }) => (
              <button
                key={key}
                onClick={() => setVisao(key)}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors ${
                  visao === key ? 'bg-fonti-primary text-white' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <Icone className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>

          {pode('processos.criar') && (
            <Button className="bg-fonti-primary hover:bg-fonti-primary-hover text-white gap-1.5" onClick={() => setModalAberto(true)}>
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Novo Processo</span>
            </Button>
          )}
        </div>
      </div>

      {visao === 'cards'    && <VisaoCards modulo="processos" responsavelId={responsavelId} />}
      {visao === 'tabela'   && <VisaoTabela produtoFixo="financiamento" responsavelId={responsavelId} />}
      {visao === 'emissoes' && <VisaoEmissoes />}

      <NovoProcessoRapidoModal
        aberto={modalAberto}
        onFechar={() => setModalAberto(false)}
        moduloInicial="financiamento"
      />
    </div>
  )
}
