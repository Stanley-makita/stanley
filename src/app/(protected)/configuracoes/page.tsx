import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Settings, Building2, Users, Layers, Smartphone, Calculator, Landmark, ClipboardCheck, Bot } from 'lucide-react'
import { FasesLista } from './_components/fases/FasesLista'
import { BancosLista } from './_components/bancos/BancosLista'
import { ProdutosLista } from './_components/produtos/ProdutosLista'
import { UsuariosLista } from './_components/usuarios/UsuariosLista'
import { InstanciasLista } from './_components/instancias/InstanciasLista'
import { SimuladorConfigTab } from './_components/simulador/SimuladorConfigTab'
import { RegistrosImoveisLista } from './_components/registros-imoveis/RegistrosImoveisLista'
import { ChecklistsConfig } from './_components/checklists/ChecklistsConfig'
import { AgenteFontiConfig } from './_components/bot/AgenteFontiConfig'

export default function ConfiguracoesPage() {
  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Settings className="w-5 h-5 text-[#C2AA6A]" />
          <h1 className="text-xl font-semibold text-[#253B29]">Configurações</h1>
        </div>
        <p className="text-sm text-gray-500">
          Gerencie fases do processo, bancos parceiros, produtos, usuários, instâncias WhatsApp e registros de imóveis.
        </p>
      </div>

      <Tabs defaultValue="fases">
        <TabsList className="bg-[#253B29]/10 mb-6">
          <TabsTrigger value="fases" className="data-[state=active]:bg-[#253B29] data-[state=active]:text-white">
            <Layers className="w-4 h-4 mr-1.5" /> Fases
          </TabsTrigger>
          <TabsTrigger value="bancos" className="data-[state=active]:bg-[#253B29] data-[state=active]:text-white">
            <Building2 className="w-4 h-4 mr-1.5" /> Bancos
          </TabsTrigger>
          <TabsTrigger value="produtos" className="data-[state=active]:bg-[#253B29] data-[state=active]:text-white">
            <Settings className="w-4 h-4 mr-1.5" /> Produtos
          </TabsTrigger>
          <TabsTrigger value="usuarios" className="data-[state=active]:bg-[#253B29] data-[state=active]:text-white">
            <Users className="w-4 h-4 mr-1.5" /> Usuários
          </TabsTrigger>
          <TabsTrigger value="instancias" className="data-[state=active]:bg-[#253B29] data-[state=active]:text-white">
            <Smartphone className="w-4 h-4 mr-1.5" /> Instâncias
          </TabsTrigger>
          <TabsTrigger value="simulador" className="data-[state=active]:bg-[#253B29] data-[state=active]:text-white">
            <Calculator className="w-4 h-4 mr-1.5" /> Simulador
          </TabsTrigger>
          <TabsTrigger value="registros-imoveis" className="data-[state=active]:bg-[#253B29] data-[state=active]:text-white">
            <Landmark className="w-4 h-4 mr-1.5" /> Reg. Imóveis
          </TabsTrigger>
          <TabsTrigger value="checklists" className="data-[state=active]:bg-[#253B29] data-[state=active]:text-white">
            <ClipboardCheck className="w-4 h-4 mr-1.5" /> Checklists
          </TabsTrigger>
          <TabsTrigger value="agente-fonti" className="data-[state=active]:bg-[#253B29] data-[state=active]:text-white">
            <Bot className="w-4 h-4 mr-1.5" /> Agente Fonti
          </TabsTrigger>
        </TabsList>

        <TabsContent value="fases">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
            <h2 className="text-base font-medium text-gray-900 mb-4">Fases do Processo</h2>
            <p className="text-sm text-gray-500 mb-6">
              Defina as etapas do processo de crédito. Arraste para reordenar.
            </p>
            <FasesLista />
          </div>
        </TabsContent>

        <TabsContent value="bancos">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
            <h2 className="text-base font-medium text-gray-900 mb-4">Bancos Parceiros</h2>
            <BancosLista />
          </div>
        </TabsContent>

        <TabsContent value="produtos">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
            <h2 className="text-base font-medium text-gray-900 mb-4">Produtos e Serviços</h2>
            <ProdutosLista />
          </div>
        </TabsContent>

        <TabsContent value="usuarios">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
            <h2 className="text-base font-medium text-gray-900 mb-4">Usuários</h2>
            <UsuariosLista />
          </div>
        </TabsContent>

        <TabsContent value="instancias">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
            <h2 className="text-base font-medium text-gray-900 mb-4">Instâncias WhatsApp</h2>
            <InstanciasLista />
          </div>
        </TabsContent>

        <TabsContent value="simulador">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
            <h2 className="text-base font-medium text-gray-900 mb-1">Simulador de Custas</h2>
            <p className="text-sm text-gray-500 mb-6">Configure parâmetros de cálculo, tarifas bancárias e alíquotas de ITBI por município.</p>
            <SimuladorConfigTab />
          </div>
        </TabsContent>

        <TabsContent value="registros-imoveis">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
            <h2 className="text-base font-medium text-gray-900 mb-1">Registros de Imóveis</h2>
            <p className="text-sm text-gray-500 mb-6">
              Cadastre os cartórios de Registro de Imóveis utilizados nos processos. Exemplos: 1º RI Maringá, 2º RI Maringá, RI Sarandi.
            </p>
            <RegistrosImoveisLista />
          </div>
        </TabsContent>

        <TabsContent value="checklists">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
            <h2 className="text-base font-medium text-gray-900 mb-1">Checklists por Fase</h2>
            <p className="text-sm text-gray-500 mb-6">
              Configure os itens de verificação de cada fase. Itens obrigatórios bloqueiam o avanço de fase no processo.
            </p>
            <ChecklistsConfig />
          </div>
        </TabsContent>

        <TabsContent value="agente-fonti">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
            <h2 className="text-base font-medium text-gray-900 mb-1">Agente Fonti</h2>
            <p className="text-sm text-gray-500 mb-6">
              Personalize o comportamento do assistente virtual no WhatsApp — nome, horário, produtos e mensagens.
            </p>
            <AgenteFontiConfig />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}