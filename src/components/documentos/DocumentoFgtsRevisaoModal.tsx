'use client'

import { useState } from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'
import { Loader2, ExternalLink, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { OcrResultado, FgtsContaOcr } from '@/lib/documentos/ocr'

interface DocumentoFgtsProps {
  id: string
  nome_original: string
  storage_path: string
  ocr_dados: Record<string, unknown> | null
}

interface Props {
  documento: DocumentoFgtsProps
  onClose: () => void
  onConfirmado: () => void
}

async function getToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

function fmtSaldo(v: string | undefined | null): string {
  if (!v) return ''
  const n = parseFloat(v.replace(',', '.'))
  if (isNaN(n)) return v
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n)
}

export function DocumentoFgtsRevisaoModal({ documento, onClose, onConfirmado }: Props) {
  const ocr = documento.ocr_dados as OcrResultado | null
  const ocrRaw = ocr as unknown as Record<string, unknown> | null

  const [nome, setNome] = useState<string>((ocrRaw?.nome as string) ?? '')
  const [pisPassep, setPisPassep] = useState<string>((ocrRaw?.pis_pasep as string) ?? '')
  const [dataExtrato, setDataExtrato] = useState<string>((ocrRaw?.data_extrato as string) ?? '')
  const [contas, setContas] = useState<FgtsContaOcr[]>(() => {
    const raw = ocrRaw?.contas_fgts
    if (Array.isArray(raw) && raw.length > 0) return raw as FgtsContaOcr[]
    // Fallback: se veio no formato antigo (campos flat)
    const flat: FgtsContaOcr = {
      cod_empregador: (ocrRaw?.cod_empregador as string) ?? undefined,
      nro_conta_fgts: (ocrRaw?.nro_conta_fgts as string) ?? undefined,
      saldo_disponivel: (ocrRaw?.saldo_disponivel as string) ?? undefined,
    }
    if (flat.cod_empregador || flat.nro_conta_fgts || flat.saldo_disponivel) return [flat]
    return [{}]
  })

  const [salvando, setSalvando] = useState(false)
  const [docUrl, setDocUrl] = useState<string | null>(null)
  const [carregandoUrl, setCarregandoUrl] = useState(false)

  function atualizarConta(idx: number, campo: keyof FgtsContaOcr, valor: string) {
    setContas((prev) => prev.map((c, i) => i === idx ? { ...c, [campo]: valor } : c))
  }

  function adicionarConta() {
    setContas((prev) => [...prev, {}])
  }

  function removerConta(idx: number) {
    setContas((prev) => prev.filter((_, i) => i !== idx))
  }

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
      const res = await fetch(`/api/documentos/${documento.id}/fgts-confirmar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ nome, pis_pasep: pisPassep, data_extrato: dataExtrato, contas }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        toast.error(err.error ?? 'Erro ao salvar dados FGTS.')
        return
      }
      const { salvas } = await res.json() as { salvas: number }
      toast.success(`${salvas} conta(s) FGTS salva(s) no perfil do cliente.`)
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
    await fetch(`/api/documentos/${documento.id}/fgts-confirmar`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` },
    })
    toast('Extrato marcado como revisado sem salvar dados.')
    onConfirmado()
  }

  const confiancaColor = { alta: 'text-green-600', media: 'text-amber-600', baixa: 'text-red-500' }[ocr?.confianca ?? 'media']
  const nContasDetectadas = contas.length

  return (
    <Dialog open onOpenChange={(v) => { if (!v && !salvando) onClose() }}>
      <DialogContent className="max-w-2xl p-0 flex flex-col overflow-hidden max-h-[90vh]">
        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-[#253B29]">Revisar Extrato FGTS</h2>
              <p className="text-xs text-gray-400 mt-0.5">{documento.nome_original}</p>
            </div>
            <div className="flex items-center gap-2">
              {ocr?.confianca && (
                <span className={`text-xs font-medium ${confiancaColor}`}>Confiança {ocr.confianca}</span>
              )}
              <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
                FGTS · {nContasDetectadas} conta{nContasDetectadas !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
        </div>

        {/* Corpo */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500">
              Verifique os dados extraídos. Ao confirmar, todas as contas serão salvas no perfil do cliente.
            </p>
            <button
              onClick={abrirDocumento}
              disabled={carregandoUrl}
              className="flex items-center gap-1 text-xs text-[#253B29] hover:underline shrink-0 ml-4"
            >
              {carregandoUrl ? <Loader2 className="h-3 w-3 animate-spin" /> : <ExternalLink className="h-3 w-3" />}
              Ver extrato
            </button>
          </div>

          {/* Dados gerais do trabalhador */}
          <div className="p-4 bg-gray-50 rounded-xl space-y-3">
            <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Dados do Trabalhador</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Nome</label>
                <input
                  type="text"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#253B29]/20 focus:border-[#253B29] bg-white"
                  placeholder="Nome completo..."
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">NIS / PIS / PASEP</label>
                <input
                  type="text"
                  value={pisPassep}
                  onChange={(e) => setPisPassep(e.target.value)}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#253B29]/20 focus:border-[#253B29] bg-white"
                  placeholder="Somente dígitos..."
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Data do extrato</label>
                <input
                  type="date"
                  value={dataExtrato}
                  onChange={(e) => setDataExtrato(e.target.value)}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#253B29]/20 focus:border-[#253B29] bg-white"
                />
              </div>
            </div>
          </div>

          {/* Contas FGTS */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                Contas FGTS ({contas.length})
              </p>
              <button
                onClick={adicionarConta}
                className="flex items-center gap-1 text-xs text-[#253B29] hover:underline"
              >
                <Plus className="h-3 w-3" /> Adicionar conta
              </button>
            </div>

            {contas.map((conta, idx) => (
              <div key={idx} className="border border-gray-200 rounded-xl p-4 space-y-3 relative">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-medium text-gray-500">Conta {idx + 1}</p>
                  {contas.length > 1 && (
                    <button
                      onClick={() => removerConta(idx)}
                      className="text-gray-300 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="text-xs font-medium text-gray-600 block mb-1">Código / CNPJ do empregador</label>
                    <input
                      type="text"
                      value={conta.cod_empregador ?? ''}
                      onChange={(e) => atualizarConta(idx, 'cod_empregador', e.target.value)}
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#253B29]/20 focus:border-[#253B29]"
                      placeholder="Inscrição do empregador..."
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs font-medium text-gray-600 block mb-1">Número da conta FGTS</label>
                    <input
                      type="text"
                      value={conta.nro_conta_fgts ?? ''}
                      onChange={(e) => atualizarConta(idx, 'nro_conta_fgts', e.target.value)}
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#253B29]/20 focus:border-[#253B29]"
                      placeholder="Nº da conta..."
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Saldo disponível (R$)</label>
                    <input
                      type="text"
                      value={conta.saldo_disponivel ?? ''}
                      onChange={(e) => atualizarConta(idx, 'saldo_disponivel', e.target.value)}
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#253B29]/20 focus:border-[#253B29]"
                      placeholder="ex: 121507.82"
                    />
                  </div>
                  {conta.saldo_disponivel && (
                    <div className="flex items-end pb-2">
                      <span className="text-sm font-semibold text-[#253B29]">{fmtSaldo(conta.saldo_disponivel)}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-between gap-3 px-6 pb-5 pt-3 border-t border-gray-100 shrink-0">
          <Button variant="ghost" size="sm" onClick={handleIgnorar} disabled={salvando} className="text-gray-400 hover:text-gray-600">
            Ignorar
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose} disabled={salvando}>Cancelar</Button>
            <Button
              size="sm"
              className="bg-[#253B29] hover:bg-[#1a2b1e] text-white min-w-[130px]"
              onClick={handleConfirmar}
              disabled={salvando}
            >
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : `Confirmar ${contas.length} conta${contas.length !== 1 ? 's' : ''}`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
