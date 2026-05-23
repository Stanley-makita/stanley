'use client'

import { useState } from 'react'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SeletorPeriodo } from '@/components/relatorios/SeletorPeriodo'
import { AbaProducaoGeral } from '@/components/relatorios/abas/AbaProducaoGeral'
import { AbaRelPorBanco } from '@/components/relatorios/abas/AbaRelPorBanco'
import { AbaRelPorModalidade } from '@/components/relatorios/abas/AbaRelPorModalidade'
import { AbaRelPorEquipe } from '@/components/relatorios/abas/AbaRelPorEquipe'
import { PeriodoRelatorio } from '@/types/relatorios'

function periodoInicial(): PeriodoRelatorio {
  const hoje = new Date()
  return {
    dataInicio: format(startOfMonth(hoje), 'yyyy-MM-dd'),
    dataFim: format(endOfMonth(hoje), 'yyyy-MM-dd'),
  }
}

export default function RelatoriosPage() {
  const [periodo, setPeriodo] = useState<PeriodoRelatorio>(periodoInicial)
  const anoAtual = new Date().getFullYear()

  return (
    <div className="p-6 space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#253B29]">Relatórios</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Inteligência operacional da Fontinhas
          </p>
        </div>
        <SeletorPeriodo value={periodo} onChange={setPeriodo} />
      </div>

      {/* Abas */}
      <Tabs defaultValue="producao">
        <TabsList className="bg-gray-100">
          {[
            { value: 'producao', label: 'Produção Geral' },
            { value: 'banco', label: 'Por Banco' },
            { value: 'modalidade', label: 'Por Modalidade' },
            { value: 'equipe', label: 'Por Equipe' },
          ].map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className="data-[state=active]:bg-[#253B29] data-[state=active]:text-white"
            >
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="producao" className="mt-4">
          <AbaProducaoGeral ano={anoAtual} />
        </TabsContent>

        <TabsContent value="banco" className="mt-4">
          <AbaRelPorBanco periodo={periodo} />
        </TabsContent>

        <TabsContent value="modalidade" className="mt-4">
          <AbaRelPorModalidade periodo={periodo} />
        </TabsContent>

        <TabsContent value="equipe" className="mt-4">
          <AbaRelPorEquipe periodo={periodo} />
        </TabsContent>
      </Tabs>
    </div>
  )
}