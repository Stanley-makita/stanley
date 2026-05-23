'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Plus, Pencil, Check, X } from 'lucide-react'
import { toast } from 'sonner'
import {
  useItbiConfig,
  useCustasConfig,
  useConfigGeral,
  useSalvarConfigGeral,
  useSalvarTarifaBanco,
  useSalvarItbi,
} from '@/hooks/simulador/useSimuladorConfig'
import type { SimuladorItbiConfig, SimuladorCustasConfig } from '@/types/simulador'
import { SIMULADOR_CONFIG_DEFAULTS } from '@/types/simulador'

// ── Seção de parâmetros gerais ─────────────────────────────────────────────
function SecaoParametrosGerais() {
  const { data: cfg } = useConfigGeral()
  const salvar = useSalvarConfigGeral()
  const [editando, setEditando] = useState(false)
  const defaults = cfg ?? SIMULADOR_CONFIG_DEFAULTS
  const [form, setForm] = useState({ ...defaults })

  function iniciarEdicao() {
    setForm({ ...(cfg ?? SIMULADOR_CONFIG_DEFAULTS) })
    setEditando(true)
  }

  async function salvarParams() {
    await salvar.mutateAsync(form)
    toast.success('Parâmetros salvos')
    setEditando(false)
  }

  const p = editando ? form : defaults

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[#253B29]">Parâmetros Gerais</h3>
        {!editando ? (
          <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={iniciarEdicao}>
            <Pencil className="h-3.5 w-3.5" /> Editar
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={() => setEditando(false)}>
              <X className="h-3.5 w-3.5" /> Cancelar
            </Button>
            <Button size="sm" className="bg-[#253B29] text-white gap-1 text-xs" onClick={salvarParams} disabled={salvar.isPending}>
              <Check className="h-3.5 w-3.5" /> Salvar
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {[
          { chave: 'funrejus_percentual', label: 'FunRejus %', fmt: (v: number) => (v * 100).toFixed(4) + '%' },
          { chave: 'funrejus_minimo', label: 'FunRejus mínimo (R$)', fmt: (v: number) => `R$ ${v}` },
          { chave: 'funrejus_maximo', label: 'FunRejus máximo (R$)', fmt: (v: number) => `R$ ${v}` },
          { chave: 'registro_percentual', label: 'Registro % (financiado)', fmt: (v: number) => (v * 100).toFixed(2) + '%' },
          { chave: 'iof_percentual', label: 'IOF %', fmt: (v: number) => (v * 100).toFixed(4) + '%' },
          { chave: 'engenharia_caixa', label: 'Engenharia Caixa (R$)', fmt: (v: number) => `R$ ${v}` },
        ].map(({ chave, label }) => (
          <div key={chave}>
            <Label className="text-xs text-gray-500">{label}</Label>
            {editando ? (
              <Input
                type="number"
                step="any"
                className="mt-1 h-8 text-sm"
                value={(form as unknown as Record<string, number>)[chave]}
                onChange={(e) => setForm((f) => ({ ...f, [chave]: Number(e.target.value) }))}
              />
            ) : (
              <p className="mt-1 text-sm font-medium text-[#253B29]">
                {String((p as unknown as Record<string, number>)[chave])}
              </p>
            )}
          </div>
        ))}
      </div>

      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mt-4 mb-2">Faixas de Reciprocidade (Caixa)</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1,2,3,4,5,6,7].map((n) => {
            const limiteKey = `reciprocidade_r${n}_limite` as keyof typeof form
            const valorKey = `reciprocidade_r${n}_valor` as keyof typeof form
            const hasLimite = n < 7
            return (
              <div key={n} className="border border-gray-100 rounded-lg p-3 space-y-2">
                <p className="text-xs font-medium text-gray-500">R{n}{n < 7 ? ` (até)` : ' (acima)'}</p>
                {hasLimite && (
                  <div>
                    <Label className="text-xs text-gray-400">Limite</Label>
                    {editando ? (
                      <Input
                        type="number"
                        className="mt-0.5 h-7 text-xs"
                        value={(form as unknown as Record<string, number>)[limiteKey as string] ?? ''}
                        onChange={(e) => setForm((f) => ({ ...f, [limiteKey]: Number(e.target.value) }))}
                      />
                    ) : (
                      <p className="text-xs font-medium">{String((p as unknown as Record<string, number>)[limiteKey as string] ?? '')}</p>
                    )}
                  </div>
                )}
                <div>
                  <Label className="text-xs text-gray-400">Valor (R$)</Label>
                  {editando ? (
                    <Input
                      type="number"
                      className="mt-0.5 h-7 text-xs"
                      value={(form as unknown as Record<string, number>)[valorKey as string] ?? ''}
                      onChange={(e) => setForm((f) => ({ ...f, [valorKey]: Number(e.target.value) }))}
                    />
                  ) : (
                    <p className="text-xs font-medium">{String((p as unknown as Record<string, number>)[valorKey as string] ?? '')}</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Seção de tarifas bancárias ─────────────────────────────────────────────
function SecaoTarifas() {
  const { data: tarifas = [] } = useCustasConfig()
  const salvar = useSalvarTarifaBanco()
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [novoAberto, setNovoAberto] = useState(false)
  const [formNovo, setFormNovo] = useState<Omit<SimuladorCustasConfig, never> & { id?: string }>({
    bancoNome: '', tarifaAvaliacao: 0, tarifaCorrespondente: 0, tarifaOutros: 0,
  })

  async function salvarTarifa(payload: typeof formNovo) {
    await salvar.mutateAsync(payload)
    toast.success('Tarifa salva')
    setNovoAberto(false)
    setEditandoId(null)
  }

  const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[#253B29]">Tarifas por Banco</h3>
        <Button size="sm" variant="outline" className="gap-1 text-xs border-[#C2AA6A] text-[#253B29] hover:bg-[#E7E0C4]" onClick={() => { setFormNovo({ bancoNome: '', tarifaAvaliacao: 0, tarifaCorrespondente: 0, tarifaOutros: 0 }); setNovoAberto(true) }}>
          <Plus className="h-3.5 w-3.5" /> Adicionar
        </Button>
      </div>

      {novoAberto && (
        <TarifaForm
          form={formNovo}
          onChange={setFormNovo}
          onSalvar={() => salvarTarifa(formNovo)}
          onCancelar={() => setNovoAberto(false)}
          pending={salvar.isPending}
        />
      )}

      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              {['Banco', 'Avaliação', 'Correspondente', 'Outros', ''].map((h) => (
                <th key={h} className="text-left text-xs text-gray-500 font-medium px-4 py-2.5">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tarifas.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400 text-xs">Nenhuma tarifa configurada.</td></tr>
            ) : tarifas.map((t, i) => (
              editandoId === t.bancoNome ? (
                <tr key={t.bancoNome} className="border-b border-gray-50">
                  <td colSpan={5} className="px-4 py-3">
                    <TarifaForm
                      form={t}
                      onChange={() => {}}
                      onSalvar={() => salvarTarifa(t)}
                      onCancelar={() => setEditandoId(null)}
                      pending={salvar.isPending}
                    />
                  </td>
                </tr>
              ) : (
                <tr key={t.bancoNome} className={`border-b border-gray-50 last:border-0 ${i % 2 === 1 ? 'bg-gray-50/50' : ''}`}>
                  <td className="px-4 py-2.5 font-medium text-[#253B29]">{t.bancoNome}</td>
                  <td className="px-4 py-2.5">{BRL.format(t.tarifaAvaliacao)}</td>
                  <td className="px-4 py-2.5">{BRL.format(t.tarifaCorrespondente)}</td>
                  <td className="px-4 py-2.5">{BRL.format(t.tarifaOutros)}</td>
                  <td className="px-4 py-2.5">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditandoId(t.bancoNome)}>
                      <Pencil className="h-3.5 w-3.5 text-gray-400" />
                    </Button>
                  </td>
                </tr>
              )
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function TarifaForm({ form, onChange, onSalvar, onCancelar, pending }: {
  form: { bancoNome: string; tarifaAvaliacao: number; tarifaCorrespondente: number; tarifaOutros: number }
  onChange: (v: typeof form) => void
  onSalvar: () => void
  onCancelar: () => void
  pending: boolean
}) {
  const [local, setLocal] = useState({ ...form })
  const set = (k: string, v: string | number) => setLocal((f) => ({ ...f, [k]: v }))

  return (
    <div className="space-y-3 p-3 bg-[#E7E0C4]/20 border border-[#C2AA6A]/50 rounded-lg">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <Label className="text-xs text-gray-500">Banco</Label>
          <Input className="mt-1 h-8 text-sm" value={local.bancoNome} onChange={(e) => set('bancoNome', e.target.value)} placeholder="Ex: Caixa Econômica" />
        </div>
        <div>
          <Label className="text-xs text-gray-500">Avaliação (R$)</Label>
          <Input className="mt-1 h-8 text-sm" type="number" value={local.tarifaAvaliacao} onChange={(e) => set('tarifaAvaliacao', Number(e.target.value))} />
        </div>
        <div>
          <Label className="text-xs text-gray-500">Correspondente (R$)</Label>
          <Input className="mt-1 h-8 text-sm" type="number" value={local.tarifaCorrespondente} onChange={(e) => set('tarifaCorrespondente', Number(e.target.value))} />
        </div>
        <div>
          <Label className="text-xs text-gray-500">Outros (R$)</Label>
          <Input className="mt-1 h-8 text-sm" type="number" value={local.tarifaOutros} onChange={(e) => set('tarifaOutros', Number(e.target.value))} />
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <Button variant="ghost" size="sm" className="h-8 text-xs gap-1" onClick={onCancelar}><X className="h-3.5 w-3.5" /> Cancelar</Button>
        <Button size="sm" className="h-8 text-xs bg-[#253B29] text-white gap-1" onClick={() => { onChange(local); onSalvar() }} disabled={!local.bancoNome || pending}>
          <Check className="h-3.5 w-3.5" /> Salvar
        </Button>
      </div>
    </div>
  )
}

// ── Seção ITBI ─────────────────────────────────────────────────────────────
function SecaoItbi() {
  const { data: itbis = [] } = useItbiConfig()
  const salvar = useSalvarItbi()
  const [novoAberto, setNovoAberto] = useState(false)
  const [formNovo, setFormNovo] = useState<SimuladorItbiConfig>({
    municipio: '', aliquota: 0.03, temDesconto: false,
  })

  async function salvarItbi(payload: SimuladorItbiConfig) {
    await salvar.mutateAsync(payload)
    toast.success('ITBI salvo')
    setNovoAberto(false)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[#253B29]">Alíquotas de ITBI por Município</h3>
        <Button size="sm" variant="outline" className="gap-1 text-xs border-[#C2AA6A] text-[#253B29] hover:bg-[#E7E0C4]" onClick={() => setNovoAberto(true)}>
          <Plus className="h-3.5 w-3.5" /> Adicionar
        </Button>
      </div>

      {novoAberto && (
        <ItbiForm
          form={formNovo}
          onSalvar={salvarItbi}
          onCancelar={() => setNovoAberto(false)}
          pending={salvar.isPending}
        />
      )}

      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              {['Município', 'Alíquota', 'Tem Desconto?', 'Alíquota Desconto', 'Limite'].map((h) => (
                <th key={h} className="text-left text-xs text-gray-500 font-medium px-4 py-2.5">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {itbis.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400 text-xs">Nenhum município configurado.</td></tr>
            ) : itbis.map((it, i) => (
              <tr key={it.municipio} className={`border-b border-gray-50 last:border-0 ${i % 2 === 1 ? 'bg-gray-50/50' : ''}`}>
                <td className="px-4 py-2.5 font-medium text-[#253B29]">{it.municipio}</td>
                <td className="px-4 py-2.5">{(it.aliquota * 100).toFixed(2)}%</td>
                <td className="px-4 py-2.5">{it.temDesconto ? 'Sim' : 'Não'}</td>
                <td className="px-4 py-2.5">{it.aliquotaDesconto ? `${(it.aliquotaDesconto * 100).toFixed(2)}%` : '—'}</td>
                <td className="px-4 py-2.5">
                  {it.limiteDesconto
                    ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(it.limiteDesconto)
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ItbiForm({ form: initial, onSalvar, onCancelar, pending }: {
  form: SimuladorItbiConfig
  onSalvar: (v: SimuladorItbiConfig) => void
  onCancelar: () => void
  pending: boolean
}) {
  const [form, setForm] = useState({ ...initial })
  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }))

  return (
    <div className="space-y-3 p-3 bg-[#E7E0C4]/20 border border-[#C2AA6A]/50 rounded-lg">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div>
          <Label className="text-xs text-gray-500">Município</Label>
          <Input className="mt-1 h-8 text-sm" value={form.municipio} onChange={(e) => set('municipio', e.target.value)} placeholder="Ex: Belo Horizonte" />
        </div>
        <div>
          <Label className="text-xs text-gray-500">Alíquota (ex: 0.03 = 3%)</Label>
          <Input className="mt-1 h-8 text-sm" type="number" step="0.001" value={form.aliquota} onChange={(e) => set('aliquota', Number(e.target.value))} />
        </div>
        <div className="flex items-center gap-2 mt-5">
          <Switch checked={form.temDesconto} onCheckedChange={(v) => set('temDesconto', v)} />
          <Label className="text-xs text-gray-500">Tem desconto?</Label>
        </div>
        {form.temDesconto && (
          <>
            <div>
              <Label className="text-xs text-gray-500">Alíquota c/ desconto</Label>
              <Input className="mt-1 h-8 text-sm" type="number" step="0.001" value={form.aliquotaDesconto ?? ''} onChange={(e) => set('aliquotaDesconto', Number(e.target.value))} />
            </div>
            <div>
              <Label className="text-xs text-gray-500">Limite (R$)</Label>
              <Input className="mt-1 h-8 text-sm" type="number" value={form.limiteDesconto ?? ''} onChange={(e) => set('limiteDesconto', Number(e.target.value))} />
            </div>
          </>
        )}
      </div>
      <div className="flex gap-2 justify-end">
        <Button variant="ghost" size="sm" className="h-8 text-xs gap-1" onClick={onCancelar}><X className="h-3.5 w-3.5" /> Cancelar</Button>
        <Button size="sm" className="h-8 text-xs bg-[#253B29] text-white gap-1" onClick={() => onSalvar(form)} disabled={!form.municipio || pending}>
          <Check className="h-3.5 w-3.5" /> Salvar
        </Button>
      </div>
    </div>
  )
}

// ── Tab principal ──────────────────────────────────────────────────────────
export function SimuladorConfigTab() {
  return (
    <div className="space-y-8">
      <SecaoParametrosGerais />
      <div className="border-t border-gray-100 pt-6">
        <SecaoTarifas />
      </div>
      <div className="border-t border-gray-100 pt-6">
        <SecaoItbi />
      </div>
    </div>
  )
}
