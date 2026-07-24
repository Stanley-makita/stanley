'use client'

/**
 * Tela especializada de Negócios do tipo Contrato — substitui, só para esta
 * modalidade, a tela genérica herdada de Financiamento (ver processos/[id]/page.tsx).
 *
 * Fase 1 do plano "Construtor Inteligente de Contratos": tipo/valor, documentos
 * (reaproveitando AbaDocumentos) e descrição da negociação. As etapas de IA
 * (Compreensão da Negociação, Plano do Contrato, construção da minuta) e o
 * botão de importar documentos do Negócio de Financiamento vinculado entram
 * numa próxima fatia — não implementadas aqui ainda.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { type Processo, type TipoContrato, TIPO_CONTRATO_LABELS } from '@/types/processos'
import { FINANCIAMENTO_MODALIDADES } from '@/lib/processos/fasesConfig'
import { AbaDocumentos } from '@/components/documentos/AbaDocumentos'
import { ParticularidadeCliente } from '@/components/pessoas/ParticularidadeCliente'

function useNegocioFinanciamentoVinculado(pessoaId: string | null | undefined, processoAtualId: string) {
  const { usuario } = useAuth()
  return useQuery({
    queryKey: ['negocio-financiamento-vinculado', pessoaId],
    enabled: !!usuario?.empresa_id && !!pessoaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('processos')
        .select('id, numero_processo, modalidade')
        .eq('empresa_id', usuario!.empresa_id)
        .eq('pessoa_id', pessoaId!)
        .is('deleted_at', null)
        .neq('id', processoAtualId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []).find((p) => FINANCIAMENTO_MODALIDADES.has(p.modalidade)) ?? null
    },
  })
}

function useAtualizarTipoValorContrato(processoId: string) {
  const { usuario } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: { tipo_contrato: TipoContrato | null; valor_contrato: number | null }) => {
      const { error } = await supabase
        .from('processos')
        .update(payload)
        .eq('id', processoId)
        .eq('empresa_id', usuario!.empresa_id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['processos', processoId] }),
  })
}

export function ContratoConstrutor({ processo }: { processo: Processo }) {
  const router = useRouter()
  const compradorPrincipal = processo.compradores?.find((c) => c.principal) ?? processo.compradores?.[0]
  const pessoaId = compradorPrincipal?.pessoa_id ?? processo.pessoa_id

  const { data: negocioVinculado } = useNegocioFinanciamentoVinculado(pessoaId, processo.id)
  const atualizar = useAtualizarTipoValorContrato(processo.id)

  const [tipoContrato, setTipoContrato] = useState<TipoContrato | ''>(processo.tipo_contrato ?? '')
  const [valorContrato, setValorContrato] = useState(processo.valor_contrato != null ? String(processo.valor_contrato) : '')
  const [descricao, setDescricao] = useState('')

  function salvarTipoValor(patch: Partial<{ tipo: TipoContrato | ''; valor: string }>) {
    const tipo = patch.tipo !== undefined ? patch.tipo : tipoContrato
    const valor = patch.valor !== undefined ? patch.valor : valorContrato
    if (patch.tipo !== undefined) setTipoContrato(patch.tipo)
    if (patch.valor !== undefined) setValorContrato(patch.valor)
    atualizar.mutate({
      tipo_contrato: tipo || null,
      valor_contrato: valor ? Number(valor) : null,
    })
  }

  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-gray-400" onClick={() => router.push('/processos')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-lg font-bold leading-tight text-fonti-primary sm:text-xl truncate">
          {compradorPrincipal?.nome ?? processo.nome_imovel}
        </h1>
        <ParticularidadeCliente pessoaId={pessoaId} />
        {negocioVinculado && (
          <button
            onClick={() => router.push(`/processos/${negocioVinculado.id}`)}
            className="ml-auto text-xs text-blue-600 hover:underline shrink-0"
          >
            {negocioVinculado.numero_processo} vinculado — Ver Negócio →
          </button>
        )}
      </div>

      {/* ① Tipo de contrato + valor */}
      <section className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">① Tipo de contrato</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Select value={tipoContrato} onValueChange={(v) => salvarTipoValor({ tipo: v as TipoContrato })}>
            <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione o tipo" /></SelectTrigger>
            <SelectContent>
              {Object.entries(TIPO_CONTRATO_LABELS).map(([valor, label]) => (
                <SelectItem key={valor} value={valor}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="number"
            inputMode="decimal"
            placeholder="Valor do contrato (R$)"
            value={valorContrato}
            onChange={(e) => setValorContrato(e.target.value)}
            onBlur={() => salvarTipoValor({})}
            className="h-9 text-sm"
          />
        </div>
      </section>

      {/* ② Documentos */}
      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">② Documentos</h2>
        <AbaDocumentos contexto="processo" processoId={processo.id} pessoaId={pessoaId ?? undefined} />
      </section>

      {/* ③ Descrição da negociação */}
      <section className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">③ Descreva a negociação</h2>
        <Textarea
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          maxLength={1000}
          rows={5}
          placeholder="Ex: Contrato de compra e venda de imóvel residencial em Maringá. Valor R$450 mil, entrada R$180 mil, saldo financiado. Posse em 30 dias. Multa 10%."
          className="text-sm"
        />
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-gray-400">{descricao.length}/1000</span>
          <Button size="sm" disabled title="Em construção — próxima etapa do Construtor de Contratos">
            ✨ Entender negociação
          </Button>
        </div>
      </section>
    </div>
  )
}
