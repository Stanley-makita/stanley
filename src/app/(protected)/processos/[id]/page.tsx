'use client'

import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useProcesso } from '@/hooks/processos/useProcessos'
import { useAuth } from '@/hooks/auth/useAuth'
import { ProcessoStatusBadge } from '@/components/processos/ProcessoStatusBadge'
import { PainelComentarios } from '@/components/processos/detalhe/PainelComentarios'
import { PainelTarefas } from '@/components/processos/detalhe/PainelTarefas'
import { PainelPendencias } from '@/components/processos/detalhe/PainelPendencias'
import { PainelChecklist } from '@/components/processos/detalhe/PainelChecklist'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Building2, Calendar, ClipboardList, User, FileText, DollarSign, CheckCircle2, AlertCircle, Plus, Download, Mail } from 'lucide-react'
import { ValidadeCard } from '@/components/processos/detalhe/ValidadeCard'
import { EngenhariaCard } from '@/components/processos/detalhe/EngenhariaCard'
import { AlertaVencimentoModal } from '@/components/processos/detalhe/AlertaVencimentoModal'
import { useAlertasVencimento } from '@/hooks/processos/useAlertasVencimento'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { differenceInDays } from 'date-fns'
import { useState, useMemo } from 'react'
import { NovaSolicitacaoDrawer } from '@/components/solicitacoes/NovaSolicitacaoDrawer'
import { BlocoResponsaveis } from '@/components/processos/BlocoResponsaveis'
import { BlocoParceiros } from '@/components/processos/BlocoParceiros'
import { EditarProcessoDrawer } from '@/components/processos/EditarProcessoDrawer'
import { useAtualizarChanceEmissao, useAtualizarImovelProcesso } from '@/hooks/processos/useProcessos'
import { useProcessoFasesHistorico } from '@/hooks/processos/useProcessoFasesHistorico'
import { BlocoImovel } from '@/components/imoveis/BlocoImovel'
import { type ContextoSolicitacao } from '@/types/solicitacoes-operacionais'
import { AbaCompradores } from '@/components/processos/abas/AbaCompradores'
import { AbaVendedores } from '@/components/processos/abas/AbaVendedores'
import { AbaFases } from '@/components/processos/abas/AbaFases'
import { AbaDocumentos } from '@/components/documentos/AbaDocumentos'
import { AbaContrato } from '@/components/processos/abas/AbaContrato'
import { AbaTimeline } from '@/components/processos/abas/AbaTimeline'
import { AbaFinanceiro } from '@/components/processos/abas/AbaFinanceiro'
import { AbaCustas } from '@/components/processos/abas/AbaCustas'
import { AbaSolicitacoes } from '@/components/solicitacoes/AbaSolicitacoes'
import { NovaTarefaDialog } from '@/components/processos/detalhe/NovaTarefaDialog'
import { ModalConfirmacaoValores } from '@/components/processos/ModalConfirmacaoValores'
import { EmailConfirmacaoBadge } from '@/components/processos/EmailConfirmacaoBadge'

const MODALIDADES_COM_CUSTAS = ['SFI', 'SBPE', 'PMCMV', 'Pro_Cotista', 'CGI'] as const

function formatarMoeda(v: number | null) {
  if (!v) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v)
}

export default function ProcessoDetalhePage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { carregando } = useAuth()
  const { data: processo, isLoading, error } = useProcesso(id)
  const [novaSolicitacaoAberta, setNovaSolicitacaoAberta] = useState(false)
  const [editarProcessoAberto, setEditarProcessoAberto] = useState(false)
  const [novaTarefaAberta, setNovaTarefaAberta] = useState(false)
  const [confirmFormulariosAberto, setConfirmFormulariosAberto] = useState(false)
  const [gerandoFormularios, setGerandoFormularios] = useState(false)
  const [confirmacaoValoresAberto, setConfirmacaoValoresAberto] = useState(false)

  function bancoTemFormularios(nome?: string | null): boolean {
    if (!nome) return false
    const n = nome.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    return n.includes('bradesco') || n.includes('brasil') || n === 'bb'
      || n.includes('santander') || n.includes('itau') || n.includes('ita')
      || n.includes('caixa')
  }

  async function confirmarGerarFormularios() {
    if (!processo?.banco?.nome) return
    setConfirmFormulariosAberto(false)
    setGerandoFormularios(true)
    try {
      const res = await fetch(`/api/processos/${id}/formularios?banco=${encodeURIComponent(processo.banco.nome)}`, {
        method: 'POST',
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Erro ao gerar formulários')

      toast.success(json.mensagem, {
        className: 'border-l-4 border-l-fonti-accent bg-fonti-accent-hover text-fonti-primary',
        duration: 6000,
      })
      // Recarrega aba de documentos
      setAbaAtiva('documentos')
    } catch (e: any) {
      toast.error(e.message ?? 'Erro ao gerar formulários.')
    } finally {
      setGerandoFormularios(false)
    }
  }
  const [abaAtiva, setAbaAtiva] = useState(searchParams.get('aba') ?? 'resumo')
  const [itensObrigatoriosPendentes, setItensObrigatoriosPendentes] = useState(false)

  // Dados financeiros obrigatórios: bloqueia avanço de fase se incompletos ou inconsistentes
  const dadosFinanceirosPendentes = useMemo(() => {
    if (!processo) return false
    const p = processo as any
    if (!p.banco_id)                                    return true
    if (!p.taxa_juros  || p.taxa_juros  <= 0)           return true
    if (!p.sistema_amortizacao)                         return true
    if (!p.valor_imovel    || p.valor_imovel    <= 0)   return true
    if (!p.valor_financiado || p.valor_financiado <= 0) return true
    if (p.valor_fgts === null || p.valor_fgts === undefined) return true
    // Consistência: imóvel deve cobrir financiado + FGTS
    const rp = p.valor_imovel - p.valor_financiado - (p.valor_fgts ?? 0)
    if (rp < 0) return true
    return false
  }, [processo])
  const { mutate: atualizarChance, isPending: atualizandoChance } = useAtualizarChanceEmissao()
  const { mutate: atualizarImovel, isPending: atualizandoImovel } = useAtualizarImovelProcesso()
  const { alertasBloqueantes, alertasVencidos, confirmar: confirmarAlertas } = useAlertasVencimento(id, {
    validade_credito:    (processo as any)?.validade_credito,
    validade_engenharia: (processo as any)?.validade_engenharia,
    validade_matricula:  (processo as any)?.validade_matricula,
  })
  const { data: fasesHistorico = [] } = useProcessoFasesHistorico(id)

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
    <div className="flex flex-col gap-5 p-4 lg:h-full lg:flex-row lg:gap-6 lg:p-6">
      {/* Conteúdo principal */}
      <div className="min-w-0 flex-1 space-y-5 overflow-visible lg:overflow-y-auto">
        {/* Header do processo */}
        <div>
          {/* Row 1: voltar + nome + badges */}
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-gray-400" onClick={() => router.push('/processos')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="min-w-0 flex-1 text-lg font-bold leading-tight text-fonti-primary sm:text-xl">
              {processo.compradores?.find(c => c.principal)?.nome
                ?? processo.compradores?.[0]?.nome
                ?? processo.nome_imovel}
            </h1>
            {processo.fase_atual ? (
              <Badge
                variant="outline"
                className="text-xs font-medium"
                style={processo.fase_atual.cor ? {
                  backgroundColor: processo.fase_atual.cor + '20',
                  borderColor: processo.fase_atual.cor + '60',
                  color: processo.fase_atual.cor,
                } : undefined}
              >
                {processo.fase_atual.nome}
              </Badge>
            ) : (
              <ProcessoStatusBadge status={processo.status_processo} />
            )}
            <Badge variant="outline" className="text-xs">{processo.modalidade}</Badge>
            {processo.tem_assessoria && (
              <Badge className="text-xs bg-fonti-accent-hover text-fonti-primary border-fonti-accent">
                Assessoria
              </Badge>
            )}
            <EmailConfirmacaoBadge processoId={id} />
          </div>
          {/* Row 2: botões de ação */}
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
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
                    ? 'h-8 shrink-0 gap-1.5 text-xs border-green-300 text-green-700 bg-green-50 hover:bg-green-100'
                    : 'h-8 shrink-0 gap-1.5 text-xs border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100'
                }
              >
                {processo.chance_emissao === 'certeza' ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : (
                  <AlertCircle className="h-3.5 w-3.5" />
                )}
                {processo.chance_emissao === 'certeza' ? 'Certeza' : 'Incerteza'}
              </Button>

              {/* Nova Tarefa */}
              <Button
                size="sm"
                variant="outline"
                className="h-8 shrink-0 gap-1.5 text-xs border-gray-300 text-gray-600 hover:bg-gray-50"
                onClick={() => setNovaTarefaAberta(true)}
              >
                <Plus className="h-3.5 w-3.5" /> Tarefa
              </Button>

              {/* Editar Processo */}
              <Button
                size="sm"
                variant="outline"
                className="h-8 shrink-0 gap-1.5 text-xs border-gray-300 text-gray-600 hover:bg-gray-50"
                onClick={() => setEditarProcessoAberto(true)}
              >
                <DollarSign className="h-3.5 w-3.5" />
                Negócio
              </Button>

              {/* Gerar Formulários — apenas bancos com templates disponíveis */}
              {bancoTemFormularios(processo.banco?.nome) && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={gerandoFormularios}
                  className="h-8 shrink-0 gap-1.5 text-xs border-blue-300 text-blue-700 hover:bg-blue-50 disabled:opacity-40"
                  onClick={() => setConfirmFormulariosAberto(true)}
                >
                  <Download className="h-3.5 w-3.5" />
                  {gerandoFormularios ? 'Gerando...' : 'Formulários'}
                </Button>
              )}

              {/* Confirmação de Valores — a partir da fase Engenharia */}
              {(processo.fase_atual?.nome?.toLowerCase().includes('engenharia') ||
                fasesHistorico.some(h => h.fase?.nome?.toLowerCase().includes('engenharia'))) && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!processo.banco?.nome}
                  title={!processo.banco?.nome ? 'Defina o banco do processo antes de enviar a confirmação' : 'Enviar confirmação de valores por e-mail'}
                  className="h-8 shrink-0 gap-1.5 text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-50 disabled:opacity-40"
                  onClick={() => setConfirmacaoValoresAberto(true)}
                >
                  <Mail className="h-3.5 w-3.5" />
                  Confirmar Valores
                </Button>
              )}

              {/* Nova Solicitação */}
              <Button
                size="sm"
                variant="outline"
                className="h-8 shrink-0 gap-1.5 text-xs border-fonti-accent/60 text-fonti-primary hover:bg-fonti-accent-hover"
                onClick={() => setNovaSolicitacaoAberta(true)}
              >
                <ClipboardList className="h-3.5 w-3.5" />
                + Solicitação
              </Button>
            </div>

          {!processo.imovel_id && processo.nome_imovel && (
            <p className="ml-10 text-sm font-medium text-fonti-primary sm:ml-11">
              {processo.nome_imovel}
            </p>
          )}
          <p className="ml-10 text-xs text-gray-400 sm:ml-11">
            {processo.numero_processo}
            {processo.banco && ` • ${processo.banco.nome}`}
            {` • ${diasEmAndamento} dias em andamento`}
            {` • Emissão: `}
            <span className={processo.chance_emissao === 'certeza' ? 'text-green-600' : 'text-amber-600'}>
              {processo.chance_emissao === 'certeza' ? 'Certeza' : 'Incerteza'}
            </span>
          </p>
        </div>

        {/* KPIs + Validades */}
        {(() => {
          const faseEng = processo.fase_atual?.nome?.toLowerCase().includes('engenharia') ?? false
          const jaPasoiEngenharia = fasesHistorico.some(h => h.fase?.nome?.toLowerCase().includes('engenharia'))
          const temEngenharia = faseEng || jaPasoiEngenharia || Boolean((processo as any).validade_engenharia || (processo as any).valor_engenharia)
          const temMatricula  = faseEng || jaPasoiEngenharia || Boolean((processo as any).validade_matricula)
          const numCards = 3 + (temMatricula ? 1 : 0) + (temEngenharia ? 1 : 0)
          const gridColsClass = numCards <= 3 ? 'md:grid-cols-3' : numCards === 4 ? 'md:grid-cols-4' : 'md:grid-cols-5'
          return (
            <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${gridColsClass}`}>
              {/* Valor do Imóvel */}
              <div className="rounded-xl border border-gray-200 bg-white p-4 flex items-center gap-3">
                <div className="w-9 h-9 bg-gray-50 rounded-lg flex items-center justify-center shrink-0">
                  <Building2 className="h-4 w-4 text-fonti-primary" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">Valor do Imóvel</p>
                  <p className="text-sm font-bold text-fonti-primary">{formatarMoeda(processo.valor_imovel)}</p>
                </div>
              </div>

              {/* Dias em Andamento */}
              <div className="rounded-xl border border-gray-200 bg-white p-4 flex items-center gap-3">
                <div className="w-9 h-9 bg-gray-50 rounded-lg flex items-center justify-center shrink-0">
                  <Calendar className="h-4 w-4 text-fonti-primary" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">Dias em Andamento</p>
                  <p className="text-sm font-bold text-fonti-primary">{diasEmAndamento} dias</p>
                </div>
              </div>

              {/* Validade Crédito — sempre visível */}
              <ValidadeCard processoId={id} tipo="credito" label="Validade Crédito" data={(processo as any).validade_credito} />

              {/* Validade Matrícula — só na fase Engenharia ou se já preenchido */}
              {temMatricula && (
                <ValidadeCard processoId={id} tipo="matricula" label="Validade Matrícula" data={(processo as any).validade_matricula} />
              )}

              {/* Engenharia (vencimento + valor) — só na fase Engenharia ou se já preenchido */}
              {temEngenharia && (
                <EngenhariaCard
                  processoId={id}
                  validadeEngenharia={(processo as any).validade_engenharia}
                  valorEngenharia={(processo as any).valor_engenharia}
                />
              )}
            </div>
          )
        })()}

        {/* Banner não-bloqueante para prazos já vencidos */}
        {alertasVencidos.length > 0 && (
          <div className="flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 sm:flex-row sm:items-start">
            <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-red-800">Prazo(s) vencido(s)</p>
              <p className="text-xs text-red-600 mt-0.5">
                {alertasVencidos.map(a => `${a.label} (${Math.abs(a.diasRestantes)}d atrás)`).join(' · ')}
                {' — '}Atualize as datas nos cards acima.
              </p>
            </div>
            <button
              onClick={() => confirmarAlertas.mutate(alertasVencidos)}
              className="text-xs text-red-500 hover:text-red-700 underline shrink-0"
            >
              Ciente
            </button>
          </div>
        )}

        {/* Modal bloqueante apenas para prazos futuros próximos do vencimento */}
        <AlertaVencimentoModal
          alertas={alertasBloqueantes}
          onConfirmar={() => confirmarAlertas.mutate(alertasBloqueantes)}
          isPending={confirmarAlertas.isPending}
        />

        {/* Abas */}
        <Tabs value={abaAtiva} onValueChange={setAbaAtiva}>
          <div className="-mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
          <TabsList className="inline-flex h-9 min-w-max bg-gray-100">
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
                className="text-xs data-[state=active]:bg-fonti-primary data-[state=active]:text-white"
              >
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
          </div>

          <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4 sm:p-5">
            <TabsContent value="resumo" className="m-0">
              <AbaResumo
                processo={processo}
                onUpdateImovel={(campos) => atualizarImovel({ processoId: id, ...campos } as any)}
                isPendingImovel={atualizandoImovel}
              />
            </TabsContent>
            <TabsContent value="compradores" className="m-0">
              <AbaCompradores processoId={id} />
            </TabsContent>
            <TabsContent value="vendedores" className="m-0">
              <AbaVendedores processoId={id} />
            </TabsContent>
            <TabsContent value="fases" className="m-0">
              <AbaFases processoId={id} processo={processo} itensObrigatoriosPendentes={itensObrigatoriosPendentes} dadosFinanceirosPendentes={dadosFinanceirosPendentes} />
            </TabsContent>
            <TabsContent value="documentos" className="m-0">
              <AbaDocumentos contexto="processo" processoId={id} />
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

      <NovaTarefaDialog
        open={novaTarefaAberta}
        onOpenChange={setNovaTarefaAberta}
        processoId={id}
      />

      <ModalConfirmacaoValores
        processoId={id}
        aberto={confirmacaoValoresAberto}
        onFechar={() => setConfirmacaoValoresAberto(false)}
      />

      {/* Confirmação de geração de formulários */}
      <Dialog open={confirmFormulariosAberto} onOpenChange={setConfirmFormulariosAberto}>
        <DialogContent className="max-h-[92svh] w-[calc(100vw-1rem)] max-w-sm overflow-y-auto sm:w-full">
          <DialogHeader>
            <DialogTitle className="text-fonti-primary">Gerar formulários</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600 py-2">
            Confirma o preenchimento automático dos formulários do{' '}
            <span className="font-semibold text-fonti-primary">{processo.banco?.nome}</span>?
          </p>
          <p className="text-xs text-gray-400">
            Os PDFs serão gerados com os dados do processo e salvos na aba <strong>Documentos</strong>.
          </p>
          <DialogFooter className="mt-2 flex-col-reverse gap-2 sm:flex-row">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmFormulariosAberto(false)}
            >
              Não, cancelar
            </Button>
            <Button
              size="sm"
              className="bg-fonti-primary hover:bg-fonti-primary-hover text-white"
              onClick={confirmarGerarFormularios}
            >
              <Download className="h-3.5 w-3.5 mr-1" />
              Sim, gerar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Painel direito — sempre visível */}
      <div className="shrink-0 overflow-hidden rounded-xl border border-gray-200 bg-white divide-y divide-gray-100 lg:w-80 lg:flex lg:flex-col lg:overflow-y-auto">
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
    </div>
  )
}

// Componente inline da aba Resumo
function AbaResumo({
  processo,
  onUpdateImovel,
  isPendingImovel,
}: {
  processo: ReturnType<typeof useProcesso>['data'] & {}
  onUpdateImovel: (campos: Record<string, unknown>) => void
  isPendingImovel: boolean
}) {
  if (!processo) return null

  const fmtMoeda = (v: number | null) =>
    v ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v) : '—'

  return (
    <div className="space-y-4">
      {/* Row 1: Operação + Participantes */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Operação */}
        <div className="space-y-3 border border-gray-200 rounded-xl p-4 bg-white shadow-[var(--shadow-card)]">
          <h4 className="text-[11px] font-bold text-fonti-primary uppercase tracking-widest border-b border-gray-100 pb-2">Operação</h4>
          <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
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
        <div className="space-y-3 border border-gray-200 rounded-xl p-4 bg-white shadow-[var(--shadow-card)]">
          <h4 className="text-[11px] font-bold text-fonti-primary uppercase tracking-widest border-b border-gray-100 pb-2">Compradores</h4>
          {(processo.compradores?.length ?? 0) > 0 ? (
            <div className="space-y-1.5">
              {processo.compradores!.map((c) => (
                <div key={c.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <User className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                  <span className="text-fonti-primary font-medium">{c.nome}</span>
                  {c.cpf && <span className="text-xs text-gray-400">{c.cpf}</span>}
                  {c.principal && (
                    <span className="text-[10px] bg-fonti-primary text-white px-1.5 py-0.5 rounded-full">Principal</span>
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
          <div className="space-y-2 border border-gray-200 rounded-xl p-4 bg-white shadow-[var(--shadow-card)] flex items-center gap-3">
            <div className="w-8 h-8 bg-fonti-accent-hover rounded-lg flex items-center justify-center shrink-0">
              <FileText className="h-4 w-4 text-fonti-primary" />
            </div>
            <div>
              <p className="text-xs text-gray-400">Contrato</p>
              <p className="text-sm text-gray-500 italic">Acesse a aba "Contrato" para redigir e exportar.</p>
            </div>
          </div>
        ) : (
          <BlocoImovel
            processo={processo}
            onUpdate={onUpdateImovel as any}
            isPending={isPendingImovel}
          />
        )}

        {/* Vendedores */}
        <div className="space-y-3 border border-gray-200 rounded-xl p-4 bg-white shadow-[var(--shadow-card)]">
          <h4 className="text-[11px] font-bold text-fonti-primary uppercase tracking-widest border-b border-gray-100 pb-2">Vendedores</h4>
          {(processo.vendedores?.length ?? 0) > 0 ? (
            <div className="space-y-1.5">
              {processo.vendedores!.map((v) => (
                <div key={v.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <User className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                  <span className="text-fonti-primary font-medium">{v.nome}</span>
                  {v.cpf && <span className="text-xs text-gray-400">{v.cpf}</span>}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-300 italic">Nenhum vendedor cadastrado</p>
          )}
        </div>
      </div>

      {/* Row 3: Parceiros (Corretor, Imobiliária, Parceiro Comercial) */}
      <BlocoParceiros processoId={processo.id} />

      {/* Row 4: Assessoria & Contrato + Responsáveis */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Assessoria & Contrato */}
        <div className="space-y-3 border border-gray-200 rounded-xl p-4 bg-white shadow-[var(--shadow-card)]">
          <h4 className="text-[11px] font-bold text-fonti-primary uppercase tracking-widest border-b border-gray-100 pb-2">Assessoria & Contrato</h4>
          <div className={`flex items-center justify-between p-3 rounded-lg ${processo.tem_assessoria ? 'bg-fonti-accent-hover' : 'bg-gray-50'}`}>
            <span className="text-sm text-fonti-primary">{processo.tem_assessoria ? 'Com Assessoria' : 'Sem Assessoria'}</span>
            {processo.tem_assessoria && processo.valor_assessoria != null && (
              <span className="text-sm font-semibold text-fonti-primary">{formatarMoeda(processo.valor_assessoria)}</span>
            )}
            {processo.tem_assessoria && processo.valor_assessoria == null && (
              <span className="text-xs text-fonti-primary font-medium">Inclusa</span>
            )}
          </div>
          {(processo.comissao_comercial || processo.comissao_empresa) && (
            <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
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
              style={{ width: '40%', backgroundColor: processo.fase_atual.cor ?? 'var(--fonti-primary)' }}
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
      <p className="text-sm font-medium text-fonti-primary">{valor}</p>
    </div>
  )
}
