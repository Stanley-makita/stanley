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
import { useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useAuth } from '@/hooks/auth/useAuth'
import { useAnalisesCredito } from '@/hooks/leads/useAnalisesCredito'
import {
  AnaliseCard, AnaliseForm, type AnaliseFormInput,
} from '@/components/leads/LeadDetalhe/AbaCredito'
import type { StatusAnaliseCredito } from '@/types/leads'

interface Props { processoId: string }

export function AbaCredito({ processoId }: Props) {
  const { usuario } = useAuth()
  const qc = useQueryClient()
  const {
    analises, isLoading, criar, editar, deletar, definirBanco, limparBancoDefinido,
  } = useAnalisesCredito({ processoId })

  const [criando, setCriando] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)

  function handleStatusChange(id: string, status: StatusAnaliseCredito) {
    editar.mutate({ id, status })
  }

  function handleToggleBanco(id: string) {
    const analise = analises.find((a) => a.id === id)
    if (analise?.banco_definido) {
      limparBancoDefinido.mutate(id)
    } else {
      definirBanco.mutate(id)
    }
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
  }

  return (
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
              onDeletar={() => deletar.mutate(analise.id)}
              onDefinirBanco={() => handleToggleBanco(analise.id)}
              onStatusChange={(s) => handleStatusChange(analise.id, s)}
              onDataRespostaChange={(d) => handleDataRespostaChange(analise.id, d)}
              deletando={deletar.isPending}
              definindoBanco={definirBanco.isPending || limparBancoDefinido.isPending}
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
  )
}
