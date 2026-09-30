'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { Loader2, UserPlus } from 'lucide-react'
import { cpfValido } from '@/lib/cpf'
import { cn } from '@/lib/utils'

type Resultado = { id: string; nome: string; cpf: string | null; cliente_de?: string | null }

export type EscolhaParticipante = { pessoaId: string; nome: string } | { nome: string; cpf: string }

interface Props {
  aberto: boolean
  onFechar: () => void
  titulo: string
  textoConfirmar: string
  /** Quem já está na proposta (não aparece na lista). */
  excluirIds: string[]
  /** Pessoa existente escolhida ou nova (nome/CPF) — quem chama grava. */
  onConfirmar: (escolha: EscolhaParticipante) => Promise<void>
}

function mascararCpf(cpf: string | null): string {
  const d = (cpf ?? '').replace(/\D/g, '')
  return d.length === 11 ? `***.***.${d.slice(6, 9)}-${d.slice(9)}` : 'sem CPF'
}

/** Busca de Pessoa para a proposta (ignora carteira, avisa se é cliente de outro comercial) ou criação só com nome. */
export function AdicionarParticipanteModal({ aberto, onFechar, titulo, textoConfirmar, excluirIds, onConfirmar }: Props) {
  const [termo, setTermo] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [resultados, setResultados] = useState<Resultado[]>([])
  const [escolhida, setEscolhida] = useState<Resultado | null>(null)
  const [criando, setCriando] = useState(false)
  const [novoNome, setNovoNome] = useState('')
  const [novoCpf, setNovoCpf] = useState('')
  const [salvando, setSalvando] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const excluirChave = excluirIds.join(',')

  useEffect(() => {
    if (!aberto) {
      setTermo(''); setResultados([]); setEscolhida(null); setCriando(false); setNovoNome(''); setNovoCpf('')
    }
  }, [aberto])

  useEffect(() => {
    if (termo.trim().length < 2) { setResultados([]); return }
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      setBuscando(true)
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const soDigitos = termo.replace(/\D/g, '')
        const qs = soDigitos.length === 11 ? `cpf=${soDigitos}` : `q=${encodeURIComponent(termo.trim())}`
        const res = await fetch(`/api/pessoas?${qs}&papel=participante`, {
          headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json.error ?? 'Erro na busca.')
        const excluir = excluirChave.split(',')
        setResultados(((json.data ?? []) as Resultado[]).filter(p => !excluir.includes(p.id)))
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Erro na busca.')
      } finally {
        setBuscando(false)
      }
    }, 250)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [termo, excluirChave])

  const cpfNovoDigitos = novoCpf.replace(/\D/g, '')
  const cpfNovoInvalido = !!cpfNovoDigitos && !cpfValido(cpfNovoDigitos)
  const podeConfirmar = criando ? !!novoNome.trim() && !cpfNovoInvalido : !!escolhida

  async function confirmar() {
    if (!podeConfirmar) return
    setSalvando(true)
    try {
      await onConfirmar(criando
        ? { nome: novoNome.trim(), cpf: cpfNovoDigitos }
        : { pessoaId: escolhida!.id, nome: escolhida!.nome })
      onFechar()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível concluir.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={o => { if (!o) onFechar() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{titulo}</DialogTitle></DialogHeader>

        {!criando ? (
          <div className="space-y-3">
            <label className="block text-xs font-medium text-gray-600">
              Buscar pessoa por nome ou CPF
              <Input autoFocus value={termo} onChange={e => { setTermo(e.target.value); setEscolhida(null) }} className="mt-1" />
            </label>
            <div className="max-h-72 space-y-2 overflow-y-auto" role="listbox" aria-label="Pessoas encontradas">
              {buscando && (
                <div className="flex justify-center py-3"><Loader2 className="h-4 w-4 animate-spin text-fonti-primary" /></div>
              )}
              {!buscando && termo.trim().length >= 2 && resultados.length === 0 && (
                <p className="py-2 text-sm text-gray-500">Ninguém encontrado com esse nome ou CPF.</p>
              )}
              {resultados.map(p => (
                <button
                  key={p.id}
                  type="button"
                  role="option"
                  aria-selected={escolhida?.id === p.id}
                  onClick={() => setEscolhida(p)}
                  className={cn(
                    'w-full rounded-lg border p-3 text-left transition-colors',
                    escolhida?.id === p.id ? 'border-fonti-primary bg-fonti-surface-warm' : 'border-gray-200 hover:bg-gray-50',
                  )}
                >
                  <p className="text-sm font-semibold text-gray-900">{p.nome}</p>
                  <p className="text-xs text-gray-500">CPF {mascararCpf(p.cpf)}</p>
                  {p.cliente_de && (
                    <p className="mt-1 inline-block rounded bg-amber-50 px-2 py-0.5 text-xs text-amber-800">
                      Também é cliente de {p.cliente_de}. Nesta proposta você passa a ver e editar o cadastro.
                    </p>
                  )}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => { setCriando(true); setNovoNome(termo.replace(/\d/g, '').trim()) }}
              className="flex min-h-[44px] w-full items-center gap-2 rounded-lg border border-dashed border-fonti-primary px-3 text-sm font-semibold text-fonti-primary hover:bg-fonti-surface-warm"
            >
              <UserPlus className="h-4 w-4" /> Criar pessoa nova (só com o nome; o resto vem dos documentos)
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <label className="block text-xs font-medium text-gray-600">
              Nome completo
              <Input autoFocus value={novoNome} onChange={e => setNovoNome(e.target.value)} className="mt-1" />
            </label>
            <label className="block text-xs font-medium text-gray-600">
              CPF (opcional)
              <Input value={novoCpf} onChange={e => setNovoCpf(e.target.value)} placeholder="000.000.000-00" className="mt-1" />
            </label>
            {cpfNovoInvalido && <p className="text-xs text-red-700">CPF inválido.</p>}
            <button type="button" onClick={() => setCriando(false)} className="text-xs text-fonti-primary underline">
              Voltar para a busca
            </button>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>Cancelar</Button>
          <Button onClick={() => { void confirmar() }} disabled={!podeConfirmar || salvando}>
            {salvando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {textoConfirmar}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
