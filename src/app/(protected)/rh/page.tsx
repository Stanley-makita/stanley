'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  LayoutDashboard, Users, Cake, Briefcase, Percent, Clock, PalmtreeIcon, FileText,
} from 'lucide-react'
import { DashboardRh } from './_components/DashboardRh'
import { FuncionariosTab } from './_components/FuncionariosTab'
import { AniversariosTab } from './_components/AniversariosTab'
import { CargosTab } from './_components/CargosTab'
import { ComissoesTab } from './_components/ComissoesTab'
import { PontoTab } from './_components/PontoTab'
import { FeriasTab } from './_components/FeriasTab'
import { RelatoriosTab } from './_components/RelatoriosTab'

const ABAS = [
  { value: 'dashboard',    label: 'Dashboard',    icon: LayoutDashboard },
  { value: 'funcionarios', label: 'Funcionários', icon: Users },
  { value: 'aniversarios', label: 'Aniversários', icon: Cake },
  { value: 'cargos',       label: 'Cargos',       icon: Briefcase },
  { value: 'comissoes',    label: 'Comissões',    icon: Percent },
  { value: 'ponto',        label: 'Ponto',        icon: Clock },
  { value: 'ferias',       label: 'Férias',       icon: PalmtreeIcon },
  { value: 'relatorios',   label: 'Relatórios',   icon: FileText },
] as const

export default function RhPage() {
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Recursos Humanos</h1>
        <p className="text-sm text-gray-500">Gerencie funcionários, cargos, ponto, férias e mais</p>
      </div>

      <Tabs defaultValue="dashboard">
        <div className="border-b border-gray-200 -mx-0">
          <TabsList className="bg-transparent h-auto p-0 gap-0 rounded-none">
            {ABAS.map(({ value, label, icon: Icon }) => (
              <TabsTrigger
                key={value}
                value={value}
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#253B29] data-[state=active]:bg-transparent data-[state=active]:text-[#253B29] data-[state=active]:shadow-none text-gray-500 hover:text-gray-700 gap-1.5 px-4 py-2.5 text-sm"
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <div className="pt-5">
          <TabsContent value="dashboard" className="mt-0"><DashboardRh /></TabsContent>
          <TabsContent value="funcionarios" className="mt-0"><FuncionariosTab /></TabsContent>
          <TabsContent value="aniversarios" className="mt-0"><AniversariosTab /></TabsContent>
          <TabsContent value="cargos" className="mt-0"><CargosTab /></TabsContent>
          <TabsContent value="comissoes" className="mt-0"><ComissoesTab /></TabsContent>
          <TabsContent value="ponto" className="mt-0"><PontoTab /></TabsContent>
          <TabsContent value="ferias" className="mt-0"><FeriasTab /></TabsContent>
          <TabsContent value="relatorios" className="mt-0"><RelatoriosTab /></TabsContent>
        </div>
      </Tabs>
    </div>
  )
}
