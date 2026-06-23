'use client'

import { useState } from 'react'
import { useBancos, useCriarBanco, useAtualizarBanco, useExcluirBanco } from '../../_hooks/useBancos'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Plus, Trash2, Pencil, X, Building2 } from 'lucide-react'
import type { Banco } from '@/types/configuracoes'

const SIMULADOR_KEYS = [
  { value: '', label: '— não vinculado ao simulador —' },
  { value: 'caixa',     label: 'Caixa Econômica Federal' },
  { value: 'itau',      label: 'Itaú' },
  { value: 'bradesco',  label: 'Bradesco' },
  { value: 'santander', label: 'Santander' },
  { value: 'bb',        label: 'Banco do Brasil' },
  { value: 'inter',     label: 'Banco Inter' },
  { value: 'daycoval',  label: 'Daycoval (CGI)' },
]

type FormState = {
  nome: string
  logo_url: string
  simulador_key: string
  taxa_anual: string
  taxa_admin: string
  prazo_maximo: string
  ltv_maximo: string
  idade_max_quit: string
  comprometimento: string
  seguro_mip: string
  seguro_dfi: string
  ativo: boolean
}

const FORM_VAZIO: FormState = {
  nome: '', logo_url: '', simulador_key: '',
  taxa_anual: '', taxa_admin: '0',
  prazo_maximo: '420', ltv_maximo: '80',
  idade_max_quit: '80', comprometimento: '30',
  seguro_mip: '', seguro_dfi: '',
  ativo: true,
}

function bancoParaForm(b: Banco): FormState {
  return {
    nome:            b.nome ?? '',
    logo_url:        (b as any).logo_url ?? '',
    simulador_key:   (b as any).simulador_key ?? '',
    taxa_anual:      (b as any).taxa_anual != null ? String((b as any).taxa_anual) : '',
    taxa_admin:      (b as any).taxa_admin != null ? String((b as any).taxa_admin) : '0',
    prazo_maximo:    (b as any).prazo_maximo != null ? String((b as any).prazo_maximo) : '420',
    ltv_maximo:      (b as any).ltv_maximo != null ? String((b as any).ltv_maximo) : '80',
    idade_max_quit:  (b as any).idade_max_quit != null ? String((b as any).idade_max_quit) : '80',
    comprometimento: (b as any).comprometimento != null ? String((b as any).comprometimento) : '30',
    seguro_mip:      (b as any).seguro_mip != null ? String((b as any).seguro_mip) : '',
    seguro_dfi:      (b as any).seguro_dfi != null ? String((b as any).seguro_dfi) : '',
    ativo:           b.ativo ?? true,
  }
}

function formParaPayload(f: FormState) {
  return {
    nome:            f.nome.trim(),
    logo_url:        f.logo_url.trim() || null,
    simulador_key:   f.simulador_key || null,
    taxa_anual:      f.taxa_anual !== '' ? parseFloat(f.taxa_anual) : null,
    taxa_admin:      f.taxa_admin !== '' ? parseFloat(f.taxa_admin) : 0,
    prazo_maximo:    f.prazo_maximo !== '' ? parseInt(f.prazo_maximo) : null,
    ltv_maximo:      f.ltv_maximo !== '' ? parseFloat(f.ltv_maximo) : null,
    idade_max_quit:  f.idade_max_quit !== '' ? parseInt(f.idade_max_quit) : 80,
    comprometimento: f.comprometimento !== '' ? parseFloat(f.comprometimento) : 30,
    seguro_mip:      f.seguro_mip !== '' ? parseFloat(f.seguro_mip) : null,
    seguro_dfi:      f.seguro_dfi !== '' ? parseFloat(f.seguro_dfi) : null,
    ativo:           f.ativo,
  }
}

export function BancosLista() {
  const { data: bancos = [], isLoading, error } = useBancos()
  const criar = useCriarBanco()
  const atualizar = useAtualizarBanco()
  const excluir = useExcluirBanco()

  const [modal, setModal] = useState<{ modo: 'criar' | 'editar'; banco?: Banco } | null>(null)
  const [form, setForm] = useState<FormState>(FORM_VAZIO)

  function abrirCriar() {
    setForm(FORM_VAZIO)
    setModal({ modo: 'criar' })
  }

  function abrirEditar(banco: Banco) {
    setForm(bancoParaForm(banco))
    setModal({ modo: 'editar', banco })
  }

  function fechar() { setModal(null) }

  function set(campo: keyof FormState, valor: string | boolean) {
    setForm(prev => ({ ...prev, [campo]: valor }))
  }

  async function salvar() {
    if (!form.nome.trim()) return
    const payload = formParaPayload(form)
    if (modal?.modo === 'criar') {
      await criar.mutateAsync(payload as any)
    } else if (modal?.banco) {
      await atualizar.mutateAsync({ id: modal.banco.id, ...payload } as any)
    }
    fechar()
  }

  const isPending = criar.isPending || atualizar.isPending

  if (isLoading) {
    return <div className="space-y-2">{[...Array(4)].map((_, i) => (
      <div key={i} className="h-14 rounded-lg bg-gray-100 animate-pulse" />
    ))}</div>
  }

  if (error) return <p className="text-red-600 text-sm">Não foi possível carregar os bancos.</p>

  return (
    <>
      {/* Lista */}
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <p className="text-sm text-gray-500">{bancos.length} banco(s) cadastrado(s)</p>
          <Button size="sm" className="bg-fonti-primary hover:bg-fonti-accent hover:text-fonti-primary text-white" onClick={abrirCriar}>
            <Plus className="w-4 h-4 mr-1" /> Novo banco
          </Button>
        </div>

        {bancos.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Building2 className="h-8 w-8 mx-auto mb-2 text-gray-300" />
            <p className="text-sm">Nenhum banco cadastrado ainda.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-gray-100 overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium">Banco</th>
                  <th className="px-3 py-2.5 text-right font-medium">Taxa Anual</th>
                  <th className="px-3 py-2.5 text-right font-medium">Prazo Máx.</th>
                  <th className="px-3 py-2.5 text-right font-medium">LTV Máx.</th>
                  <th className="px-3 py-2.5 text-center font-medium">Status</th>
                  <th className="px-3 py-2.5 text-right font-medium">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {bancos.map((banco: any) => (
                  <tr key={banco.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {banco.logo_url
                          ? <img src={banco.logo_url} alt="" className="w-5 h-5 object-contain rounded" />
                          : <Building2 className="w-4 h-4 text-gray-400" />
                        }
                        <div>
                          <p className="font-medium text-gray-800">{banco.nome}</p>
                          {banco.simulador_key && (
                            <p className="text-[10px] text-gray-400">Motor: {banco.simulador_key}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right text-gray-600">
                      {banco.taxa_anual != null ? `${Number(banco.taxa_anual).toFixed(2)}%` : '—'}
                    </td>
                    <td className="px-3 py-3 text-right text-gray-600">
                      {banco.prazo_maximo != null ? `${banco.prazo_maximo} meses` : '—'}
                    </td>
                    <td className="px-3 py-3 text-right text-gray-600">
                      {banco.ltv_maximo != null ? `${banco.ltv_maximo}%` : '—'}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <Switch
                        checked={banco.ativo}
                        onCheckedChange={(v) => atualizar.mutate({ id: banco.id, ativo: v } as any)}
                        className="data-[state=checked]:bg-fonti-primary"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-400 hover:text-fonti-primary hover:bg-fonti-accent/20" onClick={() => abrirEditar(banco)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-red-300 hover:text-red-600 hover:bg-red-50" onClick={() => excluir.mutate(banco.id)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-800">
                {modal.modo === 'criar' ? 'Novo Banco' : 'Editar Banco'}
              </h2>
              <button onClick={fechar} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-5">
              {/* Identificação */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Nome do Banco</Label>
                  <Input value={form.nome} onChange={e => set('nome', e.target.value)} className="h-8 text-sm" placeholder="Ex: Caixa Econômica" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">URL do Logo</Label>
                  <Input value={form.logo_url} onChange={e => set('logo_url', e.target.value)} className="h-8 text-sm" placeholder="https://..." />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Vínculo com o Simulador</Label>
                <select
                  value={form.simulador_key}
                  onChange={e => set('simulador_key', e.target.value)}
                  className="w-full h-8 text-sm border border-gray-200 rounded-md px-2 bg-white"
                >
                  {SIMULADOR_KEYS.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
                </select>
                <p className="text-[10px] text-gray-400">
                  Vincula este banco ao motor de cálculo. Os valores abaixo substituem os padrões do sistema.
                </p>
              </div>

              {/* Parâmetros de Simulação */}
              <div className="space-y-3">
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Parâmetros de Simulação</p>

                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Taxa de Juros Anual (%)</Label>
                    <Input
                      type="number" step="0.01" min="0" max="30"
                      value={form.taxa_anual}
                      onChange={e => set('taxa_anual', e.target.value)}
                      className="h-8 text-sm"
                      placeholder="ex: 11.90"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Taxa Administração (R$)</Label>
                    <Input
                      type="number" step="0.01" min="0"
                      value={form.taxa_admin}
                      onChange={e => set('taxa_admin', e.target.value)}
                      className="h-8 text-sm"
                      placeholder="ex: 25"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Prazo Máximo (meses)</Label>
                    <Input
                      type="number" step="1" min="12" max="480"
                      value={form.prazo_maximo}
                      onChange={e => set('prazo_maximo', e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">LTV Máximo (%)</Label>
                    <Input
                      type="number" step="1" min="0" max="100"
                      value={form.ltv_maximo}
                      onChange={e => set('ltv_maximo', e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Idade Máxima Quitação</Label>
                    <Input
                      type="number" step="1" min="60" max="90"
                      value={form.idade_max_quit}
                      onChange={e => set('idade_max_quit', e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Comprometimento Máx. (%)</Label>
                    <Input
                      type="number" step="1" min="0" max="50"
                      value={form.comprometimento}
                      onChange={e => set('comprometimento', e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Seguro MIP (%)</Label>
                    <Input
                      type="number" step="0.0001" min="0"
                      value={form.seguro_mip}
                      onChange={e => set('seguro_mip', e.target.value)}
                      className="h-8 text-sm"
                      placeholder="ex: 0.0230"
                    />
                    <p className="text-[10px] text-gray-400">% mensal sobre saldo devedor. Deixe vazio para usar tabela por idade.</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Seguro DFI (%)</Label>
                    <Input
                      type="number" step="0.0001" min="0"
                      value={form.seguro_dfi}
                      onChange={e => set('seguro_dfi', e.target.value)}
                      className="h-8 text-sm"
                      placeholder="ex: 0.0066"
                    />
                    <p className="text-[10px] text-gray-400">% mensal sobre valor do imóvel.</p>
                  </div>
                </div>
              </div>

              {/* Ativo */}
              <div className="flex items-center gap-2">
                <Switch
                  checked={form.ativo}
                  onCheckedChange={v => set('ativo', v)}
                  className="data-[state=checked]:bg-fonti-primary"
                />
                <Label className="text-sm">Ativo para simulações</Label>
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100">
              <Button variant="outline" size="sm" onClick={fechar}>Cancelar</Button>
              <Button
                size="sm"
                className="bg-fonti-primary hover:bg-fonti-primary-hover text-white"
                onClick={salvar}
                disabled={!form.nome.trim() || isPending}
              >
                {isPending ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
