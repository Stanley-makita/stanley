'use client'

/**
 * Tela especializada de Negócios do tipo Contrato — substitui, só para esta
 * modalidade, a tela genérica herdada de Financiamento (ver processos/[id]/page.tsx).
 *
 * Fluxo completo do Construtor Inteligente de Contratos: Tipo/Valor →
 * Documentos (reaproveitando AbaDocumentos, com import por referência do
 * Negócio de Financiamento vinculado) → Descrição da negociação →
 * Compreensão da Negociação (IA) + Painel de Inteligência → Plano do
 * Contrato (IA) → Construir contrato (template + resumo confirmado) →
 * editor completo (TipTap/PDF/ClickSign, reaproveitando AbaContrato).
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Sparkles, Loader2, CheckCircle2, AlertTriangle, Import } from 'lucide-react'
import { toast } from 'sonner'
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
import {
  useEntenderNegociacao, useConfirmarEntendimento, useGerarPlanoContrato, useConfirmarPlano,
  useSalvarContrato,
} from '@/hooks/processos/useProcessoContrato'
import { type ResumoNegociacao } from '@/lib/contratos/entenderNegociacao'
import { type PlanoContrato } from '@/lib/contratos/planejarContrato'
import { selecionarTemplate } from '@/lib/contratos/selecionarTemplate'
import { substituirVariaveis } from '@/lib/contratos/substituirVariaveis'
import { construirDadosTemplate } from '@/lib/contratos/resumoParaTemplate'
import { AbaContrato } from '@/components/processos/abas/AbaContrato'

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

function useImportarDocumentosNegocio(processoId: string) {
  const { usuario } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (negocioOrigemId: string) => {
      const { data: vinculosOrigem, error: erroOrigem } = await supabase
        .from('documento_vinculos')
        .select('documento_id')
        .eq('entidade_tipo', 'processo')
        .eq('entidade_id', negocioOrigemId)
      if (erroOrigem) throw erroOrigem

      const { data: vinculosAtuais } = await supabase
        .from('documento_vinculos')
        .select('documento_id')
        .eq('entidade_tipo', 'processo')
        .eq('entidade_id', processoId)
      const jaVinculados = new Set((vinculosAtuais ?? []).map((v) => v.documento_id))

      const novos = (vinculosOrigem ?? [])
        .map((v) => v.documento_id)
        .filter((id) => !jaVinculados.has(id))

      if (novos.length === 0) return 0

      const { error } = await supabase.from('documento_vinculos').insert(
        novos.map((documento_id) => ({
          empresa_id: usuario!.empresa_id,
          documento_id,
          entidade_tipo: 'processo',
          entidade_id: processoId,
          vinculado_por: usuario!.id,
        })),
      )
      if (error) throw error
      return novos.length
    },
    onSuccess: (quantidade) => {
      qc.invalidateQueries({ queryKey: ['documentos-unificado', 'processo', processoId] })
      toast.success(quantidade > 0 ? `${quantidade} documento(s) importado(s).` : 'Nenhum documento novo para importar.')
    },
    onError: (error) => {
      console.error('[contratos] erro ao importar documentos do negócio vinculado:', error)
      toast.error('Erro ao importar documentos.')
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
  const importarDocumentos = useImportarDocumentosNegocio(processo.id)
  const atualizar = useAtualizarTipoValorContrato(processo.id)
  const entenderNegociacao = useEntenderNegociacao(processo.id)
  const confirmarEntendimento = useConfirmarEntendimento(processo.id)
  const gerarPlano = useGerarPlanoContrato(processo.id)
  const confirmarPlano = useConfirmarPlano(processo.id)
  const salvarContrato = useSalvarContrato(processo.id)

  const [tipoContrato, setTipoContrato] = useState<TipoContrato | ''>(processo.tipo_contrato ?? '')
  const [valorContrato, setValorContrato] = useState(processo.valor_contrato != null ? String(processo.valor_contrato) : '')
  const [descricao, setDescricao] = useState('')
  const [resumo, setResumo] = useState<ResumoNegociacao | null>(null)
  const [rascunhoId, setRascunhoId] = useState<string | null>(null)
  const [plano, setPlano] = useState<PlanoContrato | null>(null)
  const [construindo, setConstruindo] = useState(false)
  const [contratoConstruido, setContratoConstruido] = useState(false)

  async function construirContrato() {
    if (!resumo || !rascunhoId) return
    setConstruindo(true)
    try {
      await confirmarPlano.mutateAsync({ contratoId: rascunhoId, plano: plano! })
      const template = selecionarTemplate(tipoContrato)
      const { processoAdaptado, compradoresAdaptados, vendedoresAdaptados, extras } = construirDadosTemplate(resumo, processo)
      const html = substituirVariaveis(template.conteudo, processoAdaptado, compradoresAdaptados, vendedoresAdaptados, undefined, extras)
      await salvarContrato.mutateAsync({ id: rascunhoId, tipo_modelo: tipoContrato, titulo: template.titulo, conteudo_html: html })
      setContratoConstruido(true)
    } finally {
      setConstruindo(false)
    }
  }

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
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">② Documentos</h2>
          {negocioVinculado && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1.5"
              disabled={importarDocumentos.isPending}
              onClick={() => importarDocumentos.mutate(negocioVinculado.id)}
            >
              <Import className="h-3.5 w-3.5" />
              {importarDocumentos.isPending ? 'Importando...' : `Importar do Negócio ${negocioVinculado.numero_processo}`}
            </Button>
          )}
        </div>
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
          <Button
            size="sm"
            disabled={!tipoContrato || entenderNegociacao.isPending}
            onClick={() => entenderNegociacao.mutate(descricao, { onSuccess: setResumo })}
          >
            {entenderNegociacao.isPending
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Entendendo...</>
              : <><Sparkles className="h-4 w-4" /> Entender negociação</>}
          </Button>
        </div>
      </section>

      {/* ④ Compreensão da Negociação + Painel de Inteligência */}
      {resumo && (
        <section className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">④ Compreensão da negociação</h2>

          <div className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
            {resumo.compradores.length > 0 && (
              <p><span className="text-gray-400">Comprador:</span> {resumo.compradores.map((p) => p.nome).filter(Boolean).join(', ') || '—'}</p>
            )}
            {resumo.vendedores.length > 0 && (
              <p><span className="text-gray-400">Vendedor:</span> {resumo.vendedores.map((p) => p.nome).filter(Boolean).join(', ') || '—'}</p>
            )}
            {(resumo.imovel.endereco || resumo.imovel.matricula) && (
              <p className="sm:col-span-2"><span className="text-gray-400">Imóvel:</span> {[resumo.imovel.endereco, resumo.imovel.cidade, resumo.imovel.uf].filter(Boolean).join(', ')}{resumo.imovel.matricula ? ` — matrícula ${resumo.imovel.matricula}` : ''}</p>
            )}
            {resumo.valor != null && <p><span className="text-gray-400">Valor:</span> {resumo.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>}
            {resumo.entrada != null && <p><span className="text-gray-400">Entrada:</span> {resumo.entrada.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>}
            {resumo.saldo && <p><span className="text-gray-400">Saldo:</span> {resumo.saldo}</p>}
            {resumo.prazo_posse_dias != null && <p><span className="text-gray-400">Posse:</span> {resumo.prazo_posse_dias} dias</p>}
            {resumo.multa_percentual != null && <p><span className="text-gray-400">Multa:</span> {resumo.multa_percentual}%</p>}
            {resumo.cidade && <p><span className="text-gray-400">Cidade:</span> {resumo.cidade}</p>}
          </div>

          <div className="rounded-md bg-gray-50 p-3 space-y-1">
            {resumo.painel_inteligencia.map((item, i) => (
              <div key={i} className="flex items-start gap-1.5 text-xs">
                {item.status === 'ok'
                  ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-600 mt-0.5" />
                  : <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600 mt-0.5" />}
                <span className={item.status === 'ok' ? 'text-gray-600' : 'text-amber-700'}>{item.texto}</span>
              </div>
            ))}
          </div>

          <div className="flex justify-between">
            <Button variant="outline" size="sm" onClick={() => { setResumo(null); setPlano(null) }}>Corrigir informações</Button>
            <Button
              size="sm"
              disabled={confirmarEntendimento.isPending}
              onClick={() => confirmarEntendimento.mutate(
                { rascunhoId, tipoContrato: tipoContrato as string, resumo },
                {
                  onSuccess: (id) => {
                    setRascunhoId(id)
                    gerarPlano.mutate(id, { onSuccess: setPlano })
                  },
                },
              )}
            >
              {confirmarEntendimento.isPending ? 'Salvando...' : '✓ Confirmar entendimento'}
            </Button>
          </div>
        </section>
      )}

      {/* ⑤ Plano do Contrato */}
      {resumo && gerarPlano.isPending && (
        <section className="rounded-lg border border-gray-200 bg-white p-4 flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Planejando a estrutura do contrato...
        </section>
      )}
      {resumo && plano && (
        <section className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400">⑤ Plano do contrato</h2>
          <p className="text-sm text-gray-600">O contrato será composto por:</p>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {plano.clausulas.map((c, i) => (
              <div key={i} className="flex items-start gap-1.5 text-sm">
                {c.tipo === 'padrao'
                  ? <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600 mt-0.5" />
                  : <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />}
                <span className={c.tipo === 'condicional' ? 'text-amber-700' : 'text-gray-700'}>{c.texto}</span>
              </div>
            ))}
          </div>
          <div className="flex justify-between">
            <Button variant="outline" size="sm" onClick={() => setPlano(null)}>← Voltar</Button>
            <Button size="sm" disabled={construindo} onClick={construirContrato}>
              {construindo
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Construindo...</>
                : <><Sparkles className="h-4 w-4" /> Construir contrato</>}
            </Button>
          </div>
        </section>
      )}

      {/* Minuta construída — abre no editor completo (TipTap, Salvar, PDF, ClickSign),
          já reaproveitado tal e qual da aba antiga de Contrato. */}
      {contratoConstruido && (
        <section className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Minuta</h2>
          <AbaContrato processoId={processo.id} processo={processo} />
        </section>
      )}
    </div>
  )
}
