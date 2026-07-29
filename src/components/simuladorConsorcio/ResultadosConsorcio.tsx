'use client'

import type { ResultadoConsorcio } from '@/lib/simuladorConsorcio/tipos'
import { TrendingUp, Home, Landmark } from 'lucide-react'

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const PCT = (v: number) => `${(v * 100).toFixed(2)}%`

function Metrica({ label, valor, destaque }: { label: string; valor: string; destaque?: boolean }) {
  return (
    <div className="bg-gray-50 rounded-lg px-3 py-2">
      <p className="text-[10px] text-gray-400 mb-0.5">{label}</p>
      <p className={destaque ? 'text-sm font-bold text-fonti-primary' : 'text-xs font-semibold text-gray-700'}>
        {valor}
      </p>
    </div>
  )
}

interface Props {
  resultado: ResultadoConsorcio | null
}

export function ResultadosConsorcio({ resultado }: Props) {
  if (!resultado) {
    return (
      <div className="flex items-center justify-center h-full text-center text-gray-300 text-xs py-12">
        Preencha os campos obrigatórios para ver os resultados
      </div>
    )
  }

  const { agregados, resumo, comparativo, linhas } = resultado
  const consorcioGanha = comparativo.patrimonioCompraConsorcio >= comparativo.patrimonioCompraAVista

  return (
    <div className="space-y-4">
      {/* Bloco 1 — Patrimônio (comparativo, maior destaque) */}
      <div className="rounded-xl border-2 border-fonti-primary overflow-hidden">
        <div className="bg-fonti-primary px-4 py-2 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-white" />
          <p className="text-xs font-bold text-white uppercase tracking-wide">Patrimônio ao final do prazo</p>
        </div>
        <div className="grid grid-cols-2 gap-3 p-4">
          <div className={consorcioGanha ? 'opacity-60' : ''}>
            <p className="text-[10px] text-gray-400 flex items-center gap-1"><Home className="h-3 w-3" /> Compra à vista</p>
            <p className="text-lg font-bold text-gray-700">{BRL.format(comparativo.patrimonioCompraAVista)}</p>
          </div>
          <div className={consorcioGanha ? '' : 'opacity-60'}>
            <p className="text-[10px] text-gray-400 flex items-center gap-1"><Landmark className="h-3 w-3" /> Consórcio + aplicação</p>
            <p className="text-lg font-bold text-[#1E7B34]">{BRL.format(comparativo.patrimonioCompraConsorcio)}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 px-4 pb-3">
          <Metrica label="Prazo em anos" valor={String(comparativo.prazoEmAnos)} />
          <Metrica label="CET a.a." valor={PCT(comparativo.cetAnual)} />
        </div>
      </div>

      {/* Bloco 2 — campos calculados de célula única */}
      <div className="grid grid-cols-2 gap-2.5">
        <Metrica label="Taxa de Adm" valor={BRL.format(agregados.taxaAdmReais)} />
        <Metrica label="Valor com lance embutido" valor={BRL.format(agregados.valorComLanceEmbutido)} />
        <Metrica label="Valor Líquido da carta" valor={BRL.format(agregados.valorLiquidoDaCarta)} />
        <Metrica label="Valorização do bem (a.m.)" valor={PCT(agregados.valorizacaoBemMensal)} />
      </div>

      {/* Bloco 3 — resumo (100% resultado) */}
      <div className="space-y-2">
        <p className="text-[10px] font-semibold text-fonti-primary uppercase tracking-wide border-b border-gray-100 pb-1">
          Resumo
        </p>
        <div className="grid grid-cols-2 gap-2.5">
          <Metrica label="Valor do lance" valor={BRL.format(resumo.valorDoLance)} />
          <Metrica label="Lance embutido" valor={BRL.format(resumo.lanceEmbutido)} />
          <Metrica label="Lance próprio" valor={BRL.format(resumo.lanceProprio)} />
          <Metrica label="Valor Líquido" valor={BRL.format(resumo.valorLiquido)} />
          <Metrica label="Devolução" valor={BRL.format(resumo.devolucao)} />
          <Metrica label="Correção saldo devedor" valor={BRL.format(resumo.correcaoSaldoDevedor)} />
          <Metrica label="Correção valor da carta" valor={BRL.format(resumo.correcaoValorDaCarta)} />
          <Metrica label="Custo de correção" valor={BRL.format(resumo.custoDeCorrecao)} />
          <Metrica label="Custo de adm" valor={BRL.format(resumo.custoDeAdm)} />
          <Metrica label="Custo total" valor={BRL.format(resumo.custoTotal)} destaque />
          <Metrica label="Saldo Líquido" valor={BRL.format(resumo.saldoLiquido)} destaque />
        </div>
      </div>

      {/* Cronograma mensal — colapsável, pra auditoria/conferência mês a mês */}
      <details className="text-xs">
        <summary className="cursor-pointer text-fonti-primary font-medium select-none">
          Ver cronograma mensal ({linhas.length} meses)
        </summary>
        <div className="mt-2 border border-gray-100 rounded-lg overflow-x-auto">
          <table className="w-full text-[11px] border-collapse">
            <thead className="bg-gray-50">
              <tr className="border-b border-gray-200">
                <th className="text-left font-semibold text-gray-500 px-2 py-1.5">Mês</th>
                <th className="text-right font-semibold text-gray-500 px-2 py-1.5">Carta</th>
                <th className="text-right font-semibold text-gray-500 px-2 py-1.5">Saldo devedor</th>
                <th className="text-right font-semibold text-gray-500 px-2 py-1.5">Parcela</th>
                <th className="text-right font-semibold text-gray-500 px-2 py-1.5">Lance</th>
                <th className="text-right font-semibold text-gray-500 px-2 py-1.5">Saldo aplicação</th>
                <th className="text-right font-semibold text-gray-500 px-2 py-1.5">Imóvel consórcio</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.mes} className={l.lance > 0 ? 'bg-fonti-accent-hover' : 'odd:bg-gray-50/60'}>
                  <td className="px-2 py-1 text-gray-500">{l.mes}</td>
                  <td className="px-2 py-1 text-right text-gray-700">{l.carta != null ? BRL.format(l.carta) : '—'}</td>
                  <td className="px-2 py-1 text-right text-gray-700">{l.saldoDevedor != null ? BRL.format(l.saldoDevedor) : '—'}</td>
                  <td className="px-2 py-1 text-right text-gray-700">{l.parcela != null ? BRL.format(l.parcela) : '—'}</td>
                  <td className="px-2 py-1 text-right text-gray-700">{l.lance > 0 ? BRL.format(l.lance) : '—'}</td>
                  <td className="px-2 py-1 text-right text-gray-700">{BRL.format(l.saldoAplicacao)}</td>
                  <td className="px-2 py-1 text-right text-gray-700">{BRL.format(l.imovelConsorcio)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  )
}
