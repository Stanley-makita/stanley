'use client'

import { useCallback, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { type Lead } from '@/types/leads'
import { useParticipantes } from '@/hooks/participantes/useParticipantes'
import {
  useAdicionarParticipante, useAlterarCompoeRenda, useRelacionamentosDe, useRemoverParticipante,
} from '@/hooks/participantes/useMutacoesParticipantes'
import { PAPEIS_COMPRA } from '@/lib/participantes/tipos'
import { rotuloParticipante } from '@/lib/participantes/rotulos'
import { rendaComposta } from '@/lib/participantes/renda'
import { FormularioPessoa, type OpcaoConjuge } from '@/components/pessoas/FormularioPessoa'
import { AdicionarParticipanteModal, type EscolhaParticipante } from '@/components/participantes/AdicionarParticipanteModal'

const moeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] ?? nome

type Busca = { titulo: string; textoConfirmar: string; aoEscolher: (e: EscolhaParticipante) => Promise<void> }

/**
 * Aba Pessoa do Lead (V2 B2b): uma sub-aba por participante de compra, cada uma com o
 * formulário completo da Pessoa. Incluir/remover participante grava lead_coparticipantes e o
 * casamento grava os ponteiros das Pessoas — a sincronização da Fase A mantém o modelo novo.
 * "Compõe renda" é a única escrita direta no modelo novo (PATCH /api/participacoes/[id]).
 */
export function AbaPessoa({ lead }: { lead: Lead }) {
  const { data: participantes = [], isLoading } = useParticipantes({ tipo: 'lead', id: lead.id })
  const compra = useMemo(() => participantes
    .filter(p => PAPEIS_COMPRA.includes(p.papel))
    .sort((a, b) => (a.papel === 'titular' ? 0 : 1) - (b.papel === 'titular' ? 0 : 1) || a.ordem - b.ordem),
  [participantes])
  const { data: rels = [] } = useRelacionamentosDe(compra.map(p => p.pessoa.id))

  const [selecionadaId, setSelecionadaId] = useState<string | null>(null)
  const [sujo, setSujo] = useState(false)
  const [busca, setBusca] = useState<Busca | null>(null)

  const adicionar = useAdicionarParticipante(lead.id)
  const remover = useRemoverParticipante(lead.id)
  const alterarCompoe = useAlterarCompoeRenda(lead.id)

  const atual = compra.find(p => p.pessoa.id === selecionadaId) ?? compra.find(p => p.papel === 'titular') ?? compra[0]
  const todosRotulo = compra.map(p => ({ pessoaId: p.pessoa.id, nome: p.pessoa.nome, papel: p.papel }))
  const opcoesConjuge: OpcaoConjuge[] = compra.map(p => ({ pessoaId: p.pessoa.id, nome: p.pessoa.nome }))
  const renda = rendaComposta(compra.map(p => ({ papel: p.papel, compoe_renda: p.compoe_renda, pessoa: p.pessoa })))
  const onSujoChange = useCallback((v: boolean) => setSujo(v), [])

  function trocarPara(pessoaId: string) {
    if (pessoaId === atual?.pessoa.id) return
    if (sujo && !window.confirm(`Há alterações não salvas de ${atual ? primeiroNome(atual.pessoa.nome) : 'esta pessoa'}. Descartar?`)) return
    setSujo(false)
    setSelecionadaId(pessoaId)
  }

  async function incluir(escolha: EscolhaParticipante) {
    const pessoaId = await adicionar.mutateAsync(escolha)
    toast.success(`${'pessoaId' in escolha ? escolha.nome : escolha.nome} incluído(a) na proposta.`)
    setSujo(false)
    setSelecionadaId(pessoaId)
  }

  function abrirInclusao() {
    setBusca({ titulo: 'Adicionar participante', textoConfirmar: 'Adicionar à proposta', aoEscolher: incluir })
  }

  function onConjugeForaDaProposta(conjuge: OpcaoConjuge) {
    // Cônjuge do titular entra sozinho pela sincronização; de outro participante, só se o usuário quiser.
    if (atual?.papel === 'titular') return
    if (window.confirm(`Incluir ${conjuge.nome} na proposta como cônjuge?`)) {
      adicionar.mutate({ pessoaId: conjuge.pessoaId }, {
        onError: (e) => toast.error(e instanceof Error ? e.message : 'Não foi possível incluir.'),
      })
    }
  }

  function onBuscarConjuge(escolher: (p: OpcaoConjuge) => void) {
    setBusca({
      titulo: 'Casado(a) com', textoConfirmar: 'Escolher',
      aoEscolher: async (e) => {
        if ('pessoaId' in e) { escolher(e); return }
        // Nova pessoa pelo modal de busca: cria só a Pessoa (sem incluir na proposta ainda).
        const { supabase } = await import('@/lib/supabase')
        const { data: nova, error } = await supabase.from('pessoas')
          .insert({ empresa_id: lead.empresa_id, nome: e.nome, cpf: e.cpf || null, tipo: 'cliente' })
          .select('id').single()
        if (error?.code === '23505') throw new Error('Esse CPF já é de outra pessoa cadastrada — busque por ele.')
        if (error || !nova) throw new Error('Não foi possível criar a pessoa.')
        escolher({ pessoaId: nova.id as string, nome: e.nome })
      },
    })
  }

  async function removerAtual() {
    if (!atual || atual.papel !== 'coparticipante') return
    if (!window.confirm(`Remover ${atual.pessoa.nome} desta proposta? O cadastro e os documentos dela continuam na Pessoa.`)) return
    try {
      await remover.mutateAsync(atual.pessoa.id)
      toast.success(`${primeiroNome(atual.pessoa.nome)} removido(a) da proposta.`)
      setSujo(false)
      setSelecionadaId(null)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível remover.')
    }
  }

  if (!lead.pessoa_id) {
    return <div className="flex h-32 items-center justify-center text-sm text-gray-400">Este lead ainda não possui pessoa vinculada.</div>
  }
  if (isLoading) {
    return <div className="flex h-32 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-fonti-primary" /></div>
  }
  // Sem participações (ex.: titular que é Pessoa de operador, nunca vira participante): só o formulário.
  if (!atual) {
    return (
      <div className="-mx-3 -my-4 bg-gray-50 px-3 py-4 pb-8 sm:-mx-5 sm:px-5">
        <FormularioPessoa key={lead.pessoa_id} pessoaId={lead.pessoa_id} participantesDaProposta={[]} onSujoChange={onSujoChange} />
      </div>
    )
  }

  const rotuloAtual = rotuloParticipante({ pessoaId: atual.pessoa.id, nome: atual.pessoa.nome, papel: atual.papel }, todosRotulo, rels)

  return (
    <div className="-mx-3 -my-4 bg-gray-50 px-3 py-4 pb-8 sm:-mx-5 sm:px-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-[11px] font-bold uppercase tracking-widest text-fonti-primary">Participantes da proposta</h2>
      </div>

      <div role="tablist" aria-label="Participantes" className="-mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1">
        {compra.map(p => {
          const ativo = p.pessoa.id === atual.pessoa.id
          const rotulo = rotuloParticipante({ pessoaId: p.pessoa.id, nome: p.pessoa.nome, papel: p.papel }, todosRotulo, rels)
          return (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={ativo}
              onClick={() => trocarPara(p.pessoa.id)}
              className={cn(
                'inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm transition-colors',
                ativo ? 'border-fonti-primary bg-fonti-primary text-white' : 'border-gray-300 bg-white text-gray-800 hover:bg-gray-50',
              )}
            >
              <span className="font-semibold">{primeiroNome(p.pessoa.nome)}</span>
              <span className={ativo ? 'text-white/80' : 'text-gray-500'}>· {rotulo}</span>
            </button>
          )
        })}
        <button
          type="button"
          onClick={abrirInclusao}
          className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full border border-dashed border-fonti-primary px-4 text-sm font-semibold text-fonti-primary hover:bg-fonti-surface-warm"
        >
          <Plus className="h-4 w-4" /> Participante
        </button>
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="min-w-0">
          <p className="truncate text-base font-bold text-fonti-primary">{atual.pessoa.nome}</p>
          <p className="text-xs text-gray-500">{rotuloAtual}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex min-h-[44px] items-center gap-2 text-sm text-gray-800">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[#253B29]"
              checked={atual.compoe_renda}
              disabled={alterarCompoe.isPending}
              onChange={e => alterarCompoe.mutate(
                { participacaoId: atual.id, compoe: e.target.checked },
                { onError: (err) => toast.error(err instanceof Error ? err.message : 'Não foi possível salvar.') },
              )}
            />
            Compõe renda
          </label>
          {atual.papel === 'coparticipante' && (
            <button
              type="button"
              onClick={() => { void removerAtual() }}
              disabled={remover.isPending}
              className="min-h-[44px] rounded-lg border border-gray-300 px-3 text-sm font-semibold text-red-800 hover:bg-red-50"
            >
              Remover da proposta
            </button>
          )}
        </div>
      </div>

      <FormularioPessoa
        key={atual.pessoa.id}
        pessoaId={atual.pessoa.id}
        participantesDaProposta={opcoesConjuge}
        onConjugeForaDaProposta={onConjugeForaDaProposta}
        onBuscarConjuge={onBuscarConjuge}
        onSujoChange={onSujoChange}
      />

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-fonti-primary px-4 py-3 text-white">
        <span className="text-sm">
          Renda composta da proposta{' '}
          <span className="text-fonti-accent-hover">
            ({renda.participantes.filter(p => p.compoe_renda).map(p => primeiroNome(p.nome)).join(' + ') || 'ninguém'})
          </span>
        </span>
        <span className="text-lg font-bold">{moeda(renda.total)}</span>
      </div>

      <AdicionarParticipanteModal
        aberto={!!busca}
        onFechar={() => setBusca(null)}
        titulo={busca?.titulo ?? ''}
        textoConfirmar={busca?.textoConfirmar ?? 'Confirmar'}
        excluirIds={compra.map(p => p.pessoa.id)}
        onConfirmar={async (e) => { if (busca) await busca.aoEscolher(e) }}
      />
    </div>
  )
}
