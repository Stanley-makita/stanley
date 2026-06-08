'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Home, Clock, CreditCard, FileText, Building, ChevronRight, MessageCircle, Loader2, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import { type Lead } from '@/types/leads'
import { useBancos } from '@/hooks/useBancos'
import { useCriarProcesso } from '@/hooks/processos/useCriarProcesso'
import { useUsuariosEmpresa } from '@/hooks/useUsuariosEmpresa'
import { useAuth } from '@/hooks/auth/useAuth'
import { supabase } from '@/lib/supabase'

type TipoProcesso = 'financiamento' | 'consorcio' | 'cgi' | 'contrato' | 'credito_pj'

export interface PessoaMinima {
  id: string
  nome: string
  cpf: string | null
  email: string | null
  telefone: string | null
}

const PRODUTOS = [
  { id: 'financiamento' as TipoProcesso, nome: 'Financiamento Imobiliário', descricao: 'SBPE, PMCMV, Pro-Cotista, SFI', icone: <Home className="h-5 w-5" /> },
  { id: 'consorcio' as TipoProcesso, nome: 'Consórcio', descricao: 'Carta de crédito via consórcio', icone: <Clock className="h-5 w-5" /> },
  { id: 'cgi' as TipoProcesso, nome: 'CGI', descricao: 'Crédito com Garantia de Imóvel', icone: <CreditCard className="h-5 w-5" /> },
  { id: 'contrato' as TipoProcesso, nome: 'Contrato', descricao: 'Prestação de serviço', icone: <FileText className="h-5 w-5" /> },
  { id: 'credito_pj' as TipoProcesso, nome: 'Crédito PJ', descricao: 'Pessoa Jurídica', icone: <Building className="h-5 w-5" />, emBreve: true },
]

const MODALIDADES = [
  { value: 'SBPE', label: 'SBPE' },
  { value: 'PMCMV', label: 'PMCMV - Minha Casa Minha Vida' },
  { value: 'Pro_Cotista', label: 'Pró-Cotista FGTS' },
  { value: 'SFI', label: 'SFI' },
]

function fmtMoeda(v: number | null | undefined) {
  if (v == null) return null
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

function fmtOrigem(origem: string) {
  const map: Record<string, string> = { whatsapp: 'WhatsApp', indicacao: 'Indicação', site: 'Site', instagram: 'Instagram', facebook: 'Facebook', outros: 'Outros' }
  return map[origem] ?? origem
}

async function marcarLeadConvertido(leadId: string) {
  await supabase.rpc('marcar_lead_convertido', { p_lead_id: leadId })
}

function parseMoeda(v: string): number {
  return Number(v.replace(/[^\d,]/g, '').replace(',', '.')) || 0
}

function formatMoedaInput(v: string): string {
  const num = parseMoeda(v)
  if (!num) return ''
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(num)
}

interface Props {
  aberto: boolean
  onFechar: () => void
  lead: Lead | null
  pessoa?: PessoaMinima | null
}

export function NovoProcessoModal({ aberto, onFechar, lead, pessoa }: Props) {
  const [tipo, setTipo] = useState<TipoProcesso | null>(null)

  function fechar() {
    setTipo(null)
    onFechar()
  }

  return (
    <Dialog open={aberto} onOpenChange={fechar}>
      <DialogContent className={cn('p-0 gap-0 overflow-hidden', tipo ? 'max-w-lg' : 'max-w-sm')}>
        <DialogHeader className="px-5 pt-5 pb-4 border-b border-gray-100">
          <DialogTitle className="text-sm font-semibold text-[#253B29]">
            {!tipo ? 'Novo Processo' : `Novo Processo de ${PRODUTOS.find(p => p.id === tipo)?.nome}`}
          </DialogTitle>
          <p className="text-xs text-gray-400 mt-0.5">
            {!tipo ? 'Selecione o tipo de processo para o cliente' : 'Preencha os dados do processo'}
          </p>
        </DialogHeader>

        {!tipo ? (
          <SeletorTipo lead={lead} pessoa={pessoa} onSelecionar={setTipo} onFechar={fechar} />
        ) : tipo === 'financiamento' ? (
          <FormFinanciamento lead={lead} pessoa={pessoa} onVoltar={() => setTipo(null)} onFechar={fechar} />
        ) : tipo === 'consorcio' ? (
          <FormConsorcio lead={lead} pessoa={pessoa} onVoltar={() => setTipo(null)} onFechar={fechar} />
        ) : tipo === 'cgi' ? (
          <FormCGI lead={lead} pessoa={pessoa} onVoltar={() => setTipo(null)} onFechar={fechar} />
        ) : tipo === 'contrato' ? (
          <FormContrato lead={lead} pessoa={pessoa} onVoltar={() => setTipo(null)} onFechar={fechar} />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

/* ── Passo 1: Seletor de tipo ── */
function SeletorTipo({ lead, pessoa, onSelecionar, onFechar }: {
  lead: Lead | null
  pessoa?: PessoaMinima | null
  onSelecionar: (t: TipoProcesso) => void
  onFechar: () => void
}) {
  const clienteNome = lead?.nome ?? pessoa?.nome ?? '—'
  const clienteCpf  = lead?.cpf  ?? pessoa?.cpf  ?? null

  return (
    <div className="px-5 pt-4 pb-5 space-y-4">
      <div className="bg-gray-50 rounded-xl p-4 space-y-1">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-[#253B29]">{clienteNome}</p>
          {lead ? (
            <span className="flex items-center gap-1 text-xs bg-white border border-gray-200 text-gray-600 px-2 py-0.5 rounded-full">
              {lead.origem === 'whatsapp' && <MessageCircle className="h-3 w-3 text-green-500" />}
              {fmtOrigem(lead.origem)}
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs bg-white border border-gray-200 text-gray-600 px-2 py-0.5 rounded-full">
              <User className="h-3 w-3 text-[#253B29]" />
              Cliente cadastrado
            </span>
          )}
        </div>
        {clienteCpf && <p className="text-xs text-gray-500">CPF: {clienteCpf}</p>}
        {lead?.valor_pretendido != null && (
          <p className="text-xs text-gray-500">
            Valor pretendido: <span className="font-medium text-[#253B29]">{fmtMoeda(lead.valor_pretendido)}</span>
          </p>
        )}
      </div>

      {lead?.observacoes && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-gray-500">Observações do Lead</p>
          <p className="text-xs text-gray-600 bg-gray-50 rounded-lg p-3 leading-relaxed line-clamp-3">{lead.observacoes}</p>
        </div>
      )}

      <div className="space-y-1.5">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Tipo de Processo</p>
        <div className="divide-y divide-gray-100 border border-gray-200 rounded-xl overflow-hidden">
          {PRODUTOS.map((p) => (
            <button
              key={p.id}
              disabled={p.emBreve}
              onClick={() => onSelecionar(p.id)}
              className={cn('w-full flex items-center gap-3 px-4 py-3 text-left transition-colors', p.emBreve ? 'bg-gray-50 cursor-not-allowed' : 'bg-white hover:bg-[#E7E0C4]/30 cursor-pointer')}
            >
              <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', p.emBreve ? 'bg-gray-100 text-gray-300' : 'bg-[#E7E0C4] text-[#253B29]')}>
                {p.icone}
              </div>
              <div className="flex-1 min-w-0">
                <p className={cn('text-sm font-medium', p.emBreve ? 'text-gray-400' : 'text-[#253B29]')}>{p.nome}</p>
                <p className="text-xs text-gray-400 mt-0.5">{p.descricao}</p>
              </div>
              {p.emBreve
                ? <span className="text-xs bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full shrink-0">Em breve</span>
                : <ChevronRight className="h-4 w-4 text-gray-300 shrink-0" />
              }
            </button>
          ))}
        </div>
      </div>

      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={onFechar} className="h-9">Cancelar</Button>
      </div>
    </div>
  )
}

/* ── Formulário Financiamento ── */
function FormFinanciamento({ lead, pessoa, onVoltar, onFechar }: {
  lead: Lead | null
  pessoa?: PessoaMinima | null
  onVoltar: () => void
  onFechar: () => void
}) {
  const router = useRouter()
  const { usuario } = useAuth()
  const { data: bancos = [] } = useBancos()
  const { data: usuarios = [] } = useUsuariosEmpresa()
  const criarProcesso = useCriarProcesso()

  const clienteNome    = lead?.nome     ?? pessoa?.nome     ?? ''
  const clienteCpf     = lead?.cpf      ?? pessoa?.cpf      ?? null
  const clienteEmail   = lead?.email    ?? pessoa?.email    ?? null
  const clienteTelefone= lead?.telefone ?? pessoa?.telefone ?? null

  const [valorImovel, setValorImovel] = useState('')
  const [bancoId, setBancoId] = useState('')
  const [modalidade, setModalidade] = useState('')
  const [valorFinanciar, setValorFinanciar] = useState('')
  const [temAssessoria, setTemAssessoria] = useState(true)
  const [valorAssessoria, setValorAssessoria] = useState('')
  const [operacionalId, setOperacionalId] = useState(usuario?.id ?? '')
  const [comercialId, setComercialId] = useState(lead?.responsavel_id ?? usuario?.id ?? '')

  async function handleCriar() {
    if (!bancoId || !modalidade || !valorImovel) return

    const { data: primeiraFase } = await supabase.from('fases').select('id')
      .eq('empresa_id', usuario!.empresa_id).eq('modulo', 'processos')
      .eq('ativo', true).order('ordem', { ascending: true }).limit(1).maybeSingle()

    const processo = await criarProcesso.mutateAsync({
      lead_id:          lead?.id ?? null,
      pessoa_id:        pessoa?.id ?? null,
      nome_imovel:      clienteNome,
      modalidade:       modalidade as any,
      banco_id:         bancoId,
      valor_imovel:     parseMoeda(valorImovel),
      valor_financiado: parseMoeda(valorFinanciar) || null,
      valor_entrada:    null,
      status_emissao:   'nao_emitido',
      chance_emissao:   'incerteza',
      status_processo:  'em_analise',
      tem_assessoria:   temAssessoria,
      valor_assessoria: temAssessoria && valorAssessoria ? parseMoeda(valorAssessoria) : null,
      comissao_comercial: null,
      comissao_empresa:   null,
      operacional_id:   operacionalId && operacionalId !== '__nenhum' ? operacionalId : null,
      comercial_id:     comercialId && comercialId !== '__nenhum' ? comercialId : null,
      corretor_nome:    null,
      corretor_creci:   null,
      fase_atual_id:    primeiraFase?.id ?? null,
      data_inicio:      new Date().toISOString().split('T')[0],
    })

    if (clienteNome) {
      await supabase.from('processo_compradores').insert({
        processo_id: processo.id,
        empresa_id:  processo.empresa_id,
        nome:        clienteNome,
        cpf:         clienteCpf,
        email:       clienteEmail,
        telefone:    clienteTelefone,
        principal:   true,
      })
    }

    if (lead) await marcarLeadConvertido(lead.id)
    router.push(`/processos/${processo.id}`)
    onFechar()
  }

  return (
    <div className="overflow-y-auto max-h-[75vh] px-5 py-5 space-y-5">
      <Secao titulo="Dados do Cliente">
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Nome"><Input value={clienteNome} readOnly className="bg-gray-50 h-9 text-sm" /></Campo>
          <Campo label="CPF"><Input value={clienteCpf ?? '—'} readOnly className="bg-gray-50 h-9 text-sm" /></Campo>
          <Campo label="Telefone"><Input value={clienteTelefone ?? '—'} readOnly className="bg-gray-50 h-9 text-sm" /></Campo>
          <Campo label="Email"><Input value={clienteEmail ?? ''} readOnly className="bg-gray-50 h-9 text-sm" /></Campo>
        </div>
      </Secao>

      <Secao titulo="Dados do Financiamento">
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Banco *" className="col-span-2">
            <Select value={bancoId} onValueChange={setBancoId}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione o banco" /></SelectTrigger>
              <SelectContent>
                {bancos.map(b => (
                  <SelectItem key={b.id} value={b.id}>
                    <div className="flex items-center gap-2">
                      {b.cor && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: b.cor }} />}
                      {b.nome}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Campo>
          <Campo label="Modalidade *">
            <Select value={modalidade} onValueChange={setModalidade}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>{MODALIDADES.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
            </Select>
          </Campo>
          <Campo label="Valor do Imóvel *">
            <Input placeholder="R$ 0,00" value={valorImovel} onChange={e => setValorImovel(e.target.value)} onBlur={e => setValorImovel(formatMoedaInput(e.target.value))} className="h-9 text-sm" />
          </Campo>
          <Campo label="Valor a Financiar">
            <Input placeholder="R$ 0,00" value={valorFinanciar} onChange={e => setValorFinanciar(e.target.value)} onBlur={e => setValorFinanciar(formatMoedaInput(e.target.value))} className="h-9 text-sm" />
          </Campo>
        </div>
      </Secao>

      <Secao titulo="Assessoria">
        <div className="space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <div
              onClick={() => setTemAssessoria(!temAssessoria)}
              className={cn('w-9 h-5 rounded-full transition-colors flex items-center px-0.5 cursor-pointer', temAssessoria ? 'bg-[#253B29]' : 'bg-gray-200')}
            >
              <div className={cn('w-4 h-4 rounded-full bg-white shadow transition-transform', temAssessoria ? 'translate-x-4' : 'translate-x-0')} />
            </div>
            <span className="text-sm text-gray-700">Processo inclui Assessoria</span>
          </label>
          {temAssessoria && (
            <Campo label="Valor da Assessoria negociado">
              <Input placeholder="R$ 0,00" value={valorAssessoria} onChange={e => setValorAssessoria(e.target.value)} onBlur={e => setValorAssessoria(formatMoedaInput(e.target.value))} className="h-9 text-sm" />
            </Campo>
          )}
        </div>
      </Secao>

      <Secao titulo="Responsáveis">
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Operacional">
            <Select value={operacionalId} onValueChange={setOperacionalId}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__nenhum">Nenhum</SelectItem>
                {usuarios.map(u => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </Campo>
          <Campo label="Comercial">
            <Select value={comercialId} onValueChange={setComercialId}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__nenhum">Nenhum</SelectItem>
                {usuarios.map(u => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </Campo>
        </div>
      </Secao>

      <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
        <Button variant="outline" size="sm" onClick={onVoltar} className="h-9" disabled={criarProcesso.isPending}>
          Cancelar
        </Button>
        <Button
          size="sm"
          className="h-9 bg-[#253B29] hover:bg-[#1a2b1e] text-white min-w-[120px]"
          onClick={handleCriar}
          disabled={criarProcesso.isPending || !bancoId || !modalidade || !valorImovel}
        >
          {criarProcesso.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Criar Processo'}
        </Button>
      </div>
    </div>
  )
}

/* ── Formulário CGI ── */
function FormCGI({ lead, pessoa, onVoltar, onFechar }: {
  lead: Lead | null
  pessoa?: PessoaMinima | null
  onVoltar: () => void
  onFechar: () => void
}) {
  const router = useRouter()
  const { usuario } = useAuth()
  const { data: bancos = [] } = useBancos()
  const { data: usuarios = [] } = useUsuariosEmpresa()
  const criarProcesso = useCriarProcesso()

  const clienteNome    = lead?.nome ?? pessoa?.nome ?? ''
  const clienteCpf     = lead?.cpf  ?? pessoa?.cpf  ?? null

  const [valorCredito, setValorCredito] = useState('')
  const [valorGarantia, setValorGarantia] = useState('')
  const [bancoId, setBancoId] = useState('')
  const [temAssessoria, setTemAssessoria] = useState(true)
  const [valorAssessoria, setValorAssessoria] = useState('')
  const [operacionalId, setOperacionalId] = useState(usuario?.id ?? '')
  const [comercialId, setComercialId] = useState(lead?.responsavel_id ?? usuario?.id ?? '')

  async function handleCriar() {
    if (!bancoId || !valorCredito) return

    const { data: primeiraFase } = await supabase.from('fases').select('id')
      .eq('empresa_id', usuario!.empresa_id).eq('modulo', 'processos')
      .eq('ativo', true).order('ordem', { ascending: true }).limit(1).maybeSingle()

    const processo = await criarProcesso.mutateAsync({
      lead_id:          lead?.id ?? null,
      pessoa_id:        pessoa?.id ?? null,
      nome_imovel:      clienteNome,
      modalidade:       'CGI',
      banco_id:         bancoId,
      valor_imovel:     parseMoeda(valorGarantia) || null,
      valor_financiado: parseMoeda(valorCredito) || null,
      valor_entrada:    null,
      status_emissao:   'nao_emitido',
      chance_emissao:   'incerteza',
      status_processo:  'em_analise',
      tem_assessoria:   temAssessoria,
      valor_assessoria: temAssessoria && valorAssessoria ? parseMoeda(valorAssessoria) : null,
      comissao_comercial: null,
      comissao_empresa:   null,
      operacional_id:   operacionalId && operacionalId !== '__nenhum' ? operacionalId : null,
      comercial_id:     comercialId && comercialId !== '__nenhum' ? comercialId : null,
      corretor_nome:    null,
      corretor_creci:   null,
      fase_atual_id:    primeiraFase?.id ?? null,
      data_inicio:      new Date().toISOString().split('T')[0],
    })

    if (clienteNome) {
      await supabase.from('processo_compradores').insert({
        processo_id: processo.id,
        empresa_id:  processo.empresa_id,
        nome:        clienteNome,
        cpf:         clienteCpf,
        email:       lead?.email ?? pessoa?.email ?? null,
        telefone:    lead?.telefone ?? pessoa?.telefone ?? null,
        principal:   true,
      })
    }

    if (lead) await marcarLeadConvertido(lead.id)
    router.push(`/processos/${processo.id}`)
    onFechar()
  }

  return (
    <div className="overflow-y-auto max-h-[75vh] px-5 py-5 space-y-5">
      <Secao titulo="Dados do Cliente">
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Nome"><Input value={clienteNome} readOnly className="bg-gray-50 h-9 text-sm" /></Campo>
          <Campo label="CPF"><Input value={clienteCpf ?? '—'} readOnly className="bg-gray-50 h-9 text-sm" /></Campo>
        </div>
      </Secao>

      <Secao titulo="Dados do Crédito">
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Banco *" className="col-span-2">
            <Select value={bancoId} onValueChange={setBancoId}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione o banco" /></SelectTrigger>
              <SelectContent>{bancos.map(b => <SelectItem key={b.id} value={b.id}>{b.nome}</SelectItem>)}</SelectContent>
            </Select>
          </Campo>
          <Campo label="Valor do Crédito *">
            <Input placeholder="R$ 0,00" value={valorCredito} onChange={e => setValorCredito(e.target.value)} onBlur={e => setValorCredito(formatMoedaInput(e.target.value))} className="h-9 text-sm" />
          </Campo>
          <Campo label="Valor do Imóvel em Garantia">
            <Input placeholder="R$ 0,00" value={valorGarantia} onChange={e => setValorGarantia(e.target.value)} onBlur={e => setValorGarantia(formatMoedaInput(e.target.value))} className="h-9 text-sm" />
          </Campo>
        </div>
      </Secao>

      <Secao titulo="Assessoria">
        <div className="space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <div onClick={() => setTemAssessoria(!temAssessoria)} className={cn('w-9 h-5 rounded-full transition-colors flex items-center px-0.5 cursor-pointer', temAssessoria ? 'bg-[#253B29]' : 'bg-gray-200')}>
              <div className={cn('w-4 h-4 rounded-full bg-white shadow transition-transform', temAssessoria ? 'translate-x-4' : 'translate-x-0')} />
            </div>
            <span className="text-sm text-gray-700">Processo inclui Assessoria</span>
          </label>
          {temAssessoria && (
            <Campo label="Valor da Assessoria negociado">
              <Input placeholder="R$ 0,00" value={valorAssessoria} onChange={e => setValorAssessoria(e.target.value)} onBlur={e => setValorAssessoria(formatMoedaInput(e.target.value))} className="h-9 text-sm" />
            </Campo>
          )}
        </div>
      </Secao>

      <Secao titulo="Responsáveis">
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Operacional">
            <Select value={operacionalId} onValueChange={setOperacionalId}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__nenhum">Nenhum</SelectItem>
                {usuarios.map(u => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </Campo>
          <Campo label="Comercial">
            <Select value={comercialId} onValueChange={setComercialId}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__nenhum">Nenhum</SelectItem>
                {usuarios.map(u => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </Campo>
        </div>
      </Secao>

      <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
        <Button variant="outline" size="sm" onClick={onVoltar} className="h-9" disabled={criarProcesso.isPending}>Cancelar</Button>
        <Button size="sm" className="h-9 bg-[#253B29] hover:bg-[#1a2b1e] text-white min-w-[120px]" onClick={handleCriar} disabled={criarProcesso.isPending || !bancoId || !valorCredito}>
          {criarProcesso.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Criar Processo'}
        </Button>
      </div>
    </div>
  )
}

/* ── Formulário Contrato ── */
type TipoContrato = 'compra_venda' | 'prestacao_servico' | 'juridico_externo'

const TIPO_CONTRATO_LABELS: Record<TipoContrato, string> = {
  compra_venda:       'Compra e Venda de Imóvel',
  prestacao_servico:  'Prestação de Serviço',
  juridico_externo:   'Jurídico / Externo',
}

function FormContrato({ lead, pessoa, onVoltar, onFechar }: {
  lead: Lead | null
  pessoa?: PessoaMinima | null
  onVoltar: () => void
  onFechar: () => void
}) {
  const router = useRouter()
  const { usuario } = useAuth()
  const criarProcesso = useCriarProcesso()
  const { data: usuarios = [] } = useUsuariosEmpresa()

  const clienteNome    = lead?.nome     ?? pessoa?.nome     ?? ''
  const clienteCpf     = lead?.cpf      ?? pessoa?.cpf      ?? null
  const clienteEmail   = lead?.email    ?? pessoa?.email    ?? null
  const clienteTelefone= lead?.telefone ?? pessoa?.telefone ?? null

  const claudia = usuarios.find(u => u.nome.toLowerCase().includes('cláudia') || u.nome.toLowerCase().includes('claudia'))

  const [tipoContrato, setTipoContrato] = useState<TipoContrato | ''>('')
  const [comercialId, setComercialId] = useState(lead?.responsavel_id ?? '')
  const [juridicoId, setJuridicoId] = useState(claudia?.id ?? '')

  const claudiaId = claudia?.id ?? ''

  async function handleCriar() {
    if (!tipoContrato) return

    const { data: primeiraFase } = await supabase.from('fases').select('id')
      .eq('empresa_id', usuario!.empresa_id).eq('modulo', 'contrato')
      .eq('ativo', true).order('ordem', { ascending: true }).limit(1).maybeSingle()

    const processo = await criarProcesso.mutateAsync({
      lead_id:          lead?.id ?? null,
      pessoa_id:        pessoa?.id ?? null,
      nome_imovel:      clienteNome,
      modalidade:       'Contrato',
      banco_id:         null,
      valor_imovel:     null,
      valor_financiado: null,
      valor_entrada:    null,
      status_emissao:   'nao_emitido',
      chance_emissao:   'certeza',
      status_processo:  'em_analise',
      tem_assessoria:   true,
      comissao_comercial: null,
      comissao_empresa:   null,
      operacional_id:   (() => { const v = juridicoId || claudiaId; return v && v !== '__nenhum' ? v : null })(),
      comercial_id:     comercialId && comercialId !== '__nenhum' ? comercialId : null,
      corretor_nome:    null,
      corretor_creci:   null,
      numero_contrato:  TIPO_CONTRATO_LABELS[tipoContrato],
      fase_atual_id:    primeiraFase?.id ?? null,
      data_inicio:      new Date().toISOString().split('T')[0],
    })

    if (clienteNome) {
      await supabase.from('processo_compradores').insert({
        processo_id: processo.id,
        empresa_id:  processo.empresa_id,
        nome:        clienteNome,
        cpf:         clienteCpf,
        email:       clienteEmail,
        telefone:    clienteTelefone,
        principal:   true,
      })
    }

    if (lead) await marcarLeadConvertido(lead.id)
    router.push(`/processos/${processo.id}`)
    onFechar()
  }

  return (
    <div className="overflow-y-auto max-h-[70vh] px-5 py-5 space-y-5">
      <Secao titulo="Dados do Cliente">
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Nome"><Input value={clienteNome} readOnly className="bg-gray-50 h-9 text-sm" /></Campo>
          <Campo label="CPF"><Input value={clienteCpf ?? '—'} readOnly className="bg-gray-50 h-9 text-sm" /></Campo>
        </div>
      </Secao>

      <Secao titulo="Tipo de Contrato">
        <Campo label="Tipo *">
          <Select value={tipoContrato} onValueChange={v => setTipoContrato(v as TipoContrato)}>
            <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione o tipo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="compra_venda">Compra e Venda de Imóvel</SelectItem>
              <SelectItem value="prestacao_servico">Prestação de Serviço</SelectItem>
              <SelectItem value="juridico_externo">Jurídico / Externo</SelectItem>
            </SelectContent>
          </Select>
        </Campo>
      </Secao>

      <Secao titulo="Responsáveis">
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Comercial *">
            <Select value={comercialId} onValueChange={setComercialId}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {usuarios.map(u => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </Campo>
          <Campo label="Responsável Jurídico">
            <Select value={juridicoId || claudiaId} onValueChange={setJuridicoId}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Opcional" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__nenhum">Nenhum</SelectItem>
                {usuarios.map(u => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </Campo>
        </div>
      </Secao>

      <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
        <Button variant="outline" size="sm" onClick={onVoltar} className="h-9" disabled={criarProcesso.isPending}>Cancelar</Button>
        <Button
          size="sm"
          className="h-9 bg-[#253B29] hover:bg-[#1a2b1e] text-white min-w-[120px]"
          onClick={handleCriar}
          disabled={criarProcesso.isPending || !tipoContrato}
        >
          {criarProcesso.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Criar Processo'}
        </Button>
      </div>
    </div>
  )
}

/* ── Formulário Consórcio ── */
function FormConsorcio({ lead, pessoa, onVoltar, onFechar }: {
  lead: Lead | null
  pessoa?: PessoaMinima | null
  onVoltar: () => void
  onFechar: () => void
}) {
  const router = useRouter()
  const { usuario } = useAuth()
  const criarProcesso = useCriarProcesso()
  const { data: usuarios = [] } = useUsuariosEmpresa()

  const clienteNome    = lead?.nome     ?? pessoa?.nome     ?? ''
  const clienteCpf     = lead?.cpf      ?? pessoa?.cpf      ?? null
  const clienteEmail   = lead?.email    ?? pessoa?.email    ?? null
  const clienteTelefone= lead?.telefone ?? pessoa?.telefone ?? null

  const [tipoBem, setTipoBem] = useState('')
  const [valorCarta, setValorCarta] = useState('')
  const [administradora, setAdministradora] = useState('')
  const [administradoraCustom, setAdministradoraCustom] = useState('')
  const [prazo, setPrazo] = useState('')
  const [estrategia, setEstrategia] = useState('')
  const [observacoes, setObservacoes] = useState('')
  const [comercialId, setComercialId] = useState(lead?.responsavel_id ?? '')
  const [operacionalId, setOperacionalId] = useState('')

  const administradoraFinal = administradora === '__outra' ? administradoraCustom : administradora

  async function handleCriar() {
    if (!tipoBem || !valorCarta) return

    const { data: primeiraFase } = await supabase.from('fases').select('id')
      .eq('empresa_id', usuario!.empresa_id).eq('modulo', 'consorcio')
      .eq('ativo', true).order('ordem', { ascending: true }).limit(1).maybeSingle()

    const processo = await criarProcesso.mutateAsync({
      lead_id:          lead?.id ?? null,
      pessoa_id:        pessoa?.id ?? null,
      nome_imovel:      tipoBem,
      modalidade:       'Consorcio',
      banco_id:         null,
      valor_imovel:     null,
      valor_financiado: parseMoeda(valorCarta) || null,
      valor_entrada:    null,
      status_emissao:   'nao_emitido',
      chance_emissao:   'incerteza',
      status_processo:  'em_analise',
      tem_assessoria:   true,
      comissao_comercial: null,
      comissao_empresa:   null,
      operacional_id:   operacionalId && operacionalId !== '__nenhum' ? operacionalId : null,
      comercial_id:     comercialId && comercialId !== '__nenhum' ? comercialId : null,
      corretor_nome:    administradoraFinal || null,
      corretor_creci:   null,
      fase_atual_id:    primeiraFase?.id ?? null,
      data_inicio:      new Date().toISOString().split('T')[0],
    })

    if (clienteNome) {
      await supabase.from('processo_compradores').insert({
        processo_id: processo.id,
        empresa_id:  processo.empresa_id,
        nome:        clienteNome,
        cpf:         clienteCpf,
        email:       clienteEmail,
        telefone:    clienteTelefone,
        principal:   true,
      })
    }

    const linhas = [
      prazo && `Prazo de contemplação: ${prazo}`,
      estrategia && `Estratégia: ${estrategia}`,
      observacoes && observacoes,
    ].filter(Boolean)
    if (linhas.length > 0) {
      await supabase.from('processo_comentarios').insert({
        processo_id:       processo.id,
        empresa_id:        processo.empresa_id,
        tipo:              'observacao',
        texto:             linhas.join('\n'),
        notificar_cliente: false,
      })
    }

    if (lead) await marcarLeadConvertido(lead.id)
    router.push(`/processos/${processo.id}`)
    onFechar()
  }

  return (
    <div className="overflow-y-auto max-h-[70vh] px-5 py-5 space-y-5">
      <Secao titulo="Dados do Cliente">
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Nome"><Input value={clienteNome} readOnly className="bg-gray-50 h-9 text-sm" /></Campo>
          <Campo label="CPF"><Input value={clienteCpf ?? '—'} readOnly className="bg-gray-50 h-9 text-sm" /></Campo>
        </div>
      </Secao>

      <Secao titulo="Bem">
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Tipo de Bem *">
            <Select value={tipoBem} onValueChange={setTipoBem}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Imóvel">Imóvel</SelectItem>
                <SelectItem value="Veículo">Veículo</SelectItem>
                <SelectItem value="Serviço">Serviço</SelectItem>
              </SelectContent>
            </Select>
          </Campo>
          <Campo label="Valor da Carta de Crédito *">
            <Input placeholder="R$ 0,00" value={valorCarta} onChange={e => setValorCarta(e.target.value)} onBlur={e => setValorCarta(formatMoedaInput(e.target.value))} className="h-9 text-sm" />
          </Campo>
        </div>
      </Secao>

      <Secao titulo="Administradora">
        <div className="space-y-3">
          <Campo label="Administradora">
            <Select value={administradora} onValueChange={setAdministradora}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Itaú">Itaú</SelectItem>
                <SelectItem value="Caixa">Caixa</SelectItem>
                <SelectItem value="Araucária Consórcios">Araucária Consórcios</SelectItem>
                <SelectItem value="__outra">Outra</SelectItem>
              </SelectContent>
            </Select>
          </Campo>
          {administradora === '__outra' && (
            <Campo label="Nome da Administradora">
              <Input placeholder="Digite o nome..." value={administradoraCustom} onChange={e => setAdministradoraCustom(e.target.value)} className="h-9 text-sm" />
            </Campo>
          )}
        </div>
      </Secao>

      <Secao titulo="Estratégia">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Campo label="Prazo de Contemplação">
              <Select value={prazo} onValueChange={setPrazo}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Até 12 meses">Até 12 meses</SelectItem>
                  <SelectItem value="12 a 24 meses">12 a 24 meses</SelectItem>
                  <SelectItem value="24 a 36 meses">24 a 36 meses</SelectItem>
                  <SelectItem value="Acima de 36 meses">Acima de 36 meses</SelectItem>
                  <SelectItem value="Sem preferência">Sem preferência</SelectItem>
                </SelectContent>
              </Select>
            </Campo>
            <Campo label="Estratégia de Contemplação">
              <Select value={estrategia} onValueChange={setEstrategia}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Sorteio">Sorteio</SelectItem>
                  <SelectItem value="Lance">Lance</SelectItem>
                  <SelectItem value="Lance fixo">Lance fixo</SelectItem>
                  <SelectItem value="Lance embutido">Lance embutido</SelectItem>
                </SelectContent>
              </Select>
            </Campo>
          </div>
          <Campo label="Observações">
            <Textarea placeholder="Detalhes adicionais sobre o consórcio..." value={observacoes} onChange={e => setObservacoes(e.target.value)} rows={3} className="text-sm resize-none" />
          </Campo>
        </div>
      </Secao>

      <Secao titulo="Responsáveis">
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Comercial *">
            <Select value={comercialId} onValueChange={setComercialId}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {usuarios.map(u => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </Campo>
          <Campo label="Operacional">
            <Select value={operacionalId} onValueChange={setOperacionalId}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Opcional" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__nenhum">Nenhum</SelectItem>
                {usuarios.map(u => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </Campo>
        </div>
      </Secao>

      <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
        <Button variant="outline" size="sm" onClick={onVoltar} className="h-9" disabled={criarProcesso.isPending}>Cancelar</Button>
        <Button size="sm" className="h-9 bg-[#253B29] hover:bg-[#1a2b1e] text-white min-w-[120px]" onClick={handleCriar} disabled={criarProcesso.isPending || !tipoBem || !valorCarta}>
          {criarProcesso.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Criar Processo'}
        </Button>
      </div>
    </div>
  )
}

/* ── Helpers ── */
function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">{titulo}</p>
      {children}
    </div>
  )
}

function Campo({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Label className="text-xs text-gray-500 mb-1 block">{label}</Label>
      {children}
    </div>
  )
}
