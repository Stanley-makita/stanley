'use client'

import { useCallback, useEffect, useState } from 'react'
import { Download, Loader2, Send } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useAtualizarLancamento } from '@/hooks/processos/useProcessoFinanceiro'
import type { ProcessoFinanceiro } from '@/types/processos'

interface DadosModal {
  numero: string
  titular: { nome: string; cpf: string | null } | null
  telefoneTitular: string | null
  reciboNome: string | null
  reciboCpf: string | null
}

interface Props {
  processoId: string
  lancamento: ProcessoFinanceiro
  onFechar: () => void
}

async function token(): Promise<string> {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? ''
}

const soDigitos = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '')

export function ReciboModal({ processoId, lancamento, onFechar }: Props) {
  const url = `/api/processos/${processoId}/financeiro/${lancamento.id}/recibo`
  const atualizar = useAtualizarLancamento(processoId)

  const [dados, setDados] = useState<DadosModal | null>(null)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [nome, setNome] = useState('')
  const [cpf, setCpf] = useState('')
  const [telefone, setTelefone] = useState('')
  const [enviando, setEnviando] = useState(false)

  const carregarPdf = useCallback(async () => {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${await token()}` } })
    if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? 'Erro ao gerar o recibo.')
    const blob = await res.blob()
    setPdfUrl((antigo) => {
      if (antigo) URL.revokeObjectURL(antigo)
      return URL.createObjectURL(blob)
    })
  }, [url])

  useEffect(() => {
    let ativo = true
    ;(async () => {
      try {
        const res = await fetch(`${url}?dados=1`, { headers: { Authorization: `Bearer ${await token()}` } })
        const json = await res.json()
        if (!res.ok) throw new Error(json?.error ?? 'Erro ao carregar o recibo.')
        if (!ativo) return
        const d = json as DadosModal
        setDados(d)
        setNome(d.reciboNome ?? d.titular?.nome ?? '')
        setCpf(d.reciboNome ? (d.reciboCpf ?? '') : (d.reciboCpf ?? d.titular?.cpf ?? ''))
        setTelefone(d.telefoneTitular ?? '')
        await carregarPdf()
      } catch (e) {
        if (ativo) setErro(e instanceof Error ? e.message : 'Erro ao carregar o recibo.')
      }
    })()
    return () => { ativo = false }
  }, [url, carregarPdf])

  useEffect(() => () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl) }, [pdfUrl])

  // O que está salvo hoje (vazio = proponente principal).
  const nomeSalvo = dados ? (dados.reciboNome ?? dados.titular?.nome ?? '') : ''
  const cpfSalvo = dados ? (dados.reciboNome ? (dados.reciboCpf ?? '') : (dados.reciboCpf ?? dados.titular?.cpf ?? '')) : ''
  const alterado = !!dados && (nome.trim() !== nomeSalvo || soDigitos(cpf) !== soDigitos(cpfSalvo))

  async function salvarPagador(): Promise<boolean> {
    if (!dados || !alterado) return true
    if (!nome.trim()) { toast.error('Informe o nome de quem pagou'); return false }
    const ehTitular = !!dados.titular
      && nome.trim() === dados.titular.nome
      && soDigitos(cpf) === soDigitos(dados.titular.cpf)
    const recibo_nome = ehTitular ? null : nome.trim()
    const recibo_cpf = ehTitular ? null : (cpf.trim() || null)
    try {
      await atualizar.mutateAsync({ id: lancamento.id, recibo_nome, recibo_cpf })
      setDados({ ...dados, reciboNome: recibo_nome, reciboCpf: recibo_cpf })
      await carregarPdf()
      toast.success('Recibo atualizado')
      return true
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao salvar')
      return false
    }
  }

  async function baixar() {
    if (!(await salvarPagador())) return
    const res = await fetch(url, { headers: { Authorization: `Bearer ${await token()}` } })
    if (!res.ok) { toast.error('Erro ao gerar o recibo.'); return }
    const link = document.createElement('a')
    const obj = URL.createObjectURL(await res.blob())
    link.href = obj
    link.download = `Recibo ${dados?.numero ?? ''}.pdf`
    link.click()
    setTimeout(() => URL.revokeObjectURL(obj), 1000)
  }

  async function enviar() {
    if (soDigitos(telefone).length < 10) { toast.error('Informe o WhatsApp com DDD'); return }
    if (!(await salvarPagador())) return
    setEnviando(true)
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ telefone }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) throw new Error(json?.error ?? 'Falha ao enviar.')
      toast.success('Recibo enviado pelo WhatsApp')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao enviar.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Dialog open onOpenChange={(aberto) => { if (!aberto) onFechar() }}>
      <DialogContent className="max-h-[94svh] w-[calc(100vw-1rem)] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Recibo {dados ? `nº ${dados.numero}` : ''}</DialogTitle>
        </DialogHeader>

        {erro ? (
          <p className="py-8 text-center text-sm text-red-600">{erro}</p>
        ) : !dados ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">Recebido de</label>
                <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome de quem pagou" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">CPF <span className="font-normal text-gray-300">(opcional)</span></label>
                <Input value={cpf} onChange={(e) => setCpf(e.target.value)} placeholder="000.000.000-00" />
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-gray-400">
                {dados.titular ? `Padrão: proponente principal (${dados.titular.nome}).` : 'Negócio sem proponente principal — informe quem pagou.'}
              </p>
              {alterado && (
                <Button size="sm" variant="outline" onClick={salvarPagador} disabled={atualizar.isPending}>
                  {atualizar.isPending ? 'Salvando...' : 'Atualizar recibo'}
                </Button>
              )}
            </div>

            <div className="overflow-hidden rounded-lg border bg-gray-50">
              {pdfUrl
                ? <iframe src={pdfUrl} title="Recibo" className="h-[55svh] w-full" />
                : <div className="flex h-[55svh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>}
            </div>

            <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-end">
                <div className="flex-1">
                  <label className="mb-1 block text-xs font-medium text-gray-500">WhatsApp do cliente</label>
                  <Input value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="(44) 99999-9999" />
                </div>
                <Button
                  className="gap-1.5 bg-fonti-primary text-white hover:bg-fonti-primary-hover"
                  onClick={enviar}
                  disabled={enviando || atualizar.isPending}
                >
                  {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Enviar para o cliente
                </Button>
              </div>
              <Button variant="outline" className="gap-1.5" onClick={baixar} disabled={atualizar.isPending}>
                <Download className="h-4 w-4" />
                Baixar PDF
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
