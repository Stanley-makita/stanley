'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Home, Clock, CreditCard, FileText, Building, ChevronRight, MessageCircle, Loader2, User, Link2, SkipForward } from 'lucide-react'
import { cn } from '@/lib/utils'
import { type Lead } from '@/types/leads'
import { useBancos } from '@/hooks/useBancos'
import { useCriarProcesso } from '@/hooks/processos/useCriarProcesso'
import { useComissoesPadrao } from '@/hooks/configuracoes/useComissoesPadrao'
import { useUsuariosEmpresa } from '@/hooks/useUsuariosEmpresa'
import { useAuth } from '@/hooks/auth/useAuth'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import {
  inferirValidade, preSelecionar,
  calcularStatusValidade, LABELS_VALIDADE, ICONES_VALIDADE, CORES_VALIDADE,
  type StatusValidade,
} from '@/lib/documentos'

type TipoProcesso = 'financiamento' | 'consorcio' | 'cgi' | 'contrato' | 'credito_pj'

interface DocumentoParaVincular {
  id: string
  nome_original: string
  nome_exibicao: string | null
  classificacao: string | null
  permanente: boolean | null
  validade_data: string | null
  validade_dias: number | null
  created_at: string
  pessoa_id: string | null
}

interface ProcessoCriadoPayload {
  processoId: string
  empresaId: string
  pessoaIdComprador: string | null
  nomeComprador: string
  pessoaIdConjuge: string | null
  nomeConjuge: string | null
}

interface VinculacaoState extends ProcessoCriadoPayload {
  docs: DocumentoParaVincular[]
}

const LABELS_CLASSIFICACAO_MODAL: Record<string, string> = {
  rg:                   'RG / Doc. Identidade',
  cnh:                  'CNH',
  cpf:                  'CPF',
  comprovante_endereco: 'Comp. Residência',
  comprovante_renda:    'Comp. Renda',
  extrato_fgts:         'Extrato FGTS',
  extrato_bancario:     'Extrato Bancário',
  certidao_casamento:   'Certidão Casamento',
  certidao_nascimento:  'Certidão Nascimento',
  certidao_divorcio:    'Certidão Divórcio',
  matricula:            'Matrícula Imóvel',
  contrato:             'Contrato',
}

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
  const router = useRouter()
  const { usuario } = useAuth()
  const [tipo, setTipo] = useState<TipoProcesso | null>(null)
  const [vinculacao, setVinculacao] = useState<VinculacaoState | null>(null)
  const [buscandoDocs, setBuscandoDocs] = useState(false)

  function fechar() {
    setTipo(null)
    setVinculacao(null)
    onFechar()
  }

  async function handleProcessoCriado(payload: ProcessoCriadoPayload) {
    const pessoaIds = [payload.pessoaIdComprador, payload.pessoaIdConjuge].filter((id): id is string => !!id)

    if (pessoaIds.length > 0) {
      setBuscandoDocs(true)
      const { data: docs } = await supabase
        .from('documentos_clientes')
        .select('id, nome_original, nome_exibicao, classificacao, permanente, validade_data, validade_dias, created_at, pessoa_id')
        .in('pessoa_id', pessoaIds)
        .eq('empresa_id', payload.empresaId)
        .is('deleted_at', null)
        .order('classificacao', { ascending: true })
      setBuscandoDocs(false)

      if (docs && docs.length > 0) {
        setVinculacao({ ...payload, docs: docs as DocumentoParaVincular[] })
        return
      }
    }

    router.push(`/processos/${payload.processoId}`)
    fechar()
  }

  const tituloHeader = vinculacao
    ? 'Vincular documentos ao processo'
    : !tipo
    ? 'Novo Processo'
    : `Novo Processo de ${PRODUTOS.find(p => p.id === tipo)?.nome}`

  const subtituloHeader = vinculacao
    ? 'Selecione quais documentos existentes devem ser aproveitados neste processo'
    : !tipo
    ? 'Selecione o tipo de processo para o cliente'
    : 'Preencha os dados do processo'

  return (
    <Dialog open={aberto} onOpenChange={fechar}>
      <DialogContent className={cn('max-h-[92svh] w-[calc(100vw-1rem)] gap-0 overflow-hidden p-0 sm:w-full', vinculacao || tipo ? 'max-w-lg' : 'max-w-sm')}>
        <DialogHeader className="border-b border-gray-100 px-4 pb-4 pt-5 sm:px-5">
          <DialogTitle className="text-sm font-semibold text-fonti-primary">{tituloHeader}</DialogTitle>
          <p className="text-xs text-gray-400 mt-0.5">{subtituloHeader}</p>
        </DialogHeader>

        {buscandoDocs ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-gray-300" />
          </div>
        ) : vinculacao ? (
          <VincularStep
            vinculacao={vinculacao}
            usuario={usuario}
            onConcluir={(processoId) => { router.push(`/processos/${processoId}`); fechar() }}
            onPular={(processoId) => { router.push(`/processos/${processoId}`); fechar() }}
          />
        ) : !tipo ? (
          <SeletorTipo lead={lead} pessoa={pessoa} onSelecionar={setTipo} onFechar={fechar} />
        ) : tipo === 'financiamento' ? (
          <FormFinanciamento lead={lead} pessoa={pessoa} onVoltar={() => setTipo(null)} onFechar={fechar} onProcessoCriado={handleProcessoCriado} />
        ) : tipo === 'consorcio' ? (
          <FormConsorcio lead={lead} pessoa={pessoa} onVoltar={() => setTipo(null)} onFechar={fechar} onProcessoCriado={handleProcessoCriado} />
        ) : tipo === 'cgi' ? (
          <FormCGI lead={lead} pessoa={pessoa} onVoltar={() => setTipo(null)} onFechar={fechar} onProcessoCriado={handleProcessoCriado} />
        ) : tipo === 'contrato' ? (
          <FormContrato lead={lead} pessoa={pessoa} onVoltar={() => setTipo(null)} onFechar={fechar} onProcessoCriado={handleProcessoCriado} />
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
    <div className="space-y-4 px-4 pb-5 pt-4 sm:px-5">
      <div className="bg-gray-50 rounded-xl p-4 space-y-1">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-fonti-primary">{clienteNome}</p>
          {lead ? (
            <span className="flex items-center gap-1 text-xs bg-white border border-gray-200 text-gray-600 px-2 py-0.5 rounded-full">
              {lead.origem === 'whatsapp' && <MessageCircle className="h-3 w-3 text-green-500" />}
              {fmtOrigem(lead.origem)}
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs bg-white border border-gray-200 text-gray-600 px-2 py-0.5 rounded-full">
              <User className="h-3 w-3 text-fonti-primary" />
              Cliente cadastrado
            </span>
          )}
        </div>
        {clienteCpf && <p className="text-xs text-gray-500">CPF: {clienteCpf}</p>}
        {lead?.valor_pretendido != null && (
          <p className="text-xs text-gray-500">
            Valor pretendido: <span className="font-medium text-fonti-primary">{fmtMoeda(lead.valor_pretendido)}</span>
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
              className={cn('w-full flex items-center gap-3 px-4 py-3 text-left transition-colors', p.emBreve ? 'bg-gray-50 cursor-not-allowed' : 'bg-white hover:bg-fonti-accent-hover/30 cursor-pointer')}
            >
              <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', p.emBreve ? 'bg-gray-100 text-gray-300' : 'bg-fonti-accent-hover text-fonti-primary')}>
                {p.icone}
              </div>
              <div className="flex-1 min-w-0">
                <p className={cn('text-sm font-medium', p.emBreve ? 'text-gray-400' : 'text-fonti-primary')}>{p.nome}</p>
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
        <Button variant="outline" size="sm" onClick={onFechar} className="h-9 w-full sm:w-auto">Cancelar</Button>
      </div>
    </div>
  )
}

/* ── Formulário Financiamento ── */
function FormFinanciamento({ lead, pessoa, onVoltar, onFechar, onProcessoCriado }: {
  lead: Lead | null
  pessoa?: PessoaMinima | null
  onVoltar: () => void
  onFechar: () => void
  onProcessoCriado: (payload: ProcessoCriadoPayload) => Promise<void>
}) {
  const { usuario } = useAuth()
  const { data: bancos = [] } = useBancos()
  const { data: usuarios = [] } = useUsuariosEmpresa()
  const criarProcesso = useCriarProcesso()
  const { data: comissoesPadrao = [] } = useComissoesPadrao()

  // Dados do cliente (editáveis se vazios)
  const [nome, setNome]         = useState(lead?.nome ?? pessoa?.nome ?? '')
  const [cpf, setCpf]           = useState(lead?.cpf ?? pessoa?.cpf ?? '')
  const [telefone, setTelefone] = useState(lead?.telefone ?? pessoa?.telefone ?? '')
  const [email, setEmail]       = useState(lead?.email ?? pessoa?.email ?? '')

  // Financiamento
  const [bancoId, setBancoId]               = useState('')
  const [comissaoComercial, setComissaoComercial] = useState<number | null>(null)
  const [comissaoEmpresa, setComissaoEmpresa]     = useState<number | null>(null)
  const [modalidade, setModalidade]         = useState('')
  const [valorImovel, setValorImovel]       = useState('')
  const [valorFinanciar, setValorFinanciar] = useState('')

  // FGTS: null = não escolhido, true = sim, false = não
  const [fgts, setFgts]         = useState<boolean | null>(null)
  const [valorFgts, setValorFgts] = useState('')

  // Assessoria: null = não escolhido, true = com, false = sem
  const [assessoria, setAssessoria]         = useState<boolean | null>(null)
  const [valorAssessoria, setValorAssessoria] = useState('')

  // Responsáveis
  const [operacionalId, setOperacionalId] = useState(usuario?.id ?? '')
  const [comercialId, setComercialId]     = useState(lead?.responsavel_id ?? usuario?.id ?? '')

  const [erros, setErros] = useState<Record<string, string>>({})

  function clr(...keys: string[]) {
    setErros(p => { const n = { ...p }; keys.forEach(k => delete n[k]); return n })
  }

  function validar() {
    const e: Record<string, string> = {}
    if (!nome.trim())     e.nome     = 'Informe o nome do cliente'
    if (!cpf.trim())      e.cpf      = 'Informe o CPF'
    if (!telefone.trim()) e.telefone = 'Informe o telefone'
    if (!email.trim())    e.email    = 'Informe o e-mail'
    if (!bancoId)         e.bancoId  = 'Selecione o banco'
    if (!modalidade)      e.modalidade = 'Selecione a modalidade'
    if (!valorImovel || parseMoeda(valorImovel) <= 0)   e.valorImovel   = 'Informe o valor do imóvel'
    if (!valorFinanciar || parseMoeda(valorFinanciar) <= 0) e.valorFinanciar = 'Informe o valor a financiar'
    if (fgts === null)    e.fgts     = 'Selecione uma opção'
    if (fgts && (!valorFgts || parseMoeda(valorFgts) <= 0)) e.valorFgts = 'Informe o valor do FGTS'
    if (assessoria === null) e.assessoria = 'Selecione uma opção'
    if (assessoria && (!valorAssessoria || parseMoeda(valorAssessoria) <= 0)) e.valorAssessoria = 'Informe o valor da assessoria'
    if (!operacionalId || operacionalId === '__nenhum') e.operacionalId = 'Selecione o operacional'
    if (!comercialId   || comercialId   === '__nenhum') e.comercialId   = 'Selecione o comercial'
    setErros(e)
    return Object.keys(e).length === 0
  }

  async function handleCriar() {
    if (!validar()) return

    const { data: primeiraFase } = await supabase.from('fases').select('id')
      .eq('empresa_id', usuario!.empresa_id).eq('modulo', 'processos')
      .eq('ativo', true).order('ordem', { ascending: true }).limit(1).maybeSingle()

    const processo = await criarProcesso.mutateAsync({
      lead_id:          lead?.id ?? null,
      pessoa_id:        pessoa?.id ?? null,
      nome_imovel:      '',
      modalidade:       modalidade as any,
      banco_id:         bancoId,
      valor_imovel:     parseMoeda(valorImovel),
      valor_financiado: parseMoeda(valorFinanciar) || null,
      valor_entrada:    null,
      valor_fgts:       fgts ? parseMoeda(valorFgts) : null,
      status_emissao:   'nao_emitido',
      chance_emissao:   'incerteza',
      status_processo:  'em_analise',
      tem_assessoria:   assessoria === true,
      valor_assessoria: assessoria && valorAssessoria ? parseMoeda(valorAssessoria) : null,
      comissao_comercial: comissaoComercial,
      comissao_empresa:   comissaoEmpresa,
      operacional_id:   operacionalId,
      comercial_id:     comercialId,
      corretor_nome:    null,
      corretor_creci:   null,
      fase_atual_id:    primeiraFase?.id ?? null,
      data_inicio:      new Date().toISOString().split('T')[0],
    })

    if (nome.trim()) {
      await supabase.from('processo_compradores').insert({
        processo_id: processo.id,
        empresa_id:  processo.empresa_id,
        nome:        nome.trim(),
        cpf:         cpf.trim() || null,
        email:       email.trim() || null,
        telefone:    telefone.trim() || null,
        principal:   true,
      })
    }

    if (lead) await marcarLeadConvertido(lead.id)

    await onProcessoCriado({
      processoId:        processo.id,
      empresaId:         processo.empresa_id,
      pessoaIdComprador: lead?.pessoa_id ?? pessoa?.id ?? null,
      nomeComprador:     nome.trim(),
      pessoaIdConjuge:   lead?.conjuge_pessoa_id ?? null,
      nomeConjuge:       lead?.conjuge_nome ?? null,
    })
  }

  return (
    <div className="max-h-[75svh] space-y-5 overflow-y-auto px-4 py-5 sm:px-5">
      <Secao titulo="Dados do Cliente">
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Nome *">
            <Input
              value={nome}
              onChange={e => { setNome(e.target.value); clr('nome') }}
              className={cn('h-9 text-sm', erros.nome && 'border-red-400')}
              readOnly={!!nome && !!lead}
            />
            {erros.nome && <p className="text-xs text-red-500 mt-0.5">{erros.nome}</p>}
          </Campo>
          <Campo label="CPF *">
            <Input
              value={cpf}
              onChange={e => { setCpf(e.target.value); clr('cpf') }}
              className={cn('h-9 text-sm', erros.cpf && 'border-red-400')}
              placeholder="000.000.000-00"
            />
            {erros.cpf && <p className="text-xs text-red-500 mt-0.5">{erros.cpf}</p>}
          </Campo>
          <Campo label="Telefone *">
            <Input
              value={telefone}
              onChange={e => { setTelefone(e.target.value); clr('telefone') }}
              className={cn('h-9 text-sm', erros.telefone && 'border-red-400')}
              placeholder="(44) 99999-9999"
            />
            {erros.telefone && <p className="text-xs text-red-500 mt-0.5">{erros.telefone}</p>}
          </Campo>
          <Campo label="E-mail *">
            <Input
              value={email}
              onChange={e => { setEmail(e.target.value); clr('email') }}
              className={cn('h-9 text-sm', erros.email && 'border-red-400')}
              placeholder="email@exemplo.com"
            />
            {erros.email && <p className="text-xs text-red-500 mt-0.5">{erros.email}</p>}
          </Campo>
        </div>
      </Secao>

      <Secao titulo="Dados do Financiamento">
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Banco *" className="col-span-2">
            <Select value={bancoId} onValueChange={(v) => {
              setBancoId(v); clr('bancoId')
              const cp = comissoesPadrao.find(c => c.banco_id === v)
              setComissaoComercial(cp?.comissao_comercial ?? null)
              setComissaoEmpresa(cp?.comissao_empresa ?? null)
            }}>
              <SelectTrigger className={cn('h-9 text-sm', erros.bancoId && 'border-red-400')}><SelectValue placeholder="Selecione o banco" /></SelectTrigger>
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
            {erros.bancoId && <p className="text-xs text-red-500 mt-0.5">{erros.bancoId}</p>}
          </Campo>
          <Campo label="Modalidade *">
            <Select value={modalidade} onValueChange={(v) => { setModalidade(v); clr('modalidade') }}>
              <SelectTrigger className={cn('h-9 text-sm', erros.modalidade && 'border-red-400')}><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>{MODALIDADES.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
            </Select>
            {erros.modalidade && <p className="text-xs text-red-500 mt-0.5">{erros.modalidade}</p>}
          </Campo>
          <Campo label="Valor do Imóvel *">
            <Input placeholder="R$ 0,00" value={valorImovel}
              onChange={e => { setValorImovel(e.target.value); clr('valorImovel') }}
              onBlur={e => setValorImovel(formatMoedaInput(e.target.value))}
              className={cn('h-9 text-sm', erros.valorImovel && 'border-red-400')} />
            {erros.valorImovel && <p className="text-xs text-red-500 mt-0.5">{erros.valorImovel}</p>}
          </Campo>
          <Campo label="Valor a Financiar *">
            <Input placeholder="R$ 0,00" value={valorFinanciar}
              onChange={e => { setValorFinanciar(e.target.value); clr('valorFinanciar') }}
              onBlur={e => setValorFinanciar(formatMoedaInput(e.target.value))}
              className={cn('h-9 text-sm', erros.valorFinanciar && 'border-red-400')} />
            {erros.valorFinanciar && <p className="text-xs text-red-500 mt-0.5">{erros.valorFinanciar}</p>}
          </Campo>
        </div>

        {/* FGTS — radio obrigatório */}
        <div className="mt-4 space-y-2">
          <p className={cn('text-xs font-medium', erros.fgts ? 'text-red-500' : 'text-gray-700')}>
            Vai usar FGTS? *{erros.fgts && <span className="ml-1 font-normal">{erros.fgts}</span>}
          </p>
          <div className="flex gap-4">
            {([true, false] as const).map(val => (
              <label key={String(val)} className="flex items-center gap-2 cursor-pointer">
                <div
                  onClick={() => { setFgts(val); clr('fgts', 'valorFgts') }}
                  className={cn(
                    'w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors cursor-pointer',
                    fgts === val ? 'border-fonti-primary' : erros.fgts ? 'border-red-400' : 'border-gray-300'
                  )}
                >
                  {fgts === val && <div className="w-2 h-2 rounded-full bg-fonti-primary" />}
                </div>
                <span className="text-sm text-gray-700">{val ? 'Sim' : 'Não'}</span>
              </label>
            ))}
          </div>
          {fgts === true && (
            <Campo label="Valor do FGTS *">
              <Input placeholder="R$ 0,00" value={valorFgts}
                onChange={e => { setValorFgts(e.target.value); clr('valorFgts') }}
                onBlur={e => setValorFgts(formatMoedaInput(e.target.value))}
                className={cn('h-9 text-sm', erros.valorFgts && 'border-red-400')} />
              {erros.valorFgts && <p className="text-xs text-red-500 mt-0.5">{erros.valorFgts}</p>}
            </Campo>
          )}
        </div>
      </Secao>

      {/* Assessoria — radio obrigatório */}
      <Secao titulo="Assessoria">
        <div className="space-y-2">
          <p className={cn('text-xs font-medium', erros.assessoria ? 'text-red-500' : 'text-gray-700')}>
            Processo inclui assessoria? *{erros.assessoria && <span className="ml-1 font-normal">{erros.assessoria}</span>}
          </p>
          <div className="flex gap-4">
            {([true, false] as const).map(val => (
              <label key={String(val)} className="flex items-center gap-2 cursor-pointer">
                <div
                  onClick={() => { setAssessoria(val); clr('assessoria', 'valorAssessoria') }}
                  className={cn(
                    'w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors cursor-pointer',
                    assessoria === val ? 'border-fonti-primary' : erros.assessoria ? 'border-red-400' : 'border-gray-300'
                  )}
                >
                  {assessoria === val && <div className="w-2 h-2 rounded-full bg-fonti-primary" />}
                </div>
                <span className="text-sm text-gray-700">{val ? 'Com Assessoria' : 'Sem Assessoria'}</span>
              </label>
            ))}
          </div>
          {assessoria === true && (
            <Campo label="Valor da Assessoria *">
              <Input placeholder="R$ 0,00" value={valorAssessoria}
                onChange={e => { setValorAssessoria(e.target.value); clr('valorAssessoria') }}
                onBlur={e => setValorAssessoria(formatMoedaInput(e.target.value))}
                className={cn('h-9 text-sm', erros.valorAssessoria && 'border-red-400')} />
              {erros.valorAssessoria && <p className="text-xs text-red-500 mt-0.5">{erros.valorAssessoria}</p>}
            </Campo>
          )}
        </div>
      </Secao>

      <Secao titulo="Responsáveis">
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Operacional *">
            <Select value={operacionalId} onValueChange={(v) => { setOperacionalId(v); clr('operacionalId') }}>
              <SelectTrigger className={cn('h-9 text-sm', erros.operacionalId && 'border-red-400')}><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {usuarios.map(u => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
              </SelectContent>
            </Select>
            {erros.operacionalId && <p className="text-xs text-red-500 mt-0.5">{erros.operacionalId}</p>}
          </Campo>
          <Campo label="Comercial *">
            <Select value={comercialId} onValueChange={(v) => { setComercialId(v); clr('comercialId') }}>
              <SelectTrigger className={cn('h-9 text-sm', erros.comercialId && 'border-red-400')}><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {usuarios.map(u => <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>)}
              </SelectContent>
            </Select>
            {erros.comercialId && <p className="text-xs text-red-500 mt-0.5">{erros.comercialId}</p>}
          </Campo>
        </div>
      </Secao>

      <div className="flex flex-col-reverse gap-2 border-t border-gray-100 pt-3 sm:flex-row sm:justify-end">
        <Button variant="outline" size="sm" onClick={onVoltar} className="h-9 w-full sm:w-auto" disabled={criarProcesso.isPending}>
          Cancelar
        </Button>
        <Button
          size="sm"
          className="h-9 min-w-[120px] w-full bg-fonti-primary text-white hover:bg-fonti-primary-hover sm:w-auto"
          onClick={handleCriar}
          disabled={criarProcesso.isPending}
        >
          {criarProcesso.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Criar Processo'}
        </Button>
      </div>
    </div>
  )
}

/* ── Formulário CGI ── */
function FormCGI({ lead, pessoa, onVoltar, onFechar, onProcessoCriado }: {
  lead: Lead | null
  pessoa?: PessoaMinima | null
  onVoltar: () => void
  onFechar: () => void
  onProcessoCriado: (payload: ProcessoCriadoPayload) => Promise<void>
}) {
  const { usuario } = useAuth()
  const { data: bancos = [] } = useBancos()
  const { data: usuarios = [] } = useUsuariosEmpresa()
  const criarProcesso = useCriarProcesso()

  const clienteNome    = lead?.nome ?? pessoa?.nome ?? ''
  const clienteCpf     = lead?.cpf  ?? pessoa?.cpf  ?? null

  const { data: comissoesPadrao = [] } = useComissoesPadrao()
  const [valorCredito, setValorCredito] = useState('')
  const [valorGarantia, setValorGarantia] = useState('')
  const [bancoId, setBancoId] = useState('')
  const [comissaoComercial, setComissaoComercial] = useState<number | null>(null)
  const [comissaoEmpresa, setComissaoEmpresa] = useState<number | null>(null)
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
      nome_imovel:      '',
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
      comissao_comercial: comissaoComercial,
      comissao_empresa:   comissaoEmpresa,
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

    await onProcessoCriado({
      processoId:        processo.id,
      empresaId:         processo.empresa_id,
      pessoaIdComprador: lead?.pessoa_id ?? pessoa?.id ?? null,
      nomeComprador:     clienteNome,
      pessoaIdConjuge:   lead?.conjuge_pessoa_id ?? null,
      nomeConjuge:       lead?.conjuge_nome ?? null,
    })
  }

  return (
    <div className="max-h-[75svh] space-y-5 overflow-y-auto px-4 py-5 sm:px-5">
      <Secao titulo="Dados do Cliente">
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Nome"><Input value={clienteNome} readOnly className="bg-gray-50 h-9 text-sm" /></Campo>
          <Campo label="CPF"><Input value={clienteCpf ?? '—'} readOnly className="bg-gray-50 h-9 text-sm" /></Campo>
        </div>
      </Secao>

      <Secao titulo="Dados do Crédito">
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Banco *" className="col-span-2">
            <Select value={bancoId} onValueChange={(v) => {
              setBancoId(v)
              const cp = comissoesPadrao.find(c => c.banco_id === v)
              setComissaoComercial(cp?.comissao_comercial ?? null)
              setComissaoEmpresa(cp?.comissao_empresa ?? null)
            }}>
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
            <div onClick={() => setTemAssessoria(!temAssessoria)} className={cn('w-9 h-5 rounded-full transition-colors flex items-center px-0.5 cursor-pointer', temAssessoria ? 'bg-fonti-primary' : 'bg-gray-200')}>
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
        <div className="grid gap-3 sm:grid-cols-2">
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

      <div className="flex flex-col-reverse gap-2 border-t border-gray-100 pt-3 sm:flex-row sm:justify-end">
        <Button variant="outline" size="sm" onClick={onVoltar} className="h-9 w-full sm:w-auto" disabled={criarProcesso.isPending}>Cancelar</Button>
        <Button size="sm" className="h-9 min-w-[120px] w-full bg-fonti-primary text-white hover:bg-fonti-primary-hover sm:w-auto" onClick={handleCriar} disabled={criarProcesso.isPending || !bancoId || !valorCredito}>
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

function FormContrato({ lead, pessoa, onVoltar, onFechar, onProcessoCriado }: {
  lead: Lead | null
  pessoa?: PessoaMinima | null
  onVoltar: () => void
  onFechar: () => void
  onProcessoCriado: (payload: ProcessoCriadoPayload) => Promise<void>
}) {
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
      nome_imovel:      '',
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

    await onProcessoCriado({
      processoId:        processo.id,
      empresaId:         processo.empresa_id,
      pessoaIdComprador: lead?.pessoa_id ?? pessoa?.id ?? null,
      nomeComprador:     clienteNome,
      pessoaIdConjuge:   lead?.conjuge_pessoa_id ?? null,
      nomeConjuge:       lead?.conjuge_nome ?? null,
    })
  }

  return (
    <div className="max-h-[75svh] space-y-5 overflow-y-auto px-4 py-5 sm:px-5">
      <Secao titulo="Dados do Cliente">
        <div className="grid gap-3 sm:grid-cols-2">
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
        <div className="grid gap-3 sm:grid-cols-2">
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

      <div className="flex flex-col-reverse gap-2 border-t border-gray-100 pt-3 sm:flex-row sm:justify-end">
        <Button variant="outline" size="sm" onClick={onVoltar} className="h-9 w-full sm:w-auto" disabled={criarProcesso.isPending}>Cancelar</Button>
        <Button
          size="sm"
          className="h-9 min-w-[120px] w-full bg-fonti-primary text-white hover:bg-fonti-primary-hover sm:w-auto"
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
function FormConsorcio({ lead, pessoa, onVoltar, onFechar, onProcessoCriado }: {
  lead: Lead | null
  pessoa?: PessoaMinima | null
  onVoltar: () => void
  onFechar: () => void
  onProcessoCriado: (payload: ProcessoCriadoPayload) => Promise<void>
}) {
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

    await onProcessoCriado({
      processoId:        processo.id,
      empresaId:         processo.empresa_id,
      pessoaIdComprador: lead?.pessoa_id ?? pessoa?.id ?? null,
      nomeComprador:     clienteNome,
      pessoaIdConjuge:   lead?.conjuge_pessoa_id ?? null,
      nomeConjuge:       lead?.conjuge_nome ?? null,
    })
  }

  return (
    <div className="max-h-[75svh] space-y-5 overflow-y-auto px-4 py-5 sm:px-5">
      <Secao titulo="Dados do Cliente">
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Nome"><Input value={clienteNome} readOnly className="bg-gray-50 h-9 text-sm" /></Campo>
          <Campo label="CPF"><Input value={clienteCpf ?? '—'} readOnly className="bg-gray-50 h-9 text-sm" /></Campo>
        </div>
      </Secao>

      <Secao titulo="Bem">
        <div className="grid gap-3 sm:grid-cols-2">
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
          <div className="grid gap-3 sm:grid-cols-2">
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
        <div className="grid gap-3 sm:grid-cols-2">
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

      <div className="flex flex-col-reverse gap-2 border-t border-gray-100 pt-3 sm:flex-row sm:justify-end">
        <Button variant="outline" size="sm" onClick={onVoltar} className="h-9 w-full sm:w-auto" disabled={criarProcesso.isPending}>Cancelar</Button>
        <Button size="sm" className="h-9 min-w-[120px] w-full bg-fonti-primary text-white hover:bg-fonti-primary-hover sm:w-auto" onClick={handleCriar} disabled={criarProcesso.isPending || !tipoBem || !valorCarta}>
          {criarProcesso.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Criar Processo'}
        </Button>
      </div>
    </div>
  )
}

/* ── Etapa de vinculação de documentos ── */
function VincularStep({ vinculacao, usuario, onConcluir, onPular }: {
  vinculacao: VinculacaoState
  usuario: ReturnType<typeof useAuth>['usuario']
  onConcluir: (processoId: string) => void
  onPular: (processoId: string) => void
}) {
  const { processoId, empresaId, docs, pessoaIdComprador, nomeComprador, pessoaIdConjuge, nomeConjuge } = vinculacao

  const [selecionados, setSelecionados] = useState<Set<string>>(() => {
    const pre = new Set<string>()
    docs.forEach(d => { if (preSelecionar(d)) pre.add(d.id) })
    return pre
  })
  const [vinculando, setVinculando] = useState(false)

  function toggle(id: string) {
    setSelecionados(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (selecionados.size === docs.length) {
      setSelecionados(new Set())
    } else {
      setSelecionados(new Set(docs.map(d => d.id)))
    }
  }

  async function handleVincular(ids: Set<string>) {
    if (ids.size === 0) { onPular(processoId); return }
    setVinculando(true)
    const rows = Array.from(ids).map(docId => ({
      empresa_id:    empresaId,
      documento_id:  docId,
      processo_id:   processoId,
      vinculado_por: usuario?.id ?? null,
    }))
    const { error } = await supabase
      .from('documento_processo_vinculos')
      .upsert(rows, { onConflict: 'documento_id,processo_id' })
    setVinculando(false)
    if (error) {
      console.error('[VincularStep] erro ao vincular documentos:', error)
      toast.error(`Erro ao vincular documentos: ${error.message}`)
      return
    }
    onConcluir(processoId)
  }

  const docsComprador = docs.filter(d => d.pessoa_id === pessoaIdComprador)
  const docsConjuge   = docs.filter(d => d.pessoa_id === pessoaIdConjuge)

  return (
    <div className="flex max-h-[75svh] flex-col overflow-hidden">
      <div className="flex flex-col gap-2 border-b border-gray-100 bg-gray-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <p className="text-xs text-gray-500">
          {docs.length} documento{docs.length !== 1 ? 's' : ''} encontrado{docs.length !== 1 ? 's' : ''}
        </p>
        <button onClick={toggleAll} className="text-xs text-fonti-primary hover:underline font-medium">
          {selecionados.size === docs.length ? 'Desmarcar todos' : 'Selecionar todos'}
        </button>
      </div>

      <div className="max-h-[60svh] space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
        <GrupoDocumentos
          titulo={nomeComprador}
          docs={docsComprador}
          selecionados={selecionados}
          onToggle={toggle}
        />
        {pessoaIdConjuge && docsConjuge.length > 0 && (
          <GrupoDocumentos
            titulo={`Cônjuge — ${nomeConjuge ?? 'Cônjuge'}`}
            docs={docsConjuge}
            selecionados={selecionados}
            onToggle={toggle}
          />
        )}
      </div>

      <div className="flex flex-col-reverse gap-2 border-t border-gray-100 px-4 py-4 sm:flex-row sm:justify-end sm:px-5">
        <Button
          variant="outline"
          size="sm"
          className="h-9 w-full gap-1.5 text-gray-500 sm:w-auto"
          onClick={() => onPular(processoId)}
          disabled={vinculando}
        >
          <SkipForward className="h-3.5 w-3.5" />
          Pular
        </Button>
        <Button
          size="sm"
          className="h-9 min-w-[150px] w-full gap-1.5 bg-fonti-primary text-white hover:bg-fonti-primary-hover sm:w-auto"
          onClick={() => handleVincular(selecionados)}
          disabled={vinculando}
        >
          {vinculando
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <><Link2 className="h-3.5 w-3.5" />Vincular {selecionados.size} selecionado{selecionados.size !== 1 ? 's' : ''}</>
          }
        </Button>
      </div>
    </div>
  )
}

function GrupoDocumentos({ titulo, docs, selecionados, onToggle }: {
  titulo: string
  docs: DocumentoParaVincular[]
  selecionados: Set<string>
  onToggle: (id: string) => void
}) {
  if (docs.length === 0) return null
  return (
    <div>
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{titulo}</p>
      <div className="space-y-1.5">
        {docs.map(doc => {
          const status = calcularStatusValidade(doc)
          const label  = LABELS_CLASSIFICACAO_MODAL[doc.classificacao ?? ''] ?? doc.nome_exibicao ?? doc.nome_original
          return (
            <label
              key={doc.id}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition-colors',
                selecionados.has(doc.id)
                  ? 'border-fonti-primary/20 bg-fonti-accent-hover/30'
                  : 'border-gray-100 bg-white hover:bg-gray-50'
              )}
            >
              <input
                type="checkbox"
                checked={selecionados.has(doc.id)}
                onChange={() => onToggle(doc.id)}
                className="rounded accent-fonti-primary shrink-0"
              />
              <span className="flex-1 text-sm font-medium text-fonti-primary truncate">{label}</span>
              {status && (
                <span className={cn(
                  'text-xs px-2 py-0.5 rounded-full border font-medium shrink-0',
                  CORES_VALIDADE[status]
                )}>
                  {ICONES_VALIDADE[status]} {LABELS_VALIDADE[status]}
                </span>
              )}
            </label>
          )
        })}
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
