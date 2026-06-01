'use client'

import { useState } from 'react'
import {
  useProcessoVendedores,
  useAdicionarVendedor,
  useEditarVendedor,
  useRemoverVendedor,
} from '@/hooks/processos/useProcessoVendedores'
import { type ProcessoVendedor } from '@/types/processos'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Pencil, Trash2, User, X, Check } from 'lucide-react'
import { PessoaBuscaCombobox, type PessoaOpcao } from '@/components/processos/PessoaBuscaCombobox'
import { NovaPessoaModal, type PessoaCriada } from '@/components/pessoas/NovaPessoaModal'

const ESTADOS_CIVIS = [
  'SOLTEIRO (A)',
  'DIVORCIADO (A)',
  'SEPARADO (A) JUDICIALMENTE',
  'VIÚVO (A)',
  'CASADO (A) COM COMUNHÃO TOTAL DE BENS',
  'CASADO (A) COM SEPARAÇÃO DE BENS',
  'CASADO (A) COM COMUNHÃO PARCIAL DE BENS',
]
const ESTADOS_CASADO = new Set(ESTADOS_CIVIS.slice(4))

function mascaraCpf(cpf: string | null): string {
  if (!cpf) return '—'
  const s = cpf.replace(/\D/g, '')
  if (s.length !== 11) return cpf
  return `***.***.${s.slice(6, 9)}-${s.slice(9)}`
}

interface FormVendedorState {
  nome: string
  cpf: string
  email: string
  telefone: string
  banco: string
  agencia: string
  conta: string
  estado_civil: string
  conjuge_nome: string
  conjuge_cpf: string
  conjuge_rg: string
  conjuge_data_nasc: string
  conjuge_papel: string
}

const FORM_VAZIO: FormVendedorState = {
  nome: '', cpf: '', email: '', telefone: '',
  banco: '', agencia: '', conta: '',
  estado_civil: '',
  conjuge_nome: '', conjuge_cpf: '', conjuge_rg: '',
  conjuge_data_nasc: '', conjuge_papel: '',
}

interface Props { processoId: string }

export function AbaVendedores({ processoId }: Props) {
  const { data: vendedores = [], isLoading } = useProcessoVendedores(processoId)
  const adicionar = useAdicionarVendedor(processoId)
  const editar = useEditarVendedor(processoId)
  const remover = useRemoverVendedor(processoId)

  const [exibirForm, setExibirForm] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [form, setForm] = useState<FormVendedorState>(FORM_VAZIO)
  const [pessoaSelecionada, setPessoaSelecionada] = useState<PessoaOpcao | null>(null)
  const [pessoaId, setPessoaId] = useState<string | null>(null)
  const [novaPessoaAberta, setNovaPessoaAberta] = useState(false)

  const eCasado = ESTADOS_CASADO.has(form.estado_civil)

  function set(field: Partial<FormVendedorState>) {
    setForm((prev) => ({ ...prev, ...field }))
  }

  function aplicarPessoa(p: PessoaOpcao | PessoaCriada) {
    setPessoaSelecionada(p)
    setPessoaId(p.id)
    setForm((prev) => ({
      ...prev,
      nome:     p.nome     ?? prev.nome,
      cpf:      p.cpf      ?? prev.cpf,
      email:    p.email    ?? prev.email,
      telefone: p.telefone ?? prev.telefone,
    }))
  }

  function handleEstadoCivil(valor: string) {
    const casado = ESTADOS_CASADO.has(valor)
    setForm((prev) => ({
      ...prev,
      estado_civil: valor,
      ...((!casado) && {
        conjuge_nome: '', conjuge_cpf: '', conjuge_rg: '',
        conjuge_data_nasc: '', conjuge_papel: '',
      }),
    }))
  }

  function abrirFormNovo() {
    setEditandoId(null)
    setForm(FORM_VAZIO)
    setPessoaSelecionada(null)
    setPessoaId(null)
    setExibirForm(true)
  }

  function abrirFormEditar(v: ProcessoVendedor) {
    setEditandoId(v.id)
    setForm({
      nome: v.nome,
      cpf: v.cpf ?? '',
      email: v.email ?? '',
      telefone: v.telefone ?? '',
      banco: v.banco ?? '',
      agencia: v.agencia ?? '',
      conta: v.conta ?? '',
      estado_civil: v.estado_civil ?? '',
      conjuge_nome: v.conjuge_nome ?? '',
      conjuge_cpf: v.conjuge_cpf ?? '',
      conjuge_rg: v.conjuge_rg ?? '',
      conjuge_data_nasc: v.conjuge_data_nasc ?? '',
      conjuge_papel: v.conjuge_papel ?? '',
    })
    setExibirForm(true)
  }

  function fecharForm() {
    setExibirForm(false)
    setEditandoId(null)
    setForm(FORM_VAZIO)
    setPessoaSelecionada(null)
    setPessoaId(null)
  }

  async function salvar() {
    const casado = ESTADOS_CASADO.has(form.estado_civil)
    const payload = {
      nome: form.nome.trim(),
      cpf: form.cpf.trim() || null,
      email: form.email.trim() || null,
      telefone: form.telefone.trim() || null,
      banco: form.banco.trim() || null,
      agencia: form.agencia.trim() || null,
      conta: form.conta.trim() || null,
      estado_civil: form.estado_civil || null,
      conjuge_nome: casado ? (form.conjuge_nome.trim() || null) : null,
      conjuge_cpf: casado ? (form.conjuge_cpf.trim() || null) : null,
      conjuge_rg: casado ? (form.conjuge_rg.trim() || null) : null,
      conjuge_data_nasc: casado ? (form.conjuge_data_nasc || null) : null,
      conjuge_papel: casado ? ((form.conjuge_papel as 'conjuge' | 'proprietario') || null) : null,
    }
    if (!payload.nome) return
    if (editandoId) {
      const vendedorAtual = vendedores.find((v) => v.id === editandoId)
      await editar.mutateAsync({ id: editandoId, pessoa_id: vendedorAtual?.pessoa_id ?? null, ...payload })
    } else {
      await adicionar.mutateAsync({ ...payload, pessoa_id: pessoaId })
    }
    fecharForm()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-[#253B29]">
          Vendedores <span className="text-gray-400 font-normal">({vendedores.length})</span>
        </p>
        <Button size="sm" className="bg-[#253B29] hover:bg-[#1a2b1e] text-white gap-1.5 h-8" onClick={abrirFormNovo}>
          <Plus className="h-3.5 w-3.5" /> Adicionar
        </Button>
      </div>

      {exibirForm && (
        <div className="border border-[#C2AA6A] rounded-xl p-4 bg-[#E7E0C4]/20 space-y-4">
          <p className="text-xs font-semibold text-[#253B29]">{editandoId ? 'Editar vendedor' : 'Novo vendedor'}</p>

          {/* Busca de pessoa — só no modo novo */}
          {!editandoId && (
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Buscar pessoa cadastrada</label>
              <PessoaBuscaCombobox
                pessoaSelecionada={pessoaSelecionada}
                onSelect={(p) => { if (p) aplicarPessoa(p); else { setPessoaSelecionada(null); setPessoaId(null) } }}
                onCriarPessoa={() => setNovaPessoaAberta(true)}
              />
            </div>
          )}

          {/* Dados pessoais */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <label className="text-xs text-gray-500 mb-1 block">Nome *</label>
              <Input placeholder="Nome completo" value={form.nome} onChange={(e) => set({ nome: e.target.value })} className="h-8 text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">CPF</label>
              <Input placeholder="000.000.000-00" value={form.cpf} onChange={(e) => set({ cpf: e.target.value })} className="h-8 text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Telefone</label>
              <Input placeholder="(00) 00000-0000" value={form.telefone} onChange={(e) => set({ telefone: e.target.value })} className="h-8 text-sm" />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs text-gray-500 mb-1 block">E-mail</label>
              <Input placeholder="email@exemplo.com" value={form.email} onChange={(e) => set({ email: e.target.value })} className="h-8 text-sm" />
            </div>
          </div>

          {/* Dados bancários */}
          <div>
            <p className="text-xs font-medium text-[#253B29] mb-2 border-t border-[#C2AA6A]/30 pt-3">Dados Bancários</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Banco</label>
                <Input placeholder="Nome do banco" value={form.banco} onChange={(e) => set({ banco: e.target.value })} className="h-8 text-sm" />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Agência</label>
                <Input placeholder="0000-0" value={form.agencia} onChange={(e) => set({ agencia: e.target.value })} className="h-8 text-sm" />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs text-gray-500 mb-1 block">Conta</label>
                <Input placeholder="00000-0" value={form.conta} onChange={(e) => set({ conta: e.target.value })} className="h-8 text-sm" />
              </div>
            </div>
          </div>

          {/* Estado civil */}
          <div>
            <p className="text-xs font-medium text-[#253B29] mb-2 border-t border-[#C2AA6A]/30 pt-3">Estado Civil</p>
            <Select value={form.estado_civil} onValueChange={handleEstadoCivil}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="Selecionar estado civil..." />
              </SelectTrigger>
              <SelectContent>
                {ESTADOS_CIVIS.map((ec) => (
                  <SelectItem key={ec} value={ec}>{ec}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Dados do cônjuge — só quando casado */}
          {eCasado && (
            <div>
              <p className="text-xs font-medium text-[#253B29] mb-2 border-t border-[#C2AA6A]/30 pt-3">Dados do Cônjuge</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="md:col-span-2">
                  <label className="text-xs text-gray-500 mb-1 block">Nome completo</label>
                  <Input placeholder="Nome completo do cônjuge" value={form.conjuge_nome} onChange={(e) => set({ conjuge_nome: e.target.value })} className="h-8 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">CPF</label>
                  <Input placeholder="000.000.000-00" value={form.conjuge_cpf} onChange={(e) => set({ conjuge_cpf: e.target.value })} className="h-8 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">RG</label>
                  <Input placeholder="00.000.000-0" value={form.conjuge_rg} onChange={(e) => set({ conjuge_rg: e.target.value })} className="h-8 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Data de nascimento</label>
                  <Input type="date" value={form.conjuge_data_nasc} onChange={(e) => set({ conjuge_data_nasc: e.target.value })} className="h-8 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Papel no processo</label>
                  <Select value={form.conjuge_papel} onValueChange={(v) => set({ conjuge_papel: v })}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="Selecionar..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="conjuge">Cônjuge</SelectItem>
                      <SelectItem value="proprietario">Proprietário</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-2 justify-end pt-1">
            <Button variant="ghost" size="sm" className="h-8 gap-1" onClick={fecharForm}>
              <X className="h-3.5 w-3.5" /> Cancelar
            </Button>
            <Button
              size="sm"
              className="bg-[#253B29] hover:bg-[#1a2b1e] text-white h-8 gap-1"
              onClick={salvar}
              disabled={!form.nome.trim() || adicionar.isPending || editar.isPending}
            >
              <Check className="h-3.5 w-3.5" /> Salvar
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">{[...Array(2)].map((_, i) => <div key={i} className="h-16 bg-gray-100 animate-pulse rounded-xl" />)}</div>
      ) : vendedores.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">Nenhum vendedor cadastrado.</p>
      ) : (
        <div className="space-y-3">
          {vendedores.map((v) => (
            <VendedorCard key={v.id} vendedor={v} onEditar={() => abrirFormEditar(v)} onRemover={() => remover.mutate(v.id)} />
          ))}
        </div>
      )}

      <NovaPessoaModal
        aberto={novaPessoaAberta}
        onFechar={() => setNovaPessoaAberta(false)}
        onSucesso={(p) => { aplicarPessoa(p); setNovaPessoaAberta(false) }}
      />
    </div>
  )
}

function VendedorCard({ vendedor: v, onEditar, onRemover }: { vendedor: ProcessoVendedor; onEditar: () => void; onRemover: () => void }) {
  const temBanco = v.banco || v.agencia || v.conta
  const temConjuge = v.conjuge_nome || v.conjuge_cpf

  return (
    <div className="flex items-start justify-between p-4 bg-white border border-gray-100 rounded-xl hover:border-gray-200 transition-colors cursor-pointer" onClick={onEditar}>
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center shrink-0">
          <User className="h-4 w-4 text-gray-500" />
        </div>
        <div className="space-y-0.5">
          <p className="text-sm font-semibold text-[#253B29]">{v.nome}</p>
          <div className="flex flex-wrap gap-x-4 gap-y-0.5">
            <span className="text-xs text-gray-400">CPF: {mascaraCpf(v.cpf)}</span>
            {v.telefone && <span className="text-xs text-gray-400">{v.telefone}</span>}
            {v.email && <span className="text-xs text-gray-400">{v.email}</span>}
          </div>
          {v.estado_civil && (
            <p className="text-xs text-gray-400">{v.estado_civil}</p>
          )}
          {temBanco && (
            <p className="text-xs text-gray-400">
              {[v.banco, v.agencia && `Ag. ${v.agencia}`, v.conta && `Conta ${v.conta}`].filter(Boolean).join(' · ')}
            </p>
          )}
          {temConjuge && (
            <p className="text-xs text-gray-400">
              Cônjuge: {v.conjuge_nome || '—'}
              {v.conjuge_papel && <span className="ml-1 capitalize">({v.conjuge_papel === 'proprietario' ? 'Proprietário' : 'Cônjuge'})</span>}
            </p>
          )}
        </div>
      </div>
      <div className="flex gap-1" onClick={e => e.stopPropagation()}>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-400 hover:text-[#253B29]" onClick={onEditar}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-400 hover:text-red-500" onClick={onRemover}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}
