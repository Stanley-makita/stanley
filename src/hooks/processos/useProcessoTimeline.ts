'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { type TimelineItem, type ProcessoComentario, type ProcessoFaseHistorico, type ProcessoTarefa } from '@/types/processos'

export function useProcessoTimeline(processoId: string) {
  return useQuery({
    queryKey: ['processos', processoId, 'timeline'],
    queryFn: async (): Promise<TimelineItem[]> => {
      const [comentariosRes, fasesRes, tarefasRes] = await Promise.all([
        supabase
          .from('processo_comentarios')
          .select('*, usuario:usuarios!usuario_id(nome)')
          .eq('processo_id', processoId)
          .order('created_at', { ascending: false }),
        supabase
          .from('processo_fases_historico')
          .select('*, fase:fases!fase_id(id, nome, cor), usuario:usuarios!usuario_id(nome)')
          .eq('processo_id', processoId)
          .order('entrou_em', { ascending: false }),
        supabase
          .from('processo_tarefas')
          .select('*, responsavel:usuarios!responsavel_id(nome)')
          .eq('processo_id', processoId)
          .order('created_at', { ascending: false }),
      ])

      if (comentariosRes.error) throw comentariosRes.error
      if (fasesRes.error) throw fasesRes.error
      if (tarefasRes.error) throw tarefasRes.error

      const items: TimelineItem[] = [
        ...(comentariosRes.data as ProcessoComentario[]).map((c) => ({
          tipo: 'comentario' as const,
          data: c.created_at,
          payload: c,
        })),
        ...(fasesRes.data as ProcessoFaseHistorico[]).map((f) => ({
          tipo: 'fase' as const,
          data: f.entrou_em,
          payload: f,
        })),
        ...(tarefasRes.data as ProcessoTarefa[])
          .filter((t) => !t.concluida)
          .map((t) => ({
            tipo: 'tarefa_criada' as const,
            data: t.created_at,
            payload: t,
          })),
        ...(tarefasRes.data as ProcessoTarefa[])
          .filter((t) => t.concluida && t.concluida_em)
          .map((t) => ({
            tipo: 'tarefa_concluida' as const,
            data: t.concluida_em!,
            payload: t,
          })),
      ]

      return items.sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime())
    },
    enabled: !!processoId,
  })
}