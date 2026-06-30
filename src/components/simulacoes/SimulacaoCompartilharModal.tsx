'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'
import { Loader2, Send } from 'lucide-react'
import { toast } from 'sonner'

interface OpcaoFixa { label: string; telefone: string }
interface UsuarioInterno { id: string; nome: string; telefone: string }

interface SimulacaoRef {
  id: string
  tipo: 'financiamento' | 'custas'
  nome: string
}

interface Props {
  simulacao: SimulacaoRef
  leadId?: string
  processoId?: string
  onClose: () => void
  onEnviado: () => void
}

async function getToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

export function SimulacaoCompartilharModal({ simulacao, leadId, processoId, onClose, onEnviado }: Props) {
  const [opcoesFixas, setOpcoesFixas] = useState<OpcaoFixa[]>([])
  const [usuarios, setUsuarios] = useState<UsuarioInterno[]>([])
  const [destinatario, setDestinatario] = useState<string>('')
  const [usuarioId, setUsuarioId] = useState<string>('')
  const [outroTelefone, setOutroTelefone] = useState('')
  const [mensagem, setMensagem] = useState('Segue simulação para sua análise.')
  const [enviando, setEnviando] = useState(false)
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    async function carregar() {
      setCarregando(true)
      const fixas: OpcaoFixa[] = []

      if (leadId) {
        const { data: lead } = await supabase
          .from('leads').select('telefone').eq('id', leadId).maybeSingle()
        if (lead?.telefone) {
          fixas.push({ label: `Cliente — ${lead.telefone}`, telefone: lead.telefone })
        }
        // Corretores via processo vinculado
        const { data: processoRows } = await supabase
          .from('processos').select('id').eq('lead_id', leadId).limit(1)
        if (processoRows?.[0]?.id) {
          const { data: pcRows } = await supabase
            .from('processo_corretores')
            .select('corretor:corretores!corretor_id(nome, telefone)')
            .eq('processo_id', processoRows[0].id).limit(3)
          for (const row of pcRows ?? []) {
            const c = Array.isArray(row.corretor) ? row.corretor[0] : row.corretor
            if (c?.telefone) fixas.push({ label: `Corretor — ${c.nome} (${c.telefone})`, telefone: c.telefone })
          }
        }
      } else if (processoId) {
        const { data: processo } = await supabase
          .from('processos').select('lead:leads!lead_id(nome, telefone)').eq('id', processoId).maybeSingle()
        const lead = Array.isArray(processo?.lead) ? processo.lead[0] : (processo as any)?.lead
        if (lead?.telefone) fixas.push({ label: `Cliente — ${lead.nome ?? lead.telefone}`, telefone: lead.telefone })
        const { data: pcRows } = await supabase
          .from('processo_corretores')
          .select('corretor:corretores!corretor_id(nome, telefone)')
          .eq('processo_id', processoId).limit(3)
        for (const row of pcRows ?? []) {
          const c = Array.isArray(row.corretor) ? row.corretor[0] : row.corretor
          if (c?.telefone) fixas.push({ label: `Corretor — ${c.nome} (${c.telefone})`, telefone: c.telefone })
        }
      }

      setOpcoesFixas(fixas)
      if (fixas.length > 0) setDestinatario(fixas[0].telefone)

      const { data: usersData } = await supabase
        .from('usuarios').select('id, nome, telefone_whatsapp, telefone').eq('ativo', true).order('nome')
      const com = (usersData ?? [])
        .filter(u => u.telefone_whatsapp || u.telefone)
        .map(u => ({ id: u.id, nome: u.nome, telefone: u.telefone_whatsapp ?? u.telefone }))
      setUsuarios(com)
      if (com.length > 0) setUsuarioId(com[0].id)
      setCarregando(false)
    }
    carregar()
  }, [leadId, processoId])

  const usuarioSelecionado = usuarios.find(u => u.id === usuarioId)
  const telefoneEfetivo = (() => {
    if (destinatario === 'usuario_interno') return usuarioSelecionado?.telefone ?? ''
    if (destinatario === 'outro') return outroTelefone.trim()
    return destinatario
  })()
  const nomeDestino = destinatario === 'usuario_interno' ? (usuarioSelecionado?.nome ?? null) : null

  async function handleEnviar() {
    if (!telefoneEfetivo) {
      toast.error(destinatario === 'outro' ? 'Informe o número de destino.' : 'Selecione um usuário.')
      return
    }
    const token = await getToken()
    if (!token) return
    setEnviando(true)
    try {
      const res = await fetch(`/api/simulacoes/${simulacao.id}/compartilhar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          tipo:        simulacao.tipo,
          telefone:    telefoneEfetivo,
          nome_destino: nomeDestino,
          mensagem:    mensagem.trim() || undefined,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        toast.error(err.error ?? 'Erro ao enviar simulação.')
        return
      }
      toast.success(`Simulação enviada com sucesso!`)
      onEnviado()
    } catch {
      toast.error('Erro de conexão. Tente novamente.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Dialog open onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="w-[calc(100vw-1rem)] max-w-sm p-0 overflow-hidden">
        <div className="px-5 pt-5 pb-4 border-b">
          <h2 className="text-sm font-semibold text-fonti-primary">Compartilhar Simulação</h2>
          <p className="text-xs text-gray-400 mt-0.5 truncate">{simulacao.nome}</p>
        </div>

        {carregando ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
          </div>
        ) : (
          <div className="px-5 py-4 space-y-4">
            {/* Destinatário */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-600">Enviar para</p>

              {opcoesFixas.map(op => (
                <label key={op.telefone} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio" name="dest" value={op.telefone}
                    checked={destinatario === op.telefone}
                    onChange={() => setDestinatario(op.telefone)}
                    className="accent-fonti-primary"
                  />
                  <span className="text-sm text-gray-700">{op.label}</span>
                </label>
              ))}

              {usuarios.length > 0 && (
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="radio" name="dest" value="usuario_interno"
                    checked={destinatario === 'usuario_interno'}
                    onChange={() => setDestinatario('usuario_interno')}
                    className="accent-fonti-primary mt-0.5"
                  />
                  <div className="flex-1">
                    <span className="text-sm text-gray-700">Usuário interno</span>
                    {destinatario === 'usuario_interno' && (
                      <select
                        className="mt-1.5 w-full h-8 text-xs border border-gray-200 rounded-md px-2 bg-white focus:outline-none focus:ring-1 focus:ring-fonti-primary/30"
                        value={usuarioId}
                        onChange={e => setUsuarioId(e.target.value)}
                      >
                        {usuarios.map(u => (
                          <option key={u.id} value={u.id}>{u.nome} ({u.telefone})</option>
                        ))}
                      </select>
                    )}
                  </div>
                </label>
              )}

              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="radio" name="dest" value="outro"
                  checked={destinatario === 'outro'}
                  onChange={() => setDestinatario('outro')}
                  className="accent-fonti-primary mt-0.5"
                />
                <div className="flex-1">
                  <span className="text-sm text-gray-700">Outro número</span>
                  {destinatario === 'outro' && (
                    <input
                      type="tel"
                      placeholder="55 11 99999-9999"
                      className="mt-1.5 w-full h-8 text-xs border border-gray-200 rounded-md px-2 bg-white focus:outline-none focus:ring-1 focus:ring-fonti-primary/30"
                      value={outroTelefone}
                      onChange={e => setOutroTelefone(e.target.value)}
                    />
                  )}
                </div>
              </label>
            </div>

            {/* Mensagem */}
            <div>
              <p className="text-xs font-medium text-gray-600 mb-1.5">Mensagem (opcional)</p>
              <textarea
                rows={2}
                className="w-full text-sm border border-gray-200 rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-fonti-primary/30 resize-none"
                value={mensagem}
                onChange={e => setMensagem(e.target.value)}
              />
            </div>
          </div>
        )}

        <div className="flex gap-2 px-5 pb-5">
          <Button variant="outline" size="sm" className="flex-1" onClick={onClose} disabled={enviando}>
            Cancelar
          </Button>
          <Button
            size="sm"
            className="flex-1 bg-green-700 hover:bg-green-800 text-white gap-1.5"
            onClick={handleEnviar}
            disabled={enviando || carregando || !telefoneEfetivo}
          >
            {enviando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            {enviando ? 'Enviando...' : 'Enviar'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
