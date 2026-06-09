'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'
import { Loader2, Send } from 'lucide-react'
import { toast } from 'sonner'

interface OpcaoFixa {
  label: string
  telefone: string
}

interface UsuarioInterno {
  id: string
  nome: string
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
  const [opcoesFixas, setOpcoesFixas] = useState<OpcaoFixa[]>([])
  const [usuarios, setUsuarios] = useState<UsuarioInterno[]>([])
  const [destinatario, setDestinatario] = useState<string>('')  // telefone | 'usuario_interno' | 'outro'
  const [usuarioId, setUsuarioId] = useState<string>('')
  const [outroTelefone, setOutroTelefone] = useState('')
  const [mensagem, setMensagem] = useState('Segue documento para sua conferência.')
  const [enviando, setEnviando] = useState(false)
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    async function carregar() {
      setCarregando(true)
      const fixas: OpcaoFixa[] = []

      // Lead → telefone do cliente
      const { data: lead } = await supabase
        .from('leads')
        .select('telefone')
        .eq('id', leadId)
        .maybeSingle()

      if (lead?.telefone) {
        fixas.push({ label: `Cliente — ${lead.telefone}`, telefone: lead.telefone })
      }

      // Corretores via processo vinculado
      const { data: processoRows } = await supabase
        .from('processos')
        .select('id')
        .eq('lead_id', leadId)
        .limit(1)

      if (processoRows?.[0]?.id) {
        const { data: pcRows } = await supabase
          .from('processo_corretores')
          .select('corretor:corretores!corretor_id(nome, telefone)')
          .eq('processo_id', processoRows[0].id)
          .limit(3)

        for (const row of pcRows ?? []) {
          const c = Array.isArray(row.corretor) ? row.corretor[0] : row.corretor
          if (c?.telefone) {
            fixas.push({ label: `Corretor — ${c.nome} (${c.telefone})`, telefone: c.telefone })
          }
        }
      }

      setOpcoesFixas(fixas)
      if (fixas.length > 0) setDestinatario(fixas[0].telefone)

      // Usuários internos com telefone preenchido
      const { data: usersData } = await supabase
        .from('usuarios')
        .select('id, nome, telefone_whatsapp, telefone')
        .eq('ativo', true)
        .order('nome')

      const usuariosComTelefone: UsuarioInterno[] = (usersData ?? [])
        .filter(u => u.telefone_whatsapp || u.telefone)
        .map(u => ({
          id:       u.id,
          nome:     u.nome,
          telefone: u.telefone_whatsapp ?? u.telefone,
        }))

      setUsuarios(usuariosComTelefone)
      if (usuariosComTelefone.length > 0) setUsuarioId(usuariosComTelefone[0].id)

      setCarregando(false)
    }

    carregar()
  }, [leadId])

  const usuarioSelecionado = usuarios.find(u => u.id === usuarioId)

  const telefoneEfetivo = (() => {
    if (destinatario === 'usuario_interno') return usuarioSelecionado?.telefone ?? ''
    if (destinatario === 'outro') return outroTelefone.trim()
    return destinatario
  })()

  const nomeDestino = (() => {
    if (destinatario === 'usuario_interno') return usuarioSelecionado?.nome ?? null
    return null
  })()

  async function handleEnviar() {
    if (!telefoneEfetivo) {
      toast.error(destinatario === 'outro' ? 'Informe o número de destino.' : 'Selecione um usuário.')
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
        body: JSON.stringify({
          telefone:     telefoneEfetivo,
          nome_destino: nomeDestino,
          mensagem:     mensagem.trim() || undefined,
        }),
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
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-2">Enviar para</label>

            {carregando ? (
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Carregando contatos...
              </div>
            ) : (
              <div className="space-y-2">
                {/* Opções fixas: cliente e corretores */}
                {opcoesFixas.map((op) => (
                  <label key={op.telefone} className="flex items-center gap-2.5 cursor-pointer group">
                    <input
                      type="radio"
                      name="destinatario"
                      value={op.telefone}
                      checked={destinatario === op.telefone}
                      onChange={() => setDestinatario(op.telefone)}
                      className="accent-[#253B29]"
                    />
                    <span className="text-sm text-gray-700 group-hover:text-[#253B29]">{op.label}</span>
                  </label>
                ))}

                {/* Usuário interno */}
                {usuarios.length > 0 && (
                  <div className="space-y-1.5">
                    <label className="flex items-center gap-2.5 cursor-pointer group">
                      <input
                        type="radio"
                        name="destinatario"
                        value="usuario_interno"
                        checked={destinatario === 'usuario_interno'}
                        onChange={() => setDestinatario('usuario_interno')}
                        className="accent-[#253B29]"
                      />
                      <span className="text-sm text-gray-700 group-hover:text-[#253B29]">Usuário interno / Comercial</span>
                    </label>
                    {destinatario === 'usuario_interno' && (
                      <select
                        value={usuarioId}
                        onChange={(e) => setUsuarioId(e.target.value)}
                        className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#253B29]/20 focus:border-[#253B29] bg-white ml-6"
                      >
                        {usuarios.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.nome} — {u.telefone}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}

                {/* Outro número */}
                <div className="space-y-1.5">
                  <label className="flex items-center gap-2.5 cursor-pointer group">
                    <input
                      type="radio"
                      name="destinatario"
                      value="outro"
                      checked={destinatario === 'outro'}
                      onChange={() => setDestinatario('outro')}
                      className="accent-[#253B29]"
                    />
                    <span className="text-sm text-gray-700 group-hover:text-[#253B29]">Outro número...</span>
                  </label>
                  {destinatario === 'outro' && (
                    <input
                      type="tel"
                      placeholder="Ex: (44) 99999-0000"
                      value={outroTelefone}
                      onChange={(e) => setOutroTelefone(e.target.value)}
                      className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#253B29]/20 focus:border-[#253B29] ml-6"
                      style={{ width: 'calc(100% - 1.5rem)' }}
                      autoFocus
                    />
                  )}
                </div>
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
