'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useLead } from '@/hooks/leads/useLeads'
import { useConversaDoLead } from '@/hooks/conversas/useConversaDoLead'
import { useIniciarConversa } from '@/hooks/conversas/useIniciarConversa'
import { useRouter } from 'next/navigation'
import { AbaResumo } from './LeadDetalhe/AbaResumo'
import { AbaNotas } from './LeadDetalhe/AbaNotas'
import { AbaTarefas } from './LeadDetalhe/AbaTarefas'
import { AbaProcessos } from './LeadDetalhe/AbaProcessos'
import { AbaSimulador } from './LeadDetalhe/AbaSimulador'
import { AbaCredito } from './LeadDetalhe/AbaCredito'
import { AbaDocumentos } from './LeadDetalhe/AbaDocumentos'
import { AbaHistorico } from './LeadDetalhe/AbaHistorico'
import { AbaOperacional } from './LeadDetalhe/AbaOperacional'
import { AbaFormularios } from './LeadDetalhe/AbaFormularios'
import { PainelDireitoLead } from './LeadDetalhe/PainelDireito'
import { useLeadChecklist } from '@/hooks/leads/useLeadChecklist'
import { NovoProcessoModal } from './NovoProcessoModal'
import { LeadEditarModal } from './LeadEditarModal'
import { LeadOrigemBadge } from './LeadOrigemBadge'
import { CompletarDadosPessoaDrawer } from '@/components/pessoas/CompletarDadosPessoaDrawer'
import { AbaSolicitacoes } from '@/components/solicitacoes/AbaSolicitacoes'
import { NovaSolicitacaoDrawer } from '@/components/solicitacoes/NovaSolicitacaoDrawer'
import { type ContextoSolicitacao } from '@/types/solicitacoes-operacionais'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  Plus, MessageCircle, Pencil, Loader2, Trash2,
  Phone, Mail, CreditCard, DollarSign, Calendar, CalendarClock, ClipboardList, ChevronRight,
} from 'lucide-react'
import { usePermissao } from '@/hooks/auth/usePermissao'
import { ExcluirLeadDialog } from './ExcluirLeadDialog'
import { useFases } from '@/hooks/configuracoes/useFases'
import { useEditarLead } from '@/hooks/leads/useEditarLead'
import { useConfigAbas } from '@/hooks/leads/useConfigAbas'

type Aba = 'resumo' | 'credito' | 'operacional' | 'formularios' | 'notas' | 'tarefas' | 'processos' | 'simulador' | 'solicitacoes' | 'historico' | 'documentos'

function fmtMoeda(v: number | null) {
  if (v == null) return null
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

function fmtData(s: string | null) {
  if (!s) return '—'
  try { return format(new Date(s), 'dd/MM/yyyy', { locale: ptBR }) } catch { return s }
}

function iniciais(nome: string) {
  return nome.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()
}

const PRODUTO_CONFIG: Record<string, { label: string; className: string }> = {
  financiamento: { label: 'Financiamento',        className: 'bg-blue-100 text-blue-700' },
  cgi:           { label: 'CGI',                  className: 'bg-purple-100 text-purple-700' },
  consorcio:     { label: 'Consórcio',            className: 'bg-orange-100 text-orange-700' },
  portabilidade: { label: 'Portabilidade',        className: 'bg-gray-100 text-gray-600' },
  contrato:      { label: 'Contrato',             className: 'bg-green-100 text-green-700' },
}

function produtoCfg(produto: string | null | undefined) {
  if (!produto) return null
  const k = produto.toLowerCase()
  if (k.includes('financ'))  return PRODUTO_CONFIG.financiamento
  if (k.includes('cgi'))     return PRODUTO_CONFIG.cgi
  if (k.includes('cons'))    return PRODUTO_CONFIG.consorcio
  if (k.includes('port'))    return PRODUTO_CONFIG.portabilidade
  if (k.includes('contrat')) return PRODUTO_CONFIG.contrato
  return { label: produto, className: 'bg-gray-100 text-gray-600' }
}

interface Props {
  leadId: string | null
  onFechar: () => void
}

export function LeadDetalheModal({ leadId, onFechar }: Props) {
  const router = useRouter()
  const { pode } = usePermissao()
  const [abaAtiva, setAbaAtiva] = useState<Aba>('resumo')
  const [novoProcessoAberto, setNovoProcessoAberto] = useState(false)
  const [editarAberto, setEditarAberto] = useState(false)
  const [novaSolicitacaoAberta, setNovaSolicitacaoAberta] = useState(false)
  const [completarDadosAberto, setCompletarDadosAberto] = useState(false)
  const [excluirAberto, setExcluirAberto] = useState(false)
  const [iniciarConversaAberto, setIniciarConversaAberto] = useState(false)
  const [msgInicial, setMsgInicial] = useState('')
  const [consultaRestritivosAberto, setConsultaRestritivosAberto] = useState(false)
  const [consultaRestritivosRespondido, setConsultaRestritivosRespondido] = useState(false)
  const [temRestricao, setTemRestricao] = useState<boolean | null>(null)

  const { data: lead, isLoading } = useLead(leadId ?? '')
  const { data: conversaDoLead } = useConversaDoLead(leadId ?? undefined)
  const iniciarConversa = useIniciarConversa()
  const { data: fases = [] } = useFases('leads')
  const editarLead = useEditarLead()
  const { data: itensChecklist = [] } = useLeadChecklist(leadId ?? '', lead?.fase_id)
  const abas = useConfigAbas()

  const contextoSolicitacao: ContextoSolicitacao | undefined = lead ? {
    nomeCliente: lead.nome,
    telefone: lead.telefone,
    renda: (lead.renda_formal ?? 0) + (lead.renda_informal ?? 0) || undefined,
    valorPretendido: lead.valor_pretendido ?? undefined,
    produto: lead.produto_interesse ?? undefined,
    responsavelSugeridoId: lead.responsavel_id ?? undefined,
  } : undefined

  function fechar() {
    setAbaAtiva('resumo')
    onFechar()
  }

  const aberto = !!leadId

  return (
    <>
      <Dialog open={aberto} onOpenChange={fechar}>
        <DialogContent className="flex h-[96svh] w-[calc(100vw-1rem)] max-w-[98vw] flex-col gap-0 overflow-hidden p-0">
          {isLoading || !lead ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-6 w-6 animate-spin text-fonti-primary" />
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">

              {/* ── Painel Esquerdo: Dados do Lead ── */}
              <div className="flex max-h-[38svh] w-full shrink-0 flex-col overflow-hidden border-b border-gray-100 bg-fonti-surface-warm lg:max-h-none lg:w-64 lg:border-b-0 lg:border-r">

                {/* Identidade + ações rápidas */}
                <div className="space-y-2 border-b border-gray-200 p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-fonti-primary flex items-center justify-center shrink-0">
                      <span className="text-sm font-bold text-white">{iniciais(lead.nome)}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <h2 className="text-sm font-bold text-fonti-primary leading-snug break-words">{lead.nome}</h2>
                      {lead.fase && (
                        <span
                          className="text-xs px-2 py-0.5 rounded-full font-medium text-white mt-1.5 inline-block"
                          style={{ backgroundColor: lead.fase.cor ?? 'var(--fonti-primary)' }}
                        >
                          {lead.fase.nome}
                        </span>
                      )}
                      {lead.status && (
                        <span
                          className="text-xs px-2 py-0.5 rounded-full font-medium mt-1 inline-block border"
                          style={{
                            backgroundColor: lead.status.cor + '22',
                            borderColor: lead.status.cor + '66',
                            color: lead.status.cor,
                          }}
                        >
                          {lead.status.nome}
                        </span>
                      )}
                    </div>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full h-8 text-xs gap-1.5 text-green-700 border-green-200 hover:bg-green-50"
                    onClick={() => {
                      if (conversaDoLead?.id) {
                        router.push(`/conversas?id=${conversaDoLead.id}`)
                      } else {
                        setMsgInicial('')
                        setIniciarConversaAberto(true)
                      }
                    }}
                  >
                    <MessageCircle className="h-3 w-3" />
                    {conversaDoLead?.id ? 'Abrir Conversa' : 'Iniciar Conversa'}
                  </Button>

                  <div className="grid grid-cols-[1fr_auto] gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 h-7 text-xs gap-1"
                      onClick={() => setEditarAberto(true)}
                    >
                      <DollarSign className="h-3 w-3" />
                      Dados
                    </Button>
                    {pode('leads.excluir') && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 w-7 p-0 text-red-400 border-red-200 hover:bg-red-50 hover:text-red-600 hover:border-red-300 shrink-0"
                        title="Excluir lead"
                        onClick={() => setExcluirAberto(true)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                  <div className={cn('grid gap-1.5', lead.pessoa_id ? 'grid-cols-2' : 'grid-cols-1')}>
                    {lead.pessoa_id && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs gap-1 text-fonti-primary border-fonti-accent/50 hover:bg-fonti-accent-hover/40"
                        onClick={() => setCompletarDadosAberto(true)}
                      >
                        <ClipboardList className="h-3 w-3" />
                        <span className="truncate">Completar</span>
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1 text-amber-700 border-amber-200 hover:bg-amber-50"
                      onClick={() => setNovaSolicitacaoAberta(true)}
                    >
                      <ClipboardList className="h-3 w-3" />
                      <span className="truncate">Solicitar Op.</span>
                    </Button>
                  </div>
                </div>

                {/* Campos de dados */}
                <div className="flex-1 space-y-3.5 overflow-y-auto p-4">
                  <InfoRow icone={<Phone className="h-3.5 w-3.5" />} label="Telefone" valor={lead.telefone} />
                  {lead.cpf && (
                    <InfoRow icone={<CreditCard className="h-3.5 w-3.5" />} label="CPF" valor={lead.cpf} />
                  )}
                  {lead.email && (
                    <InfoRow icone={<Mail className="h-3.5 w-3.5" />} label="E-mail" valor={lead.email} />
                  )}
                  {lead.valor_pretendido != null && (
                    <InfoRow
                      icone={<DollarSign className="h-3.5 w-3.5" />}
                      label="Valor Pretendido"
                      valor={fmtMoeda(lead.valor_pretendido) ?? '—'}
                      destaque
                    />
                  )}
                  {produtoCfg(lead.produto_interesse) && (
                    <div>
                      <p className="text-xs text-gray-400 mb-1">Produto</p>
                      <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full inline-block', produtoCfg(lead.produto_interesse)!.className)}>
                        {produtoCfg(lead.produto_interesse)!.label}
                      </span>
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-gray-400 mb-1">Origem</p>
                    <LeadOrigemBadge origem={lead.origem} />
                  </div>
                  {lead.responsavel && (
                    <div>
                      <p className="text-xs text-gray-400 mb-1">Comercial</p>
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-fonti-primary flex items-center justify-center shrink-0">
                          <span className="text-xs font-bold text-white">{iniciais(lead.responsavel.nome)}</span>
                        </div>
                        <span className="text-sm text-fonti-primary font-medium truncate">{lead.responsavel.nome}</span>
                      </div>
                    </div>
                  )}
                  {lead.responsavel_operacional && (
                    <div>
                      <p className="text-xs text-gray-400 mb-1">Operacional</p>
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center shrink-0">
                          <span className="text-xs font-bold text-white">{iniciais(lead.responsavel_operacional.nome)}</span>
                        </div>
                        <span className="text-sm text-blue-700 font-medium truncate">{lead.responsavel_operacional.nome}</span>
                      </div>
                    </div>
                  )}
                  {lead.observacoes && (
                    <div>
                      <p className="text-xs text-gray-400 mb-1">Observações</p>
                      <p className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed bg-white rounded-lg p-2.5 border border-gray-200">
                        {lead.observacoes}
                      </p>
                    </div>
                  )}
                  <div className="pt-2 border-t border-gray-200">
                    <InfoRow
                      icone={<Calendar className="h-3.5 w-3.5" />}
                      label="Criado em"
                      valor={fmtData(lead.created_at)}
                    />
                  </div>
                </div>

                {/* Ação principal */}
                <div className="space-y-2 border-t border-gray-200 p-4">
                  {(() => {
                    const idx = fases.findIndex(f => f.id === lead.fase_id)
                    const proxFase = idx >= 0 && idx < fases.length - 1 ? fases[idx + 1] : null
                    if (!proxFase) return null
                    const itensBloqueadores = itensChecklist.filter(i => i.bloqueia_avanco && !i.concluido)
                    const temBloqueio = itensBloqueadores.length > 0
                    return (
                      <Button
                        variant="outline"
                        size="sm"
                        className={cn(
                          'w-full h-8 text-xs gap-1.5',
                          temBloqueio
                            ? 'border-red-300 text-red-600 bg-red-50 hover:bg-red-100'
                            : 'text-fonti-primary border-fonti-primary/30 hover:bg-fonti-primary/5'
                        )}
                        disabled={editarLead.isPending}
                        onClick={() => {
                          if (temBloqueio) {
                            const pendentes = itensBloqueadores.map(i => i.descricao ?? 'item').join(', ')
                            toast.error('Checklist obrigatório pendente', {
                              description: `Conclua antes de avançar: ${pendentes}`,
                            })
                            return
                          }
                          editarLead.mutate({ id: lead.id, fase_id: proxFase.id })
                        }}
                      >
                        {editarLead.isPending
                          ? <Loader2 className="h-3 w-3 animate-spin" />
                          : <ChevronRight className="h-3 w-3" />
                        }
                        Avançar → {proxFase.nome}
                      </Button>
                    )
                  })()}
                  <Button
                    size="sm"
                    className="w-full h-8 text-xs gap-1.5 bg-fonti-primary hover:bg-fonti-primary-hover text-white"
                    onClick={() => setNovoProcessoAberto(true)}
                  >
                    <Plus className="h-3 w-3" />
                    Novo Processo
                  </Button>
                </div>
              </div>

              {/* ── Centro: Abas de Interação ── */}
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">

                {/* Tab bar */}
                <div className="flex shrink-0 overflow-x-auto border-b border-gray-100 bg-white px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
                  {abas.map((aba) => (
                    <button
                      key={aba.id}
                      onClick={() => {
                        if (aba.id === 'credito' && !consultaRestritivosRespondido) {
                          setConsultaRestritivosAberto(true)
                          return
                        }
                        setAbaAtiva(aba.id as Aba)
                      }}
                      className={cn(
                        'px-2.5 py-3 text-center text-xs font-medium border-b-2 transition-all -mb-px whitespace-nowrap sm:px-4',
                        abaAtiva === aba.id
                          ? 'border-fonti-primary text-fonti-primary'
                          : 'border-transparent text-gray-400 hover:text-gray-600',
                        ['notas', 'tarefas', 'operacional', 'solicitacoes', 'formularios', 'historico'].includes(aba.id) && 'hidden lg:flex'
                      )}
                    >
                      {aba.label}
                    </button>
                  ))}
                </div>

                {/* Conteúdo da aba */}
                <div className={cn(
                  'flex-1 min-h-0',
                  abaAtiva === 'simulador'
                    ? 'overflow-hidden'
                    : 'overflow-y-auto px-3 py-4 sm:px-5'
                )}>
                  {abaAtiva === 'resumo'       && <AbaResumo       lead={lead} onMudarAba={(aba) => setAbaAtiva(aba as Aba)} />}
                  {abaAtiva === 'credito'      && <AbaCredito      lead={lead} />}
                  {abaAtiva === 'operacional'  && <AbaOperacional  lead={lead} />}
                  {abaAtiva === 'formularios'  && <AbaFormularios  lead={lead} />}
                  {abaAtiva === 'notas'        && <AbaNotas        leadId={lead.id} />}
                  {abaAtiva === 'tarefas'      && <AbaTarefas      leadId={lead.id} />}
                  {abaAtiva === 'processos'    && <AbaProcessos    leadId={lead.id} />}
                  {abaAtiva === 'simulador'    && <AbaSimulador    leadId={lead.id} />}
                  {abaAtiva === 'solicitacoes' && (
                    <AbaSolicitacoes
                      leadId={lead.id}
                      contexto={contextoSolicitacao}
                    />
                  )}
                  {abaAtiva === 'historico' && <AbaHistorico leadId={lead.id} />}
                  {abaAtiva === 'documentos' && (
                    <AbaDocumentos
                      leadId={lead.id}
                      pessoaId={lead.pessoa_id}
                    />
                  )}
                </div>
              </div>

              {/* ── Painel Direito: Notas + Tarefas + Checklist (bonus em telas grandes) ── */}
              <div className="hidden w-72 shrink-0 overflow-y-auto border-l border-gray-100 bg-white xl:block">
                <PainelDireitoLead lead={lead} />
              </div>

            </div>
          )}
        </DialogContent>
      </Dialog>

      {lead && (
        <>
          <NovoProcessoModal
            aberto={novoProcessoAberto}
            onFechar={() => setNovoProcessoAberto(false)}
            lead={lead}
          />
          <LeadEditarModal
            aberto={editarAberto}
            onFechar={() => setEditarAberto(false)}
            lead={lead}
          />
          <CompletarDadosPessoaDrawer
            pessoaId={lead.pessoa_id ?? null}
            open={completarDadosAberto}
            onClose={() => setCompletarDadosAberto(false)}
            origemAuditoria="leads"
          />
          <NovaSolicitacaoDrawer
            aberto={novaSolicitacaoAberta}
            onFechar={() => setNovaSolicitacaoAberta(false)}
            leadId={lead.id}
            contexto={contextoSolicitacao}
          />
          <ExcluirLeadDialog
            aberto={excluirAberto}
            onFechar={() => setExcluirAberto(false)}
            leadId={lead.id}
            faseId={lead.fase_id}
            nomeCliente={lead.nome}
            onExcluido={fechar}
          />

          {/* Dialog: Consulta de Restritivos */}
          <Dialog open={consultaRestritivosAberto} onOpenChange={(o) => { if (!o) setConsultaRestritivosAberto(false) }}>
            <DialogContent className="max-h-[92svh] w-[calc(100vw-1rem)] max-w-sm overflow-y-auto sm:w-full">
              <DialogHeader>
                <DialogTitle className="text-fonti-primary text-base">Consulta de Restritivos</DialogTitle>
              </DialogHeader>
              <div className="py-3 space-y-4">
                <p className="text-sm text-gray-700 leading-relaxed">
                  Antes de avaliar o crédito, <strong>consulte os restritivos dos participantes</strong> (CPF, CNPJ, SCR e demais restrições).
                </p>
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">O cliente possui restrição?</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {([true, false] as const).map(val => (
                      <button
                        key={String(val)}
                        onClick={() => setTemRestricao(val)}
                        className={cn(
                          'rounded-lg border px-3 py-2.5 text-sm font-medium transition-all',
                          temRestricao === val
                            ? val
                              ? 'border-red-400 bg-red-50 text-red-700'
                              : 'border-green-400 bg-green-50 text-green-700'
                            : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                        )}
                      >
                        {val ? 'Sim, tem restrição' : 'Não tem restrição'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button
                  size="sm"
                  disabled={temRestricao === null}
                  className="w-full bg-fonti-primary hover:bg-fonti-primary-hover text-white disabled:opacity-40"
                  onClick={() => {
                    setConsultaRestritivosRespondido(true)
                    setConsultaRestritivosAberto(false)
                    setAbaAtiva('credito')
                  }}
                >
                  Confirmar e abrir Crédito
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Dialog: Iniciar nova conversa */}
          <Dialog open={iniciarConversaAberto} onOpenChange={(o) => { if (!o) setIniciarConversaAberto(false) }}>
            <DialogContent className="max-h-[92svh] w-[calc(100vw-1rem)] max-w-sm overflow-y-auto sm:w-full">
              <DialogHeader>
                <DialogTitle className="text-fonti-primary">Iniciar conversa</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="text-sm text-gray-600">
                  <p className="font-medium text-gray-800">{lead.nome}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{lead.telefone}</p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-700">Mensagem inicial (opcional)</label>
                  <Textarea
                    placeholder="Olá! Tudo bem?"
                    rows={3}
                    className="text-sm resize-none"
                    value={msgInicial}
                    onChange={(e) => setMsgInicial(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full sm:w-auto"
                  onClick={() => setIniciarConversaAberto(false)}
                >
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  disabled={iniciarConversa.isPending}
                  className="w-full gap-1.5 bg-fonti-primary text-white hover:bg-fonti-primary-hover sm:w-auto"
                  onClick={async () => {
                    try {
                      const id = await iniciarConversa.mutateAsync({
                        telefone:       lead.telefone,
                        nome:           lead.nome,
                        lead_id:        lead.id,
                        pessoa_id:      (lead as any).pessoa_id ?? undefined,
                        mensagemInicial: msgInicial,
                      })
                      setIniciarConversaAberto(false)
                      router.push(`/conversas?id=${id}`)
                    } catch {
                      toast.error('Erro ao criar conversa. Tente novamente.')
                    }
                  }}
                >
                  <MessageCircle className="h-3.5 w-3.5" />
                  {iniciarConversa.isPending ? 'Criando...' : 'Iniciar Conversa'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </>
  )
}

function InfoRow({
  icone, label, valor, destaque,
}: {
  icone: React.ReactNode
  label: string
  valor: string
  destaque?: boolean
}) {
  return (
    <div className="flex items-start gap-2 min-w-0">
      <span className="text-gray-400 mt-0.5 shrink-0">{icone}</span>
      <div className="min-w-0">
        <p className="text-xs text-gray-400">{label}</p>
        <p className={cn(
          'text-sm truncate',
          destaque ? 'font-bold text-fonti-primary' : 'font-medium text-gray-800'
        )}>
          {valor}
        </p>
      </div>
    </div>
  )
}
