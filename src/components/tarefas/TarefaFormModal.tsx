'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useMembrosAtivos } from '@/hooks/dashboard/useDashboard'
import { Loader2, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

export const CATEGORIAS_TAREFA = ['contato', 'follow-up', 'visita', 'proposta', 'documentos', 'outro']

const PRIORIDADE_CONFIG = {
  baixa:   { label: 'Baixa' },
  media:   { label: 'Média' },
  alta:    { label: 'Alta' },
  urgente: { label: 'Urgente' },
} as const

export type Prioridade = keyof typeof PRIORIDADE_CONFIG

export interface TarefaFormData {
  titulo: string
  descricao?: string
  categoria: string
  prioridade: Prioridade
  responsavel_id?: string
  data_prazo?: string
  horario_inicio?: string | null
  horario_termino?: string | null
}

interface TarefaAtual {
  titulo: string
  descricao?: string | null
  categoria?: string | null
  prioridade: string
  responsavel_id?: string | null
  data_prazo?: string | null
  horario_inicio?: string | null
  horario_termino?: string | null
}

interface Props {
  aberto: boolean
  onFechar: () => void
  onSalvar: (dados: TarefaFormData) => Promise<void>
  isPending: boolean
  tarefaAtual?: TarefaAtual
}

export function TarefaFormModal({ aberto, onFechar, onSalvar, isPending, tarefaAtual }: Props) {
  const { data: membros = [] } = useMembrosAtivos()
  const editing = !!tarefaAtual

  const [titulo, setTitulo]         = useState(tarefaAtual?.titulo ?? '')
  const [descricao, setDescricao]   = useState(tarefaAtual?.descricao ?? '')
  const [categoria, setCategoria]   = useState(tarefaAtual?.categoria ?? 'contato')
  const [prioridade, setPrioridade] = useState<Prioridade>((tarefaAtual?.prioridade as Prioridade) ?? 'media')
  const [responsavel, setResponsavel] = useState(tarefaAtual?.responsavel_id ?? '')
  const [dataPrazo, setDataPrazo]   = useState(tarefaAtual?.data_prazo ?? '')
  const [horarioInicio, setHorarioInicio]   = useState(tarefaAtual?.horario_inicio?.slice(0, 5) ?? '')
  const [horarioTermino, setHorarioTermino] = useState(tarefaAtual?.horario_termino?.slice(0, 5) ?? '')

  function resetar() {
    setTitulo(''); setDescricao(''); setCategoria('contato')
    setPrioridade('media'); setResponsavel(''); setDataPrazo('')
    setHorarioInicio(''); setHorarioTermino('')
  }

  function fechar() { if (!editing) resetar(); onFechar() }

  async function handleSalvar() {
    if (!titulo.trim()) return
    try {
      await onSalvar({
        titulo:          titulo.trim(),
        descricao:       descricao.trim() || undefined,
        categoria,
        prioridade,
        responsavel_id:  responsavel || undefined,
        data_prazo:      dataPrazo   || undefined,
        horario_inicio:  horarioInicio  || null,
        horario_termino: horarioTermino || null,
      })
      if (!editing) resetar()
    } catch (err) {
      console.error('Erro ao salvar tarefa:', err)
      toast.error('Erro ao salvar tarefa. Tente novamente.')
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={(v) => { if (!v) fechar() }}>
      <DialogContent className="max-h-[92svh] w-[calc(100vw-1rem)] max-w-md overflow-y-auto p-0 sm:w-full">
        <DialogHeader className="border-b border-gray-100 px-4 pb-4 pt-5 sm:px-6">
          <DialogTitle className="text-fonti-primary">
            {editing ? 'Editar Tarefa' : 'Nova Tarefa'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 px-4 py-5 sm:px-6">
          {/* Título */}
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Título *</label>
            <Input
              placeholder="Ex: Ligar para o cliente amanhã"
              value={titulo}
              onChange={e => setTitulo(e.target.value)}
              autoFocus={!editing}
            />
          </div>

          {/* Descrição */}
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">
              Descrição <span className="text-gray-400 font-normal">(opcional)</span>
            </label>
            <Textarea
              rows={2}
              placeholder="Detalhes sobre o que deve ser feito..."
              value={descricao ?? ''}
              onChange={e => setDescricao(e.target.value)}
              className="resize-none text-sm"
            />
          </div>

          {/* Categoria + Prioridade */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Categoria</label>
              <Select value={categoria} onValueChange={setCategoria}>
                <SelectTrigger className="text-sm h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIAS_TAREFA.map(c => (
                    <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1.5 block">Prioridade</label>
              <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
                {(Object.keys(PRIORIDADE_CONFIG) as Prioridade[]).map(p => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPrioridade(p)}
                    className={cn(
                      'shrink-0 rounded-lg border px-2 py-1 text-xs transition-all',
                      prioridade === p
                        ? 'border-fonti-primary bg-fonti-primary text-white'
                        : 'border-gray-200 text-gray-500 hover:border-gray-300'
                    )}
                  >
                    {PRIORIDADE_CONFIG[p].label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Data + Horários */}
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">
              Data e Horário <span className="text-gray-400 font-normal">(opcional)</span>
            </label>
            <div className="grid gap-2 sm:grid-cols-3">
              <Input
                type="date"
                className="h-9 text-sm"
                value={dataPrazo}
                onChange={e => setDataPrazo(e.target.value)}
              />
              <div className="relative">
                <Clock className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
                <Input type="time" className="text-sm h-9 pl-8" value={horarioInicio} onChange={e => setHorarioInicio(e.target.value)} title="Início" />
              </div>
              <div className="relative">
                <Clock className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
                <Input type="time" className="text-sm h-9 pl-8" value={horarioTermino} onChange={e => setHorarioTermino(e.target.value)} title="Término" />
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-1">Data · Início · Término</p>
          </div>

          {/* Responsável */}
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">
              Responsável <span className="text-gray-400 font-normal">(opcional)</span>
            </label>
            <Select
              value={responsavel || '__none__'}
              onValueChange={(v) => setResponsavel(v === '__none__' ? '' : v)}
            >
              <SelectTrigger className="text-sm h-9"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— Nenhum</SelectItem>
                {membros.map(m => (
                  <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-gray-100 px-4 pb-5 pt-3 sm:flex-row sm:justify-end sm:px-6">
          <Button variant="outline" className="w-full sm:w-auto" onClick={fechar} disabled={isPending}>Cancelar</Button>
          <Button
            className="min-w-[110px] bg-fonti-primary text-white hover:bg-fonti-primary-hover sm:w-auto"
            onClick={handleSalvar}
            disabled={!titulo.trim() || isPending}
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : editing ? 'Salvar' : 'Criar Tarefa'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
