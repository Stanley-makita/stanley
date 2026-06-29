'use client'

import { useParams, useRouter } from 'next/navigation'
import { useState } from 'react'
import { useProcesso, useAtualizarChanceEmissao } from '@/hooks/processos/useProcessos'
import { useAuth } from '@/hooks/auth/useAuth'
import { useFases } from '@/hooks/configuracoes/useFases'
import { ProcessoStatusBadge } from '@/components/processos/ProcessoStatusBadge'
import { PainelComentarios } from '@/components/processos/detalhe/PainelComentarios'
import { PainelTarefas } from '@/components/processos/detalhe/PainelTarefas'
import { PainelPendencias } from '@/components/processos/detalhe/PainelPendencias'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { AbaResumoConsorcio } from '@/components/consorcio/AbaResumoConsorcio'
import { AbaSimulacoes } from '@/components/consorcio/AbaSimulacoes'
import { EditarConsorcioDrawer } from '@/components/consorcio/EditarConsorcioDrawer'
import { AbaFases } from '@/components/processos/abas/AbaFases'
import { AbaDocumentos } from '@/components/processos/abas/AbaDocumentos'
import { AbaTimeline } from '@/components/processos/abas/AbaTimeline'
import { AbaSolicitacoes } from '@/components/solicitacoes/AbaSolicitacoes'
import { AbaCompradores } from '@/components/processos/abas/AbaCompradores'
import { NovaSolicitacaoDrawer } from '@/components/solicitacoes/NovaSolicitacaoDrawer'
import { type ContextoSolicitacao } from '@/types/solicitacoes-operacionais'
import { ArrowLeft, Pencil, ClipboardList, CheckCircle2, AlertCircle } from 'lucide-react'
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
  const { mutate: atualizarChance, isPending: atualizandoChance } = useAtualizarChanceEmissao()

  const [abaAtiva, setAbaAtiva]                   = useState('resumo')
  const [editarAberto, setEditarAberto]           = useState(false)
  const [novaSolicitacaoAberta, setNovaSolicitacaoAberta] = useState(false)

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

  const compradorPrincipal =
    processo.compradores?.find((c) => c.principal)?.nome ??
    processo.compradores?.[0]?.nome ??
    processo.nome_imovel

  const diasEmAndamento = processo.data_inicio
    ? differenceInDays(new Date(), new Date(processo.data_inicio))
    : 0

  // Mini-stepper
  const faseAtualOrdem = fases.find((f) => f.id === processo.fase_atual_id)?.ordem ?? null

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
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-gray-400 shrink-0"
              onClick={() => router.push('/negocios/consorcio')}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>

            <h1 className="text-xl font-bold text-fonti-primary truncate max-w-xs">{compradorPrincipal}</h1>
            <ProcessoStatusBadge status={processo.status_processo} />
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">
              Consórcio
            </span>

            {/* Mini-stepper */}
            {fases.length > 0 && (
              <div className="flex items-center gap-1 ml-1">
                {fases.map((fase) => {
                  const concluida = faseAtualOrdem !== null && fase.ordem < faseAtualOrdem
                  const atual = fase.id === processo.fase_atual_id
                  return (
                    <div
                      key={fase.id}
                      className={`w-2.5 h-2.5 rounded-full transition-all ${
                        concluida
                          ? 'bg-fonti-primary'
                          : atual
                            ? 'bg-fonti-accent ring-2 ring-fonti-accent/30'
                            : 'bg-gray-200'
                      }`}
                      title={fase.nome}
                    />
                  )
                })}
              </div>
            )}

            <div className="ml-auto flex items-center gap-2">
              {/* Toggle Certeza / Incerteza */}
              <Button
                size="sm"
                variant="outline"
                disabled={atualizandoChance}
                onClick={() =>
                  atualizarChance({
                    processoId: id,
                    chance_emissao: processo.chance_emissao === 'certeza' ? 'incerteza' : 'certeza',
                  })
                }
                className={
                  processo.chance_emissao === 'certeza'
                    ? 'gap-1.5 text-xs border-green-300 text-green-700 bg-green-50 hover:bg-green-100'
                    : 'gap-1.5 text-xs border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100'
                }
              >
                {processo.chance_emissao === 'certeza' ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : (
                  <AlertCircle className="h-3.5 w-3.5" />
                )}
                {processo.chance_emissao === 'certeza' ? 'Certeza' : 'Incerteza'}
              </Button>

              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-xs border-gray-300 text-gray-600 hover:bg-gray-50"
                onClick={() => setEditarAberto(true)}
              >
                <Pencil className="h-3.5 w-3.5" />
                Editar
              </Button>

              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-xs border-fonti-accent/60 text-fonti-primary hover:bg-fonti-accent-hover"
                onClick={() => setNovaSolicitacaoAberta(true)}
              >
                <ClipboardList className="h-3.5 w-3.5" />
                + Solicitação
              </Button>
            </div>
          </div>

          <p className="text-xs text-gray-400 ml-10">
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
              <AbaDocumentos />
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
      <div className="w-80 shrink-0 flex flex-col gap-4 overflow-y-auto">
        <PainelPendencias
          processoId={id}
          onIrParaSolicitacoes={() => setAbaAtiva('solicitacoes')}
        />
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <PainelTarefas processoId={id} />
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <PainelComentarios processoId={id} />
        </div>
      </div>

      {/* ── Drawers ── */}
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
    </div>
  )
}
