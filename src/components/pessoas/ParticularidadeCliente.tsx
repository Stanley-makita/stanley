'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { Pencil, Plus, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const LIMITE_CARACTERES = 250

interface ParticularidadeData {
  particularidade: string | null
  particularidade_criado_por: string | null
  particularidade_atualizado_em: string | null
  particularidade_criado_por_usuario: { nome: string } | null
}

/**
 * Observação livre sobre o cliente, exibida sempre visível ao lado do nome
 * (Captação > Comercial > Cliente e Negócios > Financiamento). Só quem criou
 * ou um admin pode editar/apagar; qualquer perfil com acesso à pessoa pode ler.
 */
export function ParticularidadeCliente({ pessoaId }: { pessoaId: string | null | undefined }) {
  const { usuario } = useAuth()
  const qc = useQueryClient()
  const [editando, setEditando] = useState(false)
  const [texto, setTexto] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['pessoa-particularidade', pessoaId],
    queryFn: async (): Promise<ParticularidadeData> => {
      const { data, error } = await supabase
        .from('pessoas')
        .select('particularidade, particularidade_criado_por, particularidade_atualizado_em, particularidade_criado_por_usuario:usuarios!particularidade_criado_por(nome)')
        .eq('id', pessoaId as string)
        .single()
      if (error) throw error
      return data as unknown as ParticularidadeData
    },
    enabled: !!pessoaId,
  })

  const salvar = useMutation({
    mutationFn: async (novoTexto: string) => {
      const { error } = await supabase
        .from('pessoas')
        .update({
          particularidade: novoTexto || null,
          particularidade_criado_por: data?.particularidade_criado_por ?? usuario!.id,
          particularidade_atualizado_em: new Date().toISOString(),
        })
        .eq('id', pessoaId as string)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pessoa-particularidade', pessoaId] })
      setEditando(false)
      toast.success('Particularidade salva.')
    },
    onError: () => toast.error('Não foi possível salvar a particularidade.'),
  })

  if (!pessoaId || isLoading) return null

  const podeEditar = !data?.particularidade_criado_por
    || data.particularidade_criado_por === usuario?.id
    || usuario?.perfil === 'admin'

  const popup = (
    <Dialog open={editando} onOpenChange={setEditando}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold text-fonti-primary">Particularidade do cliente</DialogTitle>
        </DialogHeader>
        <Textarea
          autoFocus
          value={texto}
          onChange={(e) => setTexto(e.target.value.slice(0, LIMITE_CARACTERES))}
          placeholder="Observação sobre o cliente (ex.: prefere contato só por WhatsApp, exigente com prazos...)"
          className="min-h-[100px] text-sm"
          maxLength={LIMITE_CARACTERES}
        />
        <p className="text-right text-xs text-gray-400">{texto.length}/{LIMITE_CARACTERES}</p>
        <DialogFooter>
          <Button variant="outline" onClick={() => setEditando(false)}>Cancelar</Button>
          <Button disabled={salvar.isPending} onClick={() => salvar.mutate(texto)}>
            {salvar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )

  if (!data?.particularidade) {
    if (!podeEditar) return null
    return (
      <>
        <button
          type="button"
          onClick={() => { setTexto(''); setEditando(true) }}
          className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-fonti-primary transition-colors"
        >
          <Plus className="h-3 w-3" /> Adicionar particularidade
        </button>
        {popup}
      </>
    )
  }

  const pillClassName = 'inline-flex max-w-[160px] items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs text-amber-700'

  return (
    <>
      {podeEditar ? (
        <button
          type="button"
          onClick={() => { setTexto(data.particularidade ?? ''); setEditando(true) }}
          title={data.particularidade ?? undefined}
          className={cn(pillClassName, 'transition-colors hover:bg-amber-100')}
        >
          <span className="italic truncate">{data.particularidade}</span>
          <Pencil className="h-3 w-3 shrink-0 text-amber-500" />
        </button>
      ) : (
        <span title={data.particularidade ?? undefined} className={pillClassName}>
          <span className="italic truncate">{data.particularidade}</span>
        </span>
      )}
      {popup}
    </>
  )
}
