'use client'

import { useState } from 'react'
import { Plus, Check, Pencil, X, Trash2 } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  useProcessoFinanceiro, useCriarLancamento, useAtualizarLancamento, useExcluirLancamento,
} from '@/hooks/processos/useProcessoFinanceiro'
import type { ProcessoFinanceiro } from '@/types/processos'

// ─── Configurações visuais ───────────────────────────────────────────────────

const TIPO_CFG: Record<ProcessoFinanceiro['tipo'], { label: string; cls: string }> = {
  receita_empresa:  { label: 'Receita',  cls: 'bg-green-100 text-green-700' },
  custo_empresa:    { label: 'Custo',    cls: 'bg-red-100 text-red-700' },
  repasse_cliente:  { label: 'Repasse',  cls: 'bg-gray-100 text-gray-600' },
  deposito_cliente: { label: 'Depósito', cls: 'bg-blue-100 text-blue-700' },
}

const SITUACAO_CFG: Record<ProcessoFinanceiro['situacao'], { label: string; cls: string }> = {
  pendente:  { label: 'Pendente',  cls: 'bg-amber-100 text-amber-700' },
  pago:      { label: 'Pago',      cls: 'bg-green-100 text-green-700' },
  cancelado: { label: 'Cancelado', cls: 'bg-gray-100 text-gray-400' },
}

type Filtro = 'todos' | 'a_receber' | 'recebido' | 'repasse' | 'deposito'

const FILTROS: { id: Filtro; label: string }[] = [
  { id: 'todos',     label: 'Todos' },
  { id: 'a_receber', label: 'A Receber' },
  { id: 'recebido',  label: 'Recebido' },
  { id: 'repasse',   label: 'Repasse Cliente' },
  { id: 'deposito',  label: 'Depósito' },
]

function fmtMoeda(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

// ─── Formulário (modal) ──────────────────────────────────────────────────────

interface FormState {
  descricao: string
  tipo: ProcessoFinanceiro['tipo']
  valor: string
  situacao: ProcessoFinanceiro['situacao']
  observacao: string
}

const FORM_VAZIO: FormState = {
  descricao: '',
  tipo: 'receita_empresa',
  valor: '',
  situacao: 'pendente',
  observacao: '',
}

interface ModalLancamentoProps {
  aberto: boolean
  onFechar: () => void
  editando: ProcessoFinanceiro | null
  onSalvar: (form: FormState) => Promise<void>
  isPending: boolean
}

function ModalLancamento({ aberto, onFechar, editando, onSalvar, isPending }: ModalLancamentoProps) {
  const [form, setForm] = useState<FormState>(FORM_VAZIO)

  // Sincroniza quando abre
  useState(() => {
    if (aberto) {
      setForm(editando ? {
        descricao:  editando.descricao,
        tipo:       editando.tipo,
        valor:      String(editando.valor),
        situacao:   editando.situacao,
        observacao: editando.observacao ?? '',
      } : FORM_VAZIO)
    }
  })

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  return (
    <Dialog open={aberto} onOpenChange={onFechar}>
      <DialogContent className="max-h-[92svh] w-[calc(100vw-1rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editando ? 'Editar lançamento' : 'Novo lançamento'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Descrição <span className="text-red-400">*</span></label>
            <Input
              placeholder="ex: Assessoria integral, ITBI, Kit certidões..."
              value={form.descricao}
              onChange={(e) => set('descricao', e.target.value)}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Tipo <span className="text-red-400">*</span></label>
              <Select value={form.tipo} onValueChange={(v) => set('tipo', v as ProcessoFinanceiro['tipo'])}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="receita_empresa">Receita da empresa</SelectItem>
                  <SelectItem value="custo_empresa">Custo da empresa</SelectItem>
                  <SelectItem value="repasse_cliente">Repasse do cliente</SelectItem>
                  <SelectItem value="deposito_cliente">Depósito do cliente</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Valor (R$) <span className="text-red-400">*</span></label>
              <Input
                type="number"
                placeholder="0,00"
                min="0"
                step="0.01"
                value={form.valor}
                onChange={(e) => set('valor', e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Situação</label>
            <Select value={form.situacao} onValueChange={(v) => set('situacao', v as ProcessoFinanceiro['situacao'])}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pendente">Pendente</SelectItem>
                <SelectItem value="pago">Pago</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Observação <span className="text-gray-300 font-normal">(opcional)</span></label>
            <Input
              placeholder="Informação adicional..."
              value={form.observacao}
              onChange={(e) => set('observacao', e.target.value)}
            />
          </div>
        </div>

        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
          <Button variant="outline" onClick={onFechar} className="w-full sm:w-auto">Cancelar</Button>
          <Button
            className="w-full bg-[#253B29] text-white hover:bg-[#1a2b1e] sm:w-auto"
            onClick={() => onSalvar(form)}
            disabled={isPending}
          >
            {isPending ? 'Salvando...' : editando ? 'Salvar' : 'Criar lançamento'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Card resumo ─────────────────────────────────────────────────────────────

function CardResumo({ label, valor, destaque }: { label: string; valor: number; destaque?: 'verde' | 'vermelho' | 'azul' | 'neutro' }) {
  const cor = destaque === 'verde' ? 'text-green-600'
    : destaque === 'vermelho' ? 'text-red-600'
    : destaque === 'azul'     ? 'text-blue-600'
    : 'text-[#253B29]'
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className={cn('text-base font-bold', cor)}>{fmtMoeda(valor)}</p>
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function AbaFinanceiro({ processoId }: { processoId: string }) {
  const { data: lancamentos = [], isLoading } = useProcessoFinanceiro(processoId)
  const criar    = useCriarLancamento(processoId)
  const atualizar = useAtualizarLancamento(processoId)
  const excluir  = useExcluirLancamento(processoId)

  const [filtro, setFiltro]         = useState<Filtro>('todos')
  const [modalAberto, setModalAberto] = useState(false)
  const [editando, setEditando]     = useState<ProcessoFinanceiro | null>(null)

  // ── Cálculo dos cards (excluir cancelados) ─────────────────────────────────
  const ativos = lancamentos.filter((l) => l.situacao !== 'cancelado')

  const aReceber    = ativos.filter((l) => l.tipo === 'receita_empresa'  && l.situacao === 'pendente').reduce((s, l) => s + l.valor, 0)
  const recebido    = ativos.filter((l) => l.tipo === 'receita_empresa'  && l.situacao === 'pago').reduce((s, l) => s + l.valor, 0)
  const depositos   = ativos.filter((l) => l.tipo === 'deposito_cliente').reduce((s, l) => s + l.valor, 0)
  const repassess   = ativos.filter((l) => l.tipo === 'repasse_cliente') .reduce((s, l) => s + l.valor, 0)
  const saldoCliente = depositos - repassess
  const custo       = ativos.filter((l) => l.tipo === 'custo_empresa')   .reduce((s, l) => s + l.valor, 0)

  // ── Filtro de lista ────────────────────────────────────────────────────────
  const filtrados = lancamentos.filter((l) => {
    if (l.situacao === 'cancelado') return false
    if (filtro === 'todos')     return true
    if (filtro === 'a_receber') return l.tipo === 'receita_empresa'  && l.situacao === 'pendente'
    if (filtro === 'recebido')  return l.tipo === 'receita_empresa'  && l.situacao === 'pago'
    if (filtro === 'repasse')   return l.tipo === 'repasse_cliente'
    if (filtro === 'deposito')  return l.tipo === 'deposito_cliente'
    return true
  })

  // ── Ações ──────────────────────────────────────────────────────────────────
  function abrirCriar() {
    setEditando(null)
    setModalAberto(true)
  }

  function abrirEditar(l: ProcessoFinanceiro) {
    setEditando(l)
    setModalAberto(true)
  }

  async function salvar(form: FormState) {
    if (!form.descricao.trim()) { toast.error('Informe a descrição'); return }
    const valor = parseFloat(form.valor)
    if (isNaN(valor) || valor <= 0) { toast.error('Informe um valor válido'); return }

    try {
      if (editando) {
        await atualizar.mutateAsync({
          id: editando.id,
          descricao:  form.descricao.trim(),
          tipo:       form.tipo,
          valor,
          situacao:   form.situacao,
          observacao: form.observacao.trim() || null,
        })
        toast.success('Lançamento atualizado')
      } else {
        await criar.mutateAsync({
          descricao:  form.descricao.trim(),
          tipo:       form.tipo,
          valor,
          situacao:   form.situacao,
          observacao: form.observacao.trim() || null,
        })
        toast.success('Lançamento criado')
      }
      setModalAberto(false)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao salvar')
    }
  }

  async function marcarPago(id: string) {
    try {
      await atualizar.mutateAsync({ id, situacao: 'pago' })
      toast.success('Marcado como pago')
    } catch { toast.error('Erro ao atualizar') }
  }

  async function handleExcluir(id: string) {
    try {
      await excluir.mutateAsync(id)
      toast.success('Lançamento removido')
    } catch { toast.error('Erro ao excluir') }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  if (isLoading) {
    return <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}</div>
  }

  return (
    <div className="space-y-5">
      {/* Cards resumo */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <CardResumo label="A Receber"     valor={aReceber}     destaque="neutro" />
        <CardResumo label="Recebido"      valor={recebido}     destaque="verde" />
        <CardResumo label="Saldo Cliente" valor={saldoCliente} destaque="azul" />
        <CardResumo label="Custo"         valor={custo}        destaque="vermelho" />
      </div>

      {/* Barra de ações */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        {/* Pills de filtro */}
        <div className="-mx-1 flex max-w-full gap-1.5 overflow-x-auto px-1 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
          {FILTROS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFiltro(f.id)}
              className={cn(
                'text-xs px-3 py-1.5 rounded-full border transition-all',
                filtro === f.id
                  ? 'bg-[#253B29] text-white border-[#253B29]'
                  : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        <Button
          size="sm"
          className="w-full gap-1.5 bg-[#253B29] text-white hover:bg-[#1a2b1e] sm:w-auto"
          onClick={abrirCriar}
        >
          <Plus className="h-4 w-4" />
          Novo Lançamento
        </Button>
      </div>

      {/* Tabela */}
      {filtrados.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
          <p className="text-sm text-gray-400">Nenhum lançamento encontrado.</p>
          <Button size="sm" variant="outline" onClick={abrirCriar} className="gap-1.5">
            <Plus className="h-4 w-4" />
            Criar primeiro lançamento
          </Button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <div className="divide-y md:hidden">
            {filtrados.map((l) => (
              <div key={l.id} className="space-y-3 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-800">{l.descricao}</p>
                    {l.observacao && (
                      <p className="mt-0.5 text-xs text-gray-400">{l.observacao}</p>
                    )}
                    <p className="mt-1 text-xs text-gray-500">
                      {format(new Date(l.created_at), 'dd/MM/yyyy', { locale: ptBR })}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-bold text-[#253B29]">
                    {fmtMoeda(l.valor)}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge className={cn('text-[11px] font-medium', TIPO_CFG[l.tipo].cls)}>
                    {TIPO_CFG[l.tipo].label}
                  </Badge>
                  <Badge className={cn('text-[11px] font-medium', SITUACAO_CFG[l.situacao].cls)}>
                    {SITUACAO_CFG[l.situacao].label}
                  </Badge>
                </div>

                <div className="flex items-center justify-end gap-1">
                  {l.situacao === 'pendente' && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs text-green-700"
                      onClick={() => marcarPago(l.id)}
                    >
                      <Check className="mr-1 h-3.5 w-3.5" />
                      Pago
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-gray-400 hover:text-[#253B29]"
                    title="Editar"
                    onClick={() => abrirEditar(l)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-gray-400 hover:text-red-500"
                    title="Excluir"
                    onClick={() => handleExcluir(l.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <div className="hidden md:block">
          {/* Cabeçalho */}
          <div className="grid grid-cols-[1fr_2fr_1fr_1fr_1fr_auto] gap-3 px-4 py-2.5 bg-gray-50 border-b text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
            <span>Data</span>
            <span>Descrição</span>
            <span>Tipo</span>
            <span>Valor</span>
            <span>Situação</span>
            <span />
          </div>

          {/* Linhas */}
          {filtrados.map((l) => (
            <div
              key={l.id}
              className="grid grid-cols-[1fr_2fr_1fr_1fr_1fr_auto] gap-3 px-4 py-3 items-center border-b last:border-0 hover:bg-gray-50/70 transition-colors"
            >
              <span className="text-xs text-gray-500">
                {format(new Date(l.created_at), 'dd/MM/yyyy', { locale: ptBR })}
              </span>

              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{l.descricao}</p>
                {l.observacao && (
                  <p className="text-xs text-gray-400 truncate">{l.observacao}</p>
                )}
              </div>

              <Badge className={cn('text-[11px] font-medium w-fit', TIPO_CFG[l.tipo].cls)}>
                {TIPO_CFG[l.tipo].label}
              </Badge>

              <span className="text-sm font-semibold text-gray-800">
                {fmtMoeda(l.valor)}
              </span>

              <Badge className={cn('text-[11px] font-medium w-fit', SITUACAO_CFG[l.situacao].cls)}>
                {SITUACAO_CFG[l.situacao].label}
              </Badge>

              {/* Ações */}
              <div className="flex items-center gap-0.5">
                {l.situacao === 'pendente' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-gray-400 hover:text-green-600"
                    title="Marcar como pago"
                    onClick={() => marcarPago(l.id)}
                  >
                    <Check className="h-3.5 w-3.5" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-gray-400 hover:text-[#253B29]"
                  title="Editar"
                  onClick={() => abrirEditar(l)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-gray-400 hover:text-red-500"
                  title="Excluir"
                  onClick={() => handleExcluir(l.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
          </div>
        </div>
      )}

      <ModalLancamento
        aberto={modalAberto}
        onFechar={() => setModalAberto(false)}
        editando={editando}
        onSalvar={salvar}
        isPending={criar.isPending || atualizar.isPending}
      />
    </div>
  )
}
