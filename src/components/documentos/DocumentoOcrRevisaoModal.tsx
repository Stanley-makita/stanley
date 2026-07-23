'use client'

import { useState } from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { supabase } from '@/lib/supabase'
import { Loader2, ExternalLink, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import type { OcrResultado } from '@/lib/documentos/ocr'

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
}

const TIPOS_OPCOES = [
  { value: 'cnh',                   label: 'CNH' },
  { value: 'rg',                    label: 'RG / Doc. de Identidade' },
  { value: 'cpf',                   label: 'CPF' },
  { value: 'certidao_casamento',    label: 'Certidão de Casamento' },
  { value: 'certidao_nascimento',   label: 'Certidão de Nascimento' },
  { value: 'comprovante_endereco',  label: 'Comprovante de Residência' },
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

export function DocumentoOcrRevisaoModal({ documento, onClose, onConfirmado, pessoaAtualId }: Props) {
  const ocr = documento.ocr_dados as OcrResultado | null
  const ocrRaw = ocr as unknown as Record<string, unknown> | null

  const pessoaDivergente = !!(
    pessoaAtualId && documento.pessoa_id && documento.pessoa_id !== pessoaAtualId
  )
  const [cienteDivergencia, setCienteDivergencia] = useState(false)

  const tipoDetectado = ocr?.tipo_documento ?? ''
  const tipoInicial = TIPOS_VALIDOS.has(tipoDetectado) ? tipoDetectado : 'cnh'

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
      const res = await fetch(`/api/documentos/${documento.id}/ocr-confirmar`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ campos: camposFiltrados, tipo_confirmado: tipoSelecionado }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string; detail?: string }
        toast.error((err.error ?? 'Erro ao salvar dados.') + (err.detail ? ` (${err.detail})` : ''))
        return
      }
      const result = await res.json().catch(() => ({})) as { cpf_divergente?: boolean }
      if (result.cpf_divergente) {
        toast.success('Dados salvos. O CPF encontrado já pertence a outro cliente — verifique manualmente.')
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
          {pessoaDivergente && (
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

          {camposVisiveis.map((key) => {
            const label = CAMPOS_LABELS[key]
            if (!label) return null
            const isDate = DATE_FIELDS.has(key)
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
              disabled={salvando || (pessoaDivergente && !cienteDivergencia)}
            >
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirmar dados'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
