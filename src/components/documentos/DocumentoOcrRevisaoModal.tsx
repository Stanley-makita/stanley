'use client'

import { useState } from 'react'
import { participanteParecido, sugerirDonoDocumento } from '@/lib/participantes/donoDocumento'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { supabase } from '@/lib/supabase'
import { Loader2, ExternalLink, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import type { OcrResultado } from '@/lib/documentos/ocr'
import { cpfValido } from '@/lib/cpf'
import { PAPEIS_VENDA, ROTULO_PAPEL, type PapelParticipacao } from '@/lib/participantes/tipos'

interface DocumentoOcrProps {
  id: string
  nome_original: string
  storage_path: string
  ocr_dados: Record<string, unknown> | null
  pessoa_id?: string | null
}

interface Props {
  documento: DocumentoOcrProps
  onClose: () => void
  onConfirmado: () => void
  /** Pessoa do contexto atual (Lead/Pessoa sendo visualizado). Se o documento
   * pertencer a uma Pessoa diferente (reaproveitado de outro Lead), avisa
   * antes de confirmar — "Confirmar dados" grava sempre na Pessoa DONA do
   * documento (documentos.pessoa_id), não na deste contexto. */
  pessoaAtualId?: string | null
  /** V2: participantes da proposta (Lead/Negócio). Com eles, a tela pergunta "De quem é este documento?".
   *  `papel` agrupa a lista (compra x venda); `conjugeNome` = casamento vigente (cônjuge do vendedor). */
  participantes?: ParticipanteOpcao[]
  /** Lead do contexto: habilita "Novo participante" (inclui no lead ao confirmar). */
  leadId?: string
  /** Negócio do contexto: habilita "Novo participante" (inclui no negócio ao confirmar). */
  processoId?: string
}

export type ParticipanteOpcao = {
  pessoaId: string
  nome: string
  cpf: string | null
  papel?: PapelParticipacao
  conjugeNome?: string | null
}

/** Lado em que a Pessoa nova entra na proposta — a tela obriga a escolher (nada vem marcado). */
type PapelNovo = 'comprador' | 'vendedor' | 'conjuge_vendedor'
const PAPEIS_NOVO: Array<{ value: PapelNovo; label: string }> = [
  { value: 'comprador', label: 'Comprador' },
  { value: 'vendedor', label: 'Vendedor' },
  { value: 'conjuge_vendedor', label: 'Cônjuge do vendedor' },
]
const TEXTO_PAPEL_NOVO: Record<PapelNovo, string> = {
  comprador: 'Entra na proposta como coparticipante da compra; o papel e o casamento se ajustam na aba Pessoa.',
  vendedor: 'Entra na proposta como vendedor.',
  conjuge_vendedor: 'O casamento com o vendedor escolhido é registrado nos dois cadastros e a pessoa entra como cônjuge do vendedor.',
}

const NOVO = '__novo'
/** Holerite, extrato, IR… — não é documento de cadastro: não grava campos nem muda a classificação. */
const SEM_CADASTRO = '__sem_cadastro'
/** Só documento de identificação pode trazer uma Pessoa nova para a proposta. */
const TIPOS_IDENTIDADE = new Set(['cnh', 'rg', 'cpf', 'certidao_nascimento', 'certidao_casamento'])

const TIPOS_OPCOES = [
  { value: 'cnh',                   label: 'CNH' },
  { value: 'rg',                    label: 'RG / Doc. de Identidade' },
  { value: 'cpf',                   label: 'CPF' },
  { value: 'certidao_casamento',    label: 'Certidão de Casamento' },
  { value: 'certidao_nascimento',   label: 'Certidão de Nascimento' },
  { value: 'comprovante_endereco',  label: 'Comprovante de Residência' },
  { value: SEM_CADASTRO,            label: 'Outro (sem dados de cadastro)' },
]

const TIPOS_VALIDOS = new Set(TIPOS_OPCOES.map(t => t.value))

const CAMPOS_POR_TIPO: Record<string, string[]> = {
  cnh: [
    'nome', 'cpf', 'rg', 'rg_orgao_emissor', 'rg_uf_emissor', 'data_nascimento', 'cidade_nascimento', 'estado_nascimento',
    'data_emissao', 'orgao_emissor', 'filiacao_mae', 'filiacao_pai', 'registro_cnh', 'validade_cnh', 'primeira_habilitacao_cnh',
  ],
  rg: [
    'nome', 'cpf', 'rg', 'data_nascimento', 'cidade_nascimento', 'estado_nascimento', 'data_emissao',
    'orgao_emissor', 'filiacao_mae', 'filiacao_pai',
  ],
  cpf: ['nome', 'cpf', 'data_nascimento', 'orgao_emissor'],
  certidao_casamento:   ['estado_civil', 'regime_casamento', 'data_casamento'],
  certidao_nascimento:  ['nome', 'cpf', 'data_nascimento', 'cidade_nascimento', 'estado_nascimento', 'filiacao_mae', 'filiacao_pai', 'data_emissao', 'orgao_emissor'],
  comprovante_endereco: ['endereco_rua', 'endereco_numero', 'endereco_bairro', 'endereco_cidade', 'endereco_uf', 'endereco_cep'],
  [SEM_CADASTRO]: [],
}

const CAMPOS_LABELS: Record<string, string> = {
  nome:                     'Nome completo',
  cpf:                      'CPF',
  rg:                       'RG',
  rg_orgao_emissor:         'Órgão emissor do RG',
  rg_uf_emissor:            'UF emissora do RG',
  data_nascimento:          'Data de nascimento',
  cidade_nascimento:        'Cidade de nascimento',
  estado_nascimento:        'UF de nascimento',
  data_emissao:             'Data de emissão',
  orgao_emissor:            'Órgão emissor',
  filiacao_mae:             'Nome da mãe',
  filiacao_pai:             'Nome do pai',
  registro_cnh:             'Nº Registro CNH',
  validade_cnh:             'Validade da habilitação',
  primeira_habilitacao_cnh: 'Primeira habilitação',
  estado_civil:             'Estado civil',
  regime_casamento:         'Regime de bens',
  data_casamento:           'Data de casamento',
  endereco_rua:             'Logradouro',
  endereco_numero:          'Número',
  endereco_bairro:          'Bairro',
  endereco_cidade:          'Cidade',
  endereco_uf:              'UF',
  endereco_cep:             'CEP',
}

const DATE_FIELDS = new Set([
  'data_nascimento', 'data_emissao', 'data_casamento', 'validade_cnh', 'primeira_habilitacao_cnh',
])

async function getToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

export function DocumentoOcrRevisaoModal({ documento, onClose, onConfirmado, pessoaAtualId, participantes = [], leadId, processoId }: Props) {
  const modoParticipantes = participantes.length > 0
  const ocr = documento.ocr_dados as OcrResultado | null
  const ocrRaw = ocr as unknown as Record<string, unknown> | null

  const pessoaDivergente = !!(
    pessoaAtualId && documento.pessoa_id && documento.pessoa_id !== pessoaAtualId
  )
  const [cienteDivergencia, setCienteDivergencia] = useState(false)
  const [ehConjuge, setEhConjuge] = useState(false)

  const tipoDetectado = ocr?.tipo_documento ?? ''
  // Tipo fora da lista (holerite, extrato, IR…) abria como CNH: mostrava nome/órgão emissor lidos do holerite
  // (ex.: empregador como "órgão emissor"), regravava o documento como CNH e sugeria "Novo participante"
  // — caso real 28/10/2026, 2 cadastros duplicados da cliente. Agora abre como "sem dados de cadastro".
  const tipoInicial = TIPOS_VALIDOS.has(tipoDetectado) ? tipoDetectado : SEM_CADASTRO

  const [tipoSelecionado, setTipoSelecionado] = useState(tipoInicial)
  const [campos, setCampos] = useState<Record<string, string>>(() => {
    if (!ocrRaw) return {}
    const initial: Record<string, string> = {}
    for (const key of Object.keys(CAMPOS_LABELS)) {
      const val = ocrRaw[key]
      if (val != null && val !== '') initial[key] = String(val)
    }
    return initial
  })

  // "De quem é este documento?" — sugestão automática até o usuário escolher à mão.
  const [donoManual, setDonoManual] = useState<string | null>(null)
  const [novoNome, setNovoNome] = useState<string | null>(null)
  const [novoCpf, setNovoCpf] = useState<string | null>(null)
  const ehIdentidade = TIPOS_IDENTIDADE.has(tipoSelecionado)
  const permiteNovo = (!!leadId || !!processoId) && ehIdentidade
  const [papelNovo, setPapelNovo] = useState<PapelNovo | null>(null)
  const [vendedorDoConjuge, setVendedorDoConjuge] = useState<string>('')
  const compradores = participantes.filter(p => !p.papel || !PAPEIS_VENDA.includes(p.papel))
  const vendedoresProposta = participantes.filter(p => p.papel === 'vendedor')
  const rotulo = (p: ParticipanteOpcao) => (p.papel ? `${p.nome} — ${ROTULO_PAPEL[p.papel]}` : p.nome)
  const sugestao = sugerirDonoDocumento(
    ehIdentidade ? { cpf: campos.cpf, nome: campos.nome } : {}, participantes, documento.pessoa_id ?? null,
  )
  const donoSugerido = sugestao.tipo === 'novo' ? (permiteNovo ? NOVO : (participantes[0]?.pessoaId ?? '')) : sugestao.pessoaId
  const dono = donoManual === NOVO && !permiteNovo ? donoSugerido : (donoManual ?? donoSugerido)
  const donoNome = dono === NOVO ? (novoNome ?? campos.nome ?? '') : participantes.find(p => p.pessoaId === dono)?.nome ?? ''

  // Certidão de casamento: com quem o dono do documento é casado (sugestão pelo 2º cônjuge extraído).
  const SEM_CASAMENTO = ''
  const [conjugeManual, setConjugeManual] = useState<string | null>(null)
  const [conjugeNovoNome, setConjugeNovoNome] = useState<string | null>(null)
  const ehCertidao = tipoSelecionado === 'certidao_casamento' && modoParticipantes
  const conjuge2Nome = typeof ocrRaw?.conjuge2_nome === 'string' ? ocrRaw.conjuge2_nome : ''
  const conjuge2Cpf = typeof ocrRaw?.conjuge2_cpf === 'string' ? ocrRaw.conjuge2_cpf : ''
  const outrosParticipantes = participantes.filter(p => p.pessoaId !== dono)
  const sugestaoConjuge = (conjuge2Nome || conjuge2Cpf)
    ? sugerirDonoDocumento({ cpf: conjuge2Cpf, nome: conjuge2Nome }, outrosParticipantes, null)
    : null
  const conjugeSugerido = sugestaoConjuge?.tipo === 'participante' ? sugestaoConjuge.pessoaId
    : sugestaoConjuge?.tipo === 'novo' ? NOVO : SEM_CASAMENTO
  const conjuge = conjugeManual ?? conjugeSugerido

  const [salvando, setSalvando] = useState(false)
  const [docUrl, setDocUrl] = useState<string | null>(null)
  const [carregandoUrl, setCarregandoUrl] = useState(false)

  const camposVisiveis = CAMPOS_POR_TIPO[tipoSelecionado] ?? []

  async function abrirDocumento() {
    if (docUrl) { window.open(docUrl, '_blank'); return }
    setCarregandoUrl(true)
    const { data } = await supabase.storage
      .from('documentos-clientes')
      .createSignedUrl(documento.storage_path, 3600)
    setCarregandoUrl(false)
    if (data?.signedUrl) {
      setDocUrl(data.signedUrl)
      window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
    } else {
      toast.error('Não foi possível abrir o documento.')
    }
  }

  const confirmarEncerrarCasamento = (encerra: Array<{ nome: string }>) => window.confirm(
    `Já existe um casamento registrado com ${encerra.map(x => x.nome).join(' e ')}.\n\n` +
    'OK = encerrar esse casamento e registrar o novo. Cancelar = voltar sem salvar nada.',
  )

  async function handleConfirmar() {
    const token = await getToken()
    if (!token) return
    setSalvando(true)

    // Apenas campos do tipo selecionado
    const camposFiltrados: Record<string, string> = {}
    for (const key of camposVisiveis) {
      if (campos[key] != null && campos[key] !== '') {
        camposFiltrados[key] = campos[key]
      }
    }

    try {
      const enviar = (extra: Record<string, unknown>) => fetch(`/api/documentos/${documento.id}/ocr-confirmar`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...corpo,
          ...extra,
        }),
      })
      const corpo = {
          campos: camposFiltrados,
          tipo_confirmado: tipoSelecionado === SEM_CADASTRO ? undefined : tipoSelecionado,
          ...(modoParticipantes
            ? (dono === NOVO
                ? {
                    novo_participante: {
                      nome: (novoNome ?? campos.nome ?? '').trim(), cpf: novoCpf ?? campos.cpf ?? '', papel: papelNovo,
                      ...(papelNovo === 'conjuge_vendedor' ? { vendedor_pessoa_id: vendedorDoConjuge } : {}),
                    },
                    ...(processoId ? { processo_id: processoId } : { lead_id: leadId }),
                  }
                : { pessoa_alvo_id: dono })
            : { titular: ehConjuge ? 'conjuge' : 'principal' }),
          ...(ehCertidao && conjuge !== SEM_CASAMENTO
            ? { casamento: conjuge === NOVO
                ? { novo: { nome: (conjugeNovoNome ?? conjuge2Nome).trim(), cpf: conjuge2Cpf } }
                : { conjuge_pessoa_id: conjuge } }
            : {}),
      }
      let res = await enviar({})
      // Servidor achou alguém da proposta com nome parecido (sem outro CPF): pergunta antes de criar cadastro novo.
      if (res.status === 409) {
        const conflito = await res.clone().json().catch(() => ({})) as {
          parecido?: { pessoa_id: string; nome: string }
          casamento_encerra?: Array<{ nome: string }>
        }
        if (conflito.casamento_encerra?.length) {
          // Cônjuge do vendedor: o vendedor (ou esta pessoa) já tem outro casamento registrado — nada foi gravado.
          if (!confirmarEncerrarCasamento(conflito.casamento_encerra)) return
          res = await enviar({ confirmar_encerrar: true })
        } else if (conflito.parecido) {
          // Duas perguntas: Cancelar/Esc NUNCA cria cadastro. Antes "Cancelar = criar cadastro novo" — quem
          // desistia criava o duplicado com o CPF e o CPF não entrava mais no titular (casos reais 23–27/10/2026).
          const mesma = window.confirm(
            `Parece ser ${conflito.parecido.nome}, que já está nesta proposta.\n\n` +
            `É a mesma pessoa? OK = sim, salvar em ${conflito.parecido.nome}.`,
          )
          if (mesma) {
            res = await enviar({ novo_participante: undefined, lead_id: undefined, pessoa_alvo_id: conflito.parecido.pessoa_id })
          } else {
            const criar = window.confirm(
              `Criar um cadastro NOVO, separado de ${conflito.parecido.nome}?\n\n` +
              'Só confirme se for outra pessoa de verdade. Cancelar = voltar sem salvar nada.',
            )
            if (!criar) return
            res = await enviar({ confirmar_novo: true })
            if (res.status === 409) {
              const c2 = await res.clone().json().catch(() => ({})) as { casamento_encerra?: Array<{ nome: string }> }
              if (c2.casamento_encerra?.length) {
                if (!confirmarEncerrarCasamento(c2.casamento_encerra)) return
                res = await enviar({ confirmar_novo: true, confirmar_encerrar: true })
              }
            }
          }
        }
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string; detail?: string }
        toast.error((err.error ?? 'Erro ao salvar dados.') + (err.detail ? ` (${err.detail})` : ''))
        return
      }
      const result = await res.json().catch(() => ({})) as {
        cpf_divergente?: boolean
        cpf_pertence_a?: { id: string; nome: string | null } | null
        cpf_invalido?: boolean
        alvo?: string
        alvo_nome?: string | null
        alvo_pessoa_id?: string
        novo_papel?: PapelNovo | null
        casamento?: 'registrado' | 'confirmar' | 'erro' | null
        casamento_encerra?: Array<{ nome: string }>
        casamento_erro?: string | null
        casamento_conjuge_id?: string | null
      }
      // Certidão: o cônjuge escolhido já tinha outro casamento registrado — pergunta antes de encerrar.
      if (result.casamento === 'confirmar' && result.alvo_pessoa_id && result.casamento_conjuge_id) {
        const nomes = (result.casamento_encerra ?? []).map(x => x.nome).join(' e ')
        if (window.confirm(`${nomes} já tem outro casamento registrado. Encerrar esse casamento e registrar o desta certidão?`)) {
          const resCas = await fetch(`/api/pessoas/${result.alvo_pessoa_id}/conjuge`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({
              conjuge_pessoa_id: result.casamento_conjuge_id, estado_civil: 'casado',
              regime_casamento: camposFiltrados.regime_casamento ?? null,
              data_casamento: camposFiltrados.data_casamento ?? null, confirmar_encerrar: true,
            }),
          })
          if (resCas.ok) result.casamento = 'registrado'
          else toast.error('Os dados foram salvos, mas o casamento não foi registrado. Ajuste na aba Pessoa.')
        }
      } else if (result.casamento === 'erro') {
        toast.warning(`Os dados foram salvos, mas o casamento não foi registrado: ${result.casamento_erro ?? 'erro'}. Ajuste na aba Pessoa.`, { duration: 12000 })
      }
      if (result.casamento === 'registrado') toast.success('Casamento registrado nos dois cadastros.')
      // CPF não gravado é aviso em amarelo e demorado — um toast verde de "sucesso"
      // passava despercebido e o CPF errado ficava no cadastro.
      if (result.cpf_divergente) {
        const dono = result.cpf_pertence_a?.nome
        toast.warning(
          dono
            ? `Os outros dados foram salvos, mas o CPF NÃO: ele já está no cadastro de "${dono}" (Pessoas). Confira se é o mesmo cliente.`
            : 'Os outros dados foram salvos, mas o CPF NÃO: ele já está no cadastro de outra pessoa. Confira em Pessoas.',
          { duration: 15000 },
        )
      } else if (result.cpf_invalido) {
        toast.warning(
          'Os outros dados foram salvos, mas o CPF NÃO: o número não é um CPF válido (confira os dígitos no documento).',
          { duration: 15000 },
        )
      } else if (modoParticipantes && result.alvo_nome) {
        const comoPapel = result.novo_papel === 'vendedor' ? ', como vendedor'
          : result.novo_papel === 'conjuge_vendedor' ? ', como cônjuge do vendedor'
          : result.novo_papel === 'comprador' ? ', como comprador' : ''
        toast.success(`Dados confirmados e salvos no cadastro de ${result.alvo_nome}${comoPapel}.`)
      } else if (result.alvo === 'conjuge') {
        toast.success('Dados confirmados e salvos no cadastro do cônjuge.')
      } else {
        toast.success('Dados confirmados e salvos no perfil do cliente.')
      }
      onConfirmado()
    } catch {
      toast.error('Erro inesperado. Tente novamente.')
    } finally {
      setSalvando(false)
    }
  }

  async function handleIgnorar() {
    const token = await getToken()
    if (!token) return
    await fetch(`/api/documentos/${documento.id}/ocr-confirmar`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` },
    })
    toast('Documento marcado como revisado sem salvar dados.')
    onConfirmado()
  }

  const confiancaColor = { alta: 'text-green-600', media: 'text-amber-600', baixa: 'text-red-500' }[ocr?.confianca ?? 'media']

  return (
    <Dialog open onOpenChange={(v) => { if (!v && !salvando) onClose() }}>
      <DialogContent className="flex max-h-[92svh] w-[calc(100vw-1rem)] max-w-2xl flex-col overflow-hidden p-0 sm:w-full">
        {/* Header */}
        <div className="shrink-0 border-b border-gray-100 px-4 pb-4 pt-5 sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-fonti-primary">Revisar dados extraídos</h2>
              <p className="text-xs text-gray-400 mt-0.5 truncate">{documento.nome_original}</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:shrink-0">
              {ocr?.confianca && (
                <span className={`text-xs font-medium ${confiancaColor}`}>
                  Confiança {ocr.confianca}
                </span>
              )}
              <Select value={tipoSelecionado} onValueChange={setTipoSelecionado}>
                <SelectTrigger className="h-8 w-full bg-gray-50 text-xs sm:w-[190px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS_OPCOES.map(t => (
                    <SelectItem key={t.value} value={t.value} className="text-xs">
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Corpo */}
        <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          {modoParticipantes && (
            <div className="mb-4 rounded-lg border border-fonti-accent/50 bg-fonti-accent-hover/20 p-3">
              <label className="mb-1 block text-xs font-semibold text-fonti-primary" htmlFor="dono-documento">
                De quem é este documento?
              </label>
              <select
                id="dono-documento"
                value={dono}
                onChange={e => setDonoManual(e.target.value)}
                className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-fonti-primary/20"
              >
                {participantes.some(p => p.papel && PAPEIS_VENDA.includes(p.papel)) ? (
                  <>
                    <optgroup label="Compra">
                      {compradores.map(p => <option key={p.pessoaId} value={p.pessoaId}>{rotulo(p)}</option>)}
                    </optgroup>
                    <optgroup label="Venda">
                      {participantes.filter(p => p.papel && PAPEIS_VENDA.includes(p.papel))
                        .map(p => <option key={p.pessoaId} value={p.pessoaId}>{rotulo(p)}</option>)}
                    </optgroup>
                  </>
                ) : participantes.map(p => <option key={p.pessoaId} value={p.pessoaId}>{rotulo(p)}</option>)}
                {permiteNovo && <option value={NOVO}>Novo participante…</option>}
              </select>
              {!donoManual && sugestao.tipo === 'participante' && sugestao.motivo !== 'dono_atual' && (
                sugestao.motivo === 'nome_diferente' ? (
                  <p className="mt-1 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-800">
                    No documento está &quot;{campos.nome}&quot;, que não bate com ninguém da proposta. Ficou com o dono atual
                    — confira. Só escolha &quot;Novo participante&quot; se for outra pessoa de verdade.
                  </p>
                ) : sugestao.motivo === 'nome_parecido' ? (
                  <p className="mt-1 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-800">
                    Sugerido pelo nome parecido — no documento está &quot;{campos.nome}&quot;. Confira se é a mesma pessoa.
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-gray-500">
                    Sugerido pelo {sugestao.motivo === 'cpf' ? 'CPF' : 'nome'} do documento — confira.
                  </p>
                )
              )}
              {dono === NOVO && (() => {
                // Nunca cria cadastro novo calado (achado real 01/10/2026: RG com o sobrenome digitado diferente virou
                // um ANDRE duplicado e travou o CPF do cliente).
                const parecido = participanteParecido(novoNome ?? campos.nome ?? '', novoCpf ?? campos.cpf, participantes)
                return (
                  <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
                    {parecido ? (
                      <>
                        Parecido com <strong>{parecido.nome}</strong>, que já está na proposta. É a mesma pessoa?{' '}
                        <button type="button" onClick={() => setDonoManual(parecido.pessoaId)}
                          className="font-semibold text-fonti-primary underline">Usar {parecido.nome}</button>
                      </>
                    ) : (
                      <>Ninguém da proposta tem esse CPF ou nome: confirmar vai criar um <strong>cadastro novo</strong>.</>
                    )}
                  </div>
                )
              })()}
              {dono === NOVO && (
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <label className="text-xs text-gray-600">Nome
                    <input value={novoNome ?? campos.nome ?? ''} onChange={e => setNovoNome(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
                  </label>
                  <label className="text-xs text-gray-600">CPF
                    <input value={novoCpf ?? campos.cpf ?? ''} onChange={e => setNovoCpf(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
                  </label>
                  <fieldset className="sm:col-span-2">
                    <legend className="mb-1 text-xs font-semibold text-fonti-primary">Entra como</legend>
                    <div className="flex flex-wrap gap-2" role="radiogroup">
                      {PAPEIS_NOVO.map(op => {
                        const semVendedor = op.value === 'conjuge_vendedor' && vendedoresProposta.length === 0
                        const ativo = papelNovo === op.value
                        return (
                          <button key={op.value} type="button" role="radio" aria-checked={ativo} disabled={semVendedor}
                            title={semVendedor ? 'Inclua o vendedor na proposta primeiro.' : undefined}
                            onClick={() => setPapelNovo(op.value)}
                            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                              ativo ? 'border-fonti-primary bg-fonti-primary text-white' : 'border-gray-200 bg-white text-gray-700 hover:border-fonti-primary/50'}`}>
                            {op.label}
                          </button>
                        )
                      })}
                    </div>
                    {!papelNovo && <p className="mt-1 text-xs text-amber-800">Escolha o papel para poder confirmar.</p>}
                    {vendedoresProposta.length === 0 && (
                      <p className="mt-1 text-xs text-gray-500">Cônjuge do vendedor: inclua o vendedor na proposta primeiro.</p>
                    )}
                  </fieldset>
                  {papelNovo === 'conjuge_vendedor' && (
                    <label className="text-xs text-gray-600 sm:col-span-2">De qual vendedor?
                      <select value={vendedorDoConjuge} onChange={e => setVendedorDoConjuge(e.target.value)}
                        className="mt-1 h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm">
                        <option value="">Escolha o vendedor…</option>
                        {vendedoresProposta.map(v => (
                          <option key={v.pessoaId} value={v.pessoaId} disabled={!!v.conjugeNome}>
                            {v.nome}{v.conjugeNome ? ` — já casado(a) com ${v.conjugeNome}` : ''}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <p className="text-xs text-gray-500 sm:col-span-2">
                    Se o CPF já for de uma pessoa cadastrada, ela é reaproveitada.{papelNovo ? ` ${TEXTO_PAPEL_NOVO[papelNovo]}` : ''}
                  </p>
                </div>
              )}
              {ehCertidao && (
                <div className="mt-3 border-t border-fonti-accent/40 pt-3">
                  <label className="mb-1 block text-xs font-semibold text-fonti-primary" htmlFor="conjuge-certidao">
                    Casado(a) com
                  </label>
                  <select
                    id="conjuge-certidao"
                    value={conjuge}
                    onChange={e => setConjugeManual(e.target.value)}
                    className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-fonti-primary/20"
                  >
                    <option value={SEM_CASAMENTO}>Não registrar o casamento agora</option>
                    {outrosParticipantes.map(p => <option key={p.pessoaId} value={p.pessoaId}>{p.nome}</option>)}
                    <option value={NOVO}>Outra pessoa (nova ou já cadastrada pelo CPF)…</option>
                  </select>
                  {conjuge2Nome && (
                    <p className="mt-1 text-xs text-gray-500">Na certidão: {conjuge2Nome}{conjuge2Cpf ? ` (CPF ${conjuge2Cpf})` : ''}</p>
                  )}
                  {conjuge === NOVO && (
                    <label className="mt-2 block text-xs text-gray-600">Nome do cônjuge
                      <input value={conjugeNovoNome ?? conjuge2Nome} onChange={e => setConjugeNovoNome(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
                    </label>
                  )}
                  <p className="mt-1 text-xs text-gray-500">
                    Data e regime da certidão valem para os dois.{' '}
                    {participantes.find(p => p.pessoaId === dono)?.papel === 'vendedor'
                      ? 'Como é vendedor, o cônjuge entra na proposta sozinho, como cônjuge do vendedor.'
                      : 'Para incluir o cônjuge na proposta, use “+ Participante” na aba Pessoa.'}
                  </p>
                </div>
              )}
              {dono !== NOVO && documento.pessoa_id && dono !== documento.pessoa_id && (
                <p className="mt-1 text-xs text-amber-800">Ao confirmar, o documento passa a ser de {donoNome}.</p>
              )}
            </div>
          )}

          {!modoParticipantes && (
          <div className="mb-4">
            <label className="flex items-center gap-1.5 text-xs text-gray-600">
              <input
                type="checkbox"
                checked={ehConjuge}
                onChange={(e) => setEhConjuge(e.target.checked)}
              />
              Este documento é do cônjuge, não do titular
            </label>
            {ehConjuge && (
              <p className="mt-1 pl-5 text-xs text-gray-400">
                Ao confirmar, os dados vão para o cadastro do cônjuge (criado ou
                reaproveitado se o CPF já for de um cliente existente) — não para
                este titular.
              </p>
            )}
          </div>
          )}

          {pessoaDivergente && !ehConjuge && !modoParticipantes && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <div className="flex-1">
                <p className="text-xs font-medium text-amber-800">
                  Este documento pertence a outro cliente
                </p>
                <p className="mt-0.5 text-xs text-amber-700">
                  Ele foi reaproveitado neste Lead, mas "Confirmar dados" sempre grava no
                  cadastro da Pessoa dona do documento — não na Pessoa deste Lead. Os
                  campos abaixo não vão aparecer aqui depois de confirmar.
                </p>
                <label className="mt-2 flex items-center gap-1.5 text-xs text-amber-800">
                  <input
                    type="checkbox"
                    checked={cienteDivergencia}
                    onChange={(e) => setCienteDivergencia(e.target.checked)}
                  />
                  Entendi, confirmar mesmo assim
                </label>
              </div>
            </div>
          )}
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-gray-500">
              Verifique os campos abaixo e corrija se necessário. Ao confirmar, os dados serão salvos no perfil do cliente.
            </p>
            <button
              onClick={abrirDocumento}
              disabled={carregandoUrl}
              className="flex shrink-0 items-center gap-1 text-xs text-fonti-primary hover:underline sm:ml-4"
            >
              {carregandoUrl ? <Loader2 className="h-3 w-3 animate-spin" /> : <ExternalLink className="h-3 w-3" />}
              Ver documento
            </button>
          </div>

          {tipoSelecionado === SEM_CADASTRO && (
            <p className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">
              Este documento não é de identificação nem comprovante de residência — não há dados de cadastro para
              salvar. Confirmar só marca como revisado{modoParticipantes ? ' (e passa para a pessoa escolhida acima)' : ''}.
              Se for RG, CNH ou certidão, escolha o tipo certo no alto.
            </p>
          )}
          {camposVisiveis.map((key) => {
            const label = CAMPOS_LABELS[key]
            if (!label) return null
            const isDate = DATE_FIELDS.has(key)
            const cpfComErro = key === 'cpf' && !!campos.cpf && !cpfValido(campos.cpf)
            return (
              <div key={key} className="mb-3">
                <label className="text-xs font-medium text-gray-600 block mb-1">{label}</label>
                <input
                  type={isDate ? 'date' : 'text'}
                  value={campos[key] ?? ''}
                  onChange={(e) => setCampos((prev) => ({ ...prev, [key]: e.target.value }))}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-fonti-primary/20 focus:border-fonti-primary"
                  placeholder={isDate ? undefined : `${label}...`}
                />
                {cpfComErro && (
                  <p className="mt-1 text-xs text-red-600">
                    CPF inválido (dígito verificador não confere) — não será salvo. Confira no documento.
                  </p>
                )}
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-gray-100 px-4 pb-5 pt-3 sm:flex-row sm:justify-between sm:px-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleIgnorar}
            disabled={salvando}
            className="text-gray-400 hover:text-gray-600"
          >
            Ignorar
          </Button>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button variant="outline" size="sm" onClick={onClose} disabled={salvando} className="w-full sm:w-auto">
              Cancelar
            </Button>
            <Button
              size="sm"
              className="min-w-[110px] bg-fonti-primary text-white hover:bg-fonti-primary-hover"
              onClick={handleConfirmar}
              disabled={salvando
                || (!modoParticipantes && pessoaDivergente && !ehConjuge && !cienteDivergencia)
                || (modoParticipantes && dono === NOVO && !(novoNome ?? campos.nome ?? '').trim())
                || (modoParticipantes && dono === NOVO && !papelNovo)
                || (modoParticipantes && dono === NOVO && papelNovo === 'conjuge_vendedor' && !vendedorDoConjuge)
                || (ehCertidao && conjuge === NOVO && !(conjugeNovoNome ?? conjuge2Nome).trim())}
            >
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirmar dados'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
