'use client'

import { useState } from 'react'
import {
  useProcessoCotas, useAdicionarCota, useEditarCota, useAlterarStatusCota, useExcluirCotaEngano,
  useRecalcularFluxoConsorcio,
  type ProcessoCota, type StatusCota, type StatusPagamentoCota,
} from '@/hooks/processos/useProcessoCotas'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Plus, Pencil, Trash2, X, Check, RefreshCw } from 'lucide-react'
import { TIPOS_BEM, LABEL_TIPO_PARCELA, type TipoParcela } from '@/types/consorcio'
import { useAuth } from '@/hooks/auth/useAuth'

const LABEL_STATUS_COTA: Record<StatusCota, string> = {
  ativo: 'Ativo', contemplado: 'Contemplado', cancelado: 'Cancelado', substituido: 'Substituído',
}
const COR_STATUS_COTA: Record<StatusCota, string> = {
  ativo: 'bg-blue-50 text-blue-700 border-blue-200',
  contemplado: 'bg-green-50 text-green-700 border-green-200',
  cancelado: 'bg-gray-100 text-gray-500 border-gray-200',
  substituido: 'bg-amber-50 text-amber-700 border-amber-200',
}
// 'quitado' = a COTA INTEIRA quitada (fim do consórcio) — nunca confundir
// com "parcela do mês em dia".
const LABEL_STATUS_PAGAMENTO: Record<StatusPagamentoCota, string> = {
  em_dia: 'Em dia', atrasado: 'Atrasado', quitado: 'Cota quitada',
}
const COR_STATUS_PAGAMENTO: Record<StatusPagamentoCota, string> = {
  em_dia: 'bg-green-50 text-green-700 border-green-200',
  atrasado: 'bg-red-50 text-red-700 border-red-200',
  quitado: 'bg-fonti-accent-hover text-fonti-primary border-fonti-accent/60',
}

interface FormCotaState {
  data_adesao: string
  grupo: string
  cota: string
  administradora_nome: string
  tipo_bem: string
  tipo_parcela: TipoParcela
  data_pagamento_boleto: string
  valor_carta: string
  valor_parcela: string
  parcela_reduzida_percentual: string
  prazo_cota_meses: string
  prazo_grupo_meses: string
  status_pagamento: StatusPagamentoCota
  data_vencimento: string
  proxima_assembleia_em: string
  informacao_adicional: string
}

const FORM_VAZIO: FormCotaState = {
  data_adesao: '', grupo: '', cota: '', administradora_nome: '', tipo_bem: '',
  tipo_parcela: 'linear', data_pagamento_boleto: '',
  valor_carta: '', valor_parcela: '', parcela_reduzida_percentual: '',
  prazo_cota_meses: '', prazo_grupo_meses: '', status_pagamento: 'em_dia',
  data_vencimento: '', proxima_assembleia_em: '', informacao_adicional: '',
}

function paraNumero(v: string): number | null {
  const n = Number(v.replace(',', '.'))
  return v.trim() === '' || isNaN(n) ? null : n
}

function paraPayload(f: FormCotaState) {
  return {
    data_adesao: f.data_adesao || null,
    grupo: f.grupo || null,
    cota: f.cota || null,
    administradora_nome: f.administradora_nome.trim() || null,
    tipo_bem: f.tipo_bem || null,
    tipo_parcela: f.tipo_parcela,
    data_pagamento_boleto: f.data_pagamento_boleto || null,
    valor_carta: paraNumero(f.valor_carta),
    valor_parcela: paraNumero(f.valor_parcela),
    parcela_reduzida_percentual: paraNumero(f.parcela_reduzida_percentual),
    prazo_cota_meses: paraNumero(f.prazo_cota_meses),
    prazo_grupo_meses: paraNumero(f.prazo_grupo_meses),
    status_pagamento: f.status_pagamento,
    data_vencimento: f.data_vencimento || null,
    proxima_assembleia_em: f.proxima_assembleia_em || null,
    informacao_adicional: f.informacao_adicional || null,
  }
}

function fmtMoeda(v: number | null) {
  if (v == null) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v)
}

function fmtData(v: string | null) {
  if (!v) return '—'
  return new Date(v + 'T00:00:00').toLocaleDateString('pt-BR')
}

export function ListaCotas({ processoId }: { processoId: string }) {
  const { data: cotas = [], isLoading } = useProcessoCotas(processoId)
  const adicionar = useAdicionarCota(processoId)
  const editar = useEditarCota(processoId)
  const alterarStatus = useAlterarStatusCota(processoId)
  const excluir = useExcluirCotaEngano(processoId)
  const recalcular = useRecalcularFluxoConsorcio(processoId)
  const { usuario } = useAuth()
  const podeRecalcular = usuario?.perfil === 'admin' || usuario?.perfil === 'gestor' || usuario?.perfil === 'gerente'

  const [exibirForm, setExibirForm] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [form, setForm] = useState<FormCotaState>(FORM_VAZIO)

  function iniciarNova() {
    setForm(FORM_VAZIO)
    setEditandoId(null)
    setExibirForm(true)
  }

  function iniciarEdicao(cota: ProcessoCota) {
    setForm({
      data_adesao: cota.data_adesao ?? '',
      grupo: cota.grupo ?? '',
      cota: cota.cota ?? '',
      administradora_nome: cota.administradora_nome ?? '',
      tipo_bem: cota.tipo_bem ?? '',
      tipo_parcela: cota.tipo_parcela,
      data_pagamento_boleto: cota.data_pagamento_boleto ?? '',
      valor_carta: cota.valor_carta != null ? String(cota.valor_carta) : '',
      valor_parcela: cota.valor_parcela != null ? String(cota.valor_parcela) : '',
      parcela_reduzida_percentual: cota.parcela_reduzida_percentual != null ? String(cota.parcela_reduzida_percentual) : '',
      prazo_cota_meses: cota.prazo_cota_meses != null ? String(cota.prazo_cota_meses) : '',
      prazo_grupo_meses: cota.prazo_grupo_meses != null ? String(cota.prazo_grupo_meses) : '',
      status_pagamento: cota.status_pagamento,
      data_vencimento: cota.data_vencimento ?? '',
      proxima_assembleia_em: cota.proxima_assembleia_em ?? '',
      informacao_adicional: cota.informacao_adicional ?? '',
    })
    setEditandoId(cota.id)
    setExibirForm(true)
  }

  function cancelar() {
    setExibirForm(false)
    setEditandoId(null)
    setForm(FORM_VAZIO)
  }

  async function salvar() {
    const payload = paraPayload(form)
    if (editandoId) {
      await editar.mutateAsync({ id: editandoId, ...payload })
    } else {
      await adicionar.mutateAsync(payload)
    }
    cancelar()
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-fonti-primary">Lista de Cotas</h3>
        <div className="flex items-center gap-2">
          {podeRecalcular && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs"
              disabled={recalcular.isPending}
              onClick={() => {
                if (window.confirm('Isso vai apagar e regerar todas as parcelas ainda não recebidas/pagas deste processo, usando a configuração de comissão atual. Continuar?')) {
                  recalcular.mutate()
                }
              }}
            >
              <RefreshCw className="h-3.5 w-3.5" /> Recalcular fluxo financeiro
            </Button>
          )}
          {!exibirForm && (
            <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={iniciarNova}>
              <Plus className="h-3.5 w-3.5" /> Nova cota
            </Button>
          )}
        </div>
      </div>

      {exibirForm && (
        <div className="border border-gray-200 rounded-xl p-4 space-y-3 bg-gray-50">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="space-y-1">
              <label className="text-xs text-gray-500">Data de adesão</label>
              <Input type="date" className="h-9 text-sm" value={form.data_adesao} onChange={(e) => setForm((f) => ({ ...f, data_adesao: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-500">Grupo</label>
              <Input className="h-9 text-sm" value={form.grupo} onChange={(e) => setForm((f) => ({ ...f, grupo: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-500">Cota</label>
              <Input className="h-9 text-sm" value={form.cota} onChange={(e) => setForm((f) => ({ ...f, cota: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-500">Administradora</label>
              <Input className="h-9 text-sm" value={form.administradora_nome} onChange={(e) => setForm((f) => ({ ...f, administradora_nome: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-500">Tipo do bem</label>
              <Select value={form.tipo_bem} onValueChange={(v) => setForm((f) => ({ ...f, tipo_bem: v }))}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {TIPOS_BEM.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-500">Tipo de parcela</label>
              <Select value={form.tipo_parcela} onValueChange={(v) => setForm((f) => ({ ...f, tipo_parcela: v as TipoParcela }))}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(LABEL_TIPO_PARCELA) as TipoParcela[]).map((t) => (
                    <SelectItem key={t} value={t}>{LABEL_TIPO_PARCELA[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-500">Data de pagamento do boleto</label>
              <Input type="date" className="h-9 text-sm" value={form.data_pagamento_boleto} onChange={(e) => setForm((f) => ({ ...f, data_pagamento_boleto: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-500">Valor da carta</label>
              <Input type="number" step="0.01" className="h-9 text-sm" value={form.valor_carta} onChange={(e) => setForm((f) => ({ ...f, valor_carta: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-500">Valor da parcela</label>
              <Input type="number" step="0.01" className="h-9 text-sm" value={form.valor_parcela} onChange={(e) => setForm((f) => ({ ...f, valor_parcela: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-500">Parcela reduzida (%)</label>
              <Input type="number" step="0.01" className="h-9 text-sm" value={form.parcela_reduzida_percentual} onChange={(e) => setForm((f) => ({ ...f, parcela_reduzida_percentual: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-500">Prazo da cota (meses)</label>
              <Input type="number" className="h-9 text-sm" value={form.prazo_cota_meses} onChange={(e) => setForm((f) => ({ ...f, prazo_cota_meses: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-500">Prazo do grupo (meses)</label>
              <Input type="number" className="h-9 text-sm" value={form.prazo_grupo_meses} onChange={(e) => setForm((f) => ({ ...f, prazo_grupo_meses: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-500">Status pagto</label>
              <Select value={form.status_pagamento} onValueChange={(v) => setForm((f) => ({ ...f, status_pagamento: v as StatusPagamentoCota }))}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(LABEL_STATUS_PAGAMENTO) as StatusPagamentoCota[]).map((s) => (
                    <SelectItem key={s} value={s}>{LABEL_STATUS_PAGAMENTO[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-500">Data de vencimento</label>
              <Input type="date" className="h-9 text-sm" value={form.data_vencimento} onChange={(e) => setForm((f) => ({ ...f, data_vencimento: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-gray-500">Próxima assembleia</label>
              <Input type="date" className="h-9 text-sm" value={form.proxima_assembleia_em} onChange={(e) => setForm((f) => ({ ...f, proxima_assembleia_em: e.target.value }))} />
            </div>
            <div className="space-y-1 col-span-2 sm:col-span-4">
              <label className="text-xs text-gray-500">Informação adicional</label>
              <Input className="h-9 text-sm" value={form.informacao_adicional} onChange={(e) => setForm((f) => ({ ...f, informacao_adicional: e.target.value }))} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={cancelar}>
              <X className="h-3.5 w-3.5" /> Cancelar
            </Button>
            <Button size="sm" className="gap-1.5 text-xs" disabled={adicionar.isPending || editar.isPending} onClick={salvar}>
              <Check className="h-3.5 w-3.5" /> {editandoId ? 'Salvar' : 'Adicionar'}
            </Button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Data de adesão</th>
              <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Grupo/Cota</th>
              <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Tipo do bem</th>
              <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Valor da carta</th>
              <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Status da cota</th>
              <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Informação</th>
              <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Status pagto</th>
              <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Data venc.</th>
              <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Ação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {isLoading && (
              <tr><td colSpan={9} className="px-3 py-6 text-center text-gray-400">Carregando...</td></tr>
            )}
            {!isLoading && cotas.length === 0 && (
              <tr><td colSpan={9} className="px-3 py-6 text-center text-gray-300 italic">Nenhuma cota cadastrada ainda.</td></tr>
            )}
            {cotas.map((c) => (
              <tr key={c.id} className="hover:bg-gray-50">
                <td className="px-3 py-2 whitespace-nowrap">{fmtData(c.data_adesao)}</td>
                <td className="px-3 py-2 whitespace-nowrap font-medium text-fonti-primary">
                  {c.grupo ?? '—'}{c.cota ? ` / ${c.cota}` : ''}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">{c.tipo_bem ?? '—'}</td>
                <td className="px-3 py-2 whitespace-nowrap">{fmtMoeda(c.valor_carta)}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${COR_STATUS_COTA[c.status_cota]}`}>
                    {LABEL_STATUS_COTA[c.status_cota]}
                  </span>
                </td>
                <td className="px-3 py-2 max-w-[200px] truncate" title={c.informacao_adicional ?? undefined}>
                  {c.proxima_assembleia_em ? `Assembleia em ${fmtData(c.proxima_assembleia_em)}` : (c.informacao_adicional || '—')}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${COR_STATUS_PAGAMENTO[c.status_pagamento]}`}>
                    {LABEL_STATUS_PAGAMENTO[c.status_pagamento]}
                  </span>
                </td>
                <td className="px-3 py-2 whitespace-nowrap">{fmtData(c.data_vencimento)}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <div className="flex items-center gap-1">
                    <button
                      title="Editar"
                      className="p-1 rounded hover:bg-gray-100 text-gray-500"
                      onClick={() => iniciarEdicao(c)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    {c.status_cota !== 'cancelado' ? (
                      <button
                        title="Cancelar cota"
                        className="p-1 rounded hover:bg-gray-100 text-amber-600"
                        onClick={() => alterarStatus.mutate({ cota: c, novoStatus: 'cancelado' })}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    ) : (
                      <button
                        title="Excluir (cadastrada por engano)"
                        className="p-1 rounded hover:bg-gray-100 text-red-500"
                        onClick={() => {
                          if (window.confirm('Excluir esta cota definitivamente? Só faça isso se ela foi cadastrada por engano e nunca foi usada.')) {
                            excluir.mutate(c)
                          }
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
