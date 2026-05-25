'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import { useRouter } from 'next/navigation'
import { formatDistanceToNow, format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  ArrowLeft, Phone, Mail, User, MessageSquare, Briefcase,
  Plus, Trash2, Edit2, Check, X, GitMerge, ExternalLink,
  UserPlus, MessageCirclePlus, FileText, Building2, FolderPlus,
  CreditCard, Calendar,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { usePermissao } from '@/lib/auth/guards'
import { LeadFormDrawer } from '@/components/leads/LeadFormDrawer'
import { NovoProcessoModal, type PessoaMinima } from '@/components/leads/NovoProcessoModal'

interface PessoaTelefone {
  id: string
  telefone: string
  principal: boolean
  whatsapp: boolean
  ativo: boolean
  created_at: string
}

interface LeadVinculado {
  id: string
  nome: string
  telefone: string
  cpf: string | null
  email: string | null
  data_nascimento: string | null
  origem: string
  produto_interesse: string | null
  created_at: string
  fase: { id: string; nome: string; cor: string } | null
}

const PRODUTO_CONFIG: Record<string, { label: string; className: string }> = {
  financiamento: { label: 'Financiamento', className: 'bg-blue-100 text-blue-700' },
  cgi:           { label: 'CGI',           className: 'bg-purple-100 text-purple-700' },
  consorcio:     { label: 'Consórcio',     className: 'bg-orange-100 text-orange-700' },
  portabilidade: { label: 'Portabilidade', className: 'bg-gray-100 text-gray-600' },
}

function produtoCfg(produto: string | null | undefined) {
  if (!produto) return null
  const key = produto.toLowerCase()
  if (key.includes('financ')) return PRODUTO_CONFIG.financiamento
  if (key.includes('cgi'))    return PRODUTO_CONFIG.cgi
  if (key.includes('cons'))   return PRODUTO_CONFIG.consorcio
  if (key.includes('port'))   return PRODUTO_CONFIG.portabilidade
  return { label: produto, className: 'bg-gray-100 text-gray-600' }
}

interface ConversaVinculada {
  id: string
  canal: string
  contato_telefone: string | null
  contato_nome: string | null
  status: string
  bot_ativo: boolean
  updated_at: string
}

type StatusProcesso = 'em_analise' | 'aprovado' | 'pendente' | 'reprovado' | 'cancelado'

interface ProcessoVinculado {
  id: string
  nome_imovel: string
  numero_processo: string
  status_processo: StatusProcesso
  valor_financiado: number | null
  valor_imovel: number | null
  created_at: string
  banco: { nome: string } | null
  fase_atual: { nome: string; cor: string | null } | null
  lead: { nome: string } | null
}

const STATUS_PROCESSO_LABEL: Record<StatusProcesso, string> = {
  em_analise: 'Em análise',
  aprovado:   'Aprovado',
  pendente:   'Pendente',
  reprovado:  'Reprovado',
  cancelado:  'Cancelado',
}

const STATUS_PROCESSO_COR: Record<StatusProcesso, string> = {
  em_analise: 'bg-blue-100 text-blue-700',
  aprovado:   'bg-green-100 text-green-700',
  pendente:   'bg-amber-100 text-amber-700',
  reprovado:  'bg-red-100 text-red-700',
  cancelado:  'bg-gray-100 text-gray-500',
}

const STATUS_ATIVOS: StatusProcesso[] = ['em_analise', 'pendente']

function fmtMoeda(v: number | null) {
  if (v == null) return null
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

const TIPOS = [
  { value: 'cliente',    label: 'Cliente' },
  { value: 'corretor',   label: 'Corretor' },
  { value: 'parceiro',   label: 'Parceiro' },
  { value: 'fornecedor', label: 'Fornecedor' },
  { value: 'outro',      label: 'Outro' },
]

interface Pessoa {
  id: string
  nome: string
  cpf: string | null
  email: string | null
  data_nascimento: string | null
  observacoes: string | null
  tipo: string | null
  created_at: string
  updated_at: string
  pessoa_telefones: PessoaTelefone[]
}

const CANAL_LABEL: Record<string, string> = {
  whatsapp: 'WhatsApp',
  site: 'Site',
  instagram: 'Instagram',
}

const STATUS_COR: Record<string, string> = {
  ativo: 'bg-blue-100 text-blue-700',
  qualificado: 'bg-green-100 text-green-700',
  humano: 'bg-amber-100 text-amber-700',
  encerrado: 'bg-gray-100 text-gray-500',
}

export default function PessoaDetalhePage({ params }: { params: { id: string } }) {
  const { usuario } = useAuth()
  const { pode } = usePermissao()
  const router = useRouter()
  const qc = useQueryClient()

  const [abaAtiva, setAbaAtiva] = useState<'telefones' | 'leads' | 'conversas' | 'processos'>('telefones')
  const [editando, setEditando] = useState(false)
  const [form, setForm] = useState({ nome: '', email: '', cpf: '', data_nascimento: '', observacoes: '', tipo: '' })
  const [drawerLead, setDrawerLead] = useState(false)
  const [modalConversa, setModalConversa] = useState(false)
  const [modalMerge, setModalMerge] = useState(false)
  const [buscaMerge, setBuscaMerge] = useState('')
  const [pessoaMergeId, setPessoaMergeId] = useState('')
  const [modalTelefone, setModalTelefone] = useState(false)
  const [novoTelefone, setNovoTelefone] = useState({ telefone: '', whatsapp: true, principal: false })
  const [modalNovoProcesso, setModalNovoProcesso] = useState(false)

  // Dados da pessoa
  const { data: pessoa, isLoading } = useQuery({
    queryKey: ['pessoa', params.id, usuario?.empresa_id],
    enabled: !!usuario?.empresa_id,
    queryFn: async (): Promise<Pessoa & { leads: LeadVinculado[]; conversas: ConversaVinculada[] }> => {
      const [{ data: p, error }, { data: leads }, { data: conversas }] = await Promise.all([
        supabase
          .from('pessoas')
          .select('id, nome, cpf, email, data_nascimento, observacoes, tipo, created_at, updated_at, pessoa_telefones(id, telefone, principal, whatsapp, ativo, created_at)')
          .eq('id', params.id)
          .eq('empresa_id', usuario!.empresa_id)
          .single(),
        supabase
          .from('leads')
          .select('id, nome, telefone, cpf, email, data_nascimento, origem, produto_interesse, created_at, fase:fases!fase_id(id, nome, cor)')
          .eq('empresa_id', usuario!.empresa_id)
          .eq('pessoa_id', params.id)
          .is('deleted_at', null)
          .order('created_at', { ascending: false }),
        supabase
          .from('conversas')
          .select('id, canal, contato_telefone, contato_nome, status, bot_ativo, updated_at')
          .eq('empresa_id', usuario!.empresa_id)
          .eq('pessoa_id', params.id)
          .order('updated_at', { ascending: false })
          .limit(20),
      ])
      if (error || !p) throw new Error('Pessoa não encontrada')
      return { ...(p as unknown as Pessoa), leads: (leads ?? []) as unknown as LeadVinculado[], conversas: (conversas ?? []) as ConversaVinculada[] }
    },
  })

  // Processos vinculados à pessoa (via pessoa_id direto ou via leads)
  const leadIds = (pessoa?.leads ?? []).map((l) => l.id)
  const { data: processos = [] } = useQuery({
    queryKey: ['processos-pessoa', params.id, leadIds],
    enabled: !!usuario?.empresa_id,
    queryFn: async (): Promise<ProcessoVinculado[]> => {
      const orFilter = leadIds.length > 0
        ? `pessoa_id.eq.${params.id},lead_id.in.(${leadIds.join(',')})`
        : `pessoa_id.eq.${params.id}`
      const { data, error } = await supabase
        .from('processos')
        .select('id, nome_imovel, numero_processo, status_processo, valor_financiado, valor_imovel, created_at, banco:bancos!banco_id(nome), fase_atual:fases!fase_atual_id(nome, cor), lead:leads!lead_id(nome)')
        .or(orFilter)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []).map((p: any) => ({
        ...p,
        banco:      Array.isArray(p.banco)      ? p.banco[0]      ?? null : p.banco,
        fase_atual: Array.isArray(p.fase_atual) ? p.fase_atual[0] ?? null : p.fase_atual,
        lead:       Array.isArray(p.lead)       ? p.lead[0]       ?? null : p.lead,
      }))
    },
  })

  // Busca para merge
  const { data: pessoasMerge = [] } = useQuery({
    queryKey: ['pessoas-merge', usuario?.empresa_id, buscaMerge],
    enabled: modalMerge && buscaMerge.length >= 2,
    queryFn: async () => {
      const { data } = await supabase
        .from('pessoas')
        .select('id, nome, pessoa_telefones(telefone)')
        .eq('empresa_id', usuario!.empresa_id)
        .ilike('nome', `%${buscaMerge}%`)
        .neq('id', params.id)
        .limit(8)
      return data ?? []
    },
  })

  const mutAtualizarPessoa = useMutation({
    mutationFn: async (dados: typeof form) => {
      const cpf = dados.cpf.trim() || null
      const { error } = await supabase
        .from('pessoas')
        .update({
          nome: dados.nome.trim() || undefined,
          email: dados.email.trim() || null,
          cpf,
          data_nascimento: dados.data_nascimento || null,
          observacoes: dados.observacoes.trim() || null,
          tipo: dados.tipo || null,
        })
        .eq('id', params.id)
        .eq('empresa_id', usuario!.empresa_id)
      if (error) throw error

      if (cpf) {
        await supabase
          .from('leads')
          .update({ cpf })
          .eq('pessoa_id', params.id)
          .eq('empresa_id', usuario!.empresa_id)
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pessoa', params.id] })
      qc.invalidateQueries({ queryKey: ['pessoas'] })
      setEditando(false)
      toast.success('Dados atualizados com sucesso')
    },
    onError: () => toast.error('Não foi possível salvar as alterações'),
  })

  const mutAdicionarTelefone = useMutation({
    mutationFn: async () => {
      if (novoTelefone.principal) {
        await supabase.from('pessoa_telefones').update({ principal: false }).eq('pessoa_id', params.id)
      }
      const { error } = await supabase.from('pessoa_telefones').insert({
        pessoa_id: params.id,
        empresa_id: usuario!.empresa_id,
        ...novoTelefone,
        ativo: true,
      })
      if (error) {
        if (error.code === '23505') throw new Error('Telefone já cadastrado')
        throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pessoa', params.id] })
      setModalTelefone(false)
      setNovoTelefone({ telefone: '', whatsapp: true, principal: false })
      toast.success('Telefone adicionado')
    },
    onError: (e: Error) => toast.error(e.message ?? 'Erro ao adicionar telefone'),
  })

  const mutRemoverTelefone = useMutation({
    mutationFn: async (telefoneId: string) => {
      const ativos = (pessoa?.pessoa_telefones ?? []).filter((t) => t.ativo)
      if (ativos.length <= 1) throw new Error('Não é possível remover o único telefone ativo')
      const { error } = await supabase
        .from('pessoa_telefones')
        .update({ ativo: false })
        .eq('id', telefoneId)
        .eq('pessoa_id', params.id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pessoa', params.id] })
      toast.success('Telefone removido')
    },
    onError: (e: Error) => toast.error(e.message ?? 'Erro ao remover telefone'),
  })

  const mutMerge = useMutation({
    mutationFn: async () => {
      if (!pessoaMergeId) throw new Error('Selecione uma pessoa para mesclar')
      const { error } = await supabase.rpc('merge_pessoas' as never, {
        p_principal: params.id,
        p_secundaria: pessoaMergeId,
      })
      // Se a RPC não existir, faz via API route
      if (error) {
        const session = await supabase.auth.getSession()
        const token = session.data.session?.access_token ?? ''
        const res = await fetch(`/api/pessoas/${params.id}/merge`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ pessoa_id_secundaria: pessoaMergeId }),
        })
        if (!res.ok) throw new Error('Erro ao mesclar pessoas')
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pessoa', params.id] })
      qc.invalidateQueries({ queryKey: ['pessoas'] })
      setModalMerge(false)
      setPessoaMergeId('')
      setBuscaMerge('')
      toast.success('Pessoas mescladas com sucesso')
    },
    onError: (e: Error) => toast.error(e.message ?? 'Erro ao mesclar'),
  })

  function iniciarEdicao() {
    if (!pessoa) return
    const lead = pessoa.leads[0] ?? null
    setForm({
      nome: pessoa.nome,
      email: pessoa.email ?? lead?.email ?? '',
      cpf: pessoa.cpf ?? lead?.cpf ?? '',
      data_nascimento: pessoa.data_nascimento ?? lead?.data_nascimento ?? '',
      observacoes: pessoa.observacoes ?? '',
      tipo: pessoa.tipo ?? '',
    })
    setEditando(true)
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    )
  }

  if (!pessoa) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-400">
        <User className="h-12 w-12 mb-3 opacity-30" />
        <p>Pessoa não encontrada</p>
        <button onClick={() => router.back()} className="mt-3 text-sm text-[#253B29] hover:underline">
          Voltar
        </button>
      </div>
    )
  }

  const telefoneAtivos = pessoa.pessoa_telefones.filter((t) => t.ativo)
  const telPrincipal = telefoneAtivos.find((t) => t.principal) ?? telefoneAtivos[0]

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="px-6 py-4 border-b bg-white flex items-center gap-4">
        <button onClick={() => router.back()} className="text-gray-400 hover:text-gray-600 transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-10 h-10 rounded-full bg-[#253B29]/10 flex items-center justify-center shrink-0">
            <span className="text-[#253B29] font-bold text-sm uppercase">{pessoa.nome.charAt(0)}</span>
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-gray-900 truncate">{pessoa.nome}</h1>
            <p className="text-xs text-gray-400">
              Cadastrado {formatDistanceToNow(new Date(pessoa.created_at), { addSuffix: true, locale: ptBR })}
            </p>
          </div>
        </div>
        <div className="flex gap-2 shrink-0 flex-wrap justify-end">
          {!editando && (
            <>
              <Button
                size="sm"
                className="bg-[#253B29] hover:bg-[#1a2b1e] text-white gap-1.5"
                onClick={() => setDrawerLead(true)}
              >
                <UserPlus className="h-4 w-4" />
                Criar Lead
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => setModalNovoProcesso(true)}
              >
                <FolderPlus className="h-4 w-4" />
                Novo Processo
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => setModalConversa(true)}
              >
                <MessageCirclePlus className="h-4 w-4" />
                Nova Conversa
              </Button>
              <Button variant="outline" size="sm" onClick={iniciarEdicao}>
                <Edit2 className="h-4 w-4 mr-1.5" />
                Editar
              </Button>
            </>
          )}
          {pode('pessoas.merge') && !editando && (
            <Button variant="outline" size="sm" onClick={() => setModalMerge(true)}>
              <GitMerge className="h-4 w-4 mr-1.5" />
              Mesclar
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {/* Card de dados */}
        <div className="bg-white rounded-xl border p-5">
          {editando ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Nome</label>
                  <Input value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">E-mail</label>
                  <Input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="email@exemplo.com" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">CPF</label>
                  <Input value={form.cpf} onChange={(e) => setForm((f) => ({ ...f, cpf: e.target.value }))} placeholder="000.000.000-00" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Data de nascimento</label>
                  <Input type="date" value={form.data_nascimento} onChange={(e) => setForm((f) => ({ ...f, data_nascimento: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 block">Observações</label>
                <textarea
                  className="w-full text-sm border rounded-md px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-[#253B29]/30"
                  rows={3}
                  value={form.observacoes}
                  onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))}
                  placeholder="Anotações internas sobre esta pessoa..."
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-2 block">Tipo</label>
                <div className="flex flex-wrap gap-2">
                  {TIPOS.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, tipo: f.tipo === t.value ? '' : t.value }))}
                      className={cn(
                        'text-xs px-3 py-1.5 rounded-lg border transition-all',
                        form.tipo === t.value
                          ? 'border-[#253B29] bg-[#253B29] text-white font-medium'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                      )}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={() => setEditando(false)}>
                  <X className="h-4 w-4 mr-1" /> Cancelar
                </Button>
                <Button size="sm" onClick={() => mutAtualizarPessoa.mutate(form)} disabled={mutAtualizarPessoa.isPending}>
                  <Check className="h-4 w-4 mr-1" /> Salvar
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-x-8 gap-y-3">
              {(() => {
                const lead0 = pessoa.leads[0] ?? null
                const cpfEfetivo = pessoa.cpf ?? lead0?.cpf ?? null
                const nascEfetivo = pessoa.data_nascimento ?? lead0?.data_nascimento ?? null
                return [
                  { label: 'Nome',       value: pessoa.nome,  icon: User },
                  { label: 'E-mail',     value: pessoa.email ?? lead0?.email ?? null, icon: Mail },
                  { label: 'CPF',        value: cpfEfetivo,   icon: CreditCard },
                  { label: 'Nascimento', value: nascEfetivo
                      ? format(new Date(nascEfetivo + 'T12:00:00'), 'dd/MM/yyyy')
                      : null,                                  icon: Calendar },
                ]
              })().map(({ label, value, icon: Icon }) => (
                <div key={label} className="flex items-start gap-2">
                  <Icon className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-[11px] text-gray-400">{label}</p>
                    <p className={cn('text-sm', value ? 'text-gray-800' : 'text-gray-300 italic')}>{value ?? '—'}</p>
                  </div>
                </div>
              ))}
              <div className="flex items-start gap-2">
                <User className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-[11px] text-gray-400">Tipo</p>
                  <p className={cn('text-sm', pessoa.tipo ? 'text-gray-800' : 'text-gray-300 italic')}>
                    {pessoa.tipo ? (TIPOS.find((t) => t.value === pessoa.tipo)?.label ?? pessoa.tipo) : '—'}
                  </p>
                </div>
              </div>
              {pessoa.observacoes && (
                <div className="col-span-2 mt-1 p-3 bg-amber-50 rounded-lg text-sm text-amber-800">
                  {pessoa.observacoes}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Abas */}
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="flex border-b">
            {([
              { id: 'telefones',  label: `Telefones (${telefoneAtivos.length})`,   icon: Phone },
              { id: 'leads',      label: `Leads (${pessoa.leads.length})`,          icon: Briefcase },
              { id: 'conversas',  label: `Conversas (${pessoa.conversas.length})`,  icon: MessageSquare },
              { id: 'processos',  label: `Processos (${processos.length})`,         icon: FileText },
            ] as const).map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setAbaAtiva(id)}
                className={cn(
                  'flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors',
                  abaAtiva === id
                    ? 'border-[#253B29] text-[#253B29]'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>

          <div className="p-4">
            {/* Aba Telefones */}
            {abaAtiva === 'telefones' && (
              <div className="space-y-2">
                {telefoneAtivos.map((tel) => (
                  <div key={tel.id} className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-gray-50">
                    <div className="flex items-center gap-3">
                      <Phone className="h-4 w-4 text-gray-400" />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-800">{tel.telefone}</span>
                          {tel.principal && (
                            <Badge className="text-[10px] px-1.5 py-0 bg-[#253B29] text-white">Principal</Badge>
                          )}
                          {tel.whatsapp && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-green-600 border-green-200">WhatsApp</Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => mutRemoverTelefone.mutate(tel.id)}
                      disabled={telefoneAtivos.length <= 1}
                      className="p-1.5 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => setModalTelefone(true)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 border border-dashed border-gray-200 rounded-lg text-sm text-gray-400 hover:border-[#253B29]/40 hover:text-[#253B29] transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  Adicionar telefone
                </button>
              </div>
            )}

            {/* Aba Leads */}
            {abaAtiva === 'leads' && (
              <div className="space-y-2">
                {pessoa.leads.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center gap-3">
                    <p className="text-sm text-gray-400">Nenhum lead vinculado a esta pessoa</p>
                    <Button
                      size="sm"
                      className="bg-[#253B29] hover:bg-[#1a2b1e] text-white gap-1.5"
                      onClick={() => setDrawerLead(true)}
                    >
                      <UserPlus className="h-4 w-4" />
                      Criar primeiro Lead para esta pessoa
                    </Button>
                  </div>
                ) : pessoa.leads.map((lead) => {
                  const fase    = Array.isArray(lead.fase) ? lead.fase[0] : lead.fase
                  const produto = produtoCfg(lead.produto_interesse)
                  return (
                    <button
                      key={lead.id}
                      onClick={() => router.push(`/leads/${lead.id}`)}
                      className="w-full flex items-center justify-between py-3 px-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors text-left group"
                    >
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium text-gray-800">{lead.nome}</p>
                          {produto && (
                            <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded-full', produto.className)}>
                              {produto.label}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {lead.telefone} · {formatDistanceToNow(new Date(lead.created_at), { addSuffix: true, locale: ptBR })}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {fase && (
                          <span
                            className="text-[11px] font-medium px-2 py-0.5 rounded-full"
                            style={{ background: fase.cor + '22', color: fase.cor }}
                          >
                            {fase.nome}
                          </span>
                        )}
                        <ExternalLink className="h-3.5 w-3.5 text-gray-300 group-hover:text-gray-500" />
                      </div>
                    </button>
                  )
                })}
              </div>
            )}

            {/* Aba Conversas */}
            {abaAtiva === 'conversas' && (
              <div className="space-y-2">
                {pessoa.conversas.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-6">Nenhuma conversa vinculada a esta pessoa</p>
                ) : pessoa.conversas.map((conv) => (
                  <button
                    key={conv.id}
                    onClick={() => router.push(`/conversas?id=${conv.id}`)}
                    className="w-full flex items-center justify-between py-3 px-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors text-left group"
                  >
                    <div className="flex items-center gap-3">
                      <MessageSquare className="h-4 w-4 text-gray-400 shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-gray-800">
                          {CANAL_LABEL[conv.canal] ?? conv.canal}
                          {conv.contato_telefone && <span className="text-gray-400 font-normal"> · {conv.contato_telefone}</span>}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {formatDistanceToNow(new Date(conv.updated_at), { addSuffix: true, locale: ptBR })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded-full', STATUS_COR[conv.status] ?? STATUS_COR.ativo)}>
                        {conv.status === 'humano' ? 'Em atendimento' : conv.status === 'ativo' ? 'Ativo' : conv.status === 'qualificado' ? 'Qualificado' : 'Encerrado'}
                      </span>
                      <ExternalLink className="h-3.5 w-3.5 text-gray-300 group-hover:text-gray-500" />
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Aba Processos */}
            {abaAtiva === 'processos' && (() => {
              if (processos.length === 0) {
                return (
                  <div className="flex flex-col items-center justify-center py-8 text-center gap-3">
                    <FileText className="h-10 w-10 text-gray-200" />
                    <p className="text-sm text-gray-400">Nenhum processo registrado para esta pessoa</p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      onClick={() => setModalNovoProcesso(true)}
                    >
                      <FolderPlus className="h-4 w-4" />
                      Criar primeiro Processo
                    </Button>
                  </div>
                )
              }

              const ativos     = processos.filter(p => STATUS_ATIVOS.includes(p.status_processo))
              const concluidos = processos.filter(p => !STATUS_ATIVOS.includes(p.status_processo))

              function ProcessoCard({ proc, dimmed }: { proc: ProcessoVinculado; dimmed?: boolean }) {
                const valor = fmtMoeda(proc.valor_financiado ?? proc.valor_imovel)
                return (
                  <button
                    onClick={() => router.push(`/processos/${proc.id}`)}
                    className={cn(
                      'w-full flex items-start justify-between py-3 px-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors text-left group gap-3',
                      dimmed && 'opacity-60'
                    )}
                  >
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center shrink-0 mt-0.5">
                        <Building2 className="h-4 w-4 text-amber-600" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-800 truncate">{proc.nome_imovel}</p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className="text-xs text-gray-400">#{proc.numero_processo}</span>
                          {proc.banco && (
                            <span className="text-xs text-gray-400">· {proc.banco.nome}</span>
                          )}
                          {proc.lead && (
                            <span className="text-xs text-gray-400 truncate">· {proc.lead.nome}</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {format(new Date(proc.created_at), 'dd/MM/yyyy', { locale: ptBR })}
                          {valor && <span className="font-medium text-gray-600"> · {valor}</span>}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      {proc.fase_atual ? (
                        <span
                          className="text-[11px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap"
                          style={{ background: (proc.fase_atual.cor ?? '#888') + '22', color: proc.fase_atual.cor ?? '#888' }}
                        >
                          {proc.fase_atual.nome}
                        </span>
                      ) : (
                        <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded-full', STATUS_PROCESSO_COR[proc.status_processo])}>
                          {STATUS_PROCESSO_LABEL[proc.status_processo]}
                        </span>
                      )}
                      <ExternalLink className="h-3.5 w-3.5 text-gray-300 group-hover:text-gray-500" />
                    </div>
                  </button>
                )
              }

              return (
                <div className="space-y-2">
                  {ativos.map(p => <ProcessoCard key={p.id} proc={p} />)}
                  {concluidos.length > 0 && (
                    <>
                      {ativos.length > 0 && (
                        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider pt-2 pb-1 px-1">
                          Concluídos / Cancelados
                        </p>
                      )}
                      {concluidos.map(p => <ProcessoCard key={p.id} proc={p} dimmed />)}
                    </>
                  )}
                </div>
              )
            })()}
          </div>
        </div>
      </div>

      {/* Drawer: Criar Lead pré-preenchido */}
      <LeadFormDrawer
        aberto={drawerLead}
        onFechar={() => setDrawerLead(false)}
        initialValues={{
          nome:     pessoa.nome,
          telefone: telPrincipal?.telefone ?? '',
          email:    pessoa.email  ?? '',
          cpf:      pessoa.cpf    ?? '',
        }}
      />

      {/* Modal: Novo Processo direto da Pessoa (sem Lead) */}
      <NovoProcessoModal
        aberto={modalNovoProcesso}
        onFechar={() => setModalNovoProcesso(false)}
        lead={null}
        pessoa={{
          id:       pessoa.id,
          nome:     pessoa.nome,
          cpf:      pessoa.cpf ?? pessoa.leads[0]?.cpf ?? null,
          email:    pessoa.email ?? pessoa.leads[0]?.email ?? null,
          telefone: telPrincipal?.telefone ?? null,
        }}
      />

      {/* Modal: Nova Conversa (em breve) */}
      <Dialog open={modalConversa} onOpenChange={setModalConversa}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Nova Conversa</DialogTitle>
          </DialogHeader>
          <div className="py-4 text-center space-y-2">
            <MessageCirclePlus className="h-10 w-10 text-gray-300 mx-auto" />
            <p className="text-sm text-gray-600">
              A criação de conversas diretamente pelo cadastro da pessoa estará disponível em breve.
            </p>
            <p className="text-xs text-gray-400">
              Por enquanto, inicie a conversa pelo módulo <strong>Conversas</strong>.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setModalConversa(false)}>Fechar</Button>
            <Button
              className="bg-[#253B29] hover:bg-[#1a2b1e] text-white"
              onClick={() => { setModalConversa(false); router.push('/conversas') }}
            >
              Ir para Conversas
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Adicionar telefone */}
      <Dialog open={modalTelefone} onOpenChange={setModalTelefone}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Adicionar telefone</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Número</label>
              <Input
                placeholder="5544999998888"
                value={novoTelefone.telefone}
                onChange={(e) => setNovoTelefone((f) => ({ ...f, telefone: e.target.value }))}
              />
              <p className="text-xs text-gray-400 mt-1">Formato: código do país + DDD + número (somente dígitos)</p>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="rounded"
                checked={novoTelefone.whatsapp}
                onChange={(e) => setNovoTelefone((f) => ({ ...f, whatsapp: e.target.checked }))}
              />
              <span className="text-sm text-gray-700">Aceita WhatsApp</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="rounded"
                checked={novoTelefone.principal}
                onChange={(e) => setNovoTelefone((f) => ({ ...f, principal: e.target.checked }))}
              />
              <span className="text-sm text-gray-700">Definir como principal</span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalTelefone(false)}>Cancelar</Button>
            <Button
              onClick={() => mutAdicionarTelefone.mutate()}
              disabled={!novoTelefone.telefone.trim() || mutAdicionarTelefone.isPending}
            >
              Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Mesclar pessoas */}
      <Dialog open={modalMerge} onOpenChange={setModalMerge}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Mesclar duplicata</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-gray-600">
              Os leads, conversas e telefones da pessoa selecionada serão transferidos para <strong>{pessoa.nome}</strong>, e o registro duplicado será removido.
            </p>
            <Input
              placeholder="Buscar pessoa a mesclar..."
              value={buscaMerge}
              onChange={(e) => { setBuscaMerge(e.target.value); setPessoaMergeId('') }}
            />
            {pessoasMerge.length > 0 && (
              <div className="border rounded-lg overflow-hidden divide-y max-h-48 overflow-y-auto">
                {(pessoasMerge as Array<{ id: string; nome: string; pessoa_telefones: Array<{ telefone: string }> }>).map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setPessoaMergeId(p.id)}
                    className={cn(
                      'w-full text-left px-3 py-2.5 text-sm hover:bg-gray-50 transition-colors flex items-center justify-between',
                      pessoaMergeId === p.id && 'bg-[#253B29]/5'
                    )}
                  >
                    <span className="font-medium text-gray-800">{p.nome}</span>
                    <span className="text-xs text-gray-400">{p.pessoa_telefones?.[0]?.telefone ?? ''}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalMerge(false)}>Cancelar</Button>
            <Button
              variant="destructive"
              onClick={() => mutMerge.mutate()}
              disabled={!pessoaMergeId || mutMerge.isPending}
            >
              <GitMerge className="h-4 w-4 mr-1.5" />
              Mesclar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
