'use client'

import { useParams, useRouter } from 'next/navigation'
import { useState } from 'react'
import { useProcesso } from '@/hooks/processos/useProcessos'
import { useAuth } from '@/hooks/auth/useAuth'
import { useFases } from '@/hooks/configuracoes/useFases'
import { Badge } from '@/components/ui/badge'
import { ParticularidadeCliente } from '@/components/pessoas/ParticularidadeCliente'
import { PipelineBarProcesso } from '@/components/processos/PipelineBarProcesso'
import { PainelChecklist } from '@/components/processos/detalhe/PainelChecklist'
import { PainelComentarios } from '@/components/processos/detalhe/PainelComentarios'
import { PainelTarefas } from '@/components/processos/detalhe/PainelTarefas'
import { PainelPendencias } from '@/components/processos/detalhe/PainelPendencias'
import { NovaTarefaDialog } from '@/components/processos/detalhe/NovaTarefaDialog'
import { ComunicarPartesProcessoModal } from '@/components/processos/ComunicarPartesProcessoModal'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { AbaResumoConsorcio } from '@/components/consorcio/AbaResumoConsorcio'
import { AbaSimulacoes } from '@/components/consorcio/AbaSimulacoes'
import { EditarConsorcioDrawer } from '@/components/consorcio/EditarConsorcioDrawer'
import { AbaFases } from '@/components/processos/abas/AbaFases'
import { AbaDocumentos } from '@/components/documentos/AbaDocumentos'
import { AbaTimeline } from '@/components/processos/abas/AbaTimeline'
import { AbaSolicitacoes } from '@/components/solicitacoes/AbaSolicitacoes'
import { AbaCompradores } from '@/components/processos/abas/AbaCompradores'
import { NovaSolicitacaoDrawer } from '@/components/solicitacoes/NovaSolicitacaoDrawer'
import { type ContextoSolicitacao } from '@/types/solicitacoes-operacionais'
import { ArrowLeft, FileText, ClipboardList, Plus, MessageCircle } from 'lucide-react'
import { differenceInDays } from 'date-fns'

const ABAS = [
  ['resumo',       'Resumo'],
  ['compradores',  'Compradores'],
  ['simulacoes',   'Simulações'],
  ['fases',        'Fases'],
  ['documentos',   'Documentos'],
  ['timeline',     'Timeline'],
  ['solicitacoes', 'Solicitações'],
] as const

export default function ConsorcioDetalhePage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { carregando } = useAuth()
  const { data: processo, isLoading, error } = useProcesso(id)
  const { data: fases = [] } = useFases('consorcio')

  const [abaAtiva, setAbaAtiva]                   = useState('resumo')
  const [editarAberto, setEditarAberto]           = useState(false)
  const [novaSolicitacaoAberta, setNovaSolicitacaoAberta] = useState(false)
  const [novaTarefaAberta, setNovaTarefaAberta]   = useState(false)
  const [comunicarAberto, setComunicarAberto]     = useState(false)
  const [itensObrigatoriosPendentes, setItensObrigatoriosPendentes] = useState(false)

  if (carregando || isLoading) {
    return (
      <div className="p-6 animate-pulse space-y-4">
        <div className="h-16 bg-gray-100 rounded-xl" />
        <div className="h-64 bg-gray-100 rounded-xl" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6 text-center py-16">
        <p className="text-red-500 text-sm font-medium">Erro ao carregar processo</p>
        <p className="text-gray-400 text-xs mt-1">{(error as any)?.message}</p>
      </div>
    )
  }

  if (!processo) {
    return <div className="p-6 text-center py-16 text-gray-400">Processo não encontrado.</div>
  }

  const compradorPrincipalObj = processo.compradores?.find((c) => c.principal) ?? processo.compradores?.[0]
  const compradorPrincipal = compradorPrincipalObj?.nome ?? processo.nome_imovel
  const pessoaId = compradorPrincipalObj?.pessoa_id ?? processo.pessoa_id

  const diasEmAndamento = processo.data_inicio
    ? differenceInDays(new Date(), new Date(processo.data_inicio))
    : 0

  const contexto: ContextoSolicitacao = {
    processoNumero: processo.numero_processo,
    processoNomeImovel: processo.nome_imovel,
    processoModalidade: processo.modalidade,
    processoFaseAtual: processo.fase_atual?.nome,
    processoValorFinanciado: processo.valor_financiado,
    processoCompradorPrincipal: compradorPrincipal,
    responsavelSugeridoId: processo.operacional_id,
  }

  return (
    <div className="flex gap-6 p-6 h-full">
      {/* Conteúdo principal */}
      <div className="flex-1 overflow-y-auto space-y-5">

        {/* ── Header ── */}
        <div>
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-gray-400 shrink-0"
              onClick={() => router.push('/negocios/consorcio')}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>

            <h1 className="text-xl font-bold text-fonti-primary truncate max-w-xs">{compradorPrincipal}</h1>
            <ParticularidadeCliente pessoaId={pessoaId} />
            <Badge variant="outline" className="text-xs">Consórcio</Badge>
          </div>

          {fases.length > 0 && (
            <div className="mb-1.5">
              <PipelineBarProcesso processo={processo} fases={fases} itensObrigatoriosPendentes={itensObrigatoriosPendentes} />
            </div>
          )}

          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
            <Button
              size="sm"
              variant="outline"
              className="h-8 shrink-0 gap-1.5 text-xs border-gray-300 text-gray-600 hover:bg-gray-50"
              onClick={() => setNovaTarefaAberta(true)}
            >
              <Plus className="h-3.5 w-3.5" /> Tarefa
            </Button>

            <Button
              size="sm"
              variant="outline"
              className="h-8 shrink-0 gap-1.5 text-xs border-gray-300 text-gray-600 hover:bg-gray-50"
              onClick={() => setEditarAberto(true)}
            >
              <FileText className="h-3.5 w-3.5" />
              Dados da Carta
            </Button>

            <Button
              size="sm"
              variant="outline"
              className="h-8 shrink-0 gap-1.5 text-xs border-fonti-accent/60 text-fonti-primary hover:bg-fonti-accent-hover"
              onClick={() => setNovaSolicitacaoAberta(true)}
            >
              <ClipboardList className="h-3.5 w-3.5" />
              + Solicitação
            </Button>

            <Button
              size="sm"
              variant="outline"
              className="h-8 shrink-0 gap-1.5 text-xs border-green-300 text-green-700 hover:bg-green-50"
              onClick={() => setComunicarAberto(true)}
            >
              <MessageCircle className="h-3.5 w-3.5" />
              Comunicar
            </Button>
          </div>

          <p className="text-xs text-gray-400 ml-10 mt-1.5">
            {processo.numero_processo}
            {processo.fase_atual && ` · Fase: ${processo.fase_atual.nome}`}
            {` · ${diasEmAndamento} dias`}
          </p>
        </div>

        {/* ── Abas ── */}
        <Tabs value={abaAtiva} onValueChange={setAbaAtiva}>
          <TabsList className="bg-gray-100 h-9">
            {ABAS.map(([value, label]) => (
              <TabsTrigger
                key={value}
                value={value}
                className="text-xs data-[state=active]:bg-fonti-primary data-[state=active]:text-white"
              >
                {label}
              </TabsTrigger>
            ))}
          </TabsList>

          <div className="mt-4 bg-white border border-gray-200 rounded-xl p-5">
            <TabsContent value="resumo" className="m-0">
              <AbaResumoConsorcio
                processo={processo}
                onIrParaCompradores={() => setAbaAtiva('compradores')}
              />
            </TabsContent>
            <TabsContent value="compradores" className="m-0">
              <AbaCompradores processoId={id} />
            </TabsContent>
            <TabsContent value="simulacoes" className="m-0">
              <AbaSimulacoes processoId={id} />
            </TabsContent>
            <TabsContent value="fases" className="m-0">
              <AbaFases processoId={id} processo={processo} />
            </TabsContent>
            <TabsContent value="documentos" className="m-0">
              <AbaDocumentos contexto="processo" processoId={id} />
            </TabsContent>
            <TabsContent value="timeline" className="m-0">
              <AbaTimeline processoId={id} />
            </TabsContent>
            <TabsContent value="solicitacoes" className="m-0">
              <AbaSolicitacoes processoId={id} contexto={contexto} />
            </TabsContent>
          </div>
        </Tabs>
      </div>

      {/* ── Painel direito ── */}
      <div className="shrink-0 overflow-hidden rounded-xl border border-gray-200 bg-white divide-y divide-gray-100 w-80 flex flex-col overflow-y-auto">
        <PainelChecklist
          processoId={id}
          faseId={processo.fase_atual_id}
          onPendenciasChange={setItensObrigatoriosPendentes}
        />
        <PainelPendencias
          processoId={id}
          onIrParaSolicitacoes={() => setAbaAtiva('solicitacoes')}
        />
        <PainelTarefas processoId={id} onNovaTarefa={() => setNovaTarefaAberta(true)} />
        <PainelComentarios processoId={id} />
      </div>

      {/* ── Drawers e modais ── */}
      <EditarConsorcioDrawer
        aberto={editarAberto}
        onFechar={() => setEditarAberto(false)}
        processo={processo}
      />

      <NovaSolicitacaoDrawer
        aberto={novaSolicitacaoAberta}
        onFechar={() => setNovaSolicitacaoAberta(false)}
        processoId={id}
        leadId={processo.lead_id ?? undefined}
        contexto={contexto}
      />

      <NovaTarefaDialog
        open={novaTarefaAberta}
        onOpenChange={setNovaTarefaAberta}
        processoId={id}
      />

      <ComunicarPartesProcessoModal
        processoId={id}
        open={comunicarAberto}
        onOpenChange={setComunicarAberto}
      />
    </div>
  )
}
