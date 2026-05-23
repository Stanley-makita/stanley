'use client'

import { useState } from 'react'
import { VisaoCards } from '@/components/processos/visoes/VisaoCards'
import { VisaoTabela } from '@/components/processos/visoes/VisaoTabela'
import { VisaoEmissoes } from '@/components/processos/visoes/VisaoEmissoes'
import { ResumoEstoque } from '@/components/processos/ResumoEstoque'
import { Button } from '@/components/ui/button'
import { usePermissao } from '@/hooks/auth/usePermissao'
import { LayoutGrid, Table2, BarChart2, Plus } from 'lucide-react'

type Visao = 'cards' | 'tabela' | 'emissoes'

export default function ProcessosPage() {
  const [visao, setVisao] = useState<Visao>('cards')
  const { pode } = usePermissao()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#253B29]">Processos</h1>
          <p className="text-sm text-gray-500">Acompanhe todos os processos de crédito imobiliário</p>
        </div>

        <div className="flex items-center gap-2">
          {/* Toggle de visão */}
          <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
            {([
              { key: 'tabela',  label: 'Tabela',   Icone: Table2    },
              { key: 'cards',   label: 'Cards',    Icone: LayoutGrid },
              { key: 'emissoes', label: 'Emissões', Icone: BarChart2 },
            ] as const).map(({ key, label, Icone }) => (
              <button
                key={key}
                onClick={() => setVisao(key)}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors ${
                  visao === key
                    ? 'bg-[#253B29] text-white'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <Icone className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>

          {pode('processos.criar') && (
            <Button className="bg-[#253B29] hover:bg-[#1a2b1e] text-white gap-1.5">
              <Plus className="h-4 w-4" />
              Novo Processo
            </Button>
          )}
        </div>
      </div>

      {/* Resumo do Estoque — sempre visível */}
      <ResumoEstoque />

      {/* Visão selecionada */}
      {visao === 'cards'    && <VisaoCards />}
      {visao === 'tabela'   && <VisaoTabela />}
      {visao === 'emissoes' && <VisaoEmissoes />}
    </div>
  )
}