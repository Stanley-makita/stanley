'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AlertTriangle, ExternalLink, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface Duplicata {
  id: string
  nome: string
  campo: 'telefone' | 'cpf'
}

const TIPOS = [
  { value: 'cliente',    label: 'Cliente' },
  { value: 'corretor',   label: 'Corretor' },
  { value: 'parceiro',   label: 'Parceiro' },
  { value: 'fornecedor', label: 'Fornecedor' },
  { value: 'outro',      label: 'Outro' },
] as const

export interface PessoaCriada {
  id: string
  nome: string
  cpf: string | null
  email: string | null
  telefone: string | null
}

interface Props {
  aberto: boolean
  onFechar: () => void
  onSucesso?: (pessoa: PessoaCriada) => void
}

export function NovaPessoaModal({ aberto, onFechar, onSucesso }: Props) {
  const { usuario } = useAuth()
  const router = useRouter()
  const qc = useQueryClient()

  const [form, setForm] = useState({
    nome: '',
    telefone: '',
    cpf: '',
    email: '',
    tipo: '' as string,
  })
  const [duplicata, setDuplicata] = useState<Duplicata | null>(null)
  const [ignorarDuplicata, setIgnorarDuplicata] = useState(false)
  const [verificando, setVerificando] = useState(false)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Reset ao abrir
  useEffect(() => {
    if (aberto) {
      setForm({ nome: '', telefone: '', cpf: '', email: '', tipo: '' })
      setDuplicata(null)
      setIgnorarDuplicata(false)
    }
  }, [aberto])

  async function verificarDuplicata(telefone: string, cpf: string) {
    if (!usuario?.empresa_id) return
    const tel = telefone.trim()
    const cpfTrim = cpf.trim()

    if (!tel && !cpfTrim) {
      setDuplicata(null)
      return
    }

    setVerificando(true)
    try {
      // Verifica telefone primeiro
      if (tel) {
        const { data } = await supabase
          .from('pessoa_telefones')
          .select('pessoa_id, pessoas!inner(id, nome)')
          .eq('empresa_id', usuario.empresa_id)
          .eq('telefone', tel)
          .eq('ativo', true)
          .limit(1)
          .single()

        if (data) {
          const p = Array.isArray(data.pessoas) ? data.pessoas[0] : data.pessoas as { id: string; nome: string }
          setDuplicata({ id: p.id, nome: p.nome, campo: 'telefone' })
          return
        }
      }

      // Verifica CPF
      if (cpfTrim) {
        const { data } = await supabase
          .from('pessoas')
          .select('id, nome')
          .eq('empresa_id', usuario.empresa_id)
          .eq('cpf', cpfTrim)
          .limit(1)
          .single()

        if (data) {
          setDuplicata({ id: data.id, nome: data.nome, campo: 'cpf' })
          return
        }
      }

      setDuplicata(null)
    } catch {
      setDuplicata(null)
    } finally {
      setVerificando(false)
    }
  }

  function agendarVerificacao(telefone: string, cpf: string) {
    if (ignorarDuplicata) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => verificarDuplicata(telefone, cpf), 600)
  }

  function handleChange(campo: keyof typeof form, valor: string) {
    const novoForm = { ...form, [campo]: valor }
    setForm(novoForm)

    if (campo === 'telefone' || campo === 'cpf') {
      setIgnorarDuplicata(false)
      agendarVerificacao(
        campo === 'telefone' ? valor : form.telefone,
        campo === 'cpf' ? valor : form.cpf,
      )
    }
  }

  const salvar = useMutation({
    mutationFn: async () => {
      if (!usuario?.empresa_id) throw new Error('Sem empresa')
      const nome = form.nome.trim()
      if (!nome) throw new Error('Nome obrigatório')

      const { data: pessoa, error: errPessoa } = await supabase
        .from('pessoas')
        .insert({
          empresa_id:      usuario.empresa_id,
          nome,
          cpf:             form.cpf.trim()   || null,
          email:           form.email.trim() || null,
          tipo:            form.tipo         || null,
          status_identidade: 'confirmada',
        })
        .select('id')
        .single()

      if (errPessoa) throw errPessoa

      if (form.telefone.trim()) {
        const { error: errTel } = await supabase
          .from('pessoa_telefones')
          .insert({
            pessoa_id:  pessoa.id,
            empresa_id: usuario.empresa_id,
            telefone:   form.telefone.trim(),
            principal:  true,
            whatsapp:   true,
            ativo:      true,
          })
        if (errTel && errTel.code !== '23505') throw errTel
      }

      return {
        id: pessoa.id,
        nome,
        cpf:      form.cpf.trim()      || null,
        email:    form.email.trim()    || null,
        telefone: form.telefone.trim() || null,
      } satisfies PessoaCriada
    },
    onSuccess: (pessoa) => {
      qc.invalidateQueries({ queryKey: ['pessoas', usuario?.empresa_id] })
      toast.success('Pessoa criada com sucesso')
      onFechar()
      if (onSucesso) {
        onSucesso(pessoa)
      } else {
        router.push(`/pessoas/${pessoa.id}`)
      }
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(`Erro ao criar pessoa: ${msg}`)
    },
  })

  const podeSalvar = form.nome.trim().length > 0 && !salvar.isPending

  return (
    <Dialog open={aberto} onOpenChange={(v) => { if (!v && !salvar.isPending) onFechar() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nova Pessoa</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-1">
          {/* Nome */}
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">
              Nome <span className="text-red-400">*</span>
            </label>
            <Input
              placeholder="Nome completo"
              value={form.nome}
              onChange={(e) => handleChange('nome', e.target.value)}
              autoFocus
            />
          </div>

          {/* Telefone */}
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">Telefone principal</label>
            <div className="relative">
              <Input
                placeholder="5544999998888"
                value={form.telefone}
                onChange={(e) => handleChange('telefone', e.target.value)}
              />
              {verificando && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-gray-400" />
              )}
            </div>
            <p className="text-[11px] text-gray-400 mt-0.5">Código do país + DDD + número (somente dígitos)</p>
          </div>

          {/* CPF */}
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">CPF</label>
            <div className="relative">
              <Input
                placeholder="000.000.000-00"
                value={form.cpf}
                onChange={(e) => handleChange('cpf', e.target.value)}
              />
              {verificando && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-gray-400" />
              )}
            </div>
          </div>

          {/* Email */}
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1 block">E-mail</label>
            <Input
              type="email"
              placeholder="email@exemplo.com"
              value={form.email}
              onChange={(e) => handleChange('email', e.target.value)}
            />
          </div>

          {/* Tipo */}
          <div>
            <label className="text-xs font-medium text-gray-500 mb-2 block">Tipo</label>
            <div className="flex flex-wrap gap-1.5">
              {TIPOS.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, tipo: f.tipo === t.value ? '' : t.value }))}
                  className={cn(
                    'text-xs px-3 py-1.5 rounded-lg border transition-all',
                    form.tipo === t.value
                      ? 'border-[#253B29] bg-[#253B29] text-white font-medium'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Alerta de duplicata */}
          {duplicata && !ignorarDuplicata && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800">
                  Já existe uma pessoa com esse {duplicata.campo === 'telefone' ? 'telefone' : 'CPF'}:{' '}
                  <strong>{duplicata.nome}</strong>. Deseja vincular em vez de criar novo?
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { onFechar(); router.push(`/pessoas/${duplicata.id}`) }}
                  className="flex items-center gap-1 text-xs font-medium text-amber-700 hover:text-amber-900 underline underline-offset-2"
                >
                  <ExternalLink className="h-3 w-3" />
                  Ver pessoa existente
                </button>
                <span className="text-amber-300">·</span>
                <button
                  type="button"
                  onClick={() => setIgnorarDuplicata(true)}
                  className="text-xs text-amber-600 hover:text-amber-800 underline underline-offset-2"
                >
                  Criar mesmo assim
                </button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={salvar.isPending}>
            Cancelar
          </Button>
          <Button
            className="bg-[#253B29] hover:bg-[#1a2b1e] text-white min-w-[90px]"
            onClick={() => salvar.mutate()}
            disabled={!podeSalvar || (!!duplicata && !ignorarDuplicata)}
          >
            {salvar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Criar Pessoa'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
