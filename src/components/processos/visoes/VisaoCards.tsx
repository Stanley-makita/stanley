'use client'

import { useCallback, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { useProcessos, type ProdutoFiltro } from '@/hooks/processos/useProcessos'
import { useFases } from '@/hooks/configuracoes/useFases'
import { useSolicitacoesAbertasPorProcesso } from '@/hooks/solicitacoes/useSolicitacoesAbertasPorProcesso'
import { useMoverProcessoKanban } from '@/hooks/processos/useProcessoFasesHistorico'
import { usePermissao } from '@/hooks/auth/usePermissao'
import { useAuth } from '@/hooks/auth/useAuth'
import { supabase } from '@/lib/supabase'
import { ChanceBadge } from '@/components/processos/ChanceBadge'
import { ProcessoStatusBadge } from '@/components/processos/ProcessoStatusBadge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { Search, User, Clock, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import type { Processo, ModalidadeProcesso } from '@/types/processos'
import type { Fase } from '@/types/configuracoes'

// ─── Filtros ──────────────────────────────────────────────────────────────────

// Só usado na tela de Negócios/Financiamento (única página que chama VisaoCards
// sem produtoFixo nem produtosDisponiveis) — "Contrato" tem tela própria
// (/negocios/contrato) e não deve aparecer como filtro rápido aqui.
const FILTROS_PRODUTO: { label: string; value: ProdutoFiltro }[] = [
  { label: 'Financiamento', value: 'financiamento' },
  { label: 'CGI',           value: 'cgi' },
]

// Usado em Negócios/Todos os Negócios — cada produto tem seu próprio conjunto
// de fases (módulo diferente), então escolher um destes troca o quadro inteiro
// de colunas exibido (ver PRODUTO_MODULO).
export const FILTROS_PRODUTO_TODOS: { label: string; value: ProdutoFiltro }[] = [
  { label: 'Financiamento', value: 'financiamento' },
  { label: 'CGI',           value: 'cgi' },
  { label: 'Consórcio',     value: 'consorcio' },
  { label: 'Registro',      value: 'registro' },
  { label: 'Contratos',     value: 'contrato' },
]

const PRODUTO_MODULO: Partial<Record<ProdutoFiltro, string>> = {
  financiamento: 'processos',
  cgi:           'processos',
  consorcio:     'consorcio',
  registro:      'registro',
  contrato:      'contrato',
}

const FILTROS_CHANCE = [
  { label: 'Certeza',   value: 'certeza'   as const },
  { label: 'Incerteza', value: 'incerteza' as const },
]

const FINANCIAMENTO_MODS = new Set(['SFI', 'SBPE', 'PMCMV', 'Pro_Cotista'])

const MODALIDADE_CONFIG: Record<ModalidadeProcesso, { label: string; cls: string }> = {
  SFI:         { label: 'SFI',         cls: 'bg-blue-100 text-blue-700' },
  SBPE:        { label: 'SBPE',        cls: 'bg-blue-100 text-blue-700' },
  PMCMV:       { label: 'PMCMV',       cls: 'bg-blue-100 text-blue-700' },
  Pro_Cotista: { label: 'Pro Cotista', cls: 'bg-blue-100 text-blue-700' },
  CGI:         { label: 'CGI',         cls: 'bg-purple-100 text-purple-700' },
  Contrato:    { label: 'Contrato',    cls: 'bg-gray-100 text-gray-600' },
  Consorcio:   { label: 'Consórcio',   cls: 'bg-orange-100 text-orange-700' },
  Registro:    { label: 'Registro',    cls: 'bg-teal-100 text-teal-700' },
}

function fmtMoeda(v: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency', currency: 'BRL', maximumFractionDigits: 0,
  }).format(v)
}

// ─── Card compacto ────────────────────────────────────────────────────────────

function KanbanCard({ processo, arrastavel, overlay }: { processo: Processo; arrastavel?: boolean; overlay?: boolean }) {
  const router = useRouter()
  // O "fantasma" do DragOverlay é uma 2ª cópia do card renderizada enquanto o
  // card original continua montado na coluna — se ambos chamassem o hook, os
  // dois tentariam abrir o mesmo canal realtime `pendencias-processo-<id>` ao
  // mesmo tempo e o Supabase derruba a página (channel já subscrito). No
  // overlay não faz sentido buscar isso de novo mesmo, é só um preview visual.
  const { data: pendencias = [] } = useSolicitacoesAbertasPorProcesso(overlay ? undefined : processo.id)
  const mouseDownPos = useRef<{ x: number; y: number } | null>(null)

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: processo.id,
    data: { processo },
    disabled: !arrastavel,
  })

  const comprador =
    processo.compradores?.find((c) => c.principal)?.nome ??
    processo.compradores?.[0]?.nome

  const mod = MODALIDADE_CONFIG[processo.modalidade]

  function abrir() {
    const rota = processo.modalidade === 'Consorcio'
      ? `/negocios/consorcio/${processo.id}`
      : `/processos/${processo.id}`
    router.push(rota)
  }

  return (
    <div
      ref={arrastavel ? setNodeRef : undefined}
      style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined}
      {...(arrastavel ? attributes : {})}
      {...(arrastavel ? listeners : {})}
      onMouseDown={arrastavel ? (e) => { mouseDownPos.current = { x: e.clientX, y: e.clientY } } : undefined}
      onClick={arrastavel
        ? (e) => {
          e.stopPropagation()
          if (mouseDownPos.current) {
            const dx = e.clientX - mouseDownPos.current.x
            const dy = e.clientY - mouseDownPos.current.y
            if (Math.sqrt(dx * dx + dy * dy) < 5) abrir()
          }
          mouseDownPos.current = null
        }
        : abrir}
      className={cn(
        'bg-white border border-gray-200 rounded-lg p-2.5 hover:shadow-md hover:border-fonti-accent transition-all select-none',
        arrastavel ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
        isDragging && 'opacity-40 border-fonti-accent',
        overlay && 'shadow-lg rotate-1 opacity-95',
      )}
    >
      {/* linha 1: status + modalidade + chance */}
      <div className="flex items-center justify-between gap-1 mb-1.5">
        <div className="flex items-center gap-1 min-w-0 flex-wrap">
          <ProcessoStatusBadge status={processo.status_processo} />
          {mod && (
            <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${mod.cls}`}>
              {mod.label}
            </span>
          )}
        </div>
        <ChanceBadge chance={processo.chance_emissao} />
      </div>

      {/* linha 2: cliente / imóvel */}
      <div className="flex items-start gap-1 mb-0.5">
        <User className="h-3 w-3 text-fonti-primary mt-0.5 shrink-0" />
        <p className="text-xs font-semibold text-fonti-primary line-clamp-1 leading-tight">
          {comprador ?? processo.nome_imovel}
        </p>
      </div>
      {comprador && (
        <p className="text-[10px] text-gray-400 line-clamp-1 pl-4 mb-1.5 leading-tight">
          {processo.nome_imovel}
        </p>
      )}

      {/* linha 3: valor + nº */}
      <div className="flex items-center justify-between mt-1.5">
        <span className="text-xs font-bold text-fonti-primary">
          {processo.valor_financiado ? fmtMoeda(processo.valor_financiado) : '—'}
        </span>
        <span className="text-[9px] text-gray-400 tabular-nums">{processo.numero_processo}</span>
      </div>

      {/* linha 4: banco + pendencias + responsável */}
      <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-gray-100">
        <div className="flex items-center gap-1.5 min-w-0">
          {processo.banco && (
            <span className="text-[10px] text-gray-500 truncate max-w-[90px]">
              {processo.banco.nome}
            </span>
          )}
          {pendencias.length > 0 && (
            <div className="flex items-center gap-0.5 text-amber-600 shrink-0">
              <Clock className="h-2.5 w-2.5" />
              <span className="text-[10px] font-medium">{pendencias.length}</span>
            </div>
          )}
        </div>
        {processo.operacional && (
          <span className="text-[10px] text-gray-400 shrink-0">
            {processo.operacional.nome.split(' ')[0]}
          </span>
        )}
      </div>
    </div>
  )
}

// ─── Coluna do Kanban ─────────────────────────────────────────────────────────

function KanbanColuna({
  faseId, nome, cor, count, processos, arrastavel,
}: {
  faseId: string
  nome: string
  cor: string | null
  count: number
  processos: Processo[]
  arrastavel?: boolean
}) {
  const { setNodeRef, isOver } = useDroppable({ id: faseId, disabled: !arrastavel })

  return (
    <div className="flex w-[82vw] max-w-[21rem] shrink-0 flex-col sm:w-64 lg:min-w-[180px] lg:max-w-[260px] lg:flex-1">
      {/* cabeçalho */}
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ backgroundColor: cor ?? 'var(--fonti-accent)' }}
          />
          <span className="text-xs font-semibold text-gray-700 truncate">{nome}</span>
        </div>
        <span className="text-xs font-medium text-gray-400 shrink-0 ml-2 tabular-nums">
          {count}
        </span>
      </div>

      {/* corpo */}
      <div
        ref={setNodeRef}
        className={cn(
          'flex-1 bg-gray-50/80 border rounded-xl p-2 space-y-2 overflow-y-auto transition-colors',
          isOver ? 'border-fonti-accent bg-fonti-accent-hover/20' : 'border-gray-200',
        )}
      >
        {processos.length === 0 ? (
          <p className="text-center py-6 text-[11px] text-gray-300">—</p>
        ) : (
          processos.map((p) => <KanbanCard key={p.id} processo={p} arrastavel={arrastavel} />)
        )}
      </div>
    </div>
  )
}

// ─── Visão principal ──────────────────────────────────────────────────────────

export function VisaoCards({ modulo = 'processos', produtoFixo, responsavelId, produtosDisponiveis }: {
  modulo?: string
  produtoFixo?: ProdutoFiltro
  responsavelId?: string
  /** Só usado em Negócios/Todos os Negócios — cada produto tem seu próprio
   * módulo de fases, então escolher um aqui troca o quadro inteiro exibido
   * (ver PRODUTO_MODULO). Quando ausente, mantém o comportamento antigo
   * (módulo fixo pela prop `modulo`, toggle Financiamento/CGI). */
  produtosDisponiveis?: { label: string; value: ProdutoFiltro }[]
}) {
  const filtrosProduto = produtosDisponiveis ?? FILTROS_PRODUTO
  const [produtoFiltro, setProdutoFiltro] = useState<ProdutoFiltro>(
    produtosDisponiveis ? (produtosDisponiveis[0]?.value ?? 'financiamento') : 'todos'
  )
  const [chanceFiltro, setChanceFiltro] = useState<'certeza' | 'incerteza' | 'todos'>('todos')
  const [busca, setBusca] = useState('')

  const moduloAtivo = produtoFixo ? modulo : produtosDisponiveis ? (PRODUTO_MODULO[produtoFiltro] ?? modulo) : modulo

  const { data: fases = [], isLoading: fasesLoading } = useFases(moduloAtivo)
  const { data: processos = [], isLoading: processosLoading } = useProcessos({
    produto: produtoFixo ?? produtoFiltro,
    chance: chanceFiltro,
    busca,
    responsavelId,
  })

  const isLoading = fasesLoading || processosLoading

  // ── Drag-and-drop (mover processo de fase pelo Kanban) ──
  const { usuario } = useAuth()
  const { pode } = usePermissao()
  const podeEditar = pode('processos.editar')
  const podeRetroceder = pode('processos.retroceder_fase')
  const moverProcesso = useMoverProcessoKanban()

  const [processoArrastado, setProcessoArrastado] = useState<Processo | null>(null)
  const [retornoPendente, setRetornoPendente] = useState<{ processo: Processo; faseDestino: Fase } | null>(null)
  const [motivoRetorno, setMotivoRetorno] = useState('')

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  const onDragStart = useCallback((event: DragStartEvent) => {
    const processo = event.active.data.current?.processo as Processo | undefined
    if (processo) setProcessoArrastado(processo)
  }, [])

  const onDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setProcessoArrastado(null)
      const { active, over } = event
      if (!over) return

      const processo = active.data.current?.processo as Processo | undefined
      const faseDestinoId = over.id as string
      if (!processo || processo.fase_atual_id === faseDestinoId) return

      const idxOrigem  = fases.findIndex((f) => f.id === processo.fase_atual_id)
      const idxDestino = fases.findIndex((f) => f.id === faseDestinoId)
      const faseDestino = fases[idxDestino]
      if (idxDestino === -1 || !faseDestino) return

      // Retrocesso: só quem tem processos.retroceder_fase, e pede motivo
      // (mesmo padrão do PipelineBarProcesso/AbaFases do Consórcio). O
      // checklist já marcado permanece — vinculado a processo+item, não à fase.
      if (idxOrigem === -1 || idxDestino < idxOrigem) {
        if (!podeRetroceder) {
          toast.error('Você não tem permissão para retroceder a fase deste processo.')
          return
        }
        setMotivoRetorno('')
        setRetornoPendente({ processo, faseDestino })
        return
      }

      // Avanço: só uma fase de cada vez, mesma regra do PipelineBarProcesso.
      if (idxDestino !== idxOrigem + 1) {
        toast.error('Processo só pode avançar uma fase por vez.')
        return
      }

      // Checklist obrigatório da fase de origem precisa estar completo.
      const faseOrigem = fases[idxOrigem]
      const { data: template } = await supabase
        .from('checklist_templates')
        .select('id')
        .eq('fase_id', faseOrigem.id)
        .eq('empresa_id', usuario!.empresa_id)
        .eq('ativo', true)
        .maybeSingle()

      if (template) {
        const { data: itens } = await supabase
          .from('checklist_items')
          .select('id, descricao')
          .eq('template_id', template.id)
          .eq('obrigatorio', true)
          .eq('ativo', true)

        if (itens && itens.length > 0) {
          const itemIds = itens.map((i) => i.id)
          const { data: execucoes } = await supabase
            .from('checklist_execucoes')
            .select('item_id, marcado')
            .eq('processo_id', processo.id)
            .in('item_id', itemIds)

          const concluidos = new Set(execucoes?.filter((e) => e.marcado).map((e) => e.item_id) ?? [])
          const bloqueadores = itens.filter((i) => !concluidos.has(i.id))
          if (bloqueadores.length > 0) {
            toast.error('Complete os itens obrigatórios do checklist antes de avançar.', {
              description: bloqueadores.map((b) => b.descricao).join(', '),
            })
            return
          }
        }
      }

      moverProcesso.mutate({ processoId: processo.id, faseId: faseDestinoId })
    },
    [fases, moverProcesso, podeRetroceder, usuario]
  )

  async function confirmarRetorno() {
    if (!retornoPendente || !motivoRetorno.trim()) return
    try {
      await moverProcesso.mutateAsync({
        processoId: retornoPendente.processo.id,
        faseId: retornoPendente.faseDestino.id,
        observacao: motivoRetorno.trim(),
        retrocedendo: true,
      })
      setRetornoPendente(null)
      setMotivoRetorno('')
    } catch {
      // Erro já exibido via onError de useMoverProcessoKanban — mantém o dialog aberto.
    }
  }

  // contagens para os filtros
  const contagemProduto = processos.reduce((acc, p) => {
    const mod = p.modalidade
    if (FINANCIAMENTO_MODS.has(mod)) acc.financiamento = (acc.financiamento ?? 0) + 1
    else if (mod === 'Consorcio') acc.consorcio = (acc.consorcio ?? 0) + 1
    else if (mod === 'CGI')       acc.cgi        = (acc.cgi        ?? 0) + 1
    else if (mod === 'Contrato')  acc.contrato   = (acc.contrato   ?? 0) + 1
    else if (mod === 'Registro')  acc.registro   = (acc.registro   ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  const contagemChance = processos.reduce((acc, p) => {
    acc[p.chance_emissao] = (acc[p.chance_emissao] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  // agrupar por fase
  const porFase = processos.reduce((acc, p) => {
    const key = p.fase_atual_id ?? '__sem_fase__'
    ;(acc[key] ??= []).push(p)
    return acc
  }, {} as Record<string, Processo[]>)

  return (
    <div className="flex min-h-[calc(100dvh_/_0.8_-_220px)] flex-col md:h-[calc(100dvh_/_0.8_-_180px)] md:min-h-0">
      {/* ── Filtros ── */}
      <div className="mb-3 flex shrink-0 flex-wrap items-center gap-1.5">

        {!produtoFixo && filtrosProduto.map((f) => {
          const count = contagemProduto[f.value] ?? 0
          const ativo = produtoFiltro === f.value
          return (
            <button
              key={f.value}
              onClick={() => setProdutoFiltro(produtosDisponiveis ? f.value : (ativo ? 'todos' : f.value))}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                ativo
                  ? 'bg-fonti-accent text-fonti-primary'
                  : 'bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-100'
              }`}
            >
              {f.label}
              {count > 0 && <span className="ml-1 opacity-70">{count}</span>}
            </button>
          )
        })}

        {!produtoFixo && <span className="hidden h-4 w-px shrink-0 bg-gray-300 sm:block" />}

        {/* Registro e Contrato seguem um fluxo por fase (já visível nas colunas
            do Kanban) — Certeza/Incerteza não se aplica a eles. */}
        {produtoFixo !== 'registro' && produtoFixo !== 'contrato' && FILTROS_CHANCE.map((f) => {
          const count = contagemChance[f.value] ?? 0
          const ativo = chanceFiltro === f.value
          const ativoClass = f.value === 'certeza'
            ? 'bg-green-600 text-white border-green-600'
            : 'bg-amber-500 text-white border-amber-500'
          const inativoClass = f.value === 'certeza'
            ? 'bg-green-50 text-green-700 border border-green-200 hover:bg-green-100'
            : 'bg-amber-50 text-amber-600 border border-amber-200 hover:bg-amber-100'
          return (
            <button
              key={f.value}
              onClick={() => setChanceFiltro(ativo ? 'todos' : f.value)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors border ${
                ativo ? ativoClass : inativoClass
              }`}
            >
              {f.label}
              {count > 0 && <span className="ml-1 opacity-70">{count}</span>}
            </button>
          )
        })}

        <div className="relative ml-0 min-w-full flex-1 sm:ml-1 sm:min-w-[180px] sm:max-w-[260px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <Input
            placeholder="Buscar por imóvel ou proposta..."
            className="pl-8 h-7 text-xs"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
      </div>

      {/* ── Kanban Board ── */}
      {isLoading ? (
        <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-4 md:mx-0 md:px-0">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="shrink-0 w-48 animate-pulse bg-gray-100 rounded-xl h-full min-h-[400px]" />
          ))}
        </div>
      ) : (
        <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
          <div className="-mx-4 flex min-h-0 flex-1 gap-3 overflow-x-auto px-4 pb-4 md:mx-0 md:px-0">
            {fases.map((fase) => (
              <KanbanColuna
                key={fase.id}
                faseId={fase.id}
                nome={fase.nome}
                cor={fase.cor}
                count={(porFase[fase.id] ?? []).length}
                processos={porFase[fase.id] ?? []}
                arrastavel={podeEditar}
              />
            ))}
          </div>

          <DragOverlay
            className={undefined}
            style={undefined}
            transition={undefined}
            adjustScale={undefined}
          >
            {processoArrastado && <KanbanCard processo={processoArrastado} overlay />}
          </DragOverlay>
        </DndContext>
      )}

      {/* Dialog de retorno de fase pelo Kanban — só chega aqui quem tem
          processos.retroceder_fase (checado antes de abrir). */}
      <Dialog open={!!retornoPendente} onOpenChange={(o) => { if (!o) { setRetornoPendente(null); setMotivoRetorno('') } }}>
        <DialogContent className="w-[calc(100vw-1rem)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-700">
              <AlertTriangle className="h-5 w-5" />
              Retornar processo para "{retornoPendente?.faseDestino.nome}"?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-500">
            {(retornoPendente?.processo.compradores?.find((c) => c.principal)?.nome
              ?? retornoPendente?.processo.compradores?.[0]?.nome
              ?? retornoPendente?.processo.nome_imovel)} retornará para uma fase anterior.
            Esta ação fica registrada no histórico. Os itens já marcados no checklist continuam marcados.
          </p>
          <div className="space-y-1.5">
            <Label>Motivo <span className="text-red-500">*</span></Label>
            <Textarea
              value={motivoRetorno}
              onChange={(e) => setMotivoRetorno(e.target.value)}
              placeholder="Descreva o motivo do retorno..."
              rows={3}
              className="resize-none"
            />
          </div>
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => { setRetornoPendente(null); setMotivoRetorno('') }}
              disabled={moverProcesso.isPending}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="flex-1"
              disabled={!motivoRetorno.trim() || moverProcesso.isPending}
              onClick={confirmarRetorno}
            >
              {moverProcesso.isPending ? 'Salvando...' : 'Confirmar retorno'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
