'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'

export interface ChecklistItemDB {
  id: string
  template_id: string
  descricao: string
  obrigatorio: boolean
  ordem: number
  ativo: boolean
  acao_ao_completar: string | null
  // Quando preenchido, o item só aparece se o processo tiver esse banco
  // selecionado (ex: item de conformidade que só existe para a Caixa) — null
  // = sempre aparece.
  condicao_banco_id: string | null
}

export interface ChecklistTemplateDB {
  id: string
  fase_id: string
  nome: string
  ativo: boolean
}

export interface ChecklistExecucao {
  id: string
  processo_id: string
  item_id: string
  marcado: boolean
  marcado_por: string | null
  marcado_em: string | null
  usuario?: { nome: string } | null
}

// Busca template + itens de uma fase. `bancoId` filtra fora itens
// condicionados a um banco diferente do banco do processo (ver
// condicao_banco_id) — quando omitido, itens condicionados nunca aparecem
// (evita vazar item de um banco específico num contexto sem banco definido).
export function useChecklistTemplate(faseId: string | null | undefined, bancoId?: string | null) {
  const { usuario } = useAuth()

  return useQuery({
    queryKey: ['checklist-template', faseId, usuario?.empresa_id, bancoId],
    enabled: !!faseId && !!usuario?.empresa_id,
    queryFn: async () => {
      const { data: template, error: tErr } = await supabase
        .from('checklist_templates')
        .select('id, fase_id, nome, ativo')
        .eq('empresa_id', usuario!.empresa_id)
        .eq('fase_id', faseId!)
        .eq('ativo', true)
        .maybeSingle()

      if (tErr) throw tErr
      if (!template) return { template: null, itens: [] }

      const { data: itens, error: iErr } = await supabase
        .from('checklist_items')
        .select('id, template_id, descricao, obrigatorio, ordem, ativo, acao_ao_completar, condicao_banco_id')
        .eq('template_id', template.id)
        .eq('ativo', true)
        .order('ordem', { ascending: true })

      if (iErr) throw iErr
      const todos = (itens ?? []) as ChecklistItemDB[]
      const visiveis = todos.filter((i) => !i.condicao_banco_id || i.condicao_banco_id === bancoId)
      return { template: template as ChecklistTemplateDB, itens: visiveis }
    },
    staleTime: 30_000,
  })
}

// Busca execuções de um processo (o que foi marcado)
export function useChecklistExecucoes(processoId: string) {
  const { usuario } = useAuth()

  return useQuery({
    queryKey: ['checklist-execucoes', processoId],
    enabled: !!processoId && !!usuario?.empresa_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('checklist_execucoes')
        .select('id, processo_id, item_id, marcado, marcado_por, marcado_em, usuario:usuarios!marcado_por(nome)')
        .eq('processo_id', processoId)
        .eq('empresa_id', usuario!.empresa_id)

      if (error) throw error
      return (data ?? []) as unknown as ChecklistExecucao[]
    },
  })
}

// "processo_conforme"/"processo_inconforme" são mutuamente exclusivos (o
// processo só pode estar num dos dois estados por vez) — marcar um desmarca
// automaticamente o outro, se estava marcado.
const PAR_CONFORMIDADE: Record<string, string> = {
  processo_conforme: 'processo_inconforme',
  processo_inconforme: 'processo_conforme',
}

// Mutation: marcar ou desmarcar um item (upsert)
export function useMarcarChecklistItem(processoId: string) {
  const queryClient = useQueryClient()
  const { usuario } = useAuth()

  return useMutation({
    mutationFn: async ({ item, marcado }: { item: ChecklistItemDB; marcado: boolean }) => {
      const { error } = await supabase
        .from('checklist_execucoes')
        .upsert(
          {
            processo_id: processoId,
            item_id:     item.id,
            empresa_id:  usuario!.empresa_id,
            marcado,
            marcado_por: marcado ? usuario!.id : null,
            marcado_em:  marcado ? new Date().toISOString() : null,
          },
          { onConflict: 'processo_id,item_id' }
        )
      if (error) throw error

      if (marcado && item.acao_ao_completar === 'emitido') {
        const { error: errP } = await supabase
          .from('processos')
          .update({
            status_emissao: 'emitido',
            data_emissao: new Date().toISOString().slice(0, 10),
          })
          .eq('id', processoId)
        if (errP) throw errP
      }

      // "assinado" é dedicado (não reaproveita status_emissao, que é enum de 2
      // valores cabeado em triggers financeiros/notificação de emissão) — só
      // libera o botão "Enviar para Fluxo Registro" no cabeçalho do processo.
      if (marcado && item.acao_ao_completar === 'assinado') {
        const { error: errP } = await supabase
          .from('processos')
          .update({ assinado_em: new Date().toISOString() })
          .eq('id', processoId)
        if (errP) throw errP
      }

      // Trava o processo (leitura) e passa a exibir "Processo Concluído" no
      // cabeçalho — ver PainelChecklist/processos/[id]/page.tsx.
      if (marcado && item.acao_ao_completar === 'processo_concluido') {
        const { error: errP } = await supabase
          .from('processos')
          .update({ concluido_em: new Date().toISOString() })
          .eq('id', processoId)
        if (errP) throw errP
      }

      // Dispara o financeiro do Consórcio (mesma função chamada quando o
      // processo avança pra uma fase com e_fase_final_consorcio=true — ver
      // useProcessoFasesHistorico.moverFaseProcesso). Os dois gatilhos
      // coexistem; a função é idempotente por cota/parcela (ON CONFLICT DO
      // NOTHING). Só chama se o processo for de fato Consórcio, pra não
      // quebrar caso esse item apareça, por engano, em outra modalidade.
      if (marcado && item.acao_ao_completar === 'consorcio_efetivado') {
        const { data: proc } = await supabase
          .from('processos')
          .select('modalidade')
          .eq('id', processoId)
          .single()
        if (proc?.modalidade === 'Consorcio') {
          const { error: errRpc } = await supabase.rpc('gerar_fluxo_financeiro_consorcio', { p_processo_id: processoId })
          if (errRpc) throw errRpc
        }
      }

      if (marcado && item.acao_ao_completar === 'enviado_conformidade') {
        const { error: errP } = await supabase
          .from('processos')
          .update({ enviado_conformidade_em: new Date().toISOString() })
          .eq('id', processoId)
        if (errP) throw errP
      }

      if (marcado && (item.acao_ao_completar === 'processo_conforme' || item.acao_ao_completar === 'processo_inconforme')) {
        const acaoOposta = PAR_CONFORMIDADE[item.acao_ao_completar]
        const { data: itemOposto } = await supabase
          .from('checklist_items')
          .select('id')
          .eq('template_id', item.template_id)
          .eq('acao_ao_completar', acaoOposta)
          .maybeSingle()

        if (itemOposto) {
          const { error: errOposto } = await supabase
            .from('checklist_execucoes')
            .upsert(
              {
                processo_id: processoId,
                item_id:     itemOposto.id,
                empresa_id:  usuario!.empresa_id,
                marcado:     false,
                marcado_por: null,
                marcado_em:  null,
              },
              { onConflict: 'processo_id,item_id' }
            )
          if (errOposto) throw errOposto
        }

        const { error: errP } = await supabase
          .from('processos')
          .update(
            item.acao_ao_completar === 'processo_conforme'
              ? { conformidade_aprovada_em: new Date().toISOString() }
              : { conformidade_reprovada_em: new Date().toISOString() }
          )
          .eq('id', processoId)
        if (errP) throw errP
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['checklist-execucoes', processoId] })
      queryClient.invalidateQueries({ queryKey: ['processo', processoId] })
      queryClient.invalidateQueries({ queryKey: ['processos'] })
    },
  })
}

// "processo_conforme"/"processo_inconforme" formam um par mutuamente
// exclusivo: o par conta como satisfeito se qualquer um dos dois estiver
// marcado (não exige os dois, mesmo que ambos sejam obrigatórios).
const ACOES_PAR_CONFORMIDADE = ['processo_conforme', 'processo_inconforme']

export function itemChecklistSatisfeito(
  item: ChecklistItemDB,
  itens: ChecklistItemDB[],
  marcadosSet: Set<string>,
): boolean {
  if (marcadosSet.has(item.id)) return true
  if (item.acao_ao_completar && ACOES_PAR_CONFORMIDADE.includes(item.acao_ao_completar)) {
    const par = itens.find(x => x.id !== item.id && x.acao_ao_completar && ACOES_PAR_CONFORMIDADE.includes(x.acao_ao_completar))
    if (par && marcadosSet.has(par.id)) return true
  }
  return false
}

// Hook derivado: retorna se há itens obrigatórios pendentes para uma fase/processo
export function useChecklistPendencias(processoId: string, faseId: string | null | undefined) {
  const { data: tmpl, isLoading: tmplLoading } = useChecklistTemplate(faseId)
  const { data: execucoes = [], isLoading: execLoading } = useChecklistExecucoes(processoId)

  const itens = tmpl?.itens ?? []
  const marcadosSet = new Set(execucoes.filter(e => e.marcado).map(e => e.item_id))

  const itensObrigatoriosPendentes = itens.some(i => i.obrigatorio && !itemChecklistSatisfeito(i, itens, marcadosSet))

  return {
    itensObrigatoriosPendentes,
    isLoading: tmplLoading || execLoading,
  }
}
