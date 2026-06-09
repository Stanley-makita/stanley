'use client'

import { useState } from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'
import { Loader2, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import type { OcrResultado } from '@/lib/documentos/ocr'

interface DocumentoOcrProps {
  id: string
  nome_original: string
  storage_path: string
  ocr_dados: Record<string, unknown> | null
}

interface Props {
  documento: DocumentoOcrProps
  onClose: () => void
  onConfirmado: () => void
}

const CAMPOS_LABELS: Record<string, string> = {
  nome:                     'Nome completo',
  cpf:                      'CPF',
  rg:                       'RG',
  data_nascimento:          'Data de nascimento',
  cidade_nascimento:        'Cidade de nascimento',
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

const TIPO_LABELS: Record<string, string> = {
  rg:                   'RG',
  cnh:                  'CNH',
  comprovante_endereco: 'Comprovante de Endereço',
  comprovante_renda:    'Comprovante de Renda',
  certidao_casamento:   'Certidão de Casamento',
  outro:                'Documento',
}

async function getToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

export function DocumentoOcrRevisaoModal({ documento, onClose, onConfirmado }: Props) {
  const ocr = documento.ocr_dados as OcrResultado | null
  const ocrRaw = ocr as unknown as Record<string, unknown> | null

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
    try {
      const res = await fetch(`/api/documentos/${documento.id}/ocr-confirmar`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ campos }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string; detail?: string }
        toast.error((err.error ?? 'Erro ao salvar dados.') + (err.detail ? ` (${err.detail})` : ''))
        return
      }
      toast.success('Dados confirmados e salvos no perfil do cliente.')
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

  const tipoLabel = ocr ? (TIPO_LABELS[ocr.tipo_documento] ?? 'Documento') : 'Documento'
  const confiancaColor = { alta: 'text-green-600', media: 'text-amber-600', baixa: 'text-red-500' }[ocr?.confianca ?? 'media']

  return (
    <Dialog open onOpenChange={(v) => { if (!v && !salvando) onClose() }}>
      <DialogContent className="max-w-2xl p-0 flex flex-col overflow-hidden max-h-[90vh]">
        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-[#253B29]">Revisar dados extraídos</h2>
              <p className="text-xs text-gray-400 mt-0.5">{documento.nome_original}</p>
            </div>
            <div className="flex items-center gap-2">
              {ocr?.confianca && (
                <span className={`text-xs font-medium ${confiancaColor}`}>
                  Confiança {ocr.confianca}
                </span>
              )}
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{tipoLabel}</span>
            </div>
          </div>
        </div>

        {/* Corpo */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs text-gray-500">
              Verifique os campos abaixo e corrija se necessário. Ao confirmar, os dados serão salvos no perfil do cliente.
            </p>
            <button
              onClick={abrirDocumento}
              disabled={carregandoUrl}
              className="flex items-center gap-1 text-xs text-[#253B29] hover:underline shrink-0 ml-4"
            >
              {carregandoUrl ? <Loader2 className="h-3 w-3 animate-spin" /> : <ExternalLink className="h-3 w-3" />}
              Ver documento
            </button>
          </div>

          {Object.entries(CAMPOS_LABELS).map(([key, label]) => {
            if (!(key in campos) && !(ocrRaw && ocrRaw[key])) return null
            const isDate = ['data_nascimento', 'data_emissao', 'data_casamento', 'validade_cnh', 'primeira_habilitacao_cnh'].includes(key)
            return (
              <div key={key} className="mb-3">
                <label className="text-xs font-medium text-gray-600 block mb-1">{label}</label>
                <input
                  type={isDate ? 'date' : 'text'}
                  value={campos[key] ?? ''}
                  onChange={(e) => setCampos((prev) => ({ ...prev, [key]: e.target.value }))}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#253B29]/20 focus:border-[#253B29]"
                  placeholder={isDate ? undefined : `${label}...`}
                />
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div className="flex justify-between gap-3 px-6 pb-5 pt-3 border-t border-gray-100 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleIgnorar}
            disabled={salvando}
            className="text-gray-400 hover:text-gray-600"
          >
            Ignorar
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose} disabled={salvando}>
              Cancelar
            </Button>
            <Button
              size="sm"
              className="bg-[#253B29] hover:bg-[#1a2b1e] text-white min-w-[110px]"
              onClick={handleConfirmar}
              disabled={salvando}
            >
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirmar dados'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
