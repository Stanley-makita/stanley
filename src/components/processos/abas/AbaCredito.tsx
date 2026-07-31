'use client'

/**
 * Aba "Crédito" de Processos — reaproveita as mesmas análises de crédito
 * (banco, valores, status) já usadas em Captação/Lead, mas para um negócio
 * que já está em fase avançada de Financiamento e precisa de uma NOVA
 * análise por motivo externo (banco recusou, mudança de renda, troca de
 * banco etc.), sem voltar o cliente pra fase de Lead.
 *
 * Diferente de BlocoAnalises (Lead), aqui não há sincronização de status
 * de fase/Kanban nem lead_followups — o Processo já tem seu próprio fluxo
 * de fases/status, então esta aba só registra as análises em si.
 */

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import { useAnalisesCredito } from '@/hooks/leads/useAnalisesCredito'
import { useSalvarValidadeProcesso } from '@/hooks/processos/useSalvarValidadeProcesso'
import { useAdicionarComentario } from '@/hooks/processos/useProcessoComentarios'
import { useBancos } from '@/hooks/useBancos'
import { fmtData } from '@/lib/utils'
import {
  AnaliseCard, AnaliseForm, type AnaliseFormInput,
} from '@/components/leads/LeadDetalhe/AbaCredito'
import { ExcluirAnaliseCreditoDialog } from '@/components/processos/abas/ExcluirAnaliseCreditoDialog'
import type { StatusAnaliseCredito, LeadAnaliseCredito } from '@/types/leads'
import type { Processo } from '@/types/processos'

interface Props { processoId: string; processo: Processo }

function useAtualizarDataCreditoProcesso(processoId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (data_credito: string | null) => {
      const { error } = await supabase.from('processos').update({ data_credito }).eq('id', processoId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['processos', processoId] }),
    onError: () => toast.error('Não foi possível salvar a data da aprovação.'),
  })
}

// Sincroniza o card "Operação" (Resumo) com os dados de uma análise de
// crédito aprovada em outro banco — só chamado quando o banco muda,
// nunca automaticamente (ver handleSalvarDataAprovacao).
function useSincronizarOperacaoComAnalise(processoId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (dados: {
      banco_id: string
      valor_imovel: number | null
      valor_entrada: number | null
      valor_financiado: number | null
      prazo_amortizacao_meses: number | null
    }) => {
      const { error } = await supabase.from('processos').update(dados).eq('id', processoId)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['processos', processoId] })
      qc.invalidateQueries({ queryKey: ['processos'] })
      toast.success('Dados da Operação atualizados com esta análise.')
    },
    onError: () => toast.error('Não foi possível atualizar os Dados da Operação.'),
  })
}

export function AbaCredito({ processoId, processo }: Props) {
  const { usuario } = useAuth()
  const qc = useQueryClient()
  const {
    analises, isLoading, criar, editar, deletar, definirBanco, limparBancoDefinido,
  } = useAnalisesCredito({ processoId })

  const [criando, setCriando] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [excluindoAnalise, setExcluindoAnalise] = useState<LeadAnaliseCredito | null>(null)
  const analiseDefinida = analises.find((a) => a.banco_definido) ?? null
  const podeExcluirAnalise = usuario?.perfil === 'admin'

  const [dataAprovacao, setDataAprovacao] = useState(processo.data_credito ?? '')
  const atualizarDataCredito = useAtualizarDataCreditoProcesso(processoId)
  const salvarValidade = useSalvarValidadeProcesso()
  const sincronizarOperacao = useSincronizarOperacaoComAnalise(processoId)
  const { data: bancos = [] } = useBancos()
  const comentar = useAdicionarComentario(processoId)

  function handleStatusChange(id: string, status: StatusAnaliseCredito) {
    const analise = analises.find((a) => a.id === id)
    editar.mutate({ id, status }, {
      onSuccess: () => {
        if (status === 'aprovado') {
          comentar.mutate({
            tipo: 'alteracao',
            texto: `Análise de crédito aprovada${analise?.banco_pretendido ? ` — Banco: ${analise.banco_pretendido}` : ''}.`,
            notificar_cliente: false,
          })
        }
      },
    })
  }

  // Compartilhada entre trocar o banco definido (handleToggleBanco) e editar
  // manualmente a Data da Aprovação (handleSalvarDataAprovacao) — antes só o
  // segundo caminho perguntava sobre Validade/sincronizar Operação, então
  // trocar de banco quando a data já era igual (ex: dois bancos aprovados no
  // mesmo dia) não disparava nada. Recebe a análise diretamente (não
  // `analiseDefinida` do estado) pra não depender do refetch já ter chegado.
  async function salvarDataESincronizar(analiseBase: LeadAnaliseCredito | null, novaData: string | null) {
    if (novaData !== (processo.data_credito ?? null)) {
      await atualizarDataCredito.mutateAsync(novaData)
      setDataAprovacao(novaData ?? '')
      if (novaData) {
        comentar.mutate({
          tipo: 'alteracao',
          texto: `Data de Aprovação de Crédito registrada: ${fmtData(novaData)}.`,
          notificar_cliente: false,
        })
      }
    }

    if (!novaData) return

    const substituir = window.confirm(
      'Deseja atualizar também a Validade do Crédito (+90 dias a partir de hoje) com base nesta nova aprovação?\n\nSe preferir manter a validade já em vigor, clique em Cancelar — a data de aprovação é salva de qualquer forma.',
    )
    if (substituir) {
      const novaValidade = new Date()
      novaValidade.setDate(novaValidade.getDate() + 90)
      const dataValidade = novaValidade.toISOString().slice(0, 10)
      await salvarValidade.mutateAsync({
        processoId,
        tipo: 'credito',
        data: dataValidade,
      })
      comentar.mutate({
        tipo: 'alteracao',
        texto: `Validade do Crédito atualizada para ${fmtData(dataValidade)}.`,
        notificar_cliente: false,
      })
    }

    // Só pergunta sobre os Dados da Operação quando o banco da análise base é
    // diferente do banco já registrado no processo — se for o mesmo banco
    // (ex: crédito venceu e precisou reaprovar), não há nada pra sincronizar.
    if (analiseBase?.banco_pretendido) {
      const bancoAnalise = bancos.find((b) => b.nome === analiseBase.banco_pretendido)
      const bancoMudou = bancoAnalise && bancoAnalise.id !== (processo.banco_id ?? null)
      if (bancoMudou) {
        const sincronizar = window.confirm(
          `O banco desta aprovação (${analiseBase.banco_pretendido}) é diferente do banco atual da operação (${processo.banco?.nome ?? '—'}).\n\nDeseja atualizar os Dados da Operação (Banco, Valor do Imóvel, Entrada, Valor Financiado e Prazo) com os valores desta análise?\n\nSe preferir manter os dados atuais, clique em Cancelar.`,
        )
        if (sincronizar) {
          await sincronizarOperacao.mutateAsync({
            banco_id: bancoAnalise!.id,
            valor_imovel: analiseBase.valor_imovel,
            valor_entrada: analiseBase.entrada,
            valor_financiado: analiseBase.valor_pretendido,
            prazo_amortizacao_meses: analiseBase.prazo_meses,
          })
          comentar.mutate({
            tipo: 'alteracao',
            texto: `Dados da Operação (Resumo) atualizados conforme análise de crédito aprovada — novo banco: ${bancoAnalise!.nome}.`,
            notificar_cliente: false,
          })
        }
      }
    }
  }

  async function handleToggleBanco(id: string) {
    const analise = analises.find((a) => a.id === id)
    if (!analise) return
    if (analise.banco_definido) {
      limparBancoDefinido.mutate(id)
      return
    }
    await definirBanco.mutateAsync(id)
    // Usa a data já digitada no campo se houver; senão a data de resposta da
    // própria análise; senão hoje — nunca fica sem data, nunca exige que o
    // usuário mexa no campo manualmente como "gatilho".
    const data = dataAprovacao || analise.data_resposta || new Date().toISOString().slice(0, 10)
    await salvarDataESincronizar(analise, data)
  }

  function handleDataRespostaChange(id: string, data_resposta: string | null) {
    editar.mutate({ id, data_resposta })
  }

  async function handleSalvarNova(campos: AnaliseFormInput) {
    if (!usuario) return
    await criar.mutateAsync({
      empresa_id: usuario.empresa_id,
      lead_id: null,
      processo_id: processoId,
      banco_definido: false,
      ...campos,
    })
    setCriando(false)
    qc.invalidateQueries({ queryKey: ['processos', processoId] })
    comentar.mutate({
      tipo: 'alteracao',
      texto: `Nova análise de crédito solicitada${campos.banco_pretendido ? ` — Banco: ${campos.banco_pretendido}` : ''}.`,
      notificar_cliente: false,
    })
  }

  function handleConfirmarExclusao(motivo: string) {
    if (!excluindoAnalise) return
    const nomeBanco = excluindoAnalise.banco_pretendido ?? excluindoAnalise.nome
    deletar.mutate(excluindoAnalise.id, {
      onSuccess: () => {
        comentar.mutate({
          tipo: 'alteracao',
          texto: `Análise de crédito excluída — Banco: ${nomeBanco} — Motivo: ${motivo}`,
          notificar_cliente: false,
        })
        setExcluindoAnalise(null)
      },
    })
  }

  // Correção manual pontual da data (o campo "Data da Aprovação") — só faz
  // algo se o valor de fato mudou, pra não reabrir os confirms de
  // Validade/Operação toda vez que o campo só perde o foco sem alteração.
  // A troca de banco definido (handleToggleBanco) já dispara o mesmo fluxo
  // completo sozinha, sem depender deste campo.
  async function handleSalvarDataAprovacao() {
    const valor = dataAprovacao || null
    if (valor === (processo.data_credito ?? null)) return
    await salvarDataESincronizar(analiseDefinida, valor)
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl space-y-3">
        <div className="flex items-center justify-between border-b border-gray-100 pb-2">
          <div>
            <p className="text-[11px] font-bold text-fonti-primary uppercase tracking-widest">Análises de Crédito</p>
            <p className="text-xs text-gray-400 mt-0.5">
              Registre uma nova tentativa de análise (outro banco, reanálise) sem voltar o negócio pra fase de Lead.
            </p>
          </div>
          <button
            onClick={() => { setCriando(true); setEditandoId(null) }}
            className="flex items-center gap-1 text-xs text-fonti-primary hover:underline font-medium shrink-0"
          >
            <Plus className="h-3 w-3" /> Nova Análise
          </button>
        </div>

        {isLoading && <p className="text-xs text-gray-400">Carregando...</p>}

        {!isLoading && analises.length === 0 && !criando && (
          <p className="text-xs text-gray-400 italic">Nenhuma análise de crédito registrada neste negócio ainda.</p>
        )}

        <div className="space-y-3">
          {analises.map((analise, i) =>
            editandoId === analise.id ? (
              <AnaliseForm
                key={analise.id}
                inicial={analise}
                onSalvar={async (campos) => {
                  await editar.mutateAsync({ id: analise.id, ...campos })
                  setEditandoId(null)
                }}
                onCancelar={() => setEditandoId(null)}
                isPending={editar.isPending}
              />
            ) : (
              <AnaliseCard
                key={analise.id}
                analise={analise}
                numero={i + 1}
                onEditar={() => { setEditandoId(analise.id); setCriando(false) }}
                onDefinirBanco={() => handleToggleBanco(analise.id)}
                onStatusChange={(s) => handleStatusChange(analise.id, s)}
                onDataRespostaChange={(d) => handleDataRespostaChange(analise.id, d)}
                definindoBanco={definirBanco.isPending || limparBancoDefinido.isPending}
                onSolicitarExclusao={podeExcluirAnalise ? () => setExcluindoAnalise(analise) : undefined}
                excluindo={deletar.isPending}
              />
            ),
          )}

          {criando && (
            <AnaliseForm
              numero={analises.length + 1}
              onSalvar={handleSalvarNova}
              onCancelar={() => setCriando(false)}
              isPending={criar.isPending}
            />
          )}
        </div>
      </div>

      {/* Aprovação de Crédito — mesmo card de Lead, adaptado: salvar a data
          nunca sobrescreve a Validade do Crédito sem confirmação. */}
      <div className="bg-white border border-gray-300 rounded-xl shadow p-4 space-y-3">
        <p className="text-[11px] font-bold text-fonti-primary uppercase tracking-widest border-b border-gray-100 pb-2">Aprovação de Crédito</p>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[200px]">
            {analiseDefinida ? (
              <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 h-[52px]">
                <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] text-green-600 font-semibold uppercase tracking-wide leading-none mb-0.5">Banco Definido</p>
                  <p className="text-sm font-bold text-green-800 truncate leading-tight">
                    {analiseDefinida.banco_pretendido ?? analiseDefinida.nome}
                  </p>
                </div>
                {analiseDefinida.numero_proposta && (
                  <p className="text-xs text-green-700 shrink-0">Prop. {analiseDefinida.numero_proposta}</p>
                )}
              </div>
            ) : (
              <div className="flex items-center rounded-lg border border-dashed border-gray-200 bg-gray-50 px-3 h-[52px]">
                <p className="text-xs text-gray-400 italic">Nenhum banco definido</p>
              </div>
            )}
          </div>

          <div className="shrink-0 space-y-1">
            <p className="text-xs text-gray-500">Data da Aprovação</p>
            <input
              type="date"
              className="h-8 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={dataAprovacao}
              onChange={(e) => setDataAprovacao(e.target.value)}
              onBlur={handleSalvarDataAprovacao}
            />
            {(atualizarDataCredito.isPending || salvarValidade.isPending || sincronizarOperacao.isPending) && (
              <p className="text-[10px] text-gray-400">Salvando…</p>
            )}
          </div>
        </div>
      </div>

      <ExcluirAnaliseCreditoDialog
        analise={excluindoAnalise}
        onFechar={() => setExcluindoAnalise(null)}
        onConfirmar={handleConfirmarExclusao}
        isPending={deletar.isPending}
      />
    </div>
  )
}
