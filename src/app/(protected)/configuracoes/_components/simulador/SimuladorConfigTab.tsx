'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Plus, Pencil, Check, X, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  useItbiConfig,
  useCustasConfig,
  useConfigGeral,
  useSalvarConfigGeral,
  useSalvarTarifaBanco,
  useExcluirTarifaBanco,
  useSalvarItbi,
} from '@/hooks/simulador/useSimuladorConfig'
import { useBancos } from '@/hooks/useBancos'
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
        <h3 className="text-sm font-semibold text-fonti-primary">Parâmetros Gerais</h3>
        {!editando ? (
          <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={iniciarEdicao}>
            <Pencil className="h-3.5 w-3.5" /> Editar
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={() => setEditando(false)}>
              <X className="h-3.5 w-3.5" /> Cancelar
            </Button>
            <Button size="sm" className="bg-fonti-primary text-white gap-1 text-xs" onClick={salvarParams} disabled={salvar.isPending}>
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
              <p className="mt-1 text-sm font-medium text-fonti-primary">
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
  const { data: bancos = [] } = useBancos()
  const salvar = useSalvarTarifaBanco()
  const excluir = useExcluirTarifaBanco()
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [novoAberto, setNovoAberto] = useState(false)

  const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

  const bancosNomes = Array.from(new Set([
    ...(bancos as Array<{ nome: string }>).map((b) => b.nome).filter(Boolean),
    ...tarifas.map((t) => t.bancoNome).filter(Boolean),
  ])).sort((a, b) => a.localeCompare(b, 'pt-BR'))

  async function handleSalvar(payload: SimuladorCustasConfig) {
    try {
      await salvar.mutateAsync(payload)
      toast.success('Tarifa salva')
      setNovoAberto(false)
      setEditandoId(null)
    } catch {
      // Erro já exibido via onError de useSalvarTarifaBanco — mantém o formulário
      // aberto para o usuário corrigir, em vez de fechar como se tivesse salvado.
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-fonti-primary">Tarifas por Banco</h3>
        <Button size="sm" variant="outline" className="gap-1 text-xs border-fonti-accent text-fonti-primary hover:bg-fonti-accent-hover"
          onClick={() => { setNovoAberto(true); setEditandoId(null) }}>
          <Plus className="h-3.5 w-3.5" /> Adicionar
        </Button>
      </div>

      {novoAberto && (
        <TarifaForm
          inicial={{ bancoNome: '', tipo: 'residencial', valor: 0 }}
          bancosNomes={bancosNomes}
          onSalvar={handleSalvar}
          onCancelar={() => setNovoAberto(false)}
          pending={salvar.isPending}
        />
      )}

      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              {['Banco', 'Tipo', 'Valor', ''].map((h) => (
                <th key={h} className="text-left text-xs text-gray-500 font-medium px-4 py-2.5">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tarifas.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-400 text-xs">Nenhuma tarifa configurada.</td></tr>
            ) : tarifas.map((t, i) => (
              editandoId === t.id ? (
                <tr key={t.id} className="border-b border-gray-50">
                  <td colSpan={4} className="px-4 py-3">
                    <TarifaForm
                      inicial={t}
                      bancosNomes={bancosNomes}
                      onSalvar={handleSalvar}
                      onCancelar={() => setEditandoId(null)}
                      pending={salvar.isPending}
                    />
                  </td>
                </tr>
              ) : (
                <tr key={t.id ?? `${t.bancoNome}-${t.tipo}`} className={`border-b border-gray-50 last:border-0 ${i % 2 === 1 ? 'bg-gray-50/50' : ''}`}>
                  <td className="px-4 py-2.5 font-medium text-fonti-primary">{t.bancoNome}</td>
                  <td className="px-4 py-2.5 capitalize">{t.tipo}</td>
                  <td className="px-4 py-2.5">{BRL.format(t.valor)}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7"
                        onClick={() => { setEditandoId(t.id ?? null); setNovoAberto(false) }}>
                        <Pencil className="h-3.5 w-3.5 text-gray-400" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7"
                        onClick={() => t.id && excluir.mutate(t.id)}>
                        <Trash2 className="h-3.5 w-3.5 text-red-400" />
                      </Button>
                    </div>
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

function TarifaForm({ inicial, bancosNomes, onSalvar, onCancelar, pending }: {
  inicial: SimuladorCustasConfig
  bancosNomes: string[]
  onSalvar: (payload: SimuladorCustasConfig) => void
  onCancelar: () => void
  pending: boolean
}) {
  const [local, setLocal] = useState({ ...inicial })
  const [valorStr, setValorStr] = useState(
    inicial.valor > 0 ? inicial.valor.toFixed(2).replace('.', ',') : ''
  )

  function parseValor(s: string) {
    return Number(s.replace(/\./g, '').replace(',', '.')) || 0
  }

  function handleValorBlur() {
    const num = parseValor(valorStr)
    setLocal((f) => ({ ...f, valor: num }))
  }

  function handleSalvar() {
    onSalvar({ ...local, valor: parseValor(valorStr) })
  }

  return (
    <div className="space-y-3 p-3 bg-fonti-accent-hover/20 border border-fonti-accent/50 rounded-lg">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <Label className="text-xs text-gray-500">Banco</Label>
          <select
            className="mt-1 w-full h-8 text-sm rounded-md border border-input bg-background px-2 focus:outline-none focus:ring-1 focus:ring-fonti-primary"
            value={local.bancoNome}
            onChange={(e) => setLocal((f) => ({ ...f, bancoNome: e.target.value }))}
          >
            <option value="">Selecione...</option>
            {bancosNomes.map((nome) => (
              <option key={nome} value={nome}>{nome}</option>
            ))}
          </select>
        </div>
        <div>
          <Label className="text-xs text-gray-500">Tipo</Label>
          <select
            className="mt-1 w-full h-8 text-sm rounded-md border border-input bg-background px-2 focus:outline-none focus:ring-1 focus:ring-fonti-primary"
            value={local.tipo}
            onChange={(e) => setLocal((f) => ({ ...f, tipo: e.target.value as 'residencial' | 'comercial' }))}
          >
            <option value="residencial">Residencial</option>
            <option value="comercial">Comercial</option>
          </select>
        </div>
        <div>
          <Label className="text-xs text-gray-500">Valor (R$)</Label>
          <Input
            className="mt-1 h-8 text-sm"
            value={valorStr}
            onChange={(e) => setValorStr(e.target.value)}
            onBlur={handleValorBlur}
            placeholder="Ex: 1.950,00"
          />
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <Button variant="ghost" size="sm" className="h-8 text-xs gap-1" onClick={onCancelar}>
          <X className="h-3.5 w-3.5" /> Cancelar
        </Button>
        <Button
          size="sm"
          className="h-8 text-xs bg-fonti-primary text-white gap-1"
          onClick={handleSalvar}
          disabled={!local.bancoNome || pending}
        >
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
    municipio: '', aliquota: 0.03, temDesconto: false, formulaComDesconto: 'percentual', excecaoPrimeiraAquisicao: false,
  })

  async function salvarItbi(payload: SimuladorItbiConfig) {
    await salvar.mutateAsync(payload)
    toast.success('ITBI salvo')
    setNovoAberto(false)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-fonti-primary">Alíquotas de ITBI por Município</h3>
        <Button size="sm" variant="outline" className="gap-1 text-xs border-fonti-accent text-fonti-primary hover:bg-fonti-accent-hover" onClick={() => setNovoAberto(true)}>
          <Plus className="h-3.5 w-3.5" /> Adicionar
        </Button>
      </div>

      {novoAberto && (
        <ItbiForm
          form={formNovo}
          itbis={itbis}
          onSalvar={salvarItbi}
          onCancelar={() => setNovoAberto(false)}
          pending={salvar.isPending}
        />
      )}

      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              {['Município', 'Alíquota', 'Tem Desconto?', 'Fórmula', 'Alíquota Desconto', 'Limite', '1ª Aquisição'].map((h) => (
                <th key={h} className="text-left text-xs text-gray-500 font-medium px-4 py-2.5">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {itbis.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-gray-400 text-xs">Nenhum município configurado.</td></tr>
            ) : itbis.map((it, i) => (
              <tr key={it.municipio} className={`border-b border-gray-50 last:border-0 ${i % 2 === 1 ? 'bg-gray-50/50' : ''}`}>
                <td className="px-4 py-2.5 font-medium text-fonti-primary">{it.municipio}</td>
                <td className="px-4 py-2.5">{(it.aliquota * 100).toFixed(2)}%</td>
                <td className="px-4 py-2.5">{it.temDesconto ? 'Sim' : 'Não'}</td>
                <td className="px-4 py-2.5">
                  {!it.temDesconto ? '—' : it.formulaComDesconto === 'composta'
                    ? `Composta (${it.aliquotaDescontoFinanciado ? (it.aliquotaDescontoFinanciado * 100).toFixed(2) : '0'}% fin. + ${it.aliquotaDesconto ? (it.aliquotaDesconto * 100).toFixed(2) : '0'}% C&V)`
                    : 'Percentual'}
                </td>
                <td className="px-4 py-2.5">
                  {it.formulaComDesconto !== 'composta' && it.aliquotaDesconto ? `${(it.aliquotaDesconto * 100).toFixed(2)}%` : '—'}
                </td>
                <td className="px-4 py-2.5">
                  {it.limiteDesconto
                    ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(it.limiteDesconto)
                    : '—'}
                </td>
                <td className="px-4 py-2.5">{it.excecaoPrimeiraAquisicao ? 'Perde desconto acima do limite' : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ItbiForm({ form: initial, itbis, onSalvar, onCancelar, pending }: {
  form: SimuladorItbiConfig
  itbis: SimuladorItbiConfig[]
  onSalvar: (v: SimuladorItbiConfig) => void
  onCancelar: () => void
  pending: boolean
}) {
  const [form, setForm] = useState({ ...initial })
  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }))

  function usarConfigDe(municipioOrigem: string) {
    const origem = itbis.find((it) => it.municipio === municipioOrigem)
    if (!origem) return
    setForm((f) => ({
      ...f,
      aliquota: origem.aliquota,
      temDesconto: origem.temDesconto,
      aliquotaDesconto: origem.aliquotaDesconto,
      limiteDesconto: origem.limiteDesconto,
      formulaComDesconto: origem.formulaComDesconto ?? 'percentual',
      aliquotaDescontoFinanciado: origem.aliquotaDescontoFinanciado,
      excecaoPrimeiraAquisicao: origem.excecaoPrimeiraAquisicao ?? false,
    }))
  }

  return (
    <div className="space-y-3 p-3 bg-fonti-accent-hover/20 border border-fonti-accent/50 rounded-lg">
      {itbis.length > 0 && (
        <div>
          <Label className="text-xs text-gray-500">Usar mesmas configurações de</Label>
          <select
            className="mt-1 w-full h-8 text-sm rounded-md border border-input bg-background px-2 focus:outline-none focus:ring-1 focus:ring-fonti-primary"
            defaultValue=""
            onChange={(e) => { if (e.target.value) usarConfigDe(e.target.value) }}
          >
            <option value="">Selecione uma cidade já cadastrada...</option>
            {itbis.map((it) => (
              <option key={it.municipio} value={it.municipio}>{it.municipio}</option>
            ))}
          </select>
        </div>
      )}
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
              <Label className="text-xs text-gray-500">Fórmula do desconto</Label>
              <select
                className="mt-1 w-full h-8 text-sm rounded-md border border-input bg-background px-2 focus:outline-none focus:ring-1 focus:ring-fonti-primary"
                value={form.formulaComDesconto ?? 'percentual'}
                onChange={(e) => set('formulaComDesconto', e.target.value)}
              >
                <option value="percentual">Percentual único sobre o valor</option>
                <option value="composta">Composta (% financiado + % C&amp;V)</option>
              </select>
            </div>
            {form.formulaComDesconto === 'composta' && (
              <div>
                <Label className="text-xs text-gray-500">Alíquota sobre valor financiado</Label>
                <Input className="mt-1 h-8 text-sm" type="number" step="0.001" value={form.aliquotaDescontoFinanciado ?? ''} onChange={(e) => set('aliquotaDescontoFinanciado', Number(e.target.value))} />
              </div>
            )}
            <div>
              <Label className="text-xs text-gray-500">
                {form.formulaComDesconto === 'composta' ? 'Alíquota sobre C&V/Terreno' : 'Alíquota c/ desconto'}
              </Label>
              <Input className="mt-1 h-8 text-sm" type="number" step="0.001" value={form.aliquotaDesconto ?? ''} onChange={(e) => set('aliquotaDesconto', Number(e.target.value))} />
            </div>
            <div className="flex items-center gap-2 mt-5">
              <Switch checked={form.excecaoPrimeiraAquisicao ?? false} onCheckedChange={(v) => set('excecaoPrimeiraAquisicao', v)} />
              <Label className="text-xs text-gray-500">Perde desconto na 1ª aquisição acima do limite?</Label>
            </div>
            <div>
              <Label className="text-xs text-gray-500">
                {form.excecaoPrimeiraAquisicao ? 'Limite (R$) — acima disso perde o desconto' : 'Limite (R$) — desconto válido até esse valor'}
              </Label>
              <Input className="mt-1 h-8 text-sm" type="number" value={form.limiteDesconto ?? ''} onChange={(e) => set('limiteDesconto', Number(e.target.value))} />
            </div>
          </>
        )}
      </div>
      <div className="flex gap-2 justify-end">
        <Button variant="ghost" size="sm" className="h-8 text-xs gap-1" onClick={onCancelar}><X className="h-3.5 w-3.5" /> Cancelar</Button>
        <Button size="sm" className="h-8 text-xs bg-fonti-primary text-white gap-1" onClick={() => onSalvar(form)} disabled={!form.municipio || pending}>
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
