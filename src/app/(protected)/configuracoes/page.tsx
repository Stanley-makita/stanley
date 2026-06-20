'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import {
  Settings, Building2, Users, Layers, Smartphone, Calculator,
  Landmark, ClipboardCheck, Bot, LayoutTemplate, Percent, Target,
  Package, ChevronRight, ArrowLeft,
} from 'lucide-react'
import { FasesLista } from './_components/fases/FasesLista'
import { BancosLista } from './_components/bancos/BancosLista'
import { ProdutosLista } from './_components/produtos/ProdutosLista'
import { UsuariosLista } from './_components/usuarios/UsuariosLista'
import { InstanciasLista } from './_components/instancias/InstanciasLista'
import { SimuladorConfigTab } from './_components/simulador/SimuladorConfigTab'
import { RegistrosImoveisLista } from './_components/registros-imoveis/RegistrosImoveisLista'
import { ChecklistsConfig } from './_components/checklists/ChecklistsConfig'
import { AgenteFontiConfig } from './_components/bot/AgenteFontiConfig'
import { AbasConfigTab } from './_components/abas/AbasConfigTab'
import { AbaComissoesPadrao } from '@/components/configuracoes/AbaComissoesPadrao'
import { AbaMetas } from '@/components/configuracoes/AbaMetas'

interface ConfigItem {
  key: string
  label: string
  descricao: string
  icon: React.ElementType
}

interface ConfigGrupo {
  titulo: string
  itens: ConfigItem[]
}

const GRUPOS: ConfigGrupo[] = [
  {
    titulo: 'Pipeline',
    itens: [
      { key: 'fases',      label: 'Fases',         descricao: 'Etapas do pipeline de crédito, consórcio e contratos',  icon: Layers },
      { key: 'checklists', label: 'Checklists',     descricao: 'Itens de verificação obrigatórios por fase',             icon: ClipboardCheck },
      { key: 'abas-lead',  label: 'Abas do Lead',   descricao: 'Ordem e visibilidade das abas no modal de lead',         icon: LayoutTemplate },
    ],
  },
  {
    titulo: 'Comercial & Financeiro',
    itens: [
      { key: 'bancos',          label: 'Bancos',            descricao: 'Bancos e instituições parceiras',                       icon: Building2 },
      { key: 'produtos',        label: 'Produtos',          descricao: 'Produtos e modalidades de crédito oferecidos',          icon: Package },
      { key: 'comissoes-banco', label: 'Comissões Banco',   descricao: 'Percentuais por banco, modalidade, piso e teto',        icon: Percent },
      { key: 'metas',           label: 'Metas',             descricao: 'Metas mensais de valor financiado e contratos',         icon: Target },
      { key: 'simulador',       label: 'Simulador',         descricao: 'Parâmetros de custas, ITBI e tarifas bancárias',        icon: Calculator },
    ],
  },
  {
    titulo: 'Imóveis',
    itens: [
      { key: 'registros-imoveis', label: 'Registros de Imóveis', descricao: 'Cartórios de RI utilizados nos processos', icon: Landmark },
    ],
  },
  {
    titulo: 'Usuários & Equipe',
    itens: [
      { key: 'usuarios', label: 'Usuários', descricao: 'Gerencie usuários, acessos e permissões', icon: Users },
    ],
  },
  {
    titulo: 'Comunicação & Automação',
    itens: [
      { key: 'instancias',   label: 'Instâncias WhatsApp', descricao: 'Números e instâncias conectadas ao sistema',            icon: Smartphone },
      { key: 'agente-fonti', label: 'Agente Fonti',        descricao: 'Comportamento do assistente virtual no WhatsApp',       icon: Bot },
    ],
  },
]

const TODOS_ITENS = GRUPOS.flatMap(g => g.itens)

function renderConteudo(key: string) {
  const wrap = (titulo: string, descricao: string, children: React.ReactNode) => (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
      <h2 className="text-base font-medium text-gray-900 mb-1">{titulo}</h2>
      {descricao && <p className="text-sm text-gray-500 mb-6">{descricao}</p>}
      {children}
    </div>
  )

  switch (key) {
    case 'fases':            return wrap('Fases do Processo', 'Defina as etapas do pipeline. Arraste para reordenar.', <FasesLista />)
    case 'bancos':           return wrap('Bancos Parceiros', '', <BancosLista />)
    case 'produtos':         return wrap('Produtos e Serviços', '', <ProdutosLista />)
    case 'usuarios':         return wrap('Usuários', '', <UsuariosLista />)
    case 'instancias':       return wrap('Instâncias WhatsApp', '', <InstanciasLista />)
    case 'simulador':        return wrap('Simulador de Custas', 'Configure parâmetros de cálculo, tarifas bancárias e alíquotas de ITBI por município.', <SimuladorConfigTab />)
    case 'registros-imoveis': return wrap('Registros de Imóveis', 'Cadastre os cartórios de RI utilizados nos processos.', <RegistrosImoveisLista />)
    case 'checklists':       return wrap('Checklists por Fase', 'Itens obrigatórios bloqueiam o avanço de fase no processo.', <ChecklistsConfig />)
    case 'agente-fonti':     return wrap('Agente Fonti', 'Personalize o assistente virtual no WhatsApp — nome, horário, produtos e mensagens.', <AgenteFontiConfig />)
    case 'abas-lead':        return wrap('Abas do Lead', 'Defina a ordem das abas no modal de detalhe do lead.', <AbasConfigTab />)
    case 'comissoes-banco':  return wrap('Comissões por Banco', 'Configure o percentual por banco e modalidade, com piso e teto por operação.', <AbaComissoesPadrao />)
    case 'metas':            return wrap('Metas da Equipe', 'Metas mensais de valor financiado e número de contratos.', <AbaMetas />)
    default:                 return null
  }
}

function ConfiguracoesInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const abaAtiva = searchParams.get('aba')

  const itemAtivo = abaAtiva ? TODOS_ITENS.find(i => i.key === abaAtiva) : null

  function navegar(key: string) {
    router.push(`/configuracoes?aba=${key}`)
  }

  function voltar() {
    router.push('/configuracoes')
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          {itemAtivo && (
            <button onClick={voltar} className="p-1 rounded hover:bg-gray-100 transition-colors mr-1">
              <ArrowLeft className="w-4 h-4 text-gray-500" />
            </button>
          )}
          <Settings className="w-5 h-5 text-fonti-accent" />
          <h1 className="text-xl font-semibold text-fonti-primary">
            {itemAtivo ? itemAtivo.label : 'Configurações'}
          </h1>
        </div>
        {!itemAtivo && (
          <p className="text-sm text-gray-500 ml-7">
            Gerencie pipeline, comercial, usuários, comunicação e automação.
          </p>
        )}
        {itemAtivo && (
          <p className="text-sm text-gray-400 ml-7">
            <button onClick={voltar} className="hover:underline">Configurações</button>
            <ChevronRight className="inline w-3 h-3 mx-1" />
            {itemAtivo.label}
          </p>
        )}
      </div>

      {/* Conteúdo ativo */}
      {itemAtivo ? (
        renderConteudo(itemAtivo.key)
      ) : (
        /* Grid de categorias */
        <div className="space-y-8">
          {GRUPOS.map(grupo => (
            <div key={grupo.titulo}>
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                {grupo.titulo}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {grupo.itens.map(item => {
                  const Icon = item.icon
                  return (
                    <button
                      key={item.key}
                      onClick={() => navegar(item.key)}
                      className="flex items-start gap-3 p-4 bg-white border border-gray-200 rounded-xl hover:border-fonti-primary/30 hover:shadow-sm transition-all text-left group"
                    >
                      <div className="w-8 h-8 rounded-lg bg-fonti-primary/10 flex items-center justify-center shrink-0 group-hover:bg-fonti-primary/20 transition-colors">
                        <Icon className="w-4 h-4 text-fonti-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-fonti-primary">{item.label}</p>
                        <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{item.descricao}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-400 shrink-0 mt-0.5 transition-colors" />
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function ConfiguracoesPage() {
  return (
    <Suspense>
      <ConfiguracoesInner />
    </Suspense>
  )
}
