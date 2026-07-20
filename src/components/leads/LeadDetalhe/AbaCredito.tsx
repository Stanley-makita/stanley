'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { supabase } from '@/lib/supabase'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useEditarLead } from '@/hooks/leads/useEditarLead'
import { useAnalisesCredito } from '@/hooks/leads/useAnalisesCredito'
import { useFaseStatuses } from '@/app/(protected)/configuracoes/_hooks/useFaseStatuses'
import { useFases } from '@/hooks/configuracoes/useFases'
import type { Lead, LeadAnaliseCredito, StatusAnaliseCredito } from '@/types/leads'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { InputMoeda } from '@/components/ui/input-moeda'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { cn, normalizarTexto } from '@/lib/utils'
import {
  Save, User, Building2, Handshake, Loader2, X, Plus, Check,
  ClipboardList, ExternalLink, Pencil, Search, Home, TrendingUp, Banknote,
} from 'lucide-react'
import { CompletarDadosPessoaDrawer } from '@/components/pessoas/CompletarDadosPessoaDrawer'
import { BlocoImovelLead } from '@/components/leads/BlocoImovelLead'
import { useAuth } from '@/hooks/auth/useAuth'
import { ValidadeCard } from '@/components/processos/detalhe/ValidadeCard'

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
  const { analises } = useAnalisesCredito(lead.id)
  const analiseDefinida = analises.find(a => a.banco_definido) ?? null
  // Trava de obrigatoriedade (Data da Aprovação + Validade do Crédito) só entra
  // em vigor quando alguma análise está com banco definido E status aprovado —
  // condição mais estrita que a de exibição do card acima (só banco_definido).
  const exigeAprovacao = analises.some(a => a.banco_definido && a.status === 'aprovado')
  const [gatilhoValidade, setGatilhoValidade] = useState(0)
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

  const rendaTotal = (lead.renda_formal ?? 0) + (lead.renda_informal ?? 0)

  return (
    <div className="space-y-5">

      {/* 1. KPIs financeiros */}
      <div className="grid grid-cols-3 gap-2">
        <KpiMetrica
          icone={<Home className="h-3.5 w-3.5" />}
          label="Valor do Imóvel"
          valor={lead.valor_imovel}
          sub={lead.tipo_imovel ?? undefined}
          cor="blue"
        />
        <KpiMetrica
          icone={<TrendingUp className="h-3.5 w-3.5" />}
          label="Valor Pretendido"
          valor={lead.valor_pretendido}
          sub={lead.produto_interesse ?? undefined}
          cor="gold"
        />
        <KpiMetrica
          icone={<Banknote className="h-3.5 w-3.5" />}
          label="Renda Total"
          valor={rendaTotal > 0 ? rendaTotal : null}
          sub={rendaTotal > 0 ? `F: ${fmtMoeda(lead.renda_formal)} + I: ${fmtMoeda(lead.renda_informal)}` : undefined}
          cor="gray"
        />
      </div>

      {/* 2. Status da fase + Validade + Produto (linha compacta).
          Sem análise decisiva (Status da Fase ainda é o controle manual):
          3 colunas. Com análise decisiva (status já sincronizado, card some
          por completo — sem espaço vazio): 2 colunas. */}
      <div className={cn('grid grid-cols-1 gap-3', analiseDefinida ? 'sm:grid-cols-2' : 'sm:grid-cols-3')}>
        {!analiseDefinida && <StatusFase lead={lead} />}
        <ValidadeCard
          label="Validade do Crédito"
          data={lead.validade_credito}
          onSalvar={async (data) => { await editar.mutateAsync({ id: lead.id, validade_credito: data }) }}
          isPending={editar.isPending}
          atalho={{ texto: '+90 dias (padrão crédito)', dias: 90 }}
          abrirGatilho={gatilhoValidade}
        />
        <BlocoProduto lead={lead} />
      </div>

      {/* 3. Participantes */}
      <BlocoParticipantes
        lead={lead}
        onCompletarPessoa={lead.pessoa_id ? () => setCompletarPessoaAberto(true) : undefined}
        onAbrirConjugePessoa={lead.conjuge_pessoa_id ? () => setConjugePessoaDrawer(lead.conjuge_pessoa_id) : undefined}
        onEditarConjuge={() => setConjugeDialogAberto(true)}
        onDesvincularConjuge={lead.conjuge_pessoa_id ? desvincularConjuge : undefined}
        onCriarConjuge={vincularCriarConjuge}
      />

      {/* 4. Análises de Crédito */}
      <BlocoAnalises leadId={lead.id} empresaId={lead.empresa_id} responsavelId={lead.responsavel_id ?? null} />

      {/* 5. Aprovação de Crédito */}
      <BlocoAprovacaoCredito
        lead={lead}
        analiseDefinida={analiseDefinida}
        exigeAprovacao={exigeAprovacao}
        onSalvo={() => { if (!lead.validade_credito) setGatilhoValidade((g) => g + 1) }}
      />

      {/* 5+6. Imóvel e Vendedor lado a lado */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <BlocoImovelLead lead={lead} />
        <BlocoVendedor
          lead={lead}
          onAbrirVendedorPessoa={lead.vendedor_pessoa_id ? () => setVendedorPessoaDrawer(lead.vendedor_pessoa_id) : undefined}
        />
      </div>

      {/* 6. Origem + Parceiros */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

// ── KpiMetrica ────────────────────────────────────────────────

function KpiMetrica({ icone, label, valor, sub, cor }: {
  icone: React.ReactNode
  label: string
  valor: number | null | undefined
  sub?: string
  cor: 'blue' | 'gold' | 'gray'
}) {
  const cores = {
    blue: 'bg-blue-50 text-blue-600',
    gold: 'bg-fonti-surface-warm text-fonti-accent',
    gray: 'bg-gray-50 text-gray-500',
  }
  return (
    <div className="border border-gray-200 rounded-xl p-3 bg-white shadow-sm">
      <div className="flex items-center gap-1.5 mb-1.5">
        <div className={cn('w-6 h-6 rounded-md flex items-center justify-center shrink-0', cores[cor])}>
          {icone}
        </div>
        <p className="text-[10px] text-gray-400 font-medium leading-tight">{label}</p>
      </div>
      <p className="text-base font-bold text-fonti-primary leading-none">
        {valor != null ? fmtMoeda(valor) : '—'}
      </p>
      {sub && <p className="text-[10px] text-gray-400 mt-1 truncate">{sub}</p>}
    </div>
  )
}

// ── StatusFase ────────────────────────────────────────────────

function StatusFase({ lead }: { lead: Lead }) {
  const editar = useEditarLead()
  const { data: statuses = [], isLoading } = useFaseStatuses(lead.fase_id)
  const { data: fases = [] } = useFases('leads')
  // Não usar lead.fase?.nome (join) — cruza a lista de fases (sempre
  // populada) com o fase_id cru, mesmo padrão já usado em outros pontos.
  const faseAtualNome = fases.find(f => f.id === lead.fase_id)?.nome
  // Em "Concluído" o status válido é o último definido (normalmente em
  // Análise de Crédito) — não faz sentido reabrir o seletor aqui, já que essa
  // fase não tem (nem deveria ter) sua própria lista de status configurada.
  // O último status já aparece em destaque no cabeçalho (ver LeadDetalheModal).
  if (normalizarTexto(faseAtualNome) === normalizarTexto('Concluído')) return null
  if (isLoading) return null
  if (statuses.length === 0) {
    return (
      <div className="bg-white border border-gray-300 rounded-xl shadow p-4">
        <p className="text-[11px] font-bold text-fonti-primary uppercase tracking-widest border-b border-gray-100 pb-2 mb-2">Status da Fase</p>
        <p className="text-xs text-gray-400 italic">
          Nenhum status configurado.{' '}
          <a href="/configuracoes" className="text-fonti-accent hover:underline">Configurar em Configurações → Fases</a>
        </p>
      </div>
    )
  }
  return (
    <div className="bg-white border border-gray-300 rounded-xl shadow p-4">
      <p className="text-[11px] font-bold text-fonti-primary uppercase tracking-widest border-b border-gray-100 pb-2 mb-3">Status da Fase</p>
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

  // Se há pessoa vinculada como cônjuge, a renda vem dela; caso contrário usa leads.conjuge_renda_*
  const rendaConjugeFonteFormal   = lead.conjuge_pessoa?.renda_formal   ?? lead.conjuge_renda_formal
  const rendaConjugeFonteInformal = lead.conjuge_pessoa?.renda_informal ?? lead.conjuge_renda_informal

  // Sincroniza estado local quando o lead prop muda (após save ou refetch)
  const [conjFormal,   setConjFormal]   = useState(fmtMoedaInput(rendaConjugeFonteFormal))
  const [conjInformal, setConjInformal] = useState(fmtMoedaInput(rendaConjugeFonteInformal))
  const [conjDirty,    setConjDirty]    = useState(false)
  const [rendaConsiderada, setRendaConsiderada] = useState(fmtMoedaInput(lead.renda_considerada))
  const [rcDirty, setRcDirty] = useState(false)

  // Resincroniza quando os valores mudam (da pessoa vinculada ou dos campos do lead)
  useEffect(() => {
    if (!conjDirty) {
      setConjFormal(fmtMoedaInput(rendaConjugeFonteFormal))
      setConjInformal(fmtMoedaInput(rendaConjugeFonteInformal))
    }
  }, [rendaConjugeFonteFormal, rendaConjugeFonteInformal])

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
    <div className="bg-white border border-gray-300 rounded-xl shadow overflow-hidden">

      {/* ── Comprador ── */}
      <div className="px-4 pt-3 pb-2">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Comprador</p>
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-full bg-fonti-primary flex items-center justify-center shrink-0 mt-0.5">
            <span className="text-xs font-bold text-white">{iniciais(lead.nome)}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {onCompletarPessoa ? (
                <button onClick={onCompletarPessoa} className="text-sm font-semibold text-fonti-primary hover:underline flex items-center gap-1 text-left">
                  {lead.nome}
                  <ExternalLink className="h-3 w-3 opacity-40 shrink-0" />
                </button>
              ) : (
                <p className="text-sm font-semibold text-gray-800">{lead.nome}</p>
              )}
              {onCompletarPessoa && (
                <button onClick={onCompletarPessoa} className="flex items-center gap-0.5 text-[10px] text-gray-400 hover:text-fonti-primary">
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

        <div className="ml-12 mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
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
                      <button onClick={onEditarConjuge} className="flex items-center gap-0.5 text-[10px] text-gray-400 hover:text-fonti-primary">
                        <Pencil className="h-2.5 w-2.5" /> Editar
                      </button>
                    )}
                    {nomeConjuge && (
                      <button onClick={onCriarConjuge} className="flex items-center gap-0.5 text-[10px] text-fonti-primary hover:underline font-medium">
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
                      <button onClick={onAbrirConjugePessoa} className="text-sm font-semibold text-fonti-primary hover:underline flex items-center gap-1">
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

                {/* Renda cônjuge */}
                <div className="ml-12 mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {lead.conjuge_pessoa_id ? (
                    // Pessoa vinculada: renda vem do cadastro dela (somente leitura aqui)
                    <>
                      <RendaCampo label="Formal"   valor={fmtMoedaValor(rendaConjugeFonteFormal   || null)} />
                      <RendaCampo label="Informal" valor={fmtMoedaValor(rendaConjugeFonteInformal || null)} />
                      <RendaCampo label="Total"    valor={fmtMoedaValor(totalConjuge || null)} destaque />
                    </>
                  ) : (
                    // Sem pessoa vinculada: editável nos campos do lead
                    <>
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
                    </>
                  )}
                </div>
                {conjDirty && !lead.conjuge_pessoa_id && (
                  <div className="ml-12 mt-1">
                    <button onClick={salvarRendaConjuge} className="flex items-center gap-1 text-[10px] text-fonti-primary hover:underline">
                      {editar.isPending
                        ? <Loader2 className="h-2.5 w-2.5 animate-spin" />
                        : <Save className="h-2.5 w-2.5" />
                      }
                      Salvar renda
                    </button>
                  </div>
                )}
                {lead.conjuge_pessoa_id && (rendaConjugeFonteFormal == null && rendaConjugeFonteInformal == null) && (
                  <p className="ml-12 mt-1 text-[10px] text-gray-400 italic">
                    Cadastre a renda no perfil do cônjuge (clique no nome acima)
                  </p>
                )}
              </>
            ) : (
              <button onClick={onEditarConjuge} className="flex items-center gap-1 text-xs text-fonti-primary font-medium hover:underline">
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
            <p className="text-lg font-bold text-fonti-primary">{fmtMoedaValor(rendaTotal)}</p>
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
                <button onClick={salvarRendaConsiderada} className="text-fonti-primary hover:opacity-70 shrink-0">
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
      <p className={cn('text-xs font-semibold', destaque ? 'text-fonti-primary' : 'text-gray-700')}>{valor}</p>
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

// ── BlocoProduto ──────────────────────────────────────────────

function BlocoProduto({ lead }: { lead: Lead }) {
  const editar = useEditarLead()
  return (
    <div className="bg-white border border-gray-300 rounded-xl shadow p-4">
      <p className="text-[11px] font-bold text-fonti-primary uppercase tracking-widest border-b border-gray-100 pb-2 mb-3">Produto de Interesse</p>
      <Select
        value={lead.produto_interesse ?? ''}
        onValueChange={v => editar.mutate({ id: lead.id, produto_interesse: (v as Lead['produto_interesse']) || null })}
        disabled={editar.isPending}
      >
        <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Selecionar produto..." /></SelectTrigger>
        <SelectContent>
          <SelectItem value="financiamento">Financiamento Imobiliário</SelectItem>
          <SelectItem value="consorcio">Consórcio</SelectItem>
          <SelectItem value="cgi">CGI</SelectItem>
          <SelectItem value="portabilidade">Portabilidade</SelectItem>
          <SelectItem value="contrato">Contrato</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}

// ── Constante status ──────────────────────────────────────────

const STATUS_ANALISE: Record<StatusAnaliseCredito, { label: string; classe: string }> = {
  em_analise: { label: 'Em Análise', classe: 'bg-amber-50  border-amber-200  text-amber-700'  },
  aprovado:   { label: 'Aprovado',   classe: 'bg-green-50  border-green-200  text-green-700'  },
  recusado:   { label: 'Recusado',   classe: 'bg-red-50    border-red-200    text-red-700'    },
  pendente:   { label: 'Pendente',   classe: 'bg-gray-50   border-gray-200   text-gray-500'   },
}

// ── BlocoAnalises ─────────────────────────────────────────────

function BlocoAnalises({ leadId, empresaId, responsavelId }: { leadId: string; empresaId: string; responsavelId: string | null }) {
  const { analises, isLoading, criar, editar, deletar, definirBanco } = useAnalisesCredito(leadId)
  const [criando, setCriando] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const qc = useQueryClient()

  // Crédito recusado pode reverter (tentar outro banco) — dispara um
  // acompanhamento mais espaçado (10 dias, sem escalonar pra gestores),
  // separado do acompanhamento de "aprovado sem processo" (3 dias, que
  // começa em ModalConcluirLead.tsx). Se a análise decisiva deixar de estar
  // recusada, encerra esse acompanhamento (situação revertida).
  async function gerenciarFollowupRecusado(status: StatusAnaliseCredito) {
    if (status === 'recusado') {
      await supabase.from('lead_followups').upsert(
        {
          empresa_id:          empresaId,
          lead_id:             leadId,
          responsavel_id:      responsavelId,
          status:              'ativo',
          tipo:                'recusado_retry',
          intervalo_dias:      10,
          proxima_notificacao: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
          dias_sem_processo:   0,
        },
        { onConflict: 'lead_id', ignoreDuplicates: false }
      )
      await supabase.rpc('registrar_interacao_lead', {
        p_lead_id: leadId,
        p_descricao: 'Acompanhamento automático iniciado — crédito recusado, aguardando nova tentativa ou decisão.',
        p_tipo: 'followup_iniciado',
      })
      toast.info('Acompanhamento iniciado', {
        description: 'O Fonti enviará lembretes ao comercial a cada 10 dias enquanto o crédito estiver recusado.',
      })
    } else {
      await supabase
        .from('lead_followups')
        .update({ status: 'encerrado', motivo_encerramento: 'situacao_revertida', encerrado_em: new Date().toISOString() })
        .eq('lead_id', leadId)
        .eq('tipo', 'recusado_retry')
        .eq('status', 'ativo')
    }
  }

  // Análise "banco definido" é a decisiva — seu status espelha automaticamente
  // o status do lead (card Status da Fase / badge do cabeçalho / Kanban).
  async function sincronizarStatusLead(status: StatusAnaliseCredito) {
    gerenciarFollowupRecusado(status)

    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) return
    try {
      await fetch(`/api/leads/${leadId}/sincronizar-status-credito`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status }),
      })
      // A sincronização acontece via API (não passa por useEditarLead), então
      // precisa invalidar manualmente pra badge do cabeçalho/Kanban/Tabela
      // atualizarem sem precisar recarregar a página.
      qc.invalidateQueries({ queryKey: ['leads'] })
    } catch {
      // Sincronização é um efeito colateral — falha aqui não deve travar a
      // edição do status da análise em si.
    }
  }

  function handleStatusChange(id: string, status: StatusAnaliseCredito) {
    const analise = analises.find(a => a.id === id)
    editar.mutate({ id, status }, {
      onSuccess: () => { if (analise?.banco_definido) sincronizarStatusLead(status) },
    })
  }

  // Ao marcar uma análise como decisiva, sincroniza imediatamente com o
  // status que ela já tiver — sem isso, só a próxima troca de status (se
  // houver) dispararia a sincronização, deixando o cabeçalho/Kanban
  // desatualizados logo após "Definir banco".
  function handleDefinirBanco(id: string) {
    const analise = analises.find(a => a.id === id)
    definirBanco.mutate(id, {
      onSuccess: () => { if (analise) sincronizarStatusLead(analise.status) },
    })
  }

  function handleDataRespostaChange(id: string, data_resposta: string | null) {
    editar.mutate({ id, data_resposta })
  }

  return (
    <div className="bg-white border border-gray-300 rounded-xl shadow p-4 space-y-3">
      <div className="flex items-center justify-between border-b border-gray-100 pb-2">
        <p className="text-[11px] font-bold text-fonti-primary uppercase tracking-widest">Análises de Crédito</p>
        <button
          onClick={() => { setCriando(true); setEditandoId(null) }}
          className="flex items-center gap-1 text-xs text-fonti-primary hover:underline font-medium"
        >
          <Plus className="h-3 w-3" /> Nova Análise
        </button>
      </div>

      {isLoading && <p className="text-xs text-gray-400">Carregando...</p>}

      {!isLoading && analises.length === 0 && !criando && (
        <p className="text-xs text-gray-400 italic">Nenhuma análise de crédito. Clique em "Nova Análise" para começar.</p>
      )}

      {analises.map((analise, i) =>
        editandoId === analise.id ? (
          <AnaliseForm
            key={analise.id}
            inicial={analise}
            onSalvar={async (campos) => {
              await editar.mutateAsync({ id: analise.id, ...campos })
              setEditandoId(null)
            }}
            onCancelar={() => setEditandoId(null)}
            isPending={editar.isPending}
          />
        ) : (
          <AnaliseCard
            key={analise.id}
            analise={analise}
            numero={i + 1}
            onEditar={() => { setEditandoId(analise.id); setCriando(false) }}
            onDeletar={() => deletar.mutate(analise.id)}
            onDefinirBanco={() => handleDefinirBanco(analise.id)}
            onStatusChange={(s) => handleStatusChange(analise.id, s)}
            onDataRespostaChange={(d) => handleDataRespostaChange(analise.id, d)}
            deletando={deletar.isPending}
            definindoBanco={definirBanco.isPending}
          />
        )
      )}

      {criando && (
        <AnaliseForm
          numero={analises.length + 1}
          onSalvar={async (campos) => {
            await criar.mutateAsync({ empresa_id: empresaId, lead_id: leadId, banco_definido: false, ...campos })
            setCriando(false)
          }}
          onCancelar={() => setCriando(false)}
          isPending={criar.isPending}
        />
      )}
    </div>
  )
}

// ── AnaliseCard ───────────────────────────────────────────────

function AnaliseCard({ analise, numero, onEditar, onDeletar, onDefinirBanco, onStatusChange, onDataRespostaChange, deletando, definindoBanco }: {
  analise: LeadAnaliseCredito
  numero: number
  onEditar: () => void
  onDeletar: () => void
  onDefinirBanco: () => void
  onStatusChange: (s: StatusAnaliseCredito) => void
  onDataRespostaChange: (d: string | null) => void
  deletando: boolean
  definindoBanco: boolean
}) {
  const [expandido, setExpandido] = useState(false)
  const statusCfg = STATUS_ANALISE[analise.status] ?? STATUS_ANALISE.em_analise

  return (
    <div
      className={cn(
        'border rounded-lg transition-colors',
        analise.banco_definido ? 'border-green-300 bg-green-50/30' : 'border-gray-200',
      )}
    >
      {/* ── Linha compacta (sempre visível) — clica para expandir ── */}
      <button
        type="button"
        className="w-full text-left px-3 py-2.5 flex items-center gap-2 group"
        onClick={() => setExpandido(v => !v)}
      >
        {/* Badge banco definido */}
        <span
          onClick={e => { e.stopPropagation(); onDefinirBanco() }}
          title={analise.banco_definido ? 'Banco definido' : 'Definir como banco escolhido'}
          className={cn(
            'flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0 transition-colors cursor-pointer',
            analise.banco_definido
              ? 'bg-green-100 border-green-400 text-green-700'
              : 'bg-white border-gray-300 text-gray-400 hover:border-fonti-primary hover:text-fonti-primary',
          )}
        >
          <span className={cn('w-2 h-2 rounded-full shrink-0', analise.banco_definido ? 'bg-green-500' : 'bg-gray-300')} />
          {analise.banco_definido ? 'Banco Definido' : 'Definir banco'}
        </span>

        {/* Nome + valores compactos */}
        <div className="flex-1 min-w-0 flex items-center gap-3 overflow-hidden">
          <p className="text-xs font-semibold text-gray-700 shrink-0">{analise.nome}</p>
          {analise.banco_pretendido && (
            <p className="text-xs text-gray-500 truncate">{analise.banco_pretendido}</p>
          )}
          {!expandido && (
            <>
              {analise.valor_imovel != null && (
                <span className="text-[11px] text-gray-400 shrink-0 hidden sm:inline">
                  Imóvel <span className="text-gray-600 font-medium">{fmtMoeda(analise.valor_imovel)}</span>
                </span>
              )}
              {analise.entrada != null && (
                <span className="text-[11px] text-gray-400 shrink-0 hidden sm:inline">
                  Entrada <span className="text-gray-600 font-medium">{fmtMoeda(analise.entrada)}</span>
                </span>
              )}
              {analise.valor_pretendido != null && analise.entrada == null && (
                <span className="text-[11px] text-gray-400 shrink-0 hidden sm:inline">
                  A Financiar <span className="text-gray-600 font-medium">{fmtMoeda(analise.valor_pretendido)}</span>
                </span>
              )}
              {/* Status badge compacto */}
              <span
                onClick={e => e.stopPropagation()}
                className="shrink-0"
              >
                <Select
                  value={analise.status}
                  onValueChange={(v) => onStatusChange(v as StatusAnaliseCredito)}
                >
                  <SelectTrigger className={cn(
                    'h-5 text-[10px] px-2 py-0 rounded-full border font-medium w-auto gap-0.5',
                    statusCfg.classe,
                  )}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.entries(STATUS_ANALISE) as [StatusAnaliseCredito, { label: string; classe: string }][]).map(([v, cfg]) => (
                      <SelectItem key={v} value={v} className="text-xs">{cfg.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </span>
            </>
          )}
        </div>

        {/* Ações — sem fechar card */}
        <div
          className="flex items-center gap-2 shrink-0"
          onClick={e => e.stopPropagation()}
        >
          <button
            onClick={onEditar}
            className="flex items-center gap-0.5 text-xs text-gray-400 hover:text-fonti-primary"
          >
            <Pencil className="h-3 w-3" /> Editar
          </button>
          <button
            onClick={onDeletar}
            disabled={deletando}
            className="text-gray-300 hover:text-red-400 disabled:opacity-50"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </button>

      {/* ── Detalhe expandido ── */}
      {expandido && (
        <div className="px-3 pb-3 pt-0 space-y-2.5 border-t border-gray-100">
          {/* Grid completo de campos */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5 pt-2.5">
            {analise.banco_pretendido && (
              <div>
                <p className="text-[10px] text-gray-400">Banco</p>
                <p className="text-xs font-medium text-gray-800">{analise.banco_pretendido}</p>
              </div>
            )}
            {analise.valor_imovel != null && (
              <div>
                <p className="text-[10px] text-gray-400">Valor Imóvel</p>
                <p className="text-xs font-medium text-gray-800">{fmtMoeda(analise.valor_imovel)}</p>
              </div>
            )}
            {analise.valor_pretendido != null && (
              <div>
                <p className="text-[10px] text-gray-400">A Financiar</p>
                <p className="text-xs font-medium text-gray-800">{fmtMoeda(analise.valor_pretendido)}</p>
              </div>
            )}
            {analise.entrada != null && (
              <div>
                <p className="text-[10px] text-gray-400">Entrada</p>
                <p className="text-xs font-medium text-gray-800">{fmtMoeda(analise.entrada)}</p>
              </div>
            )}
            {analise.prazo_meses != null && (
              <div>
                <p className="text-[10px] text-gray-400">Prazo</p>
                <p className="text-xs font-medium text-gray-800">{analise.prazo_meses} meses</p>
              </div>
            )}
            {analise.finalidade && (
              <div>
                <p className="text-[10px] text-gray-400">Finalidade</p>
                <p className="text-xs font-medium text-gray-800">
                  {FINALIDADES.find(f => f.value === analise.finalidade)?.label ?? analise.finalidade}
                </p>
              </div>
            )}
          </div>

          {!analise.banco_pretendido && !analise.valor_imovel && !analise.valor_pretendido && !analise.entrada && (
            <p className="text-xs text-gray-400 italic pt-2">Análise vazia — clique em Editar para preencher.</p>
          )}

          {/* Status + Data resposta */}
          <div className="flex flex-wrap items-center gap-3 pt-1.5 border-t border-gray-100">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-gray-400 shrink-0">Status</span>
              <Select
                value={analise.status}
                onValueChange={(v) => onStatusChange(v as StatusAnaliseCredito)}
              >
                <SelectTrigger className={cn(
                  'h-6 text-[11px] px-2 py-0 rounded-full border font-medium w-auto gap-1',
                  statusCfg.classe,
                )}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.entries(STATUS_ANALISE) as [StatusAnaliseCredito, { label: string; classe: string }][]).map(([v, cfg]) => (
                    <SelectItem key={v} value={v} className="text-xs">{cfg.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-gray-400 shrink-0">Data da resposta</span>
              <input
                type="date"
                className="h-6 text-[11px] border border-gray-200 rounded px-2 bg-white focus:outline-none focus:ring-1 focus:ring-fonti-primary/30 text-gray-700"
                value={analise.data_resposta ?? ''}
                onChange={e => onDataRespostaChange(e.target.value || null)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── AnaliseForm ───────────────────────────────────────────────

type AnaliseFormInput = Omit<LeadAnaliseCredito, 'id' | 'empresa_id' | 'lead_id' | 'banco_definido' | 'created_at' | 'updated_at'>

function AnaliseForm({ inicial, numero, onSalvar, onCancelar, isPending }: {
  inicial?: LeadAnaliseCredito
  numero?: number
  onSalvar: (campos: AnaliseFormInput) => Promise<void>
  onCancelar: () => void
  isPending: boolean
}) {
  const defaultNome = inicial?.nome ?? `Análise ${numero ?? ''}`
  const [nome, setNome]               = useState(inicial?.nome ?? defaultNome)
  const [banco, setBanco]             = useState(inicial?.banco_pretendido ?? '')
  // Valor decimal simples ("500000.00"), formato que InputMoeda recebe/emite — nada de
  // string formatada pt-BR guardada em estado, só na exibição do próprio InputMoeda.
  const [valorImovel, setValorImovel] = useState(inicial?.valor_imovel != null ? String(inicial.valor_imovel) : '')
  const [valorFin, setValorFin]       = useState(inicial?.valor_pretendido != null ? String(inicial.valor_pretendido) : '')
  const [entrada, setEntrada]         = useState(inicial?.entrada != null ? String(inicial.entrada) : '')
  const [prazo, setPrazo]             = useState(inicial?.prazo_meses != null ? String(inicial.prazo_meses) : '')
  const [finalidade, setFinalidade]   = useState(inicial?.finalidade ?? '')
  const [status, setStatus]           = useState<StatusAnaliseCredito>(inicial?.status ?? 'em_analise')
  const [dataResposta, setDataResposta] = useState(inicial?.data_resposta ?? '')

  // Qual dos dois campos (Entrada ou Valor a Financiar) o usuário editou por último —
  // decide qual dos dois é recalculado quando o Valor do Imóvel muda, e evita que os
  // dois fiquem se recalculando um ao outro em ciclo (cada handler só escreve no OUTRO
  // campo via setState direto, nunca chama o handler do campo que acabou de mudar).
  const [ultimoEditado, setUltimoEditado] = useState<'entrada' | 'financiar' | null>(null)

  function paraNumero(v: string): number | null {
    return v ? Number(v) : null
  }
  // Nunca deixa o campo derivado assumir valor negativo — em vez disso, limpa (o usuário
  // então corrige manualmente qualquer um dos três campos).
  function paraStringNaoNegativa(n: number): string {
    return n >= 0 ? n.toFixed(2) : ''
  }

  function handleValorImovelChange(v: string) {
    setValorImovel(v)
    const imovel = paraNumero(v)
    if (imovel == null) return
    if (ultimoEditado === 'financiar') {
      const fin = paraNumero(valorFin)
      if (fin != null) setEntrada(paraStringNaoNegativa(imovel - fin))
    } else {
      const ent = paraNumero(entrada)
      if (ent != null) setValorFin(paraStringNaoNegativa(imovel - ent))
    }
  }

  function handleEntradaChange(v: string) {
    setEntrada(v)
    setUltimoEditado('entrada')
    const ent = paraNumero(v)
    const imovel = paraNumero(valorImovel)
    if (imovel != null && ent != null) setValorFin(paraStringNaoNegativa(imovel - ent))
  }

  function handleValorFinChange(v: string) {
    setValorFin(v)
    setUltimoEditado('financiar')
    const fin = paraNumero(v)
    const imovel = paraNumero(valorImovel)
    if (imovel != null && fin != null) setEntrada(paraStringNaoNegativa(imovel - fin))
  }

  async function handleSalvar() {
    await onSalvar({
      nome:             nome.trim() || defaultNome,
      banco_pretendido: banco || null,
      valor_imovel:     paraNumero(valorImovel),
      valor_pretendido: paraNumero(valorFin),
      entrada:          paraNumero(entrada),
      prazo_meses:      prazo ? parseInt(prazo) : null,
      finalidade:       finalidade || null,
      status,
      data_resposta:    dataResposta || null,
    })
  }

  return (
    <div className="border border-fonti-primary/20 rounded-lg p-3 space-y-3 bg-fonti-accent-hover/10">
      <div>
        <Label className="text-xs text-gray-500">Nome da análise</Label>
        <Input
          className="h-7 text-sm mt-1"
          value={nome}
          onChange={e => setNome(e.target.value)}
          placeholder={defaultNome}
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className="sm:col-span-2">
          <Label className="text-xs text-gray-500">Banco Pretendido</Label>
          <Select value={banco} onValueChange={setBanco}>
            <SelectTrigger className="h-7 text-sm mt-1"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
            <SelectContent>
              {BANCOS.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs text-gray-500">Valor do Imóvel</Label>
          <InputMoeda className="h-7 text-sm mt-1" value={valorImovel} onChange={handleValorImovelChange} />
        </div>
        <div>
          <Label className="text-xs text-gray-500">Entrada</Label>
          <InputMoeda className="h-7 text-sm mt-1" value={entrada} onChange={handleEntradaChange} />
        </div>
        <div>
          <Label className="text-xs text-gray-500">Valor a Financiar</Label>
          <InputMoeda className="h-7 text-sm mt-1" value={valorFin} onChange={handleValorFinChange} />
        </div>
        <div>
          <Label className="text-xs text-gray-500">Prazo (meses)</Label>
          <Input className="h-7 text-sm mt-1" type="number" placeholder="360" value={prazo} onChange={e => setPrazo(e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <Label className="text-xs text-gray-500">Finalidade</Label>
          <Select value={finalidade} onValueChange={setFinalidade}>
            <SelectTrigger className="h-7 text-sm mt-1"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
            <SelectContent>
              {FINALIDADES.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs text-gray-500">Status</Label>
          <Select value={status} onValueChange={v => setStatus(v as StatusAnaliseCredito)}>
            <SelectTrigger className="h-7 text-sm mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.entries(STATUS_ANALISE) as [StatusAnaliseCredito, { label: string }][]).map(([v, cfg]) => (
                <SelectItem key={v} value={v} className="text-xs">{cfg.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs text-gray-500">Data da resposta</Label>
          <Input className="h-7 text-sm mt-1" type="date" value={dataResposta} onChange={e => setDataResposta(e.target.value)} />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onCancelar} disabled={isPending}>
          Cancelar
        </Button>
        <Button
          size="sm"
          className="h-7 text-xs gap-1 bg-fonti-primary hover:bg-fonti-primary-hover text-white"
          onClick={handleSalvar}
          disabled={isPending}
        >
          {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
          Salvar
        </Button>
      </div>
    </div>
  )
}

// ── BlocoAprovacaoCredito ─────────────────────────────────────

function BlocoAprovacaoCredito({ lead, analiseDefinida, exigeAprovacao, onSalvo }: {
  lead: Lead
  analiseDefinida: LeadAnaliseCredito | null
  exigeAprovacao: boolean
  onSalvo: () => void
}) {
  const editar = useEditarLead()
  const [dataCredito, setDataCredito] = useState(lead.data_credito ?? '')
  const faltaData = exigeAprovacao && !dataCredito

  function salvarDataCredito() {
    const valor = dataCredito || null
    if (valor !== lead.data_credito) {
      editar.mutate({ id: lead.id, data_credito: valor }, {
        onSuccess: () => { if (valor) onSalvo() },
      })
    }
  }

  return (
    <div className="bg-white border border-gray-300 rounded-xl shadow p-4 space-y-3">
      <p className="text-[11px] font-bold text-fonti-primary uppercase tracking-widest border-b border-gray-100 pb-2">Aprovação de Crédito</p>

      <div className="flex items-center gap-3">
        {/* Banco definido */}
        <div className="flex-1 min-w-0">
          {analiseDefinida ? (
            <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 h-[52px]">
              <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] text-green-600 font-semibold uppercase tracking-wide leading-none mb-0.5">Banco Definido</p>
                <p className="text-sm font-bold text-green-800 truncate leading-tight">
                  {analiseDefinida.banco_pretendido ?? analiseDefinida.nome}
                </p>
              </div>
              {analiseDefinida.valor_pretendido != null && (
                <p className="text-xs text-green-700 shrink-0">{fmtMoeda(analiseDefinida.valor_pretendido)}</p>
              )}
            </div>
          ) : (
            <div className="flex items-center rounded-lg border border-dashed border-gray-200 bg-gray-50 px-3 h-[52px]">
              <p className="text-xs text-gray-400 italic">Nenhum banco definido</p>
            </div>
          )}
        </div>

        {/* Data da Aprovação */}
        <div className="shrink-0 space-y-1">
          <p className={cn('text-xs', faltaData ? 'text-red-500 font-medium' : 'text-gray-500')}>
            Data da Aprovação{faltaData && ' *'}
          </p>
          <input
            type="date"
            className={cn(
              'h-8 rounded-md border bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              faltaData ? 'border-red-400' : 'border-input'
            )}
            value={dataCredito}
            onChange={e => setDataCredito(e.target.value)}
            onBlur={salvarDataCredito}
          />
          {editar.isPending && <p className="text-[10px] text-gray-400">Salvando…</p>}
        </div>
      </div>
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
        <div className="bg-white border border-gray-300 rounded-xl shadow p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] font-bold text-fonti-primary uppercase tracking-widest">Vendedor</p>
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
                className="text-sm font-semibold text-fonti-primary hover:underline flex items-center gap-1 text-left"
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
      <div className="bg-white border border-dashed border-gray-300 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[11px] font-bold text-fonti-primary uppercase tracking-widest">Vendedor</p>
        </div>

        {/* Campo de busca */}
        <div className="relative">
          <div className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2 focus-within:border-fonti-primary transition-colors">
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
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-fonti-primary font-medium hover:bg-gray-50 transition-colors"
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
            className="mt-2 flex items-center gap-1 text-xs text-fonti-primary hover:underline font-medium"
          >
            <Plus className="h-3 w-3" /> Criar novo vendedor
          </button>
        )}
      </div>

      {/* Dialog criar novo vendedor */}
      {criandoNovo && (
        <Dialog open onOpenChange={v => { if (!v) setCriandoNovo(false) }}>
          <DialogContent className="w-[calc(100vw-1rem)] sm:max-w-sm p-6">
            <h2 className="text-base font-semibold text-fonti-primary mb-1">Novo Vendedor</h2>
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
                className="bg-fonti-primary hover:bg-fonti-primary-hover text-white"
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
    <div className="bg-white border border-gray-300 rounded-xl shadow p-4 space-y-3">
      <p className="text-[11px] font-bold text-fonti-primary uppercase tracking-widest border-b border-gray-100 pb-2 mb-1">Origem</p>
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
    <div className="bg-white border border-gray-300 rounded-xl shadow p-4 space-y-4">
      <p className="text-[11px] font-bold text-fonti-primary uppercase tracking-widest border-b border-gray-100 pb-2 mb-1">Parceiros</p>
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
        <button onClick={onAbrirAdicionar} className="flex items-center gap-0.5 text-xs text-fonti-primary hover:underline">
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
        <h2 className="text-base font-semibold text-fonti-primary mb-4">Dados do Cônjuge</h2>
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
            <Button variant="outline" size="sm" className="text-xs gap-1 text-fonti-primary border-fonti-primary/30" onClick={() => { salvar(); onCriarPessoa() }}>
              <Plus className="h-3 w-3" /> Criar cadastro completo
            </Button>
          )}
          <div className="flex gap-2 ml-auto">
            <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
            <Button size="sm" className="bg-fonti-primary hover:bg-fonti-primary-hover text-white" onClick={salvar} disabled={editar.isPending}>
              {editar.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
              Salvar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
