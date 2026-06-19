'use client'

import { useState } from 'react'
import { Plus, Pencil, Trash2, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { useRegrasComissao, useCriarRegraComissao, useAtualizarRegraComissao, useExcluirRegraComissao } from '@/hooks/rh/useComissoes'
import type { RhRegraComissao, RhFaixaComissao } from '@/types/rh'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

function fmtMoeda(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

type FaixaForm = Omit<RhFaixaComissao, 'id' | 'regra_id' | 'created_at'>

const VAZIO_REGRA = { nome: '', descricao: '', data_inicio: '', data_termino: '', ativa: true }
const VAZIO_FAIXA = (): FaixaForm => ({
  valor_minimo: 0,
  valor_maximo: 0,
  percentual: 0,
  pct_comercial: null,
  pct_operacional: null,
  pct_parceiro: null,
  piso_valor: 0,
  teto_valor: 0,
})

export function ComissoesTab() {
  const [modal, setModal] = useState(false)
  const [editando, setEditando] = useState<RhRegraComissao | null>(null)
  const [form, setForm] = useState(VAZIO_REGRA)
  const [faixas, setFaixas] = useState<FaixaForm[]>([VAZIO_FAIXA()])
  const [expandidas, setExpandidas] = useState<Set<string>>(new Set())

  const { data: regras = [] } = useRegrasComissao()
  const criar = useCriarRegraComissao()
  const atualizar = useAtualizarRegraComissao()
  const excluir = useExcluirRegraComissao()

  const isPending = criar.isPending || atualizar.isPending

  function toggleExpandida(id: string) {
    setExpandidas(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  function abrir(regra?: RhRegraComissao) {
    if (regra) {
      setEditando(regra)
      setForm({ nome: regra.nome, descricao: regra.descricao ?? '', data_inicio: regra.data_inicio, data_termino: regra.data_termino ?? '', ativa: regra.ativa })
      setFaixas(regra.faixas?.length ? regra.faixas.map(f => ({
        valor_minimo: f.valor_minimo,
        valor_maximo: f.valor_maximo,
        percentual: f.percentual,
        pct_comercial: f.pct_comercial ?? null,
        pct_operacional: f.pct_operacional ?? null,
        pct_parceiro: f.pct_parceiro ?? null,
        piso_valor: f.piso_valor ?? 0,
        teto_valor: f.teto_valor ?? 0,
      })) : [VAZIO_FAIXA()])
    } else {
      setEditando(null)
      setForm(VAZIO_REGRA)
      setFaixas([VAZIO_FAIXA()])
    }
    setModal(true)
  }

  function setFaixa(idx: number, key: keyof FaixaForm, val: number | null) {
    setFaixas(fs => fs.map((f, i) => i === idx ? { ...f, [key]: val } : f))
  }

  async function handleSalvar() {
    if (!form.nome.trim()) { toast.error('Nome é obrigatório'); return }
    if (!form.data_inicio) { toast.error('Data de início é obrigatória'); return }
    try {
      const base = { nome: form.nome, descricao: form.descricao || null, data_inicio: form.data_inicio, data_termino: form.data_termino || null, ativa: form.ativa }
      if (editando) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await atualizar.mutateAsync({ id: editando.id, ...base, faixas } as any)
        toast.success('Regra atualizada.')
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await criar.mutateAsync({ ...base, faixas } as any)
        toast.success('Regra criada.')
      }
      setModal(false)
    } catch {
      toast.error('Erro ao salvar regra.')
    }
  }

  async function handleExcluir(id: string, nome: string) {
    if (!confirm(`Desativar regra "${nome}"?`)) return
    try { await excluir.mutateAsync(id); toast.success('Regra desativada.') }
    catch { toast.error('Erro ao desativar.') }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-semibold text-gray-700">Regras de Comissão</h3>
        <Button size="sm" className="bg-[#253B29] text-white hover:bg-[#1a2b1e] gap-1.5" onClick={() => abrir()}>
          <Plus className="h-3.5 w-3.5" /> Nova Regra
        </Button>
      </div>

      {regras.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-8 text-center text-sm text-gray-400">
          Nenhuma regra de comissão cadastrada.
        </div>
      ) : (
        <div className="space-y-3">
          {regras.map(r => {
            const expandida = expandidas.has(r.id)
            return (
              <div key={r.id} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <div className="flex items-start gap-3 p-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-gray-800">{r.nome}</p>
                      <span className={cn('text-xs font-medium rounded-full px-2 py-0.5', r.ativa ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500')}>
                        {r.ativa ? 'Ativa' : 'Inativa'}
                      </span>
                    </div>
                    {r.descricao && <p className="text-xs text-gray-400 mt-0.5">{r.descricao}</p>}
                    <p className="text-xs text-gray-400 mt-1">
                      Vigência: {format(parseISO(r.data_inicio), 'dd/MM/yyyy', { locale: ptBR })}
                      {r.data_termino ? ` até ${format(parseISO(r.data_termino), 'dd/MM/yyyy', { locale: ptBR })}` : ' – Sem término definido'}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => abrir(r)}>
                      <Pencil className="h-3.5 w-3.5 text-gray-400" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleExcluir(r.id, r.nome)}>
                      <Trash2 className="h-3.5 w-3.5 text-red-400" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => toggleExpandida(r.id)}>
                      {expandida ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                    </Button>
                  </div>
                </div>

                {expandida && r.faixas && r.faixas.length > 0 && (
                  <div className="border-t border-gray-100 mx-4 mb-4">
                    <table className="w-full text-sm mt-2">
                      <thead>
                        <tr className="border-b border-gray-100">
                          <th className="text-left py-2 text-xs font-medium text-gray-500 pr-4">Val. Mínimo</th>
                          <th className="text-left py-2 text-xs font-medium text-gray-500 pr-4">Val. Máximo</th>
                          <th className="text-left py-2 text-xs font-medium text-gray-500 pr-4">% Base</th>
                          <th className="text-left py-2 text-xs font-medium text-gray-500 pr-4">% Comercial</th>
                          <th className="text-left py-2 text-xs font-medium text-gray-500 pr-4">% Operacional</th>
                          <th className="text-left py-2 text-xs font-medium text-gray-500 pr-4">% Parceiro</th>
                          <th className="text-left py-2 text-xs font-medium text-gray-500 pr-4">Piso R$</th>
                          <th className="text-left py-2 text-xs font-medium text-gray-500">Teto R$</th>
                        </tr>
                      </thead>
                      <tbody>
                        {r.faixas.map((f, i) => (
                          <tr key={i} className="border-b border-gray-50 last:border-0">
                            <td className="py-2 text-xs text-gray-700 pr-4">{fmtMoeda(f.valor_minimo)}</td>
                            <td className="py-2 text-xs text-gray-700 pr-4">{f.valor_maximo === 0 ? '—' : fmtMoeda(f.valor_maximo)}</td>
                            <td className="py-2 text-xs text-gray-700 pr-4">{f.percentual}%</td>
                            <td className="py-2 text-xs text-gray-700 pr-4">{f.pct_comercial != null ? `${f.pct_comercial}%` : '—'}</td>
                            <td className="py-2 text-xs text-gray-700 pr-4">{f.pct_operacional != null ? `${f.pct_operacional}%` : '—'}</td>
                            <td className="py-2 text-xs text-gray-700 pr-4">{f.pct_parceiro != null ? `${f.pct_parceiro}%` : '—'}</td>
                            <td className="py-2 text-xs text-gray-700 pr-4">{f.piso_valor > 0 ? fmtMoeda(f.piso_valor) : '—'}</td>
                            <td className="py-2 text-xs text-gray-700">{f.teto_valor > 0 ? fmtMoeda(f.teto_valor) : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <Dialog open={modal} onOpenChange={o => { if (!o) setModal(false) }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editando ? 'Editar Regra de Comissão' : 'Nova Regra de Comissão'}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1">
              <Label className="text-xs">Nome da Regra *</Label>
              <Input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Descrição</Label>
              <Textarea rows={2} value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Data de Início *</Label>
                <Input type="date" value={form.data_inicio} onChange={e => setForm(f => ({ ...f, data_inicio: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Data de Término (opcional)</Label>
                <Input type="date" value={form.data_termino} onChange={e => setForm(f => ({ ...f, data_termino: e.target.value }))} />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs">Faixas de Comissão</Label>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setFaixas(fs => [...fs, VAZIO_FAIXA()])}>
                  <Plus className="h-3 w-3" /> Adicionar Faixa
                </Button>
              </div>
              <div className="space-y-2">
                {faixas.map((f, i) => (
                  <div key={i} className="border border-gray-100 rounded-lg p-2.5 space-y-2">
                    <div className="grid grid-cols-3 gap-2">
                      <div className="space-y-1">
                        <Label className="text-[10px] text-gray-500">Val. Mínimo (R$)</Label>
                        <Input type="number" min={0} value={f.valor_minimo} onChange={e => setFaixa(i, 'valor_minimo', Number(e.target.value))} className="h-8 text-xs" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-gray-500">Val. Máximo (0 = sem limite)</Label>
                        <Input type="number" min={0} value={f.valor_maximo} onChange={e => setFaixa(i, 'valor_maximo', Number(e.target.value))} className="h-8 text-xs" />
                      </div>
                      <div className="flex items-end gap-1">
                        <div className="flex-1 space-y-1">
                          <Label className="text-[10px] text-gray-500">% Base</Label>
                          <Input type="number" min={0} step={0.1} value={f.percentual} onChange={e => setFaixa(i, 'percentual', Number(e.target.value))} className="h-8 text-xs" />
                        </div>
                        {faixas.length > 1 && (
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-red-400" onClick={() => setFaixas(fs => fs.filter((_, j) => j !== i))}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-5 gap-2">
                      <div className="space-y-1">
                        <Label className="text-[10px] text-gray-500">% Comercial</Label>
                        <Input type="number" min={0} step={0.1} value={f.pct_comercial ?? ''} placeholder="= Base" onChange={e => setFaixa(i, 'pct_comercial', e.target.value === '' ? null : Number(e.target.value))} className="h-7 text-xs" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-gray-500">% Operacional</Label>
                        <Input type="number" min={0} step={0.1} value={f.pct_operacional ?? ''} placeholder="= Base" onChange={e => setFaixa(i, 'pct_operacional', e.target.value === '' ? null : Number(e.target.value))} className="h-7 text-xs" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-gray-500">% Parceiro</Label>
                        <Input type="number" min={0} step={0.1} value={f.pct_parceiro ?? ''} placeholder="= Base" onChange={e => setFaixa(i, 'pct_parceiro', e.target.value === '' ? null : Number(e.target.value))} className="h-7 text-xs" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-gray-500">Piso R$</Label>
                        <Input type="number" min={0} step={100} value={f.piso_valor} onChange={e => setFaixa(i, 'piso_valor', Number(e.target.value))} className="h-7 text-xs" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-gray-500">Teto R$ (0 = sem)</Label>
                        <Input type="number" min={0} step={100} value={f.teto_valor} onChange={e => setFaixa(i, 'teto_valor', Number(e.target.value))} className="h-7 text-xs" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Switch checked={form.ativa} onCheckedChange={v => setForm(f => ({ ...f, ativa: v }))} />
              <Label className="text-xs">Regra Ativa</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModal(false)}>Cancelar</Button>
            <Button onClick={handleSalvar} disabled={isPending} className="bg-[#253B29] text-white hover:bg-[#1a2b1e]">
              {isPending ? 'Salvando...' : editando ? 'Salvar' : 'Criar Regra'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
