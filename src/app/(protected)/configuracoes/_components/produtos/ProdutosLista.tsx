'use client'

import { useState } from 'react'
import { useProdutos, useCriarProduto, useAtualizarProduto, useExcluirProduto } from '../../_hooks/useProdutos'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Plus, Trash2, Pencil, X, Package } from 'lucide-react'
import type { Produto } from '@/types/configuracoes'

const TODAS_MODALIDADES = [
  { value: 'SFI',         label: 'SFI' },
  { value: 'SBPE',        label: 'SBPE' },
  { value: 'PMCMV',       label: 'MCMV (Minha Casa Minha Vida)' },
  { value: 'Pro_Cotista', label: 'Pró-Cotista' },
  { value: 'CGI',         label: 'CGI (Crédito com Garantia de Imóvel)' },
  { value: 'Contrato',    label: 'Contrato' },
  { value: 'Consorcio',   label: 'Consórcio' },
  { value: 'Registro',    label: 'Registro' },
]

type FormState = {
  nome: string
  descricao: string
  modalidades: string[]
  ativo: boolean
}

const FORM_VAZIO: FormState = {
  nome: '',
  descricao: '',
  modalidades: [],
  ativo: true,
}

function produtoParaForm(p: Produto): FormState {
  return {
    nome:       p.nome ?? '',
    descricao:  p.descricao ?? '',
    modalidades: (p as any).modalidades ?? [],
    ativo:      p.ativo ?? true,
  }
}

function formParaPayload(f: FormState) {
  return {
    nome:       f.nome.trim(),
    descricao:  f.descricao.trim() || null,
    modalidades: f.modalidades,
    ativo:      f.ativo,
  }
}

export function ProdutosLista() {
  const { data: produtos = [], isLoading, error } = useProdutos()
  const criar = useCriarProduto()
  const atualizar = useAtualizarProduto()
  const excluir = useExcluirProduto()

  const [modal, setModal] = useState<{ modo: 'criar' | 'editar'; produto?: Produto } | null>(null)
  const [form, setForm] = useState<FormState>(FORM_VAZIO)

  function abrirCriar() {
    setForm(FORM_VAZIO)
    setModal({ modo: 'criar' })
  }

  function abrirEditar(produto: Produto) {
    setForm(produtoParaForm(produto))
    setModal({ modo: 'editar', produto })
  }

  function fechar() { setModal(null) }

  function set(campo: keyof FormState, valor: string | boolean | string[]) {
    setForm(prev => ({ ...prev, [campo]: valor }))
  }

  function toggleModalidade(val: string) {
    setForm(prev => {
      const current = prev.modalidades
      const next = current.includes(val)
        ? current.filter(m => m !== val)
        : [...current, val]
      return { ...prev, modalidades: next }
    })
  }

  async function salvar() {
    if (!form.nome.trim()) return
    const payload = formParaPayload(form)
    if (modal?.modo === 'criar') {
      await criar.mutateAsync(payload as any)
    } else if (modal?.produto) {
      await atualizar.mutateAsync({ id: modal.produto.id, ...payload } as any)
    }
    fechar()
  }

  const isPending = criar.isPending || atualizar.isPending

  if (isLoading) {
    return <div className="space-y-2">{[...Array(3)].map((_, i) => (
      <div key={i} className="h-14 rounded-lg bg-gray-100 animate-pulse" />
    ))}</div>
  }

  if (error) return <p className="text-red-600 text-sm">Não foi possível carregar os produtos.</p>

  return (
    <>
      {/* Lista */}
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <p className="text-sm text-gray-500">{produtos.length} produto(s) cadastrado(s)</p>
          <Button size="sm" className="bg-fonti-primary hover:bg-fonti-accent hover:text-fonti-primary text-white" onClick={abrirCriar}>
            <Plus className="w-4 h-4 mr-1" /> Novo produto
          </Button>
        </div>

        {produtos.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Package className="h-8 w-8 mx-auto mb-2 text-gray-300" />
            <p className="text-sm">Nenhum produto cadastrado ainda.</p>
            <p className="text-xs text-gray-400 mt-1">Crie produtos e vincule as modalidades de processo a cada um.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-gray-100 overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium">Produto</th>
                  <th className="px-3 py-2.5 text-left font-medium">Modalidades vinculadas</th>
                  <th className="px-3 py-2.5 text-center font-medium">Status</th>
                  <th className="px-3 py-2.5 text-right font-medium">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {produtos.map((produto: any) => (
                  <tr key={produto.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-800">{produto.nome}</p>
                      {produto.descricao && (
                        <p className="text-[10px] text-gray-400 mt-0.5">{produto.descricao}</p>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {(produto.modalidades ?? []).length === 0 ? (
                        <span className="text-gray-300 italic">Nenhuma</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {(produto.modalidades ?? []).map((m: string) => (
                            <span key={m} className="inline-flex items-center px-1.5 py-0.5 rounded bg-fonti-primary/10 text-fonti-primary text-[10px] font-medium">
                              {m}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <Switch
                        checked={produto.ativo}
                        onCheckedChange={(v) => atualizar.mutate({ id: produto.id, ativo: v } as any)}
                        className="data-[state=checked]:bg-fonti-primary"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-400 hover:text-fonti-primary hover:bg-fonti-accent/20" onClick={() => abrirEditar(produto)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-red-300 hover:text-red-600 hover:bg-red-50" onClick={() => excluir.mutate(produto.id)}>
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
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-800">
                {modal.modo === 'criar' ? 'Novo Produto' : 'Editar Produto'}
              </h2>
              <button onClick={fechar} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-5">
              <div className="space-y-1.5">
                <Label className="text-xs">Nome do Produto *</Label>
                <Input
                  value={form.nome}
                  onChange={e => set('nome', e.target.value)}
                  className="h-8 text-sm"
                  placeholder="Ex: Financiamento, Empréstimo, FGTS…"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Descrição (opcional)</Label>
                <Input
                  value={form.descricao}
                  onChange={e => set('descricao', e.target.value)}
                  className="h-8 text-sm"
                  placeholder="Descrição resumida do produto"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Modalidades vinculadas</Label>
                <p className="text-[10px] text-gray-400">
                  Selecione quais modalidades de processo pertencem a este produto.
                  Uma modalidade pode pertencer a apenas um produto.
                </p>
                <div className="grid grid-cols-1 gap-1.5 mt-2">
                  {TODAS_MODALIDADES.map(m => (
                    <label
                      key={m.value}
                      className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 rounded border-gray-300 accent-fonti-primary"
                        checked={form.modalidades.includes(m.value)}
                        onChange={() => toggleModalidade(m.value)}
                      />
                      <span className="text-xs text-gray-700">{m.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  checked={form.ativo}
                  onCheckedChange={v => set('ativo', v)}
                  className="data-[state=checked]:bg-fonti-primary"
                />
                <Label className="text-sm">Produto ativo</Label>
              </div>
            </div>

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
