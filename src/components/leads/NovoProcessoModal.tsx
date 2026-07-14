'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Home, Clock, CreditCard, FileText, Building, ChevronRight, MessageCircle, Loader2, User, Link2, SkipForward, Eye } from 'lucide-react'
import { cn } from '@/lib/utils'
import { type Lead, type LeadAnaliseCredito } from '@/types/leads'
import { useAnalisesCredito } from '@/hooks/leads/useAnalisesCredito'
import { useBancos } from '@/hooks/useBancos'
import { useCriarProcesso } from '@/hooks/processos/useCriarProcesso'
import { useComissoesPadrao } from '@/hooks/configuracoes/useComissoesPadrao'
import { useUsuariosEmpresa } from '@/hooks/useUsuariosEmpresa'
import { useAuth } from '@/hooks/auth/useAuth'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import {
  inferirValidade, preSelecionar, inferirPastaSugerida,
  calcularStatusValidade, LABELS_VALIDADE, ICONES_VALIDADE, CORES_VALIDADE,
  type StatusValidade,
} from '@/lib/documentos'
import { useCatalogoPastasProcesso } from '@/hooks/documentos/useCatalogoPastasProcesso'
import { useCatalogoTiposDocumento } from '@/hooks/documentos/useCatalogoTiposDocumento'
import { SeletorImovelProcesso, type ImovelSelecionado } from '@/components/leads/SeletorImovelProcesso'
import { PessoaBuscaCombobox, type PessoaOpcao } from '@/components/processos/PessoaBuscaCombobox'
import { NovaPessoaModal, type PessoaCriada } from '@/components/pessoas/NovaPessoaModal'

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
  storage_path: string
}

interface ProcessoCriadoPayload {
  processoId: string
  empresaId: string
  pessoaIdComprador: string | null
  nomeComprador: string
  pessoaIdConjuge: string | null
  nomeConjuge: string | null
  pessoaIdVendedor: string | null
  nomeVendedor: string | null
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

/** Bloco informativo mostrando os dados de parceiro/origem herdados do Lead. */
function ParceiroBadge({ lead }: { lead: Lead | null }) {
  if (!lead?.parceiro && !lead?.origem && !lead?.campanha) return null
  return (
    <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm space-y-0.5">
      <p className="text-xs font-semibold text-blue-700 mb-1">Herdado do Lead</p>
      {lead.parceiro && (
        <p className="text-blue-800">
          <span className="text-blue-500">Parceiro:</span>{' '}
          <span className="font-medium">{lead.parceiro.nome}</span>
          {lead.parceiro.tipo_parceiro && (
            <span className="ml-1 text-blue-500">({lead.parceiro.tipo_parceiro})</span>
          )}
        </p>
      )}
      {lead.parceiro?.imobiliaria && (
        <p className="text-blue-800">
          <span className="text-blue-500">Imobiliária:</span>{' '}
          <span className="font-medium">{lead.parceiro.imobiliaria}</span>
        </p>
      )}
      {lead.origem && (
        <p className="text-blue-800">
          <span className="text-blue-500">Origem:</span>{' '}
          <span className="font-medium">{fmtOrigem(lead.origem)}</span>
        </p>
      )}
      {lead.campanha && (
        <p className="text-blue-800">
          <span className="text-blue-500">Campanha:</span>{' '}
          <span className="font-medium">{lead.campanha}</span>
        </p>
      )}
    </div>
  )
}

async function marcarLeadConvertido(leadId: string) {
  await supabase.rpc('marcar_lead_convertido', { p_lead_id: leadId })
}

// Espelha o vendedor do Lead (nome/CPF/telefone + pessoa_id, quando já vinculado a uma
// Pessoa) para processo_vendedores na conversão Lead→Processo — mesmo bug de
// "esquecer de copiar o dado" já corrigido para processo_compradores.pessoa_id nesta
// sessão. Sem isso, o vendedor sempre se perdia ao virar Processo, mesmo quando o Lead
// já tinha vendedor_pessoa_id vinculado.
async function criarVendedorDoLead(processoId: string, empresaId: string, lead: Lead | null) {
  if (!lead?.vendedor_nome?.trim() && !lead?.vendedor_pessoa_id) return
  await supabase.from('processo_vendedores').insert({
    processo_id: processoId,
    empresa_id:  empresaId,
    nome:        lead.vendedor_nome?.trim() || '(a definir)',
    cpf:         lead.vendedor_cpf?.trim() || null,
    telefone:    lead.vendedor_telefone?.trim() || null,
    pessoa_id:   lead.vendedor_pessoa_id ?? null,
  })
}

function parseMoeda(v: string): number {
  return Number(v.replace(/[^\d,]/g, '').replace(',', '.')) || 0
}

function formatMoedaInput(v: string): string {
  const num = parseMoeda(v)
  if (!num) return ''
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(num)
}

function fmtN(n?: number | null): string {
  if (!n) return ''
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n)
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

  // undefined = seletor não mostrado, null = sem análise, string = id da análise escolhida
  const [analiseId, setAnaliseId] = useState<string | null | undefined>(undefined)
  const { analises } = useAnalisesCredito(lead?.id ?? '')

  const analise = analises.find(a => a.id === analiseId) ?? null

  // Mostrar seletor de análise somente para financiamento quando há análises cadastradas
  const showSeletorAnalise =
    tipo === 'financiamento' &&
    analiseId === undefined &&
    lead !== null &&
    analises.length > 0

  // Se já existe uma análise marcada como "Banco Definido", ela é a decisiva —
  // usa direto, sem perguntar de novo qual análise usar (SeletorAnalise só
  // aparece quando há ambiguidade, ou seja, nenhuma análise com banco definido).
  function handleSelecionarTipo(t: TipoProcesso) {
    if (t === 'financiamento') {
      const bancoDefinido = analises.find(a => a.banco_definido)
      if (bancoDefinido) {
        setAnaliseId(bancoDefinido.id)
        setTipo(t)
        return
      }
    }
    setTipo(t)
  }

  function fechar() {
    setTipo(null)
    setAnaliseId(undefined)
    setVinculacao(null)
    onFechar()
  }

  async function handleProcessoCriado(payload: ProcessoCriadoPayload) {
    const pessoaIds = [payload.pessoaIdComprador, payload.pessoaIdConjuge, payload.pessoaIdVendedor].filter((id): id is string => !!id)

    if (pessoaIds.length > 0) {
      setBuscandoDocs(true)
      // Lê do Acervo Documental unificado (não mais documentos_clientes): também
      // traz documentos cuja pessoa_id só foi resolvida via lead/comprador pelo
      // trigger de sincronização, não só os que já tinham pessoa_id direto.
      const { data: docs } = await supabase
        .from('documentos')
        .select('id, nome_original, nome_exibicao, classificacao:classificacao_legado, permanente, validade_data, validade_dias, created_at:recebido_em, pessoa_id, storage_path')
        .eq('dominio', 'acervo_documental')
        .in('pessoa_id', pessoaIds)
        .eq('empresa_id', payload.empresaId)
        .is('deleted_at', null)
        .order('classificacao_legado', { ascending: true })
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
    : showSeletorAnalise
    ? 'Selecionar Análise de Crédito'
    : !tipo
    ? 'Novo Processo'
    : `Novo Processo de ${PRODUTOS.find(p => p.id === tipo)?.nome}`

  const subtituloHeader = vinculacao
    ? 'Selecione quais documentos existentes devem ser aproveitados neste processo'
    : showSeletorAnalise
    ? 'Selecione qual análise de crédito será usada neste processo'
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
          <SeletorTipo lead={lead} pessoa={pessoa} onSelecionar={handleSelecionarTipo} onFechar={fechar} />
        ) : showSeletorAnalise ? (
          <SeletorAnalise
            analises={analises}
            onSelecionar={setAnaliseId}
            onVoltar={() => setTipo(null)}
          />
        ) : tipo === 'financiamento' ? (
          <FormFinanciamento lead={lead} pessoa={pessoa} analise={analise} onVoltar={() => { setTipo(null); setAnaliseId(undefined) }} onFechar={fechar} onProcessoCriado={handleProcessoCriado} />
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

  // Financiamento e CGI herdam a validade do crédito aprovado no Lead — sem
  // Data da Aprovação + Validade do Crédito preenchidas, ficam bloqueados.
  const faltaCredito = !!lead && (!lead.data_credito || !lead.validade_credito)

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
          {PRODUTOS.map((p) => {
            const bloqueadoPorCredito = !p.emBreve && faltaCredito && (p.id === 'financiamento' || p.id === 'cgi')
            const bloqueado = p.emBreve || bloqueadoPorCredito
            return (
              <button
                key={p.id}
                disabled={bloqueado}
                onClick={() => onSelecionar(p.id)}
                className={cn('w-full flex items-center gap-3 px-4 py-3 text-left transition-colors', bloqueado ? 'bg-gray-50 cursor-not-allowed' : 'bg-white hover:bg-fonti-accent-hover/30 cursor-pointer')}
              >
                <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', bloqueado ? 'bg-gray-100 text-gray-300' : 'bg-fonti-accent-hover text-fonti-primary')}>
                  {p.icone}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={cn('text-sm font-medium', bloqueado ? 'text-gray-400' : 'text-fonti-primary')}>{p.nome}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{p.descricao}</p>
                </div>
                {p.emBreve
                  ? <span className="text-xs bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full shrink-0">Em breve</span>
                  : bloqueadoPorCredito
                  ? <span className="text-xs bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full shrink-0 text-right">Requer aprovação de crédito</span>
                  : <ChevronRight className="h-4 w-4 text-gray-300 shrink-0" />
                }
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={onFechar} className="h-9 w-full sm:w-auto">Cancelar</Button>
      </div>
    </div>
  )
}

/* ── Seletor de Análise de Crédito ── */
function SeletorAnalise({ analises, onSelecionar, onVoltar }: {
  analises: LeadAnaliseCredito[]
  onSelecionar: (id: string | null) => void
  onVoltar: () => void
}) {
  return (
    <div className="space-y-4 px-4 pb-5 pt-4 sm:px-5">
      <div className="divide-y divide-gray-100 border border-gray-200 rounded-xl overflow-hidden">
        {analises.map((analise) => (
          <button
            key={analise.id}
            onClick={() => onSelecionar(analise.id)}
            className="w-full flex items-start gap-3 px-4 py-3 text-left bg-white hover:bg-fonti-accent-hover/30 transition-colors cursor-pointer"
          >
            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-fonti-accent-hover text-fonti-primary mt-0.5">
              <CreditCard className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-fonti-primary">{analise.nome}</p>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                {analise.banco_pretendido && (
                  <span className="text-xs text-gray-500">{analise.banco_pretendido}</span>
                )}
                {analise.valor_pretendido != null && (
                  <span className="text-xs text-gray-500">Financiar: {fmtMoeda(analise.valor_pretendido)}</span>
                )}
                {analise.valor_imovel != null && (
                  <span className="text-xs text-gray-500">Imóvel: {fmtMoeda(analise.valor_imovel)}</span>
                )}
                {analise.prazo_meses != null && (
                  <span className="text-xs text-gray-500">{analise.prazo_meses} meses</span>
                )}
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-gray-300 shrink-0 mt-1" />
          </button>
        ))}
        <button
          onClick={() => onSelecionar(null)}
          className="w-full flex items-center gap-3 px-4 py-3 text-left bg-white hover:bg-gray-50 transition-colors cursor-pointer"
        >
          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-gray-100 text-gray-400">
            <FileText className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-600">Preencher manualmente</p>
            <p className="text-xs text-gray-400 mt-0.5">Usar dados gerais do lead</p>
          </div>
          <ChevronRight className="h-4 w-4 text-gray-300 shrink-0" />
        </button>
      </div>

      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={onVoltar} className="h-9 w-full sm:w-auto">
          Voltar
        </Button>
      </div>
    </div>
  )
}

/* ── Formulário Financiamento ── */
function FormFinanciamento({ lead, pessoa, analise, onVoltar, onFechar, onProcessoCriado }: {
  lead: Lead | null
  pessoa?: PessoaMinima | null
  analise?: LeadAnaliseCredito | null
  onVoltar: () => void
  onFechar: () => void
  onProcessoCriado: (payload: ProcessoCriadoPayload) => Promise<void>
}) {
  const { usuario } = useAuth()
  const { data: bancos = [] } = useBancos()
  const { data: usuarios = [] } = useUsuariosEmpresa()
  const criarProcesso = useCriarProcesso()
  const { data: comissoesPadrao = [] } = useComissoesPadrao()

  // Dados de crédito: análise selecionada tem prioridade sobre campos do lead
  const fonte = analise ?? lead

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
  const [valorImovel, setValorImovel]       = useState(() => fmtN(fonte?.valor_imovel))
  const [valorFinanciar, setValorFinanciar] = useState(() => fmtN(fonte?.valor_pretendido))
  const [valorEntrada, setValorEntrada]     = useState(() => fmtN(fonte?.entrada))

  // FGTS: null = não escolhido, true = sim, false = não
  const [fgts, setFgts]         = useState<boolean | null>(null)
  const [valorFgts, setValorFgts] = useState('')

  // Assessoria: null = não escolhido, true = com, false = sem
  const [assessoria, setAssessoria]         = useState<boolean | null>(null)
  const [valorAssessoria, setValorAssessoria] = useState('')

  // Responsáveis
  const [operacionalId, setOperacionalId] = useState(usuario?.id ?? '')
  const [comercialId, setComercialId]     = useState(lead?.responsavel_id ?? usuario?.id ?? '')

  // Imóvel — mesmo padrão do BlocoImovel usado dentro do Processo (busca ou
  // cadastra um imóvel do módulo Imóveis, disponível pra reuso futuro).
  const [imovel, setImovel] = useState<ImovelSelecionado | null>(null)

  // Vendedor — mesmo padrão de busca/criação de Pessoa usado em AbaVendedores.
  const [vendedorPessoa, setVendedorPessoa] = useState<PessoaOpcao | null>(null)
  const [novaPessoaVendedorAberta, setNovaPessoaVendedorAberta] = useState(false)

  const [erros, setErros] = useState<Record<string, string>>({})

  // Auto-seleciona banco: análise tem prioridade sobre o campo do lead
  useEffect(() => {
    const bancoPretendido = fonte?.banco_pretendido
    if (bancos.length > 0 && !bancoId && bancoPretendido) {
      const q = bancoPretendido.toLowerCase()
      const match = bancos.find(b =>
        b.nome.toLowerCase().includes(q) || q.includes(b.nome.toLowerCase())
      )
      if (match) {
        setBancoId(match.id)
        const cp = comissoesPadrao.find(c => c.banco_id === match.id)
        setComissaoComercial(cp?.comissao_comercial ?? null)
        setComissaoEmpresa(cp?.comissao_empresa ?? null)
      }
    }
  }, [bancos, comissoesPadrao, fonte?.banco_pretendido])

  // Pré-preenche o vendedor a partir do Lead, quando já vinculado a uma Pessoa
  useEffect(() => {
    if (!lead?.vendedor_pessoa_id) return
    let cancelado = false
    supabase
      .from('pessoas')
      .select('id, nome, cpf, email')
      .eq('id', lead.vendedor_pessoa_id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelado && data) {
          setVendedorPessoa({ id: data.id, nome: data.nome, cpf: data.cpf, email: data.email, telefone: null })
        }
      })
    return () => { cancelado = true }
  }, [lead?.vendedor_pessoa_id])

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
      nome_imovel:      imovel?.nome_imovel ?? '',
      modalidade:       modalidade as any,
      banco_id:         bancoId,
      valor_imovel:     parseMoeda(valorImovel),
      valor_financiado:  parseMoeda(valorFinanciar) || null,
      valor_entrada:     parseMoeda(valorEntrada) || null,
      validade_credito:  lead?.validade_credito ?? null,
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
      corretor_nome:    lead?.parceiro?.tipo_parceiro === 'corretor' ? lead.parceiro!.nome : null,
      corretor_creci:   null,
      parceiro_id:      lead?.parceiro_id ?? null,
      origem:           lead?.origem ?? null,
      campanha:         lead?.campanha ?? null,
      fase_atual_id:    primeiraFase?.id ?? null,
      data_inicio:      new Date().toISOString().split('T')[0],
      ...(imovel ? {
        imovel_id:               imovel.imovel_id,
        imovel_matricula:        imovel.imovel_matricula,
        imovel_tipo:             imovel.imovel_tipo,
        imovel_categoria:        imovel.imovel_categoria,
        imovel_area_construida:  imovel.imovel_area_construida,
        imovel_area_terreno:     imovel.imovel_area_terreno,
        imovel_rua:              imovel.imovel_rua,
        imovel_numero:           imovel.imovel_numero,
        imovel_complemento:      imovel.imovel_complemento,
        imovel_bairro:           imovel.imovel_bairro,
        imovel_cidade:           imovel.imovel_cidade,
        imovel_uf:               imovel.imovel_uf,
        imovel_registro_id:      imovel.imovel_registro_id,
      } : {}),
    })

    if (lead?.parceiro_id) {
      await supabase.from('processo_parceiros').insert({ processo_id: processo.id, parceiro_id: lead.parceiro_id })
    }

    if (nome.trim()) {
      await supabase.from('processo_compradores').insert({
        processo_id: processo.id,
        empresa_id:  processo.empresa_id,
        nome:        nome.trim(),
        cpf:         cpf.trim() || null,
        email:       email.trim() || null,
        telefone:    telefone.trim() || null,
        principal:   true,
        pessoa_id:   lead?.pessoa_id ?? pessoa?.id ?? null,
      })
    }

    // Vendedor escolhido/confirmado no modal tem prioridade; sem escolha,
    // mantém o comportamento anterior (copia do Lead).
    if (vendedorPessoa) {
      await supabase.from('processo_vendedores').insert({
        processo_id: processo.id,
        empresa_id:  processo.empresa_id,
        nome:        vendedorPessoa.nome,
        cpf:         vendedorPessoa.cpf,
        pessoa_id:   vendedorPessoa.id,
      })
    } else {
      await criarVendedorDoLead(processo.id, processo.empresa_id, lead)
    }

    if (lead) await marcarLeadConvertido(lead.id)

    await onProcessoCriado({
      processoId:        processo.id,
      empresaId:         processo.empresa_id,
      pessoaIdComprador: lead?.pessoa_id ?? pessoa?.id ?? null,
      nomeComprador:     nome.trim(),
      pessoaIdConjuge:   lead?.conjuge_pessoa_id ?? null,
      nomeConjuge:       lead?.conjuge_nome ?? null,
      pessoaIdVendedor:  vendedorPessoa?.id ?? lead?.vendedor_pessoa_id ?? null,
      nomeVendedor:      vendedorPessoa?.nome ?? lead?.vendedor_nome ?? null,
    })
  }

  return (
    <div className="max-h-[75svh] space-y-5 overflow-y-auto px-4 py-5 sm:px-5">
      <ParceiroBadge lead={lead} />
      {fonte && (fonte.banco_pretendido || fonte.valor_imovel || fonte.valor_pretendido || fonte.entrada) && (
        <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-3 text-xs text-blue-700">
          <p className="font-semibold mb-1.5">
            {analise ? `Dados da análise: ${analise.nome}` : 'Dados de crédito herdados do Lead'}
          </p>
          <div className="space-y-0.5 text-blue-600">
            {fonte.banco_pretendido  && <p>Banco pretendido: <span className="font-medium">{fonte.banco_pretendido}</span></p>}
            {fonte.valor_imovel      && <p>Valor do imóvel: <span className="font-medium">{fmtN(fonte.valor_imovel)}</span></p>}
            {fonte.valor_pretendido  && <p>Valor a financiar: <span className="font-medium">{fmtN(fonte.valor_pretendido)}</span></p>}
            {fonte.entrada           && <p>Entrada: <span className="font-medium">{fmtN(fonte.entrada)}</span></p>}
          </div>
        </div>
      )}
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
          <Campo label="Entrada">
            <Input placeholder="R$ 0,00" value={valorEntrada}
              onChange={e => setValorEntrada(e.target.value)}
              onBlur={e => setValorEntrada(formatMoedaInput(e.target.value))}
              className="h-9 text-sm" />
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

      <Secao titulo="Imóvel">
        <SeletorImovelProcesso valor={imovel} onChange={setImovel} />
      </Secao>

      <Secao titulo="Vendedor">
        <PessoaBuscaCombobox
          pessoaSelecionada={vendedorPessoa}
          onSelect={setVendedorPessoa}
          onCriarPessoa={() => setNovaPessoaVendedorAberta(true)}
        />
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

      <NovaPessoaModal
        aberto={novaPessoaVendedorAberta}
        onFechar={() => setNovaPessoaVendedorAberta(false)}
        onSucesso={(p: PessoaCriada) => { setVendedorPessoa(p); setNovaPessoaVendedorAberta(false) }}
      />
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
      corretor_nome:    lead?.parceiro?.tipo_parceiro === 'corretor' ? lead.parceiro!.nome : null,
      corretor_creci:   null,
      parceiro_id:      lead?.parceiro_id ?? null,
      origem:           lead?.origem ?? null,
      campanha:         lead?.campanha ?? null,
      fase_atual_id:    primeiraFase?.id ?? null,
      data_inicio:      new Date().toISOString().split('T')[0],
    })

    if (lead?.parceiro_id) {
      await supabase.from('processo_parceiros').insert({ processo_id: processo.id, parceiro_id: lead.parceiro_id })
    }

    if (clienteNome) {
      await supabase.from('processo_compradores').insert({
        processo_id: processo.id,
        empresa_id:  processo.empresa_id,
        nome:        clienteNome,
        cpf:         clienteCpf,
        email:       lead?.email ?? pessoa?.email ?? null,
        telefone:    lead?.telefone ?? pessoa?.telefone ?? null,
        principal:   true,
        pessoa_id:   lead?.pessoa_id ?? pessoa?.id ?? null,
      })
    }
    await criarVendedorDoLead(processo.id, processo.empresa_id, lead)

    if (lead) await marcarLeadConvertido(lead.id)

    await onProcessoCriado({
      processoId:        processo.id,
      empresaId:         processo.empresa_id,
      pessoaIdComprador: lead?.pessoa_id ?? pessoa?.id ?? null,
      nomeComprador:     clienteNome,
      pessoaIdConjuge:   lead?.conjuge_pessoa_id ?? null,
      nomeConjuge:       lead?.conjuge_nome ?? null,
      pessoaIdVendedor:  lead?.vendedor_pessoa_id ?? null,
      nomeVendedor:      lead?.vendedor_nome ?? null,
    })
  }

  return (
    <div className="max-h-[75svh] space-y-5 overflow-y-auto px-4 py-5 sm:px-5">
      <ParceiroBadge lead={lead} />
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
      corretor_nome:    lead?.parceiro?.tipo_parceiro === 'corretor' ? lead.parceiro!.nome : null,
      corretor_creci:   null,
      parceiro_id:      lead?.parceiro_id ?? null,
      origem:           lead?.origem ?? null,
      campanha:         lead?.campanha ?? null,
      numero_contrato:  TIPO_CONTRATO_LABELS[tipoContrato],
      fase_atual_id:    primeiraFase?.id ?? null,
      data_inicio:      new Date().toISOString().split('T')[0],
    })

    if (lead?.parceiro_id) {
      await supabase.from('processo_parceiros').insert({ processo_id: processo.id, parceiro_id: lead.parceiro_id })
    }

    if (clienteNome) {
      await supabase.from('processo_compradores').insert({
        processo_id: processo.id,
        empresa_id:  processo.empresa_id,
        nome:        clienteNome,
        cpf:         clienteCpf,
        email:       clienteEmail,
        telefone:    clienteTelefone,
        principal:   true,
        pessoa_id:   lead?.pessoa_id ?? pessoa?.id ?? null,
      })
    }
    await criarVendedorDoLead(processo.id, processo.empresa_id, lead)

    if (lead) await marcarLeadConvertido(lead.id)

    await onProcessoCriado({
      processoId:        processo.id,
      empresaId:         processo.empresa_id,
      pessoaIdComprador: lead?.pessoa_id ?? pessoa?.id ?? null,
      nomeComprador:     clienteNome,
      pessoaIdConjuge:   lead?.conjuge_pessoa_id ?? null,
      nomeConjuge:       lead?.conjuge_nome ?? null,
      pessoaIdVendedor:  lead?.vendedor_pessoa_id ?? null,
      nomeVendedor:      lead?.vendedor_nome ?? null,
    })
  }

  return (
    <div className="max-h-[75svh] space-y-5 overflow-y-auto px-4 py-5 sm:px-5">
      <ParceiroBadge lead={lead} />
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
      corretor_nome:    administradoraFinal || null,   // Consórcio usa administradora, não parceiro
      corretor_creci:   null,
      parceiro_id:      lead?.parceiro_id ?? null,
      origem:           lead?.origem ?? null,
      campanha:         lead?.campanha ?? null,
      fase_atual_id:    primeiraFase?.id ?? null,
      data_inicio:      new Date().toISOString().split('T')[0],
    })

    if (lead?.parceiro_id) {
      await supabase.from('processo_parceiros').insert({ processo_id: processo.id, parceiro_id: lead.parceiro_id })
    }

    if (clienteNome) {
      await supabase.from('processo_compradores').insert({
        processo_id: processo.id,
        empresa_id:  processo.empresa_id,
        nome:        clienteNome,
        cpf:         clienteCpf,
        email:       clienteEmail,
        telefone:    clienteTelefone,
        principal:   true,
        pessoa_id:   lead?.pessoa_id ?? pessoa?.id ?? null,
      })
    }
    await criarVendedorDoLead(processo.id, processo.empresa_id, lead)

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
      pessoaIdVendedor:  lead?.vendedor_pessoa_id ?? null,
      nomeVendedor:      lead?.vendedor_nome ?? null,
    })
  }

  return (
    <div className="max-h-[75svh] space-y-5 overflow-y-auto px-4 py-5 sm:px-5">
      <ParceiroBadge lead={lead} />
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
  const { processoId, empresaId, docs, pessoaIdComprador, nomeComprador, pessoaIdConjuge, nomeConjuge, pessoaIdVendedor, nomeVendedor } = vinculacao

  const { data: catalogoPastas = [] } = useCatalogoPastasProcesso()
  const { data: catalogoTipos } = useCatalogoTiposDocumento()

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

  async function handleVisualizar(doc: DocumentoParaVincular) {
    const { data, error } = await supabase.storage
      .from('documentos-clientes')
      .createSignedUrl(doc.storage_path, 3600)
    if (error || !data?.signedUrl) { toast.error('Não foi possível abrir o documento.'); return }
    const a = document.createElement('a')
    a.href = data.signedUrl
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  async function handleVincular(ids: Set<string>) {
    if (ids.size === 0) { onPular(processoId); return }
    setVinculando(true)
    // Fase 1.1 (modelo definitivo): grava direto em documento_vinculos — não
    // depende mais de trigger nenhum pra o Processo enxergar o documento reaproveitado.
    // pasta_id já sai sugerido (prioridade: papel da pessoa neste processo > tipo
    // documental) — nunca obrigatório, sempre sobrescrevível depois na aba Documentos.
    const compradorasIds = [pessoaIdComprador, pessoaIdConjuge].filter((id): id is string => !!id)
    const vendedorasIds  = [pessoaIdVendedor].filter((id): id is string => !!id)
    const rows = Array.from(ids).map(docId => {
      const doc = docs.find(d => d.id === docId)
      const codigoDoTipo = catalogoTipos?.find(t => t.codigo === doc?.classificacao)?.pasta_sugerida_codigo ?? null
      const codigoPasta = doc ? inferirPastaSugerida({
        documentoPessoaId: doc.pessoa_id,
        pastaSugeridaCodigoDoTipo: codigoDoTipo,
        pessoasCompradorasIds: compradorasIds,
        pessoasVendedorasIds: vendedorasIds,
      }) : null
      const pastaId = codigoPasta ? catalogoPastas.find(p => p.codigo === codigoPasta)?.id ?? null : null
      return {
        empresa_id:    empresaId,
        documento_id:  docId,
        entidade_tipo: 'processo',
        entidade_id:   processoId,
        vinculado_por: usuario?.id ?? null,
        pasta_id:      pastaId,
      }
    })
    const { error } = await supabase
      .from('documento_vinculos')
      .upsert(rows, { onConflict: 'documento_id,entidade_tipo,entidade_id' })
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
  const docsVendedor  = docs.filter(d => d.pessoa_id === pessoaIdVendedor)

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
          onVisualizar={handleVisualizar}
        />
        {pessoaIdConjuge && docsConjuge.length > 0 && (
          <GrupoDocumentos
            titulo={`Cônjuge — ${nomeConjuge ?? 'Cônjuge'}`}
            docs={docsConjuge}
            selecionados={selecionados}
            onToggle={toggle}
            onVisualizar={handleVisualizar}
          />
        )}
        {pessoaIdVendedor && docsVendedor.length > 0 && (
          <GrupoDocumentos
            titulo={`Vendedor — ${nomeVendedor ?? 'Vendedor'}`}
            docs={docsVendedor}
            selecionados={selecionados}
            onToggle={toggle}
            onVisualizar={handleVisualizar}
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

function GrupoDocumentos({ titulo, docs, selecionados, onToggle, onVisualizar }: {
  titulo: string
  docs: DocumentoParaVincular[]
  selecionados: Set<string>
  onToggle: (id: string) => void
  onVisualizar: (doc: DocumentoParaVincular) => void
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
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); onVisualizar(doc) }}
                className="shrink-0 p-1 rounded text-gray-400 hover:text-fonti-primary hover:bg-gray-100 transition-colors"
                title="Visualizar documento"
              >
                <Eye className="h-4 w-4" />
              </button>
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
