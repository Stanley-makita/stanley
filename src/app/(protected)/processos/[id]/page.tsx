'use client'

import { useParams, useRouter } from 'next/navigation'
import { useProcesso } from '@/hooks/processos/useProcessos'
import { useAuth } from '@/hooks/auth/useAuth'
import { ProcessoStatusBadge } from '@/components/processos/ProcessoStatusBadge'
import { PainelComentarios } from '@/components/processos/detalhe/PainelComentarios'
import { PainelTarefas } from '@/components/processos/detalhe/PainelTarefas'
import { PainelPendencias } from '@/components/processos/detalhe/PainelPendencias'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Building2, Wallet, Calendar, TrendingUp, ClipboardList, User, FileText, Pencil, CheckCircle2, AlertCircle } from 'lucide-react'
import { differenceInDays } from 'date-fns'
import { useState } from 'react'
import { NovaSolicitacaoDrawer } from '@/components/solicitacoes/NovaSolicitacaoDrawer'
import { BlocoResponsaveis } from '@/components/processos/BlocoResponsaveis'
import { EditarProcessoDrawer } from '@/components/processos/EditarProcessoDrawer'
import { useAtualizarChanceEmissao } from '@/hooks/processos/useProcessos'
import { type ContextoSolicitacao } from '@/types/solicitacoes-operacionais'
import { AbaCompradores } from '@/components/processos/abas/AbaCompradores'
import { AbaVendedores } from '@/components/processos/abas/AbaVendedores'
import { AbaFases } from '@/components/processos/abas/AbaFases'
import { AbaDocumentos } from '@/components/processos/abas/AbaDocumentos'
import { AbaContrato } from '@/components/processos/abas/AbaContrato'
import { AbaTimeline } from '@/components/processos/abas/AbaTimeline'
import { AbaFinanceiro } from '@/components/processos/abas/AbaFinanceiro'
import { AbaCustas } from '@/components/processos/abas/AbaCustas'
import { AbaSolicitacoes } from '@/components/solicitacoes/AbaSolicitacoes'

const MODALIDADES_COM_CUSTAS = ['SFI', 'SBPE', 'PMCMV', 'Pro_Cotista', 'CGI'] as const

function formatarMoeda(v: number | null) {
  if (!v) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v)
}

export default function ProcessoDetalhePage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { carregando } = useAuth()
  const { data: processo, isLoading, error } = useProcesso(id)
  const [novaSolicitacaoAberta, setNovaSolicitacaoAberta] = useState(false)
  const [editarProcessoAberto, setEditarProcessoAberto] = useState(false)
  const [abaAtiva, setAbaAtiva] = useState('resumo')
  const { mutate: atualizarChance, isPending: atualizandoChance } = useAtualizarChanceEmissao()

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

  const diasEmAndamento = processo.data_inicio
    ? differenceInDays(new Date(), new Date(processo.data_inicio))
    : 0

  return (
    <div className="flex gap-6 p-6 h-[calc(100vh-80px)]">
      {/* Conteúdo principal */}
      <div className="flex-1 overflow-y-auto space-y-5">
        {/* Header do processo */}
        <div>
          <div className="flex items-center gap-3 mb-1 flex-wrap">
            <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400" onClick={() => router.push('/processos')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-xl font-bold text-[#253B29]">{processo.nome_imovel}</h1>
            <ProcessoStatusBadge status={processo.status_processo} />
            <Badge variant="outline" className="text-xs">{processo.modalidade}</Badge>
            {processo.tem_assessoria && (
              <Badge className="text-xs bg-[#E7E0C4] text-[#253B29] border-[#C2AA6A]">
                Assessoria
              </Badge>
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

              {/* Editar Processo */}
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-xs border-gray-300 text-gray-600 hover:bg-gray-50"
                onClick={() => setEditarProcessoAberto(true)}
              >
                <Pencil className="h-3.5 w-3.5" />
                Editar
              </Button>

              {/* Nova Solicitação */}
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-xs border-[#C2AA6A]/60 text-[#253B29] hover:bg-[#E7E0C4]"
                onClick={() => setNovaSolicitacaoAberta(true)}
              >
                <ClipboardList className="h-3.5 w-3.5" />
                + Solicitação
              </Button>
            </div>
          </div>

          <p className="text-xs text-gray-400 ml-11">
            {processo.numero_processo}
            {processo.banco && ` • ${processo.banco.nome}`}
            {` • ${diasEmAndamento} dias em andamento`}
            {` • Emissão: `}
            <span className={processo.chance_emissao === 'certeza' ? 'text-green-600' : 'text-amber-600'}>
              {processo.chance_emissao === 'certeza' ? 'Certeza' : 'Incerteza'}
            </span>
          </p>
        </div>

        {/* 4 KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Chance de Fechamento', valor: 'Alta', icone: TrendingUp, destaque: true },
            { label: 'Dias em Andamento',    valor: `${diasEmAndamento} dias`, icone: Calendar },
            { label: 'Valor do Imóvel',      valor: formatarMoeda(processo.valor_imovel), icone: Building2 },
            { label: 'Saldo da Conta',       valor: formatarMoeda(0), icone: Wallet },
          ].map(({ label, valor, icone: Icone, destaque }) => (
            <div
              key={label}
              className={`rounded-xl border p-4 flex items-center gap-3 ${
                destaque
                  ? 'bg-[#E7E0C4] border-[#C2AA6A]'
                  : 'bg-white border-gray-200'
              }`}
            >
              <div className="w-9 h-9 bg-white/50 rounded-lg flex items-center justify-center shrink-0">
                <Icone className="h-4 w-4 text-[#253B29]" />
              </div>
              <div>
                <p className="text-xs text-gray-500">{label}</p>
                <p className="text-sm font-bold text-[#253B29]">{valor}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Abas */}
        <Tabs value={abaAtiva} onValueChange={setAbaAtiva}>
          <TabsList className="bg-gray-100 h-9 flex-wrap">
            {([
              ['resumo','Resumo'],['compradores','Compradores'],['vendedores','Vendedores'],
              ['fases','Fases'],['documentos','Documentos'],['financeiro','Financeiro'],
              ...(MODALIDADES_COM_CUSTAS.includes(processo.modalidade as typeof MODALIDADES_COM_CUSTAS[number])
                ? [['custas','Custas']] as [string,string][]
                : []),
              ...(processo.modalidade === 'Contrato'
                ? [['contrato','Contrato']] as [string,string][]
                : []),
              ['timeline','Timeline'],['solicitacoes','Solicitações'],
            ] as [string,string][]).map(([value, label]) => (
              <TabsTrigger
                key={value}
                value={value}
                className="text-xs data-[state=active]:bg-[#253B29] data-[state=active]:text-white"
              >
                {label}
              </TabsTrigger>
            ))}
          </TabsList>

          <div className="mt-4 bg-white border border-gray-200 rounded-xl p-5">
            <TabsContent value="resumo" className="m-0">
              <AbaResumo processo={processo} />
            </TabsContent>
            <TabsContent value="compradores" className="m-0">
              <AbaCompradores processoId={id} />
            </TabsContent>
            <TabsContent value="vendedores" className="m-0">
              <AbaVendedores processoId={id} />
            </TabsContent>
            <TabsContent value="fases" className="m-0">
              <AbaFases processoId={id} processo={processo} />
            </TabsContent>
            <TabsContent value="documentos" className="m-0">
              <AbaDocumentos />
            </TabsContent>
            <TabsContent value="financeiro" className="m-0">
              <AbaFinanceiro processoId={id} />
            </TabsContent>
            <TabsContent value="custas" className="m-0">
              <AbaCustas processoId={id} />
            </TabsContent>
            <TabsContent value="contrato" className="m-0">
              <AbaContrato processoId={id} processo={processo} />
            </TabsContent>
            <TabsContent value="timeline" className="m-0">
              <AbaTimeline processoId={id} />
            </TabsContent>
            <TabsContent value="solicitacoes" className="m-0">
              <AbaSolicitacoes
                processoId={id}
                contexto={{
                  processoNumero: processo.numero_processo,
                  processoNomeImovel: processo.nome_imovel,
                  processoModalidade: processo.modalidade,
                  processoBanco: processo.banco?.nome,
                  processoFaseAtual: processo.fase_atual?.nome,
                  processoValorFinanciado: processo.valor_financiado,
                  processoCompradorPrincipal: processo.compradores?.find((c) => c.principal)?.nome ?? processo.compradores?.[0]?.nome,
                  responsavelSugeridoId: processo.operacional_id,
                } satisfies ContextoSolicitacao}
              />
            </TabsContent>
          </div>
        </Tabs>
      </div>

      <NovaSolicitacaoDrawer
        aberto={novaSolicitacaoAberta}
        onFechar={() => setNovaSolicitacaoAberta(false)}
        processoId={id}
        leadId={processo.lead_id ?? undefined}
        contexto={{
          processoNumero: processo.numero_processo,
          processoNomeImovel: processo.nome_imovel,
          processoModalidade: processo.modalidade,
          processoBanco: processo.banco?.nome,
          processoFaseAtual: processo.fase_atual?.nome,
          processoValorFinanciado: processo.valor_financiado,
          processoCompradorPrincipal: processo.compradores?.find((c) => c.principal)?.nome ?? processo.compradores?.[0]?.nome,
          responsavelSugeridoId: processo.operacional_id,
        } satisfies ContextoSolicitacao}
      />

      <EditarProcessoDrawer
        aberto={editarProcessoAberto}
        onFechar={() => setEditarProcessoAberto(false)}
        processo={processo}
      />

      {/* Painel direito — sempre visível */}
      <div className="w-80 shrink-0 flex flex-col gap-4 overflow-y-auto">
        <div className="bg-white border border-gray-200 rounded-xl p-4 flex-1">
          <PainelComentarios processoId={id} />
        </div>
        <PainelPendencias
          processoId={id}
          onIrParaSolicitacoes={() => setAbaAtiva('solicitacoes')}
        />
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <PainelTarefas processoId={id} />
        </div>
      </div>
    </div>
  )
}

// Componente inline da aba Resumo
function AbaResumo({ processo }: { processo: ReturnType<typeof useProcesso>['data'] & {} }) {
  if (!processo) return null

  const fmtMoeda = (v: number | null) =>
    v ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v) : '—'

  return (
    <div className="space-y-4">
      {/* Row 1: Operação + Participantes */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Operação */}
        <div className="space-y-3 border border-gray-100 rounded-lg p-4">
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Operação</h4>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <Campo label="Modalidade"       valor={processo.modalidade} />
            <Campo label="Banco"            valor={processo.banco?.nome ?? '—'} />
            <Campo label="Valor Financiado" valor={fmtMoeda(processo.valor_financiado)} />
            <Campo label="Entrada"          valor={fmtMoeda(processo.valor_entrada)} />
            <Campo label="Data Início"      valor={processo.data_inicio} />
            {processo.numero_proposta && (
              <Campo label="Nº Proposta" valor={processo.numero_proposta} />
            )}
          </div>
        </div>

        {/* Compradores */}
        <div className="space-y-3 border border-gray-100 rounded-lg p-4">
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Compradores</h4>
          {(processo.compradores?.length ?? 0) > 0 ? (
            <div className="space-y-1.5">
              {processo.compradores!.map((c) => (
                <div key={c.id} className="flex items-center gap-2 text-sm">
                  <User className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                  <span className="text-[#253B29] font-medium">{c.nome}</span>
                  {c.cpf && <span className="text-xs text-gray-400">{c.cpf}</span>}
                  {c.principal && (
                    <span className="text-[10px] bg-[#253B29] text-white px-1.5 py-0.5 rounded-full">Principal</span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-300 italic">Nenhum comprador cadastrado</p>
          )}
        </div>
      </div>

      {/* Row 2: Imóvel + Vendedores */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Imóvel */}
        {processo.modalidade === 'Contrato' ? (
          <div className="space-y-2 border border-gray-100 rounded-lg p-4 flex items-center gap-3">
            <div className="w-8 h-8 bg-[#E7E0C4] rounded-lg flex items-center justify-center shrink-0">
              <FileText className="h-4 w-4 text-[#253B29]" />
            </div>
            <div>
              <p className="text-xs text-gray-400">Contrato</p>
              <p className="text-sm text-gray-500 italic">Acesse a aba "Contrato" para redigir e exportar.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-3 border border-gray-100 rounded-lg p-4">
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Imóvel</h4>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="col-span-2">
                <Campo label="Descrição" valor={processo.nome_imovel} />
              </div>
              <Campo label="Valor" valor={fmtMoeda(processo.valor_imovel)} />
            </div>
          </div>
        )}

        {/* Vendedores */}
        <div className="space-y-3 border border-gray-100 rounded-lg p-4">
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Vendedores</h4>
          {(processo.vendedores?.length ?? 0) > 0 ? (
            <div className="space-y-1.5">
              {processo.vendedores!.map((v) => (
                <div key={v.id} className="flex items-center gap-2 text-sm">
                  <User className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                  <span className="text-[#253B29] font-medium">{v.nome}</span>
                  {v.cpf && <span className="text-xs text-gray-400">{v.cpf}</span>}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-300 italic">Nenhum vendedor cadastrado</p>
          )}
        </div>
      </div>

      {/* Row 3: Assessoria & Contrato + Responsáveis */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Assessoria & Contrato */}
        <div className="space-y-3 border border-gray-100 rounded-lg p-4">
          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Assessoria & Contrato</h4>
          <div className={`flex items-center justify-between p-3 rounded-lg ${processo.tem_assessoria ? 'bg-[#E7E0C4]' : 'bg-gray-50'}`}>
            <span className="text-sm text-[#253B29]">{processo.tem_assessoria ? 'Com Assessoria' : 'Sem Assessoria'}</span>
            {processo.tem_assessoria && processo.valor_assessoria != null && (
              <span className="text-sm font-semibold text-[#253B29]">{formatarMoeda(processo.valor_assessoria)}</span>
            )}
            {processo.tem_assessoria && processo.valor_assessoria == null && (
              <span className="text-xs text-[#253B29] font-medium">Inclusa</span>
            )}
          </div>
          {(processo.comissao_comercial || processo.comissao_empresa) && (
            <div className="grid grid-cols-2 gap-2 text-sm">
              {processo.comissao_comercial != null && (
                <Campo label="Comissão Comercial" valor={`${processo.comissao_comercial}%`} />
              )}
              {processo.comissao_empresa != null && (
                <Campo label="Comissão Empresa" valor={`${processo.comissao_empresa}%`} />
              )}
            </div>
          )}
        </div>

        {/* Responsáveis */}
        <BlocoResponsaveis processo={processo} />
      </div>

      {/* Barra de progresso fina */}
      {processo.fase_atual && (
        <div>
          <div className="flex justify-between text-xs text-gray-400 mb-1">
            <span>Fase atual: {processo.fase_atual.nome}</span>
          </div>
          <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: '40%', backgroundColor: processo.fase_atual.cor ?? '#253B29' }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function Campo({ label, valor }: { label: string; valor: string }) {
  return (
    <div>
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-sm font-medium text-[#253B29]">{valor}</p>
    </div>
  )
}