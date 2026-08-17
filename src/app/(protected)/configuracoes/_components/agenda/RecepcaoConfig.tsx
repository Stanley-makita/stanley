'use client'

import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useUsuarioAtual } from '@/hooks/useUsuarioAtual'
import { useUsuariosEmpresa } from '@/hooks/useUsuariosEmpresa'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Save } from 'lucide-react'
import { toast } from 'sonner'

function useRecepcaoUsuarioId(empresaId: string | undefined) {
  const supabase = createClient()
  return useQuery({
    queryKey: ['empresa-recepcao', empresaId],
    enabled: !!empresaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('empresas')
        .select('recepcao_usuario_id')
        .eq('id', empresaId!)
        .single()
      if (error) throw error
      return data.recepcao_usuario_id as string | null
    },
  })
}

export function RecepcaoConfig() {
  const supabase = createClient()
  const qc = useQueryClient()
  const { data: usuario } = useUsuarioAtual()
  const { data: membros = [] } = useUsuariosEmpresa()
  const { data: recepcaoAtual, isLoading } = useRecepcaoUsuarioId(usuario?.empresa_id)

  const [selecionado, setSelecionado] = useState<string>('')

  useEffect(() => {
    if (recepcaoAtual !== undefined) setSelecionado(recepcaoAtual ?? '')
  }, [recepcaoAtual])

  const salvar = useMutation({
    mutationFn: async () => {
      if (!usuario?.empresa_id) throw new Error('Empresa não identificada')
      const { error } = await supabase
        .from('empresas')
        .update({ recepcao_usuario_id: selecionado || null })
        .eq('id', usuario.empresa_id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['empresa-recepcao', usuario?.empresa_id] })
      toast.success('Usuário da recepção atualizado.', {
        className: 'border-l-4 border-l-fonti-accent bg-fonti-accent-hover text-fonti-primary',
      })
    },
    onError: (err: any) => toast.error(err?.message ?? 'Erro ao salvar — só admin pode alterar.'),
  })

  const mudou = selecionado !== (recepcaoAtual ?? '')

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Quando um "Novo Compromisso" é criado com local <strong>Sede Fontinhas</strong>, o sistema avisa
        automaticamente por WhatsApp, além do dono do compromisso, o usuário selecionado aqui. Troque em
        caso de férias ou ausência.
      </p>

      <div className="max-w-sm space-y-1.5">
        <Select value={selecionado || 'nenhum'} onValueChange={(v) => setSelecionado(v === 'nenhum' ? '' : v)} disabled={isLoading}>
          <SelectTrigger className="h-9 text-sm">
            <SelectValue placeholder="Selecionar usuário..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="nenhum">Nenhum (não notificar recepção)</SelectItem>
            {membros.map((m) => (
              <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Button
        size="sm"
        className="gap-1.5 bg-fonti-primary hover:bg-fonti-primary-hover text-white"
        disabled={!mudou || salvar.isPending}
        onClick={() => salvar.mutate()}
      >
        <Save className="h-3.5 w-3.5" />
        {salvar.isPending ? 'Salvando...' : 'Salvar'}
      </Button>
    </div>
  )
}
