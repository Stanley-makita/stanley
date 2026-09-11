'use client'

import { useMemo, useState } from 'react'
import { Download, Search } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useRelatorioPorRelacionamento } from '@/hooks/relatorios/useRelatorioPorRelacionamento'
import { agruparProducaoRelacionamentos, type TipoRelacionamentoProducao } from '@/lib/relatorios/producaoRelacionamentos'
import { exportarCsv } from '@/lib/exportarCsv'
import type { PeriodoRelatorio } from '@/types/relatorios'

const ROTULOS = {
  corretor: { singular: 'Corretor', plural: 'Corretores' },
  parceiro: { singular: 'Parceiro', plural: 'Parceiros' },
  imobiliaria: { singular: 'Imobiliária', plural: 'Imobiliárias' },
}
const moeda = (valor: number) => valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const normalizar = (valor: string) => valor.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim()

export function AbaRelPorRelacionamento({ periodo, tipo }: {
  periodo: PeriodoRelatorio
  tipo: TipoRelacionamentoProducao
}) {
  const [busca, setBusca] = useState('')
  const { data, isLoading, error, refetch } = useRelatorioPorRelacionamento(periodo.dataInicio, periodo.dataFim)
  const rotulos = ROTULOS[tipo]
  const linhas = useMemo(() => agruparProducaoRelacionamentos(data ?? [], tipo), [data, tipo])
  const filtradas = linhas.filter((linha) => normalizar(linha.nome).includes(normalizar(busca)))
  const grafico = filtradas.filter((linha) => linha.id !== 'sem-vinculo').slice(0, 10)

  function exportar() {
    exportarCsv(filtradas.map((linha) => ({
      [rotulos.singular]: linha.nome,
      Contratos: linha.contratos,
      'Valor Emitido (R$)': linha.valorEmitido.toFixed(2),
      'Ticket Médio (R$)': linha.ticketMedio.toFixed(2),
      'Início do período': periodo.dataInicio,
      'Fim do período': periodo.dataFim,
    })), `relatorio-por-${tipo}-${periodo.dataInicio}-${periodo.dataFim}`)
  }

  if (!periodo.dataInicio || !periodo.dataFim || periodo.dataInicio > periodo.dataFim) {
    return <p role="alert" className="py-12 text-center text-text-secondary">Selecione um período válido: a data final deve ser igual ou posterior à inicial.</p>
  }
  if (isLoading) return <p role="status" className="py-12 text-center text-text-muted">Carregando produção...</p>
  if (error) return (
    <div role="alert" className="space-y-3 py-12 text-center">
      <p className="text-red-700">Não foi possível carregar a produção. Tente novamente.</p>
      <Button variant="outline" onClick={() => void refetch()}>Tentar novamente</Button>
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-fonti-primary">Produção por {rotulos.singular}</h3>
          <p className="mt-1 text-xs text-text-muted">Negócios emitidos no período, pela data de emissão. Valores correspondem ao valor financiado.</p>
        </div>
        <Button size="sm" variant="outline" onClick={exportar} disabled={!filtradas.length} className="gap-1 self-start text-xs">
          <Download className="h-3 w-3" /> Exportar CSV
        </Button>
      </div>

      <div className="relative max-w-md">
        <Search aria-hidden="true" className="absolute left-3 top-3 h-4 w-4 text-text-muted" />
        <Input aria-label={`Buscar ${rotulos.singular.toLocaleLowerCase('pt-BR')} por nome`} placeholder={`Buscar ${rotulos.singular.toLocaleLowerCase('pt-BR')} por nome...`} value={busca} onChange={(e) => setBusca(e.target.value)} className="pl-9" />
      </div>

      {grafico.length > 0 && (
        <div>
          <h4 className="mb-3 text-sm font-semibold text-text-secondary">Maiores produções — até 10 {rotulos.plural.toLocaleLowerCase('pt-BR')}</h4>
          <ResponsiveContainer width="100%" height={Math.max(200, grafico.length * 42)}>
            <BarChart data={grafico} layout="vertical" margin={{ left: 8, right: 24 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e7eb" />
              <XAxis type="number" tickFormatter={(v) => `R$${(Number(v) / 1000).toLocaleString('pt-BR')} mil`} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
              <YAxis type="category" dataKey="nome" width={140} tick={{ fontSize: 12, fill: 'var(--text-secondary)' }} tickFormatter={(nome: string) => nome.length > 22 ? `${nome.slice(0, 21)}…` : nome} />
              <Tooltip formatter={(valor) => [moeda(Number(valor)), 'Valor emitido']} />
              <Bar dataKey="valorEmitido" name="Valor emitido" fill="var(--fonti-primary)" radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {!filtradas.length ? (
        <p role="status" className="py-12 text-center text-text-muted">
          {linhas.length ? 'Nenhum resultado para essa busca.' : 'Nenhum negócio emitido no período selecionado.'}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <caption className="sr-only">Produção por {rotulos.singular} no período selecionado</caption>
            <thead className="bg-fonti-primary text-white">
              <tr>
                <th scope="col" className="px-4 py-3 text-left">{rotulos.singular}</th>
                <th scope="col" className="px-4 py-3 text-right">Contratos</th>
                <th scope="col" className="whitespace-nowrap px-4 py-3 text-right">Valor Emitido</th>
                <th scope="col" className="whitespace-nowrap px-4 py-3 text-right">Ticket Médio</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map((linha) => (
                <tr key={linha.id} className="border-t hover:bg-fonti-surface-warm">
                  <th scope="row" className="px-4 py-3 text-left font-medium text-fonti-primary">{linha.nome}</th>
                  <td className="px-4 py-3 text-right tabular-nums">{linha.contratos}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums">{moeda(linha.valorEmitido)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{moeda(linha.ticketMedio)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-text-muted">
        Cada negócio conta uma vez por {rotulos.singular.toLocaleLowerCase('pt-BR')} vinculado, com seu valor integral. Quando há mais de um, a soma das linhas pode superar a produção geral.
        {tipo === 'imobiliaria' && ' São considerados os vínculos com papel de imobiliária no negócio.'}
      </p>
    </div>
  )
}
