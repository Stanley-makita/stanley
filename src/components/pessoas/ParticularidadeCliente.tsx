'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { Pencil, Plus, Loader2 } from 'lucide-react'

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

  if (editando) {
    return (
      <div className="flex items-start gap-2 w-full max-w-md">
        <Textarea
          autoFocus
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Observação sobre o cliente (ex.: prefere contato só por WhatsApp, exigente com prazos...)"
          className="min-h-[60px] text-xs"
        />
        <div className="flex flex-col gap-1">
          <Button size="sm" disabled={salvar.isPending} onClick={() => salvar.mutate(texto)}>
            {salvar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Salvar'}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setEditando(false)}>Cancelar</Button>
        </div>
      </div>
    )
  }

  if (!data?.particularidade) {
    if (!podeEditar) return null
    return (
      <button
        type="button"
        onClick={() => { setTexto(''); setEditando(true) }}
        className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-fonti-primary transition-colors"
      >
        <Plus className="h-3 w-3" /> Adicionar particularidade
      </button>
    )
  }

  return (
    <div className="inline-flex items-start gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1 max-w-md">
      <span className="italic">{data.particularidade}</span>
      {podeEditar && (
        <button
          type="button"
          onClick={() => { setTexto(data.particularidade ?? ''); setEditando(true) }}
          className="shrink-0 text-amber-500 hover:text-amber-800 transition-colors"
          title="Editar particularidade"
        >
          <Pencil className="h-3 w-3" />
        </button>
      )}
    </div>
  )
}
