'use client'

import { InputMoeda } from '@/components/ui/input-moeda'
import { cn } from '@/lib/utils'
import {
  PERCENTUAL_MAX_DESPESAS, descreverValorDespesas, formatarPercentual, sugerirValorDespesas,
} from '@/lib/oportunidade/tipoEDespesas'

const moeda = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

interface Props {
  /** true = financia, false = não financia, null = não definido (só no lead). */
  financiar: boolean | null
  valor: number | null
  valorImovel: number | null | undefined
  onChange: (financiar: boolean | null, valor: number | null) => void
  /** Lead aceita "não definido"; no negócio é Sim/Não. */
  permitirNaoDefinido?: boolean
}

/**
 * "Financiar despesas" + valor (pedido da equipe, 10/11/2026): o cliente pode financiar junto até 5% do valor do
 * imóvel para as custas. Ao marcar Sim, o valor vem sugerido em 5%; editável, e quando difere mostra o percentual.
 */
export function CampoDespesasFinanciadas({ financiar, valor, valorImovel, onChange, permitirNaoDefinido = true }: Props) {
  const sugestao = sugerirValorDespesas(valorImovel)
  const descricao = financiar ? descreverValorDespesas(valor, valorImovel) : null

  const opcoes: Array<{ v: boolean | null; rotulo: string }> = [
    { v: true, rotulo: 'Vai financiar' },
    { v: false, rotulo: 'Não vai financiar' },
    ...(permitirNaoDefinido ? [{ v: null, rotulo: 'Não definido' }] : []),
  ]

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {opcoes.map(o => (
          <button
            key={String(o.v)}
            type="button"
            onClick={() => onChange(o.v, o.v ? (valor ?? sugestao) : null)}
            className={cn(
              'rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-all',
              financiar === o.v
                ? 'border-fonti-primary bg-fonti-accent-hover text-fonti-primary'
                : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50',
            )}
          >
            {o.rotulo}
          </button>
        ))}
      </div>

      {financiar === true && (
        <div className="space-y-1">
          <label className="text-xs text-gray-600" htmlFor="valor-despesas-financiadas">
            Valor das despesas financiadas
          </label>
          <InputMoeda
            id="valor-despesas-financiadas"
            value={valor != null ? String(valor) : ''}
            onChange={v => onChange(true, v ? Number(v) : null)}
          />
          {descricao ? (
            <p className={cn('text-xs', descricao.acimaDoLimite ? 'text-amber-700' : 'text-gray-500')}>
              {descricao.texto}
            </p>
          ) : !valorImovel ? (
            <p className="text-xs text-gray-500">Informe o valor do imóvel para sugerir {PERCENTUAL_MAX_DESPESAS}%.</p>
          ) : null}
          {sugestao != null && valor !== sugestao && (
            <button type="button" onClick={() => onChange(true, sugestao)}
              className="text-xs font-medium text-fonti-primary underline">
              Usar {formatarPercentual(PERCENTUAL_MAX_DESPESAS)} ({moeda(sugestao)})
            </button>
          )}
        </div>
      )}
    </div>
  )
}
