'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { supabase } from '@/lib/supabase'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEditarLead } from '@/hooks/leads/useEditarLead'
import { useFaseStatuses } from '@/app/(protected)/configuracoes/_hooks/useFaseStatuses'
import type { Lead } from '@/types/leads'
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
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import {
  Save, User, Building2, Handshake, Loader2, X, Plus, Check,
  ClipboardList, ExternalLink, Pencil, Search,
} from 'lucide-react'
import { CompletarDadosPessoaDrawer } from '@/components/pessoas/CompletarDadosPessoaDrawer'
import { useAuth } from '@/hooks/auth/useAuth'

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
interface PessoaResultado {
  id: string
  nome: string
  cpf: string | null
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

// Campos extensíveis: adicionar aqui + migration para novos campos
const CAMPOS_IMOVEL = [
  { key: 'tipo_imovel',   label: 'Tipo',   tipo: 'select' as const, opcoes: TIPOS_IMOVEL },
  { key: 'cidade_imovel', label: 'Cidade', tipo: 'text'   as const },
  // futuras: { key: 'imovel_matricula', label: 'Matrícula', tipo: 'text' },
  // futuras: { key: 'imovel_rua', label: 'Endereço', tipo: 'text' },
  // futuras: { key: 'imovel_bairro', label: 'Bairro', tipo: 'text' },
] as const

// ── Helpers ───────────────────────────────────────────────────

function fmtMoeda(v: number | null | undefined): string {
  if (v == null || v === 0) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}
function fmtMoedaValor(v: number | null | undefined): string {
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
function iniciais(nome: string | null | undefined): string {
  if (!nome) return '?'
  return nome.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()
}

// ── Componente principal ──────────────────────────────────────

interface Props { lead: Lead }

export function AbaCredito({ lead }: Props) {
  const editar = useEditarLead()
  const qc = useQueryClient()
  const [completarPessoaAberto, setCompletarPessoaAberto] = useState(false)
  const [conjugePessoaDrawer, setConjugePessoaDrawer] = useState<string | null>(null)
  const [vendedorPessoaDrawer, setVendedorPessoaDrawer] = useState<string | null>(null)
  const [conjugeDialogAberto, setConjugeDialogAberto] = useState(false)

  async function vincularCriarConjuge() {
    const { data: session } = await supabase.auth.getSession()
    const token = session.session?.access_token
    if (!token) return
    const res = await fetch(`/api/leads/${lead.id}/vincular-conjuge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ criar_de_lead: true }),
    })
    const json = await res.json()
    if (res.ok && json.conjuge_pessoa_id) {
      qc.invalidateQueries({ queryKey: ['leads', lead.id] })
      setConjugeDialogAberto(false)
      setConjugePessoaDrawer(json.conjuge_pessoa_id)
    }
  }

  async function desvincularConjuge() {
    const { data: session } = await supabase.auth.getSession()
    const token = session.session?.access_token
    if (!token) return
    await fetch(`/api/leads/${lead.id}/vincular-conjuge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ desvincular: true }),
    })
    qc.invalidateQueries({ queryKey: ['leads', lead.id] })
  }

  return (
    <div className="space-y-4">

      {/* 1. Status da fase */}
      <StatusFase lead={lead} />

      {/* 2. Participantes */}
      <BlocoParticipantes
        lead={lead}
        onCompletarPessoa={lead.pessoa_id ? () => setCompletarPessoaAberto(true) : undefined}
        onAbrirConjugePessoa={lead.conjuge_pessoa_id ? () => setConjugePessoaDrawer(lead.conjuge_pessoa_id) : undefined}
        onEditarConjuge={() => setConjugeDialogAberto(true)}
        onDesvincularConjuge={lead.conjuge_pessoa_id ? desvincularConjuge : undefined}
        onCriarConjuge={vincularCriarConjuge}
      />

      {/* 3. Operação */}
      <BlocoOperacao lead={lead} />

      {/* 4. Imóvel */}
      <BlocoImovel lead={lead} />

      {/* 5. Vendedor */}
      <BlocoVendedor
        lead={lead}
        onAbrirVendedorPessoa={lead.vendedor_pessoa_id ? () => setVendedorPessoaDrawer(lead.vendedor_pessoa_id) : undefined}
      />

      {/* 6. Origem + Parceiros */}
      <div className="grid grid-cols-2 gap-4">
        <BlocoOrigem
          origem={lead.origem}
          onChange={(o) => editar.mutate({ id: lead.id, origem: o as Lead['origem'] })}
          saving={editar.isPending}
        />
        <BlocoParceirosLead leadId={lead.id} />
      </div>

      {/* Drawers */}
      <CompletarDadosPessoaDrawer
        pessoaId={lead.pessoa_id ?? null}
        open={completarPessoaAberto}
        onClose={() => setCompletarPessoaAberto(false)}
        origemAuditoria="leads"
      />
      <CompletarDadosPessoaDrawer
        pessoaId={conjugePessoaDrawer}
        open={!!conjugePessoaDrawer}
        onClose={() => setConjugePessoaDrawer(null)}
        origemAuditoria="leads"
      />
      <CompletarDadosPessoaDrawer
        pessoaId={vendedorPessoaDrawer}
        open={!!vendedorPessoaDrawer}
        onClose={() => setVendedorPessoaDrawer(null)}
        origemAuditoria="leads"
      />

      {/* Dialog cônjuge */}
      {conjugeDialogAberto && (
        <ConjugeEditarDialog
          lead={lead}
          onClose={() => setConjugeDialogAberto(false)}
          onCriarPessoa={vincularCriarConjuge}
        />
      )}
    </div>
  )
}

// ── StatusFase ────────────────────────────────────────────────

function StatusFase({ lead }: { lead: Lead }) {
  const editar = useEditarLead()
  const { data: statuses = [], isLoading } = useFaseStatuses(lead.fase_id)
  if (isLoading) return null
  if (statuses.length === 0) {
    return (
      <div className="bg-white border border-gray-100 rounded-lg p-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Status da Fase</p>
        <p className="text-xs text-gray-400 italic">
          Nenhum status configurado.{' '}
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
              disabled={editar.isPending}
              className={cn(
                'px-3 py-1 rounded-full text-xs font-medium border transition-all',
                isAtivo ? 'ring-2 ring-offset-1' : 'bg-white text-gray-400 border-gray-200 hover:bg-gray-50',
              )}
              style={isAtivo ? {
                backgroundColor: s.cor + '22', borderColor: s.cor, color: s.cor,
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

// ── BlocoParticipantes ────────────────────────────────────────

function BlocoParticipantes({ lead, onCompletarPessoa, onAbrirConjugePessoa, onEditarConjuge, onDesvincularConjuge, onCriarConjuge }: {
  lead: Lead
  onCompletarPessoa?: () => void
  onAbrirConjugePessoa?: () => void
  onEditarConjuge?: () => void
  onDesvincularConjuge?: () => void
  onCriarConjuge?: () => void
}) {
  const editar = useEditarLead()
  const casado = lead.estado_civil === 'casado' || lead.estado_civil === 'uniao_estavel'

  // Sincroniza estado local quando o lead prop muda (após save ou refetch)
  const [conjFormal,   setConjFormal]   = useState(fmtMoedaInput(lead.conjuge_renda_formal))
  const [conjInformal, setConjInformal] = useState(fmtMoedaInput(lead.conjuge_renda_informal))
  const [conjDirty,    setConjDirty]    = useState(false)
  const [rendaConsiderada, setRendaConsiderada] = useState(fmtMoedaInput(lead.renda_considerada))
  const [rcDirty, setRcDirty] = useState(false)

  // Resincroniza quando os valores do lead mudam sem o usuário ter editado
  useEffect(() => {
    if (!conjDirty) {
      setConjFormal(fmtMoedaInput(lead.conjuge_renda_formal))
      setConjInformal(fmtMoedaInput(lead.conjuge_renda_informal))
    }
  }, [lead.conjuge_renda_formal, lead.conjuge_renda_informal])

  useEffect(() => {
    if (!rcDirty) setRendaConsiderada(fmtMoedaInput(lead.renda_considerada))
  }, [lead.renda_considerada])

  const rendaFormalComprador   = lead.renda_formal   ?? 0
  const rendaInformalComprador = lead.renda_informal ?? 0
  const totalComprador         = rendaFormalComprador + rendaInformalComprador

  // Usa estado local para exibição imediata enquanto edita
  const conjFormalNum   = parseMoeda(conjFormal)   ?? 0
  const conjInformalNum = parseMoeda(conjInformal) ?? 0
  const totalConjuge    = conjFormalNum + conjInformalNum

  const rendaTotal = totalComprador + (casado ? totalConjuge : 0)

  function salvarRendaConjuge() {
    editar.mutate({
      id: lead.id,
      conjuge_renda_formal:   conjFormalNum || null,
      conjuge_renda_informal: conjInformalNum || null,
    }, { onSuccess: () => setConjDirty(false) })
  }

  function salvarRendaConsiderada() {
    editar.mutate(
      { id: lead.id, renda_considerada: parseMoeda(rendaConsiderada) },
      { onSuccess: () => setRcDirty(false) },
    )
  }

  const nomeConjuge = lead.conjuge_pessoa?.nome ?? lead.conjuge_nome

  return (
    <div className="bg-white border border-gray-100 rounded-lg overflow-hidden">

      {/* ── Comprador ── */}
      <div className="px-4 pt-3 pb-2">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Comprador</p>
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-full bg-[#253B29] flex items-center justify-center shrink-0 mt-0.5">
            <span className="text-xs font-bold text-white">{iniciais(lead.nome)}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {onCompletarPessoa ? (
                <button onClick={onCompletarPessoa} className="text-sm font-semibold text-[#253B29] hover:underline flex items-center gap-1 text-left">
                  {lead.nome}
                  <ExternalLink className="h-3 w-3 opacity-40 shrink-0" />
                </button>
              ) : (
                <p className="text-sm font-semibold text-gray-800">{lead.nome}</p>
              )}
              {onCompletarPessoa && (
                <button onClick={onCompletarPessoa} className="flex items-center gap-0.5 text-[10px] text-gray-400 hover:text-[#253B29]">
                  <ClipboardList className="h-2.5 w-2.5" /> Cadastro
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
              {lead.cpf && <span className="text-xs text-gray-500">{lead.cpf}</span>}
              {lead.data_nascimento && <span className="text-xs text-gray-500">{fmtData(lead.data_nascimento)}</span>}
              {lead.profissao && <span className="text-xs text-gray-500">{lead.profissao}</span>}
              {lead.estado_civil && (
                <span className="text-xs text-gray-400">
                  {ESTADO_CIVIL_LABEL[lead.estado_civil] ?? lead.estado_civil}
                  {lead.regime_casamento ? ` · ${REGIME_LABEL[lead.regime_casamento] ?? lead.regime_casamento}` : ''}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="ml-12 mt-2 grid grid-cols-3 gap-2">
          <RendaCampo label="Formal"   valor={fmtMoedaValor(rendaFormalComprador   || null)} />
          <RendaCampo label="Informal" valor={fmtMoedaValor(rendaInformalComprador || null)} />
          <RendaCampo label="Total"    valor={fmtMoedaValor(totalComprador          || null)} destaque />
        </div>
      </div>

      {/* ── Cônjuge ── */}
      {casado && (
        <>
          <div className="border-t border-dashed border-gray-100 mx-4 my-1" />
          <div className="px-4 pb-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Cônjuge</p>
              <div className="flex items-center gap-2">
                {lead.conjuge_pessoa_id ? (
                  <>
                    <span className="flex items-center gap-1 text-[10px] text-green-600 font-medium">
                      <Check className="h-2.5 w-2.5" /> Cadastrado
                    </span>
                    <button onClick={onDesvincularConjuge} className="text-[10px] text-gray-300 hover:text-red-400">
                      Desvincular
                    </button>
                  </>
                ) : (
                  <>
                    {nomeConjuge && (
                      <button onClick={onEditarConjuge} className="flex items-center gap-0.5 text-[10px] text-gray-400 hover:text-[#253B29]">
                        <Pencil className="h-2.5 w-2.5" /> Editar
                      </button>
                    )}
                    {nomeConjuge && (
                      <button onClick={onCriarConjuge} className="flex items-center gap-0.5 text-[10px] text-[#253B29] hover:underline font-medium">
                        <Plus className="h-2.5 w-2.5" /> Criar cadastro
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>

            {nomeConjuge ? (
              <>
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-xs font-bold text-white">{iniciais(nomeConjuge)}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    {lead.conjuge_pessoa_id ? (
                      <button onClick={onAbrirConjugePessoa} className="text-sm font-semibold text-[#253B29] hover:underline flex items-center gap-1">
                        {nomeConjuge} <ExternalLink className="h-3 w-3 opacity-40 shrink-0" />
                      </button>
                    ) : (
                      <button onClick={onEditarConjuge} className="text-sm font-semibold text-gray-700 hover:underline text-left">
                        {nomeConjuge}
                      </button>
                    )}
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                      {(lead.conjuge_pessoa?.cpf ?? lead.conjuge_cpf) && (
                        <span className="text-xs text-gray-500">{lead.conjuge_pessoa?.cpf ?? lead.conjuge_cpf}</span>
                      )}
                      {lead.conjuge_data_nascimento && (
                        <span className="text-xs text-gray-500">{fmtData(lead.conjuge_data_nascimento)}</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Renda cônjuge — editável inline */}
                <div className="ml-12 mt-2 grid grid-cols-3 gap-2">
                  <RendaCampoEditavel
                    label="Formal"
                    value={conjFormal}
                    onChange={v => { setConjFormal(v); setConjDirty(true) }}
                    onBlur={() => { if (conjDirty) salvarRendaConjuge() }}
                  />
                  <RendaCampoEditavel
                    label="Informal"
                    value={conjInformal}
                    onChange={v => { setConjInformal(v); setConjDirty(true) }}
                    onBlur={() => { if (conjDirty) salvarRendaConjuge() }}
                  />
                  <RendaCampo label="Total" valor={fmtMoedaValor(totalConjuge || null)} destaque />
                </div>
                {conjDirty && (
                  <div className="ml-12 mt-1">
                    <button onClick={salvarRendaConjuge} className="flex items-center gap-1 text-[10px] text-[#253B29] hover:underline">
                      {editar.isPending
                        ? <Loader2 className="h-2.5 w-2.5 animate-spin" />
                        : <Save className="h-2.5 w-2.5" />
                      }
                      Salvar renda
                    </button>
                  </div>
                )}
              </>
            ) : (
              <button onClick={onEditarConjuge} className="flex items-center gap-1 text-xs text-[#253B29] font-medium hover:underline">
                <Plus className="h-3 w-3" /> Informar dados do cônjuge
              </button>
            )}
          </div>
        </>
      )}

      {/* ── Renda Total ── */}
      {rendaTotal > 0 && (
        <div className="border-t border-gray-100 bg-gray-50 px-4 py-2.5 flex items-center justify-between">
          <div>
            <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Renda Total</p>
            <p className="text-lg font-bold text-[#253B29]">{fmtMoedaValor(rendaTotal)}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Renda Considerada</p>
            <div className="flex items-center gap-1 justify-end">
              <Input
                className="h-6 text-sm font-bold border-0 bg-transparent p-0 shadow-none focus-visible:ring-0 w-28 text-right"
                placeholder="0,00"
                value={rendaConsiderada}
                onChange={e => { setRendaConsiderada(e.target.value); setRcDirty(true) }}
                onBlur={() => { if (rcDirty) salvarRendaConsiderada() }}
              />
              {rcDirty && (
                <button onClick={salvarRendaConsiderada} className="text-[#253B29] hover:opacity-70 shrink-0">
                  {editar.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                </button>
              )}
            </div>
            {lead.renda_considerada && (
              <p className="text-[10px] text-gray-400">máx 30%: {fmtMoedaValor(lead.renda_considerada * 0.30)}</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function RendaCampo({ label, valor, destaque }: { label: string; valor: string; destaque?: boolean }) {
  return (
    <div className="bg-gray-50 rounded px-2 py-1.5">
      <p className="text-[10px] text-gray-400 mb-0.5">{label}</p>
      <p className={cn('text-xs font-semibold', destaque ? 'text-[#253B29]' : 'text-gray-700')}>{valor}</p>
    </div>
  )
}

function RendaCampoEditavel({ label, value, onChange, onBlur }: {
  label: string; value: string; onChange: (v: string) => void; onBlur: () => void
}) {
  return (
    <div className="bg-gray-50 rounded px-2 py-1.5">
      <p className="text-[10px] text-gray-400 mb-0.5">{label}</p>
      <Input
        className="h-4 text-xs font-semibold border-0 bg-transparent p-0 shadow-none focus-visible:ring-0 w-full"
        placeholder="0,00"
        value={value}
        onChange={e => onChange(e.target.value)}
        onBlur={onBlur}
      />
    </div>
  )
}

// ── BlocoOperacao ─────────────────────────────────────────────

function BlocoOperacao({ lead }: { lead: Lead }) {
  const editar = useEditarLead()
  const [form, setForm] = useState({
    produto_interesse: lead.produto_interesse ?? '',
    banco_pretendido:  lead.banco_pretendido  ?? '',
    valor_imovel:      fmtMoedaInput(lead.valor_imovel),
    valor_pretendido:  fmtMoedaInput(lead.valor_pretendido),
    entrada:           fmtMoedaInput(lead.entrada),
    prazo_meses:       lead.prazo_meses != null ? String(lead.prazo_meses) : '',
    finalidade:        lead.finalidade ?? '',
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
      banco_pretendido:  form.banco_pretendido || null,
      valor_imovel:      parseMoeda(form.valor_imovel),
      valor_pretendido:  parseMoeda(form.valor_pretendido),
      entrada:           parseMoeda(form.entrada),
      prazo_meses:       form.prazo_meses ? parseInt(form.prazo_meses) : null,
      finalidade:        form.finalidade || null,
    }, { onSuccess: () => setDirty(false) })
  }

  return (
    <div className="bg-white border border-gray-100 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Operação</p>
        {dirty && (
          <Button size="sm" className="h-7 text-xs gap-1 bg-[#253B29] hover:bg-[#1a2b1e] text-white" onClick={salvar} disabled={editar.isPending}>
            {editar.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
            Salvar
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <Label className="text-xs text-gray-500">Produto</Label>
          <Select value={form.produto_interesse} onValueChange={v => set('produto_interesse', v)}>
            <SelectTrigger className="h-8 text-sm mt-1"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
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
            <SelectTrigger className="h-8 text-sm mt-1"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
            <SelectContent>
              {BANCOS.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-xs text-gray-500">Valor do Imóvel</Label>
          <Input className="h-8 text-sm mt-1" placeholder="0,00" value={form.valor_imovel} onChange={e => set('valor_imovel', e.target.value)} />
        </div>
        <div>
          <Label className="text-xs text-gray-500">Entrada</Label>
          <Input className="h-8 text-sm mt-1" placeholder="0,00" value={form.entrada} onChange={e => set('entrada', e.target.value)} />
        </div>

        <div>
          <Label className="text-xs text-gray-500">Valor a Financiar</Label>
          <Input className="h-8 text-sm mt-1" placeholder="0,00" value={form.valor_pretendido} onChange={e => set('valor_pretendido', e.target.value)} />
        </div>
        <div>
          <Label className="text-xs text-gray-500">Prazo (meses)</Label>
          <Input className="h-8 text-sm mt-1" type="number" placeholder="360" value={form.prazo_meses} onChange={e => set('prazo_meses', e.target.value)} />
        </div>

        <div className="col-span-2">
          <Label className="text-xs text-gray-500">Finalidade</Label>
          <Select value={form.finalidade} onValueChange={v => set('finalidade', v)}>
            <SelectTrigger className="h-8 text-sm mt-1"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
            <SelectContent>
              {FINALIDADES.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  )
}

// ── BlocoImovel ───────────────────────────────────────────────

function BlocoImovel({ lead }: { lead: Lead }) {
  const editar = useEditarLead()
  const temDados = CAMPOS_IMOVEL.some(c => lead[c.key as keyof Lead] != null)
  const [form, setForm] = useState<Record<string, string>>(() =>
    Object.fromEntries(CAMPOS_IMOVEL.map(c => [c.key, (lead[c.key as keyof Lead] as string) ?? '']))
  )
  const [dirty, setDirty] = useState(false)
  const [editando, setEditando] = useState(false)

  function set(k: string, v: string) {
    setForm(f => ({ ...f, [k]: v }))
    setDirty(true)
  }
  function salvar() {
    const patch: Record<string, string | null> = {}
    for (const c of CAMPOS_IMOVEL) patch[c.key] = form[c.key] || null
    editar.mutate({ id: lead.id, ...patch as any }, { onSuccess: () => { setDirty(false); setEditando(false) } })
  }

  if (!temDados && !editando) {
    return (
      <div className="bg-white border border-dashed border-gray-200 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Imóvel</p>
          <button onClick={() => setEditando(true)} className="flex items-center gap-1 text-xs text-[#253B29] hover:underline font-medium">
            <Plus className="h-3 w-3" /> Informar Imóvel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-100 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Imóvel</p>
        <div className="flex items-center gap-2">
          {dirty && (
            <Button size="sm" className="h-7 text-xs gap-1 bg-[#253B29] hover:bg-[#1a2b1e] text-white" onClick={salvar} disabled={editar.isPending}>
              {editar.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
              Salvar
            </Button>
          )}
          {!editando && (
            <button onClick={() => setEditando(true)} className="text-xs text-gray-400 hover:text-[#253B29] flex items-center gap-0.5">
              <Pencil className="h-3 w-3" /> Editar
            </button>
          )}
        </div>
      </div>
      {editando ? (
        <div className="grid grid-cols-2 gap-2.5">
          {CAMPOS_IMOVEL.map(c => (
            <div key={c.key}>
              <Label className="text-xs text-gray-500">{c.label}</Label>
              {c.tipo === 'select' ? (
                <Select value={form[c.key]} onValueChange={v => set(c.key, v)}>
                  <SelectTrigger className="h-8 text-sm mt-1"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                  <SelectContent>
                    {(c as any).opcoes?.map((o: any) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <Input className="h-8 text-sm mt-1" value={form[c.key]} onChange={e => set(c.key, e.target.value)} />
              )}
            </div>
          ))}
          <div className="col-span-2 flex justify-end gap-2">
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setEditando(false)}>Cancelar</Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-x-6 gap-y-2">
          {CAMPOS_IMOVEL.map(c => {
            const val = lead[c.key as keyof Lead] as string | null
            if (!val) return null
            const label = c.tipo === 'select'
              ? (c as any).opcoes?.find((o: any) => o.value === val)?.label ?? val
              : val
            return (
              <div key={c.key}>
                <p className="text-xs text-gray-400 mb-0.5">{c.label}</p>
                <p className="text-sm font-medium text-gray-800">{label}</p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── BlocoVendedor ─────────────────────────────────────────────

function BlocoVendedor({ lead, onAbrirVendedorPessoa }: {
  lead: Lead
  onAbrirVendedorPessoa?: () => void
}) {
  const editar = useEditarLead()
  const qc = useQueryClient()
  const { usuario } = useAuth()
  const supabaseClient = createClient()

  const [buscando, setBuscando] = useState(false)
  const [termoBusca, setTermoBusca] = useState('')
  const [resultados, setResultados] = useState<PessoaResultado[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [criandoNovo, setCriandoNovo] = useState(false)
  const [novoNome, setNovoNome] = useState('')
  const [novoCpf, setNovoCpf] = useState('')
  const [vendedorDrawerAberto, setVendedorDrawerAberto] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const vendedorPessoa = lead.vendedor_pessoa

  useEffect(() => {
    if (termoBusca.length < 2) { setResultados([]); setShowDropdown(false); return }
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      if (!usuario?.empresa_id) return
      setBuscando(true)
      const q = `%${termoBusca}%`
      const { data } = await supabaseClient
        .from('pessoas')
        .select('id, nome, cpf')
        .eq('empresa_id', usuario.empresa_id)
        .is('deleted_at', null)
        .or(`nome.ilike.${q},cpf.ilike.${q}`)
        .order('nome')
        .limit(10)
      setResultados((data ?? []) as PessoaResultado[])
      setShowDropdown(true)
      setBuscando(false)
    }, 250)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [termoBusca, usuario?.empresa_id])

  async function vincularVendedor(pessoaId: string) {
    await editar.mutateAsync({ id: lead.id, vendedor_pessoa_id: pessoaId })
    qc.invalidateQueries({ queryKey: ['leads', lead.id] })
    setTermoBusca('')
    setShowDropdown(false)
  }

  async function desvincularVendedor() {
    editar.mutate({ id: lead.id, vendedor_pessoa_id: null })
  }

  async function criarNovoVendedor() {
    if (!novoNome.trim() || !usuario?.empresa_id) return
    setCriandoNovo(false)
    const { data: novaPessoa } = await supabaseClient
      .from('pessoas')
      .insert({
        empresa_id: usuario.empresa_id,
        nome: novoNome.trim(),
        cpf: novoCpf.replace(/\D/g, '') || null,
        tipo: 'cliente',
      })
      .select('id')
      .single()
    if (novaPessoa) {
      await editar.mutateAsync({ id: lead.id, vendedor_pessoa_id: novaPessoa.id })
      qc.invalidateQueries({ queryKey: ['leads', lead.id] })
      setVendedorDrawerAberto(novaPessoa.id)
    }
    setNovoNome('')
    setNovoCpf('')
  }

  // Estado: pessoa vinculada
  if (vendedorPessoa) {
    return (
      <>
        <div className="bg-white border border-gray-100 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Vendedor</p>
            <button onClick={desvincularVendedor} className="text-xs text-gray-300 hover:text-red-400">
              Desvincular
            </button>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-amber-600 flex items-center justify-center shrink-0">
              <span className="text-xs font-bold text-white">{iniciais(vendedorPessoa.nome)}</span>
            </div>
            <div className="flex-1 min-w-0">
              <button
                onClick={onAbrirVendedorPessoa}
                className="text-sm font-semibold text-[#253B29] hover:underline flex items-center gap-1 text-left"
              >
                {vendedorPessoa.nome}
                <ExternalLink className="h-3 w-3 opacity-40 shrink-0" />
              </button>
              {vendedorPessoa.cpf && <p className="text-xs text-gray-500">{vendedorPessoa.cpf}</p>}
            </div>
          </div>
        </div>

        {/* Drawer cadastro vendedor */}
        <CompletarDadosPessoaDrawer
          pessoaId={vendedorDrawerAberto ?? lead.vendedor_pessoa_id ?? null}
          open={!!vendedorDrawerAberto || (onAbrirVendedorPessoa ? false : false)}
          onClose={() => setVendedorDrawerAberto(null)}
          origemAuditoria="leads"
        />
      </>
    )
  }

  // Estado: sem vendedor — busca
  return (
    <>
      <div className="bg-white border border-dashed border-gray-200 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Vendedor</p>
        </div>

        {/* Campo de busca */}
        <div className="relative">
          <div className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2 focus-within:border-[#253B29] transition-colors">
            {buscando
              ? <Loader2 className="h-3.5 w-3.5 text-gray-400 shrink-0 animate-spin" />
              : <Search className="h-3.5 w-3.5 text-gray-400 shrink-0" />
            }
            <input
              ref={inputRef}
              className="flex-1 text-sm outline-none bg-transparent placeholder:text-gray-400"
              placeholder="Buscar vendedor por nome ou CPF..."
              value={termoBusca}
              onChange={e => setTermoBusca(e.target.value)}
              onFocus={() => { if (resultados.length > 0) setShowDropdown(true) }}
              onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
            />
            {termoBusca && (
              <button onClick={() => { setTermoBusca(''); setShowDropdown(false) }} className="text-gray-300 hover:text-gray-500">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Dropdown resultados */}
          {showDropdown && (
            <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
              {resultados.length === 0 ? (
                <div className="px-3 py-2.5 text-xs text-gray-400">Nenhum resultado encontrado</div>
              ) : (
                resultados.map(p => (
                  <button
                    key={p.id}
                    onMouseDown={() => vincularVendedor(p.id)}
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-left transition-colors"
                  >
                    <div className="w-6 h-6 rounded-full bg-amber-600 flex items-center justify-center shrink-0">
                      <span className="text-[9px] font-bold text-white">{iniciais(p.nome)}</span>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-800">{p.nome}</p>
                      {p.cpf && <p className="text-[10px] text-gray-400">{p.cpf}</p>}
                    </div>
                  </button>
                ))
              )}
              <div className="border-t border-gray-100">
                <button
                  onMouseDown={() => { setShowDropdown(false); setCriandoNovo(true); setNovoNome(termoBusca) }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-[#253B29] font-medium hover:bg-gray-50 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" /> Criar novo vendedor
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Link direto criar novo se sem termo */}
        {!termoBusca && (
          <button
            onClick={() => setCriandoNovo(true)}
            className="mt-2 flex items-center gap-1 text-xs text-[#253B29] hover:underline font-medium"
          >
            <Plus className="h-3 w-3" /> Criar novo vendedor
          </button>
        )}
      </div>

      {/* Dialog criar novo vendedor */}
      {criandoNovo && (
        <Dialog open onOpenChange={v => { if (!v) setCriandoNovo(false) }}>
          <DialogContent className="max-w-sm p-6">
            <h2 className="text-base font-semibold text-[#253B29] mb-1">Novo Vendedor</h2>
            <p className="text-xs text-gray-500 mb-4">Dados básicos para criar o cadastro. Você poderá completar depois.</p>
            <div className="space-y-3">
              <div>
                <Label className="text-xs text-gray-500">Nome completo *</Label>
                <Input className="h-8 text-sm mt-1" value={novoNome} onChange={e => setNovoNome(e.target.value)} autoFocus />
              </div>
              <div>
                <Label className="text-xs text-gray-500">CPF</Label>
                <Input className="h-8 text-sm mt-1" placeholder="000.000.000-00" value={novoCpf} onChange={e => setNovoCpf(e.target.value)} />
              </div>
            </div>
            <p className="text-[10px] text-gray-400 mt-3">
              Após salvar, o cadastro completo do vendedor abrirá automaticamente.
            </p>
            <div className="flex gap-2 justify-end mt-4">
              <Button variant="outline" size="sm" onClick={() => setCriandoNovo(false)}>Cancelar</Button>
              <Button
                size="sm"
                className="bg-[#253B29] hover:bg-[#1a2b1e] text-white"
                onClick={criarNovoVendedor}
                disabled={!novoNome.trim() || editar.isPending}
              >
                {editar.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
                Salvar e completar cadastro
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Drawer para novo vendedor criado */}
      <CompletarDadosPessoaDrawer
        pessoaId={vendedorDrawerAberto}
        open={!!vendedorDrawerAberto}
        onClose={() => setVendedorDrawerAberto(null)}
        origemAuditoria="leads"
      />
    </>
  )
}

// ── BlocoOrigem ───────────────────────────────────────────────

function BlocoOrigem({ origem, onChange, saving }: {
  origem: Lead['origem']; onChange: (o: string) => void; saving: boolean
}) {
  return (
    <div className="bg-white border border-gray-100 rounded-lg p-4 space-y-3">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Origem</p>
      <Select value={origem} onValueChange={onChange} disabled={saving}>
        <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
        <SelectContent>
          {ORIGENS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  )
}

// ── BlocoParceirosLead ────────────────────────────────────────

function BlocoParceirosLead({ leadId }: { leadId: string }) {
  const supabaseClient = createClient()
  const qc = useQueryClient()
  const [addingCorretor,    setAddingCorretor]    = useState(false)
  const [addingImobiliaria, setAddingImobiliaria] = useState(false)
  const [addingParceiro,    setAddingParceiro]    = useState(false)

  const { data: corretores = [] } = useQuery({
    queryKey: ['lead-corretores', leadId],
    queryFn: async () => {
      const { data } = await supabaseClient.from('lead_corretores').select('id, corretor_id, corretor:corretores(id, nome, creci)').eq('lead_id', leadId)
      return (data ?? []) as unknown as CorretorVinculado[]
    },
  })
  const { data: imobiliarias = [] } = useQuery({
    queryKey: ['lead-imobiliarias', leadId],
    queryFn: async () => {
      const { data } = await supabaseClient.from('lead_imobiliarias').select('id, imobiliaria_id, papel, imobiliaria:imobiliarias(id, nome, tipo)').eq('lead_id', leadId)
      return (data ?? []) as unknown as ImobiliariaVinculada[]
    },
  })
  const { data: parceiros = [] } = useQuery({
    queryKey: ['lead-parceiros', leadId],
    queryFn: async () => {
      const { data } = await supabaseClient.from('lead_parceiros').select('id, parceiro_id, parceiro:parceiros(id, nome, tipo)').eq('lead_id', leadId)
      return (data ?? []) as unknown as ParceiroVinculado[]
    },
  })
  const { data: todosCorretores = [] } = useQuery({
    queryKey: ['corretores-lista'],
    queryFn: async () => {
      const { data } = await supabaseClient.from('corretores').select('id, nome, creci').eq('ativo', true).order('nome')
      return (data ?? []) as { id: string; nome: string; creci: string | null }[]
    },
  })
  const { data: todasImobiliarias = [] } = useQuery({
    queryKey: ['imobiliarias-lista'],
    queryFn: async () => {
      const { data } = await supabaseClient.from('imobiliarias').select('id, nome, tipo').eq('ativo', true).order('nome')
      return (data ?? []) as { id: string; nome: string; tipo: string }[]
    },
  })
  const { data: todosParceiros = [] } = useQuery({
    queryKey: ['parceiros-lista'],
    queryFn: async () => {
      const { data } = await supabaseClient.from('parceiros').select('id, nome, tipo').eq('ativo', true).order('nome')
      return (data ?? []) as { id: string; nome: string; tipo: string }[]
    },
  })

  async function vincularCorretor(id: string) {
    await supabaseClient.from('lead_corretores').insert({ lead_id: leadId, corretor_id: id })
    qc.invalidateQueries({ queryKey: ['lead-corretores', leadId] }); setAddingCorretor(false)
  }
  async function vincularImobiliaria(id: string) {
    const imob = todasImobiliarias.find(i => i.id === id)
    const papel = imob?.tipo === 'construtora' ? 'construtora' : 'imobiliaria'
    await supabaseClient.from('lead_imobiliarias').insert({ lead_id: leadId, imobiliaria_id: id, papel })
    qc.invalidateQueries({ queryKey: ['lead-imobiliarias', leadId] }); setAddingImobiliaria(false)
  }
  async function vincularParceiro(id: string) {
    await supabaseClient.from('lead_parceiros').insert({ lead_id: leadId, parceiro_id: id })
    qc.invalidateQueries({ queryKey: ['lead-parceiros', leadId] }); setAddingParceiro(false)
  }
  async function removerCorretor(id: string) {
    await supabaseClient.from('lead_corretores').delete().eq('id', id)
    qc.invalidateQueries({ queryKey: ['lead-corretores', leadId] })
  }
  async function removerImobiliaria(id: string) {
    await supabaseClient.from('lead_imobiliarias').delete().eq('id', id)
    qc.invalidateQueries({ queryKey: ['lead-imobiliarias', leadId] })
  }
  async function removerParceiro(id: string) {
    await supabaseClient.from('lead_parceiros').delete().eq('id', id)
    qc.invalidateQueries({ queryKey: ['lead-parceiros', leadId] })
  }

  const corretoresDisp   = todosCorretores.filter(c => !corretores.find(v => v.corretor_id === c.id))
  const imobiliariasDisp = todasImobiliarias.filter(i => !imobiliarias.find(v => v.imobiliaria_id === i.id))
  const parceirosDisp    = todosParceiros.filter(p => !parceiros.find(v => v.parceiro_id === p.id))

  return (
    <div className="bg-white border border-gray-100 rounded-lg p-4 space-y-4">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Parceiros</p>
      <ParceirosSecao
        label="Corretor" icon={<User className="h-3.5 w-3.5" />}
        items={corretores.map(c => ({ id: c.id, nome: c.corretor.nome, sub: c.corretor.creci ? `CRECI: ${c.corretor.creci}` : undefined }))}
        onRemover={removerCorretor} adicionando={addingCorretor}
        onAbrirAdicionar={() => setAddingCorretor(true)} onFecharAdicionar={() => setAddingCorretor(false)}
        disponiveis={corretoresDisp.map(c => ({ id: c.id, label: c.nome }))} onSelecionar={vincularCorretor}
      />
      <ParceirosSecao
        label="Imobiliária / Construtora" icon={<Building2 className="h-3.5 w-3.5" />}
        items={imobiliarias.map(i => ({ id: i.id, nome: i.imobiliaria.nome, sub: i.papel === 'construtora' ? 'Construtora' : 'Imobiliária' }))}
        onRemover={removerImobiliaria} adicionando={addingImobiliaria}
        onAbrirAdicionar={() => setAddingImobiliaria(true)} onFecharAdicionar={() => setAddingImobiliaria(false)}
        disponiveis={imobiliariasDisp.map(i => ({ id: i.id, label: i.nome }))} onSelecionar={vincularImobiliaria}
      />
      <ParceirosSecao
        label="Parceiro Comercial" icon={<Handshake className="h-3.5 w-3.5" />}
        items={parceiros.map(p => ({ id: p.id, nome: p.parceiro.nome, sub: p.parceiro.tipo === 'pessoa_fisica' ? 'Pessoa Física' : 'Empresa' }))}
        onRemover={removerParceiro} adicionando={addingParceiro}
        onAbrirAdicionar={() => setAddingParceiro(true)} onFecharAdicionar={() => setAddingParceiro(false)}
        disponiveis={parceirosDisp.map(p => ({ id: p.id, label: p.nome }))} onSelecionar={vincularParceiro}
      />
    </div>
  )
}

// ── ParceirosSecao ────────────────────────────────────────────

function ParceirosSecao({ label, icon, items, onRemover, adicionando, onAbrirAdicionar, onFecharAdicionar, disponiveis, onSelecionar }: {
  label: string; icon: React.ReactNode
  items: { id: string; nome: string; sub?: string }[]
  onRemover: (id: string) => void
  adicionando: boolean; onAbrirAdicionar: () => void; onFecharAdicionar: () => void
  disponiveis: { id: string; label: string }[]; onSelecionar: (id: string) => void
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          {icon}
          <span className="font-medium">{label}</span>
        </div>
        <button onClick={onAbrirAdicionar} className="flex items-center gap-0.5 text-xs text-[#253B29] hover:underline">
          <Plus className="h-3 w-3" /> Vincular
        </button>
      </div>
      {items.length === 0 && !adicionando && <p className="text-xs text-gray-300 italic">Nenhum vinculado</p>}
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
              {disponiveis.length === 0
                ? <div className="px-2 py-1.5 text-xs text-gray-400">Nenhum disponível</div>
                : disponiveis.map(d => <SelectItem key={d.id} value={d.id} className="text-xs">{d.label}</SelectItem>)
              }
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

// ── ConjugeEditarDialog ───────────────────────────────────────

function ConjugeEditarDialog({ lead, onClose, onCriarPessoa }: {
  lead: Lead; onClose: () => void; onCriarPessoa?: () => void
}) {
  const editar = useEditarLead()
  const [form, setForm] = useState({
    conjuge_nome:            lead.conjuge_nome            ?? '',
    conjuge_cpf:             lead.conjuge_cpf             ?? '',
    conjuge_data_nascimento: lead.conjuge_data_nascimento ?? '',
  })
  function salvar() {
    editar.mutate({
      id: lead.id,
      conjuge_nome:            form.conjuge_nome || null,
      conjuge_cpf:             form.conjuge_cpf.replace(/\D/g, '') || null,
      conjuge_data_nascimento: form.conjuge_data_nascimento || null,
    }, { onSuccess: onClose })
  }
  return (
    <Dialog open onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-sm p-6">
        <h2 className="text-base font-semibold text-[#253B29] mb-4">Dados do Cônjuge</h2>
        <div className="space-y-3">
          <div>
            <Label className="text-xs text-gray-500">Nome completo</Label>
            <Input className="h-8 text-sm mt-1" value={form.conjuge_nome} onChange={e => setForm(f => ({ ...f, conjuge_nome: e.target.value }))} />
          </div>
          <div>
            <Label className="text-xs text-gray-500">CPF</Label>
            <Input className="h-8 text-sm mt-1" placeholder="000.000.000-00" value={form.conjuge_cpf} onChange={e => setForm(f => ({ ...f, conjuge_cpf: e.target.value }))} />
          </div>
          <div>
            <Label className="text-xs text-gray-500">Data de Nascimento</Label>
            <Input className="h-8 text-sm mt-1" type="date" value={form.conjuge_data_nascimento} onChange={e => setForm(f => ({ ...f, conjuge_data_nascimento: e.target.value }))} />
          </div>
        </div>
        <div className="flex justify-between items-center mt-5">
          {onCriarPessoa && (
            <Button variant="outline" size="sm" className="text-xs gap-1 text-[#253B29] border-[#253B29]/30" onClick={() => { salvar(); onCriarPessoa() }}>
              <Plus className="h-3 w-3" /> Criar cadastro completo
            </Button>
          )}
          <div className="flex gap-2 ml-auto">
            <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
            <Button size="sm" className="bg-[#253B29] hover:bg-[#1a2b1e] text-white" onClick={salvar} disabled={editar.isPending}>
              {editar.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
              Salvar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
