'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'
import { Loader2, Send } from 'lucide-react'
import { toast } from 'sonner'

interface DestinatarioOpcao {
  label: string
  telefone: string
}

interface Props {
  documento: { id: string; nome_original: string }
  leadId: string
  onClose: () => void
  onEnviado: () => void
}

async function getToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

export function DocumentoCompartilharModal({ documento, leadId, onClose, onEnviado }: Props) {
  const [opcoes, setOpcoes] = useState<DestinatarioOpcao[]>([])
  const [destinatarioSelecionado, setDestinatarioSelecionado] = useState<string>('')
  const [outroTelefone, setOutroTelefone] = useState('')
  const [mensagem, setMensagem] = useState('Segue documento para sua conferência.')
  const [enviando, setEnviando] = useState(false)
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    async function carregarDestinatarios() {
      setCarregando(true)
      const novasOpcoes: DestinatarioOpcao[] = []

      // Busca lead com responsavel
      const { data: lead } = await supabase
        .from('leads')
        .select('telefone, responsavel:usuarios!responsavel_id(id, nome, telefone_whatsapp)')
        .eq('id', leadId)
        .maybeSingle()

      if (lead?.telefone) {
        novasOpcoes.push({ label: `Cliente (${lead.telefone})`, telefone: lead.telefone })
      }

      // Comercial responsável
      const responsavel = Array.isArray(lead?.responsavel) ? lead.responsavel[0] : lead?.responsavel
      if (responsavel?.telefone_whatsapp) {
        novasOpcoes.push({
          label: `Comercial — ${responsavel.nome} (${responsavel.telefone_whatsapp})`,
          telefone: responsavel.telefone_whatsapp,
        })
      }

      // Parceiro/corretor via processo vinculado ao lead
      const { data: processoRows } = await supabase
        .from('processos')
        .select('id')
        .eq('lead_id', leadId)
        .limit(1)

      if (processoRows && processoRows.length > 0) {
        const processoId = processoRows[0].id
        const { data: pcRows } = await supabase
          .from('processo_corretores')
          .select('corretor:corretores!corretor_id(nome, telefone)')
          .eq('processo_id', processoId)
          .limit(3)

        if (pcRows) {
          for (const row of pcRows) {
            const corretor = Array.isArray(row.corretor) ? row.corretor[0] : row.corretor
            if (corretor?.telefone) {
              novasOpcoes.push({
                label: `Corretor — ${corretor.nome} (${corretor.telefone})`,
                telefone: corretor.telefone,
              })
            }
          }
        }
      }

      setOpcoes(novasOpcoes)
      if (novasOpcoes.length > 0) setDestinatarioSelecionado(novasOpcoes[0].telefone)
      setCarregando(false)
    }

    carregarDestinatarios()
  }, [leadId])

  const telefoneEfetivo = destinatarioSelecionado === 'outro'
    ? outroTelefone.trim()
    : destinatarioSelecionado

  async function handleEnviar() {
    if (!telefoneEfetivo) {
      toast.error('Informe o número de destino.')
      return
    }
    const token = await getToken()
    if (!token) return

    setEnviando(true)
    try {
      const res = await fetch(`/api/documentos/${documento.id}/compartilhar`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ telefone: telefoneEfetivo, mensagem: mensagem.trim() || undefined }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        toast.error(err.error ?? 'Erro ao enviar documento.')
        return
      }

      toast.success(`"${documento.nome_original}" enviado com sucesso!`)
      onEnviado()
    } catch {
      toast.error('Erro inesperado. Tente novamente.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Dialog open onOpenChange={(v) => { if (!v && !enviando) onClose() }}>
      <DialogContent className="max-w-md p-0 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b border-gray-100 shrink-0">
          <h2 className="text-base font-semibold text-[#253B29]">Compartilhar documento</h2>
          <p className="text-xs text-gray-400 mt-0.5 truncate" title={documento.nome_original}>
            {documento.nome_original}
          </p>
        </div>

        {/* Corpo */}
        <div className="px-6 py-5 space-y-4 flex-1">
          {/* Destinatário */}
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-2">Enviar para</label>
            {carregando ? (
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Carregando contatos...
              </div>
            ) : (
              <div className="space-y-2">
                {opcoes.map((op) => (
                  <label key={op.telefone} className="flex items-center gap-2.5 cursor-pointer group">
                    <input
                      type="radio"
                      name="destinatario"
                      value={op.telefone}
                      checked={destinatarioSelecionado === op.telefone}
                      onChange={() => setDestinatarioSelecionado(op.telefone)}
                      className="accent-[#253B29]"
                    />
                    <span className="text-sm text-gray-700 group-hover:text-[#253B29]">{op.label}</span>
                  </label>
                ))}
                <label className="flex items-center gap-2.5 cursor-pointer group">
                  <input
                    type="radio"
                    name="destinatario"
                    value="outro"
                    checked={destinatarioSelecionado === 'outro'}
                    onChange={() => setDestinatarioSelecionado('outro')}
                    className="accent-[#253B29]"
                  />
                  <span className="text-sm text-gray-700 group-hover:text-[#253B29]">Outro número...</span>
                </label>
                {destinatarioSelecionado === 'outro' && (
                  <input
                    type="tel"
                    placeholder="Ex: (44) 99999-0000"
                    value={outroTelefone}
                    onChange={(e) => setOutroTelefone(e.target.value)}
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#253B29]/20 focus:border-[#253B29] mt-1"
                    autoFocus
                  />
                )}
              </div>
            )}
          </div>

          {/* Mensagem */}
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Mensagem (opcional)</label>
            <textarea
              rows={3}
              value={mensagem}
              onChange={(e) => setMensagem(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#253B29]/20 focus:border-[#253B29] resize-none"
              placeholder="Mensagem que acompanha o documento..."
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-6 pb-5 pt-3 border-t border-gray-100 shrink-0">
          <Button variant="outline" size="sm" onClick={onClose} disabled={enviando}>
            Cancelar
          </Button>
          <Button
            size="sm"
            className="bg-[#253B29] hover:bg-[#1a2b1e] text-white gap-1.5 min-w-[100px]"
            onClick={handleEnviar}
            disabled={enviando || carregando || !telefoneEfetivo}
          >
            {enviando ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <><Send className="h-3.5 w-3.5" /> Enviar</>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
