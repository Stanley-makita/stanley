'use client'

import { useState } from 'react'
import { VisaoCards } from '@/components/processos/visoes/VisaoCards'
import { VisaoTabela } from '@/components/processos/visoes/VisaoTabela'
import { VisaoEmissoes } from '@/components/processos/visoes/VisaoEmissoes'
import { ResumoEstoque } from '@/components/processos/ResumoEstoque'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/layout/PageHeader'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { usePermissao } from '@/hooks/auth/usePermissao'
import { LayoutGrid, Table2, BarChart2, Plus } from 'lucide-react'

type Visao = 'cards' | 'tabela' | 'emissoes'

const VISOES_PROCESSOS = [
  { value: 'tabela', label: 'Tabela', icon: Table2 },
  { value: 'cards', label: 'Cards', icon: LayoutGrid },
  { value: 'emissoes', label: 'Emissões', icon: BarChart2 },
] satisfies Array<{ value: Visao; label: string; icon: typeof Table2 }>

export default function ProcessosPage() {
  const [visao, setVisao] = useState<Visao>('tabela')
  const { pode } = usePermissao()

  return (
    <div className="space-y-6 p-4 md:p-6">
      <PageHeader
        title="Processos"
        description="Acompanhe todos os processos de crédito imobiliário"
        actions={(
          <>
          <SegmentedControl
            value={visao}
            items={VISOES_PROCESSOS}
            onChange={setVisao}
            className="max-w-full"
          />

          {pode('processos.criar') && (
            <Button className="h-9 w-full gap-1.5 sm:w-auto">
              <Plus className="h-4 w-4" />
              Novo Processo
            </Button>
          )}
          </>
        )}
      />

      {/* Visão selecionada */}
      {visao === 'cards'    && <VisaoCards />}
      {visao === 'tabela'   && <VisaoTabela />}
      {visao === 'emissoes' && (
        <>
          <ResumoEstoque />
          <VisaoEmissoes />
        </>
      )}
    </div>
  )
}
