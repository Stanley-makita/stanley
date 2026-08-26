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
import type { RhRegraComissao, RhFaixaComissao, RhTipoCalculoComissao } from '@/types/rh'
import { RH_TIPO_CALCULO_LABELS } from '@/types/rh'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

function fmtMoeda(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

function fmtPercentual(v: number) {
  return `${v.toFixed(2).replace('.', ',')}%`
}

type FaixaForm = Omit<RhFaixaComissao, 'id' | 'regra_id' | 'created_at'>

const VAZIO_REGRA = {
  nome: '', descricao: '', data_inicio: '', data_termino: '', ativa: true,
  tipo_calculo: 'valor_fixo_emissao' as RhTipoCalculoComissao,
  valor_fixo_emissao: 0, valor_fixo_assessoria: 0,
}
// pct_comercial é usado quando tipo_calculo = percentual_faixa_producao_mensal;
// valor_fixo quando tipo_calculo = valor_fixo_emissao. Os demais campos
// percentuais antigos (percentual/pct_operacional/pct_parceiro) ficam null —
// mantidos na tabela só por compatibilidade com regras já existentes.
const VAZIO_FAIXA = (): FaixaForm => ({
  valor_minimo: 0,
  valor_maximo: 0,
  percentual: null,
  pct_comercial: null,
  pct_operacional: null,
  pct_parceiro: null,
  piso_valor: 0,
  teto_valor: 0,
  valor_fixo: 0,
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
      setForm({
        nome: regra.nome,
        descricao: regra.descricao ?? '',
        data_inicio: regra.data_inicio,
        data_termino: regra.data_termino ?? '',
        ativa: regra.ativa,
        tipo_calculo: regra.tipo_calculo,
        valor_fixo_emissao: regra.valor_fixo_emissao ?? 0,
        valor_fixo_assessoria: regra.valor_fixo_assessoria ?? 0,
      })
      setFaixas(regra.faixas?.length ? regra.faixas.map(f => ({
        valor_minimo: f.valor_minimo,
        valor_maximo: f.valor_maximo,
        percentual: f.percentual,
        pct_comercial: f.pct_comercial ?? null,
        pct_operacional: f.pct_operacional ?? null,
        pct_parceiro: f.pct_parceiro ?? null,
        piso_valor: f.piso_valor ?? 0,
        teto_valor: f.teto_valor ?? 0,
        valor_fixo: f.valor_fixo ?? 0,
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
      const base = {
        nome: form.nome,
        descricao: form.descricao || null,
        data_inicio: form.data_inicio,
        data_termino: form.data_termino || null,
        ativa: form.ativa,
        tipo_calculo: form.tipo_calculo,
        valor_fixo_emissao: form.valor_fixo_emissao || null,
        valor_fixo_assessoria: form.valor_fixo_assessoria || null,
      }
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
        <Button size="sm" className="bg-fonti-primary text-white hover:bg-fonti-primary-hover gap-1.5" onClick={() => abrir()}>
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
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-gray-800">{r.nome}</p>
                      <span className={cn('text-xs font-medium rounded-full px-2 py-0.5', r.ativa ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500')}>
                        {r.ativa ? 'Ativa' : 'Inativa'}
                      </span>
                      <span className={cn('text-xs font-medium rounded-full px-2 py-0.5',
                        r.tipo_calculo !== 'valor_fixo_emissao' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700')}>
                        {r.tipo_calculo === 'percentual_faixa_producao_mensal'
                          ? 'Percentual (produção mensal)'
                          : r.tipo_calculo === 'percentual_por_negocio'
                            ? 'Percentual (por negócio)'
                            : 'Valor fixo (operacional)'}
                      </span>
                    </div>
                    {r.descricao && <p className="text-xs text-gray-400 mt-0.5">{r.descricao}</p>}
                    <p className="text-xs text-gray-400 mt-1">
                      Vigência: {format(parseISO(r.data_inicio), 'dd/MM/yyyy', { locale: ptBR })}
                      {r.data_termino ? ` até ${format(parseISO(r.data_termino), 'dd/MM/yyyy', { locale: ptBR })}` : ' – Sem término definido'}
                    </p>
                    {r.tipo_calculo === 'valor_fixo_emissao' && (!!r.valor_fixo_emissao || !!r.valor_fixo_assessoria) && (
                      <p className="text-xs text-gray-500 mt-1 flex gap-3">
                        {!!r.valor_fixo_emissao && <span>Por emissão: <strong>{fmtMoeda(r.valor_fixo_emissao)}</strong></span>}
                        {!!r.valor_fixo_assessoria && <span>Por assessoria: <strong>{fmtMoeda(r.valor_fixo_assessoria)}</strong></span>}
                      </p>
                    )}
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
                          <th className="text-left py-2 text-xs font-medium text-gray-500 pr-4">Produção de</th>
                          <th className="text-left py-2 text-xs font-medium text-gray-500 pr-4">até</th>
                          <th className="text-left py-2 text-xs font-medium text-gray-500">
                            {r.tipo_calculo === 'percentual_faixa_producao_mensal'
                              ? '% Comercial'
                              : r.tipo_calculo === 'percentual_por_negocio'
                                ? '% sobre o valor do negócio'
                                : 'Valor Fixo'}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {r.faixas.map((f, i) => (
                          <tr key={i} className="border-b border-gray-50 last:border-0">
                            <td className="py-2 text-xs text-gray-700 pr-4">{fmtMoeda(f.valor_minimo)}</td>
                            <td className="py-2 text-xs text-gray-700 pr-4">{f.valor_maximo === 0 ? 'sem limite' : fmtMoeda(f.valor_maximo)}</td>
                            <td className="py-2 text-xs text-gray-700 font-medium">
                              {r.tipo_calculo !== 'valor_fixo_emissao'
                                ? (f.pct_comercial ? fmtPercentual(f.pct_comercial) : '—')
                                : (f.valor_fixo ? fmtMoeda(f.valor_fixo) : '—')}
                            </td>
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

            <div className="space-y-1">
              <Label className="text-xs">Tipo de Cálculo *</Label>
              <select
                className="w-full h-9 rounded-md border border-gray-200 px-2 text-sm"
                value={form.tipo_calculo}
                onChange={e => setForm(f => ({ ...f, tipo_calculo: e.target.value as RhTipoCalculoComissao }))}
              >
                {Object.entries(RH_TIPO_CALCULO_LABELS).map(([valor, label]) => (
                  <option key={valor} value={valor}>{label}</option>
                ))}
              </select>
              <p className="text-[11px] text-gray-400">
                {form.tipo_calculo === 'percentual_faixa_producao_mensal'
                  ? 'A faixa é aplicada sobre a produção mensal ACUMULADA do funcionário (financiamento + contrato + assessoria), não sobre um processo isolado.'
                  : form.tipo_calculo === 'percentual_por_negocio'
                    ? 'A faixa é escolhida pelo valor do negócio (ex.: valor da carta de consórcio) e aplicada direto sobre esse valor — não é uma fatia da comissão que a empresa recebe. Uma única faixa "0 até sem limite" funciona como taxa fixa por pessoa.'
                    : 'Valor fixo pago por processo emitido/com assessoria — modelo atual do time operacional.'}
              </p>
            </div>

            {form.tipo_calculo === 'valor_fixo_emissao' && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Valor por Processo Emitido (R$)</Label>
                  <Input type="number" min={0} step={0.01} value={form.valor_fixo_emissao} onChange={e => setForm(f => ({ ...f, valor_fixo_emissao: Number(e.target.value) }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Valor por Processo com Assessoria (R$)</Label>
                  <Input type="number" min={0} step={0.01} value={form.valor_fixo_assessoria} onChange={e => setForm(f => ({ ...f, valor_fixo_assessoria: Number(e.target.value) }))} />
                </div>
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs">
                  {form.tipo_calculo === 'percentual_faixa_producao_mensal'
                    ? 'Faixas de Produção Mensal (percentual sobre o total acumulado)'
                    : form.tipo_calculo === 'percentual_por_negocio'
                      ? 'Faixas por Valor do Negócio (percentual sobre o valor da carta)'
                      : 'Faixas de Produção (valor fixo por faixa atingida)'}
                </Label>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setFaixas(fs => [...fs, VAZIO_FAIXA()])}>
                  <Plus className="h-3 w-3" /> Adicionar Faixa
                </Button>
              </div>
              <div className="space-y-2">
                {faixas.map((f, i) => (
                  <div key={i} className="border border-gray-100 rounded-lg p-2.5">
                    <div className="grid grid-cols-3 gap-2">
                      <div className="space-y-1">
                        <Label className="text-[10px] text-gray-500">Produção de (R$)</Label>
                        <Input type="number" min={0} value={f.valor_minimo} onChange={e => setFaixa(i, 'valor_minimo', Number(e.target.value))} className="h-8 text-xs" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] text-gray-500">até (0 = sem limite)</Label>
                        <Input type="number" min={0} value={f.valor_maximo} onChange={e => setFaixa(i, 'valor_maximo', Number(e.target.value))} className="h-8 text-xs" />
                      </div>
                      <div className="flex items-end gap-1">
                        {form.tipo_calculo !== 'valor_fixo_emissao' ? (
                          <div className="flex-1 space-y-1">
                            <Label className="text-[10px] text-gray-500">
                              {form.tipo_calculo === 'percentual_por_negocio' ? '% sobre o valor do negócio' : '% Comercial'}
                            </Label>
                            <Input type="number" min={0} step={0.01} value={f.pct_comercial ?? ''} onChange={e => setFaixa(i, 'pct_comercial', e.target.value === '' ? null : Number(e.target.value))} className="h-8 text-xs" />
                          </div>
                        ) : (
                          <div className="flex-1 space-y-1">
                            <Label className="text-[10px] text-gray-500">Valor Fixo (R$)</Label>
                            <Input type="number" min={0} step={0.01} value={f.valor_fixo ?? ''} onChange={e => setFaixa(i, 'valor_fixo', e.target.value === '' ? null : Number(e.target.value))} className="h-8 text-xs" />
                          </div>
                        )}
                        {faixas.length > 1 && (
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-red-400" onClick={() => setFaixas(fs => fs.filter((_, j) => j !== i))}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
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
            <Button onClick={handleSalvar} disabled={isPending} className="bg-fonti-primary text-white hover:bg-fonti-primary-hover">
              {isPending ? 'Salvando...' : editando ? 'Salvar' : 'Criar Regra'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
