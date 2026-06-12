'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEditarLead } from '@/hooks/leads/useEditarLead'
import { useFaseStatuses } from '@/app/(protected)/configuracoes/_hooks/useFaseStatuses'
import type { Lead, FaseStatus } from '@/types/leads'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { Save, User, Building2, Handshake, Loader2, X, Plus, Check } from 'lucide-react'

// ── Tipos internos ────────────────────────────────────────────

interface CorretorVinculado {
  id: string
  corretor_id: string
  corretor: { id: string; nome: string; creci: string | null }
}

interface ImobiliariaVinculada {
  id: string
  imobiliaria_id: string
  papel: 'imobiliaria' | 'construtora'
  imobiliaria: { id: string; nome: string; tipo: string }
}

interface ParceiroVinculado {
  id: string
  parceiro_id: string
  parceiro: { id: string; nome: string; tipo: string }
}

// ── Constantes ────────────────────────────────────────────────

const BANCOS = [
  'Caixa Econômica Federal', 'Bradesco', 'Itaú', 'Santander', 'Banco do Brasil',
  'BTG Pactual', 'Sicredi', 'Inter', 'C6 Bank', 'Pan', 'Outro',
]

const FINALIDADES = [
  { value: 'residencial',  label: 'Residencial' },
  { value: 'comercial',    label: 'Comercial' },
  { value: 'investimento', label: 'Investimento' },
  { value: 'reforma',      label: 'Reforma' },
]

const TIPOS_IMOVEL = [
  { value: 'apartamento', label: 'Apartamento' },
  { value: 'casa',        label: 'Casa' },
  { value: 'terreno',     label: 'Terreno' },
  { value: 'comercial',   label: 'Comercial' },
  { value: 'rural',       label: 'Rural' },
]

const ORIGENS = [
  { value: 'direto',             label: 'Direto' },
  { value: 'whatsapp',           label: 'WhatsApp' },
  { value: 'indicacao',          label: 'Indicação' },
  { value: 'corretor',           label: 'Corretor' },
  { value: 'imobiliaria',        label: 'Imobiliária' },
  { value: 'construtora',        label: 'Construtora' },
  { value: 'parceiro_comercial', label: 'Parceiro Comercial' },
  { value: 'site',               label: 'Site' },
  { value: 'instagram',          label: 'Instagram' },
  { value: 'facebook',           label: 'Facebook' },
  { value: 'outros',             label: 'Outros' },
]

const ESTADO_CIVIL_LABEL: Record<string, string> = {
  solteiro: 'Solteiro(a)', casado: 'Casado(a)', uniao_estavel: 'União Estável',
  divorciado: 'Divorciado(a)', viuvo: 'Viúvo(a)',
}

const REGIME_LABEL: Record<string, string> = {
  comunhao_parcial: 'Comunhão Parcial', comunhao_total: 'Comunhão Total',
  separacao_total: 'Separação Total', participacao_final_aquestos: 'Part. Final Aquestos',
}

// ── Helpers ───────────────────────────────────────────────────

function fmtMoeda(v: number | null | undefined): string {
  if (v == null) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

function fmtData(s: string | null | undefined): string {
  if (!s) return '—'
  try { return format(new Date(s + 'T12:00:00'), 'dd/MM/yyyy', { locale: ptBR }) } catch { return s }
}

function parseMoeda(s: string): number | null {
  const n = parseFloat(s.replace(/\./g, '').replace(',', '.').replace(/[^0-9.]/g, ''))
  return isNaN(n) ? null : n
}

function fmtMoedaInput(v: number | null | undefined): string {
  if (v == null) return ''
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ── Campo de exibição ─────────────────────────────────────────

function Campo({ label, valor }: { label: string; valor: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-gray-400 mb-0.5">{label}</p>
      <p className="text-sm text-gray-800 font-medium">{valor || <span className="text-gray-300">—</span>}</p>
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────

interface Props {
  lead: Lead
}

export function AbaCredito({ lead }: Props) {
  const editar = useEditarLead()

  return (
    <div className="space-y-5">

      {/* ── 1. Status da Fase (configurável) ─────────────── */}
      <StatusFase lead={lead} saving={editar.isPending} />

      {/* ── 2. Dados do Cliente + Dados da Operação ──────── */}
      <div className="grid grid-cols-[55fr_45fr] gap-4">
        <DadosCliente lead={lead} />
        <DadosOperacao lead={lead} />
      </div>

      {/* ── 3. Indicadores de Crédito ─────────────────────── */}
      <IndicadoresCredito lead={lead} />

      {/* ── 4. Origem + Parceiros ─────────────────────────── */}
      <div className="grid grid-cols-2 gap-4">
        <BlocoOrigem
          origem={lead.origem}
          onChange={(o) => editar.mutate({ id: lead.id, origem: o as Lead['origem'] })}
          saving={editar.isPending}
        />
        <BlocoParceirosLead leadId={lead.id} />
      </div>

    </div>
  )
}

// ── StatusFase — status configurável via Configurações → Fases ─

function StatusFase({ lead, saving }: { lead: Lead; saving: boolean }) {
  const editar = useEditarLead()
  const { data: statuses = [], isLoading } = useFaseStatuses(lead.fase_id)

  if (isLoading) return null

  if (statuses.length === 0) {
    return (
      <div className="bg-white border border-gray-100 rounded-lg p-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Status da Fase</p>
        <p className="text-xs text-gray-400 italic">
          Nenhum status configurado para esta fase.{' '}
          <a href="/configuracoes" className="text-[#C2AA6A] hover:underline">Configurar em Configurações → Fases</a>
        </p>
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-100 rounded-lg p-4">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Status da Fase</p>
      <div className="flex flex-wrap gap-1.5">
        {statuses.map((s) => {
          const isAtivo = s.id === lead.status_id
          return (
            <button
              key={s.id}
              onClick={() => editar.mutate({ id: lead.id, status_id: s.id })}
              disabled={saving || editar.isPending}
              className={cn(
                'px-3 py-1 rounded-full text-xs font-medium border transition-all',
                isAtivo
                  ? 'ring-2 ring-offset-1'
                  : 'bg-white text-gray-400 border-gray-200 hover:bg-gray-50'
              )}
              style={isAtivo ? {
                backgroundColor: s.cor + '22',
                borderColor: s.cor,
                color: s.cor,
                // @ts-ignore
                '--tw-ring-color': s.cor,
              } : undefined}
            >
              {isAtivo && <Check className="h-3 w-3 inline mr-1" />}
              {s.nome}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── DadosCliente ──────────────────────────────────────────────

function DadosCliente({ lead }: { lead: Lead }) {
  const rendaTotal = (lead.renda_formal ?? 0) + (lead.renda_informal ?? 0) || null
  const casado = lead.estado_civil === 'casado' || lead.estado_civil === 'uniao_estavel'

  return (
    <div className="bg-white border border-gray-100 rounded-lg p-4 space-y-4">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Dados do Cliente</p>

      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        <Campo label="Nome" valor={lead.nome} />
        <Campo label="CPF" valor={lead.cpf} />
        <Campo label="RG" valor={lead.rg} />
        <Campo label="Data de Nascimento" valor={fmtData(lead.data_nascimento)} />
        <Campo label="Profissão" valor={lead.profissao} />
        <Campo
          label="Estado Civil"
          valor={lead.estado_civil ? ESTADO_CIVIL_LABEL[lead.estado_civil] ?? lead.estado_civil : null}
        />
        {lead.regime_casamento && (
          <Campo
            label="Regime de Bens"
            valor={REGIME_LABEL[lead.regime_casamento] ?? lead.regime_casamento}
          />
        )}
        <Campo label="Telefone" valor={lead.telefone} />
        <Campo label="E-mail" valor={lead.email} />
      </div>

      {casado && (lead.conjuge_nome || lead.conjuge_cpf) && (
        <div className="border-t border-gray-100 pt-3 space-y-2">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Cônjuge</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            <Campo label="Nome" valor={lead.conjuge_nome} />
            <Campo label="CPF" valor={lead.conjuge_cpf} />
            {lead.conjuge_data_nascimento && (
              <Campo label="Data de Nascimento" valor={fmtData(lead.conjuge_data_nascimento)} />
            )}
          </div>
        </div>
      )}

      <div className="border-t border-gray-100 pt-3">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Renda</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          <Campo label="Renda Formal" valor={fmtMoeda(lead.renda_formal)} />
          <Campo label="Renda Informal" valor={fmtMoeda(lead.renda_informal)} />
          {rendaTotal != null && (
            <div className="col-span-2">
              <p className="text-xs text-gray-400 mb-0.5">Renda Total</p>
              <p className="text-base font-bold text-[#253B29]">{fmtMoeda(rendaTotal)}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── DadosOperacao ─────────────────────────────────────────────

function DadosOperacao({ lead }: { lead: Lead }) {
  const editar = useEditarLead()

  const [form, setForm] = useState({
    produto_interesse: lead.produto_interesse ?? '',
    banco_pretendido: lead.banco_pretendido ?? '',
    valor_imovel: fmtMoedaInput(lead.valor_imovel),
    valor_pretendido: fmtMoedaInput(lead.valor_pretendido),
    entrada: fmtMoedaInput(lead.entrada),
    prazo_meses: lead.prazo_meses != null ? String(lead.prazo_meses) : '',
    finalidade: lead.finalidade ?? '',
    tipo_imovel: lead.tipo_imovel ?? '',
    cidade_imovel: lead.cidade_imovel ?? '',
  })
  const [dirty, setDirty] = useState(false)

  function set(campo: keyof typeof form, valor: string) {
    setForm(f => ({ ...f, [campo]: valor }))
    setDirty(true)
  }

  function salvar() {
    editar.mutate({
      id: lead.id,
      produto_interesse: (form.produto_interesse as Lead['produto_interesse']) || null,
      banco_pretendido: form.banco_pretendido || null,
      valor_imovel: parseMoeda(form.valor_imovel),
      valor_pretendido: parseMoeda(form.valor_pretendido),
      entrada: parseMoeda(form.entrada),
      prazo_meses: form.prazo_meses ? parseInt(form.prazo_meses) : null,
      finalidade: form.finalidade || null,
      tipo_imovel: form.tipo_imovel || null,
      cidade_imovel: form.cidade_imovel || null,
    }, { onSuccess: () => setDirty(false) })
  }

  return (
    <div className="bg-white border border-gray-100 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Dados da Operação</p>
        {dirty && (
          <Button
            size="sm"
            className="h-7 text-xs gap-1 bg-[#253B29] hover:bg-[#1a2b1e] text-white"
            onClick={salvar}
            disabled={editar.isPending}
          >
            {editar.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
            Salvar
          </Button>
        )}
      </div>

      <div className="space-y-2.5">
        <div>
          <Label className="text-xs text-gray-500">Produto</Label>
          <Select value={form.produto_interesse} onValueChange={v => set('produto_interesse', v)}>
            <SelectTrigger className="h-8 text-sm mt-1">
              <SelectValue placeholder="Selecionar..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="financiamento">Financiamento Imobiliário</SelectItem>
              <SelectItem value="consorcio">Consórcio</SelectItem>
              <SelectItem value="cgi">CGI</SelectItem>
              <SelectItem value="portabilidade">Portabilidade</SelectItem>
              <SelectItem value="contrato">Contrato</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-xs text-gray-500">Banco Pretendido</Label>
          <Select value={form.banco_pretendido} onValueChange={v => set('banco_pretendido', v)}>
            <SelectTrigger className="h-8 text-sm mt-1">
              <SelectValue placeholder="Selecionar banco..." />
            </SelectTrigger>
            <SelectContent>
              {BANCOS.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-xs text-gray-500">Valor do Imóvel</Label>
          <Input
            className="h-8 text-sm mt-1"
            placeholder="0,00"
            value={form.valor_imovel}
            onChange={e => set('valor_imovel', e.target.value)}
          />
        </div>

        <div>
          <Label className="text-xs text-gray-500">Valor a Financiar</Label>
          <Input
            className="h-8 text-sm mt-1"
            placeholder="0,00"
            value={form.valor_pretendido}
            onChange={e => set('valor_pretendido', e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs text-gray-500">Entrada</Label>
            <Input
              className="h-8 text-sm mt-1"
              placeholder="0,00"
              value={form.entrada}
              onChange={e => set('entrada', e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs text-gray-500">Prazo (meses)</Label>
            <Input
              className="h-8 text-sm mt-1"
              type="number"
              placeholder="360"
              value={form.prazo_meses}
              onChange={e => set('prazo_meses', e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs text-gray-500">Finalidade</Label>
            <Select value={form.finalidade} onValueChange={v => set('finalidade', v)}>
              <SelectTrigger className="h-8 text-sm mt-1">
                <SelectValue placeholder="Selecionar..." />
              </SelectTrigger>
              <SelectContent>
                {FINALIDADES.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-gray-500">Tipo de Imóvel</Label>
            <Select value={form.tipo_imovel} onValueChange={v => set('tipo_imovel', v)}>
              <SelectTrigger className="h-8 text-sm mt-1">
                <SelectValue placeholder="Selecionar..." />
              </SelectTrigger>
              <SelectContent>
                {TIPOS_IMOVEL.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <Label className="text-xs text-gray-500">Cidade do Imóvel</Label>
          <Input
            className="h-8 text-sm mt-1"
            placeholder="Ex: São Paulo - SP"
            value={form.cidade_imovel}
            onChange={e => set('cidade_imovel', e.target.value)}
          />
        </div>
      </div>
    </div>
  )
}

// ── IndicadoresCredito ────────────────────────────────────────

function IndicadoresCredito({ lead }: { lead: Lead }) {
  const editar = useEditarLead()
  const [rendaConsiderada, setRendaConsiderada] = useState(fmtMoedaInput(lead.renda_considerada))
  const [dirty, setDirty] = useState(false)

  const rendaConsideradaNum = parseMoeda(rendaConsiderada)
  const comprometimentoMax = rendaConsideradaNum != null ? rendaConsideradaNum * 0.30 : null

  function salvar() {
    editar.mutate(
      { id: lead.id, renda_considerada: rendaConsideradaNum },
      { onSuccess: () => setDirty(false) },
    )
  }

  return (
    <div className="bg-white border border-gray-100 rounded-lg p-4">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Indicadores de Crédito</p>
      <div className="grid grid-cols-3 gap-4">

        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs text-gray-400 mb-1">Renda Total</p>
          <p className="text-base font-bold text-gray-800">
            {fmtMoeda(((lead.renda_formal ?? 0) + (lead.renda_informal ?? 0)) || null)}
          </p>
          <p className="text-xs text-gray-400 mt-1">formal + informal</p>
        </div>

        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs text-gray-400 mb-1">Renda Considerada</p>
          <div className="flex items-center gap-1">
            <Input
              className="h-7 text-sm font-bold border-0 bg-transparent p-0 shadow-none focus-visible:ring-0 w-full"
              placeholder="0,00"
              value={rendaConsiderada}
              onChange={e => { setRendaConsiderada(e.target.value); setDirty(true) }}
              onBlur={() => { if (dirty) salvar() }}
            />
            {dirty && (
              <button onClick={salvar} className="text-[#253B29] hover:opacity-70 shrink-0">
                {editar.isPending
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Save className="h-3.5 w-3.5" />
                }
              </button>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-1">editar</p>
        </div>

        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs text-gray-400 mb-1">Comprometimento Máx.</p>
          <p className="text-base font-bold text-gray-800">{fmtMoeda(comprometimentoMax)}</p>
          <p className="text-xs text-gray-400 mt-1">30% da renda considerada</p>
        </div>

      </div>
    </div>
  )
}

// ── BlocoOrigem ───────────────────────────────────────────────

function BlocoOrigem({
  origem, onChange, saving,
}: {
  origem: Lead['origem']
  onChange: (o: string) => void
  saving: boolean
}) {
  return (
    <div className="bg-white border border-gray-100 rounded-lg p-4 space-y-3">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Origem</p>
      <Select value={origem} onValueChange={onChange} disabled={saving}>
        <SelectTrigger className="h-8 text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ORIGENS.map(o => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

// ── BlocoParceirosLead ────────────────────────────────────────

function BlocoParceirosLead({ leadId }: { leadId: string }) {
  const supabase = createClient()
  const qc = useQueryClient()

  const [addingCorretor, setAddingCorretor] = useState(false)
  const [addingImobiliaria, setAddingImobiliaria] = useState(false)
  const [addingParceiro, setAddingParceiro] = useState(false)

  const { data: corretores = [] } = useQuery({
    queryKey: ['lead-corretores', leadId],
    queryFn: async () => {
      const { data } = await supabase
        .from('lead_corretores')
        .select('id, corretor_id, corretor:corretores(id, nome, creci)')
        .eq('lead_id', leadId)
      return (data ?? []) as unknown as CorretorVinculado[]
    },
  })

  const { data: imobiliarias = [] } = useQuery({
    queryKey: ['lead-imobiliarias', leadId],
    queryFn: async () => {
      const { data } = await supabase
        .from('lead_imobiliarias')
        .select('id, imobiliaria_id, papel, imobiliaria:imobiliarias(id, nome, tipo)')
        .eq('lead_id', leadId)
      return (data ?? []) as unknown as ImobiliariaVinculada[]
    },
  })

  const { data: parceiros = [] } = useQuery({
    queryKey: ['lead-parceiros', leadId],
    queryFn: async () => {
      const { data } = await supabase
        .from('lead_parceiros')
        .select('id, parceiro_id, parceiro:parceiros(id, nome, tipo)')
        .eq('lead_id', leadId)
      return (data ?? []) as unknown as ParceiroVinculado[]
    },
  })

  const { data: todosCorretores = [] } = useQuery({
    queryKey: ['corretores-lista'],
    queryFn: async () => {
      const { data } = await supabase.from('corretores').select('id, nome, creci').eq('ativo', true).order('nome')
      return (data ?? []) as { id: string; nome: string; creci: string | null }[]
    },
  })

  const { data: todasImobiliarias = [] } = useQuery({
    queryKey: ['imobiliarias-lista'],
    queryFn: async () => {
      const { data } = await supabase.from('imobiliarias').select('id, nome, tipo').eq('ativo', true).order('nome')
      return (data ?? []) as { id: string; nome: string; tipo: string }[]
    },
  })

  const { data: todosParceiros = [] } = useQuery({
    queryKey: ['parceiros-lista'],
    queryFn: async () => {
      const { data } = await supabase.from('parceiros').select('id, nome, tipo').eq('ativo', true).order('nome')
      return (data ?? []) as { id: string; nome: string; tipo: string }[]
    },
  })

  async function vincularCorretor(corretorId: string) {
    await supabase.from('lead_corretores').insert({ lead_id: leadId, corretor_id: corretorId })
    qc.invalidateQueries({ queryKey: ['lead-corretores', leadId] })
    setAddingCorretor(false)
  }

  async function vincularImobiliaria(imobiliariaId: string) {
    const imob = todasImobiliarias.find(i => i.id === imobiliariaId)
    const papel = imob?.tipo === 'construtora' ? 'construtora' : 'imobiliaria'
    await supabase.from('lead_imobiliarias').insert({ lead_id: leadId, imobiliaria_id: imobiliariaId, papel })
    qc.invalidateQueries({ queryKey: ['lead-imobiliarias', leadId] })
    setAddingImobiliaria(false)
  }

  async function vincularParceiro(parceiroId: string) {
    await supabase.from('lead_parceiros').insert({ lead_id: leadId, parceiro_id: parceiroId })
    qc.invalidateQueries({ queryKey: ['lead-parceiros', leadId] })
    setAddingParceiro(false)
  }

  async function removerCorretor(id: string) {
    await supabase.from('lead_corretores').delete().eq('id', id)
    qc.invalidateQueries({ queryKey: ['lead-corretores', leadId] })
  }

  async function removerImobiliaria(id: string) {
    await supabase.from('lead_imobiliarias').delete().eq('id', id)
    qc.invalidateQueries({ queryKey: ['lead-imobiliarias', leadId] })
  }

  async function removerParceiro(id: string) {
    await supabase.from('lead_parceiros').delete().eq('id', id)
    qc.invalidateQueries({ queryKey: ['lead-parceiros', leadId] })
  }

  const corretoresDisponiveis = todosCorretores.filter(c => !corretores.find(v => v.corretor_id === c.id))
  const imobiliariasDisponiveis = todasImobiliarias.filter(i => !imobiliarias.find(v => v.imobiliaria_id === i.id))
  const parceirosDisponiveis = todosParceiros.filter(p => !parceiros.find(v => v.parceiro_id === p.id))

  return (
    <div className="bg-white border border-gray-100 rounded-lg p-4 space-y-4">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Parceiros</p>

      <ParceirosSecao
        label="Corretor"
        icon={<User className="h-3.5 w-3.5" />}
        items={corretores.map(c => ({
          id: c.id,
          nome: c.corretor.nome,
          sub: c.corretor.creci ? `CRECI: ${c.corretor.creci}` : undefined,
        }))}
        onRemover={removerCorretor}
        adicionando={addingCorretor}
        onAbrirAdicionar={() => setAddingCorretor(true)}
        onFecharAdicionar={() => setAddingCorretor(false)}
        disponiveis={corretoresDisponiveis.map(c => ({ id: c.id, label: c.nome }))}
        onSelecionar={vincularCorretor}
      />

      <ParceirosSecao
        label="Imobiliária / Construtora"
        icon={<Building2 className="h-3.5 w-3.5" />}
        items={imobiliarias.map(i => ({
          id: i.id,
          nome: i.imobiliaria.nome,
          sub: i.papel === 'construtora' ? 'Construtora' : 'Imobiliária',
        }))}
        onRemover={removerImobiliaria}
        adicionando={addingImobiliaria}
        onAbrirAdicionar={() => setAddingImobiliaria(true)}
        onFecharAdicionar={() => setAddingImobiliaria(false)}
        disponiveis={imobiliariasDisponiveis.map(i => ({ id: i.id, label: i.nome }))}
        onSelecionar={vincularImobiliaria}
      />

      <ParceirosSecao
        label="Parceiro Comercial"
        icon={<Handshake className="h-3.5 w-3.5" />}
        items={parceiros.map(p => ({
          id: p.id,
          nome: p.parceiro.nome,
          sub: p.parceiro.tipo === 'pessoa_fisica' ? 'Pessoa Física' : 'Empresa',
        }))}
        onRemover={removerParceiro}
        adicionando={addingParceiro}
        onAbrirAdicionar={() => setAddingParceiro(true)}
        onFecharAdicionar={() => setAddingParceiro(false)}
        disponiveis={parceirosDisponiveis.map(p => ({ id: p.id, label: p.nome }))}
        onSelecionar={vincularParceiro}
      />
    </div>
  )
}

// ── ParceirosSecao ────────────────────────────────────────────

function ParceirosSecao({
  label, icon, items, onRemover,
  adicionando, onAbrirAdicionar, onFecharAdicionar,
  disponiveis, onSelecionar,
}: {
  label: string
  icon: React.ReactNode
  items: { id: string; nome: string; sub?: string }[]
  onRemover: (id: string) => void
  adicionando: boolean
  onAbrirAdicionar: () => void
  onFecharAdicionar: () => void
  disponiveis: { id: string; label: string }[]
  onSelecionar: (id: string) => void
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          {icon}
          <span className="font-medium">{label}</span>
        </div>
        <button
          onClick={onAbrirAdicionar}
          className="flex items-center gap-0.5 text-xs text-[#253B29] hover:underline"
        >
          <Plus className="h-3 w-3" />
          Vincular
        </button>
      </div>

      {items.length === 0 && !adicionando && (
        <p className="text-xs text-gray-300 italic">Nenhum vinculado</p>
      )}

      {items.map(item => (
        <div key={item.id} className="flex items-center justify-between py-1 px-2 rounded-md bg-gray-50 mb-1">
          <div>
            <p className="text-xs font-medium text-gray-700">{item.nome}</p>
            {item.sub && <p className="text-xs text-gray-400">{item.sub}</p>}
          </div>
          <button onClick={() => onRemover(item.id)} className="text-gray-300 hover:text-red-400 ml-2 shrink-0">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}

      {adicionando && (
        <div className="mt-1.5 flex items-center gap-1.5">
          <Select onValueChange={onSelecionar}>
            <SelectTrigger className="h-7 text-xs flex-1">
              <SelectValue placeholder={`Selecionar ${label.toLowerCase()}...`} />
            </SelectTrigger>
            <SelectContent>
              {disponiveis.length === 0 ? (
                <div className="px-2 py-1.5 text-xs text-gray-400">Nenhum disponível</div>
              ) : (
                disponiveis.map(d => (
                  <SelectItem key={d.id} value={d.id} className="text-xs">{d.label}</SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
          <button onClick={onFecharAdicionar} className="text-gray-400 hover:text-gray-600 shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  )
}
