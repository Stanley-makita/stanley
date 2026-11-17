'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import { type Processo, type StatusProtocolo } from '@/types/processos'
import { deveAvancarParaProtocolado } from '@/lib/processos/registroAutoAvanco'
import { normalizarTexto } from '@/lib/utils'
import { updateProcessoOuFalha } from '@/hooks/processos/useProcessos'
import { toast } from 'sonner'

export interface DadosRegistroForm {
  registro_status_protocolo: StatusProtocolo | null
  registro_numero_protocolo: string | null
  registro_cri: string | null
  registro_data_protocolado: string | null
  registro_data_prevista_entrega: string | null
  registro_diligencia: boolean | null
}

export function useAtualizarRegistro(processo: Processo) {
  const queryClient = useQueryClient()
  const { usuario } = useAuth()

  return useMutation({
    mutationFn: async (dados: DadosRegistroForm) => {
      // Helper que checa linhas afetadas: RLS barrando o UPDATE não gera erro
      // (achado real 2026-11-17, perfil Jurídico — ver migration 354).
      await updateProcessoOuFalha(processo.id, usuario!.empresa_id, { ...dados })

      // Avanço automático Preparação -> Protocolado. Deliberadamente sem a
      // trava de dados financeiros obrigatórios do avanço manual
      // (useAvancarFase): esse avanço é disparado pelo preenchimento do
      // protocolo, não pelo clique de "avançar fase", e processos de
      // Registro criados direto na implantação podem não ter esses dados
      // preenchidos ainda.
      if (deveAvancarParaProtocolado(
        processo.registro_status_protocolo,
        dados.registro_status_protocolo,
        processo.fase_atual?.nome,
      )) {
        const { data: faseProtocolado } = await supabase
          .from('fases')
          .select('id, nome')
          .eq('empresa_id', usuario!.empresa_id)
          .eq('modulo', 'registro')
          .eq('ativo', true)

        const fase = faseProtocolado?.find((f) => normalizarTexto(f.nome) === normalizarTexto('Protocolado'))
        if (fase) {
          // Muda a fase ANTES de gravar o histórico: se o UPDATE falhar, não
          // fica registro de "entrou em Protocolado" num processo que não andou.
          await updateProcessoOuFalha(processo.id, usuario!.empresa_id, { fase_atual_id: fase.id })
          const { error: histError } = await supabase.from('processo_fases_historico').insert({
            processo_id: processo.id,
            empresa_id: usuario!.empresa_id,
            fase_id: fase.id,
            usuario_id: usuario!.id,
            observacao: 'Avanço automático: protocolo registrado no Cartório.',
          })
          if (histError) throw histError
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['processos', processo.id] })
      queryClient.invalidateQueries({ queryKey: ['processos', processo.id, 'fases-historico'] })
      toast.success('Dados de Registro salvos.', {
        className: 'border-l-4 border-l-fonti-accent bg-fonti-accent-hover text-fonti-primary',
      })
    },
    onError: (err: any) => {
      console.error('[useAtualizarRegistro] erro:', err)
      toast.error('Erro ao salvar dados de Registro.', { description: err?.message })
    },
  })
}
