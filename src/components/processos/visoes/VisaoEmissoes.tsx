'use client'

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import { useMetas } from '@/hooks/configuracoes/useMetas'
import { useBancos } from '@/hooks/useBancos'
import { ChevronLeft, ChevronRight, BarChart2, TrendingUp, Package, CheckCircle2, Clock } from 'lucide-react'
import { fmtData } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { type ResumoEstoque, type EmissaoSemana } from '@/types/processos'

function fmt(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v)
}

function pct(v: number) {
  return `${v.toFixed(3).replace('.', ',')}%`
}

export function VisaoEmissoes() {
  const { usuario } = useAuth()
  const [data, setData] = useState(new Date())

  const mes = data.getMonth() + 1
  const ano = data.getFullYear()
  const nomeMes = data.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

  // Todos os bancos cadastrados (para exibir mesmo os que não emitiram)
  const { data: todosBancos = [] } = useBancos()

  const { data: emissoes = [] } = useQuery<EmissaoSemana[]>({
    queryKey: ['processos', 'emissoes', usuario?.empresa_id, mes, ano],
    queryFn: async () => {
      const { data: result, error } = await supabase.rpc('emissoes_por_semana', {
        p_empresa_id: usuario!.empresa_id,
        p_mes: mes,
        p_ano: ano,
      })
      if (error) throw error
      return result ?? []
    },
    enabled: !!usuario,
  })

  // Query simples: só banco_id + valor dos processos emitidos no mês
  const { data: emitidosRaw = [] } = useQuery<Array<{ banco_id: string | null; valor_financiado: number | null }>>({
    queryKey: ['processos', 'emitidos-banco-raw', usuario?.empresa_id, mes, ano],
    queryFn: async () => {
      const inicioMes = `${ano}-${String(mes).padStart(2, '0')}-01`
      const ultimoDia = new Date(ano, mes, 0).getDate()
      const fimMes   = `${ano}-${String(mes).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`

      const { data: rows, error } = await supabase
        .from('processos')
        .select('banco_id, valor_financiado')
        .eq('empresa_id', usuario!.empresa_id)
        .is('deleted_at', null)
        .neq('modalidade', 'Contrato')
        .eq('status_emissao', 'emitido')
        .not('data_emissao', 'is', null)
        .gte('data_emissao', inicioMes)
        .lte('data_emissao', fimMes)

      if (error) throw error
      return (rows ?? []) as Array<{ banco_id: string | null; valor_financiado: number | null }>
    },
    enabled: !!usuario,
  })

  // Monta tabela de banco cruzando todosBancos com os emitidos do mês
  const bancosPerformance = useMemo(() => {
    const agrupado = new Map<string, { valor: number; qtd: number }>()
    for (const r of emitidosRaw) {
      const key = r.banco_id ?? '__sem_banco__'
      const ex = agrupado.get(key)
      if (ex) { ex.valor += r.valor_financiado ?? 0; ex.qtd++ }
      else agrupado.set(key, { valor: r.valor_financiado ?? 0, qtd: 1 })
    }

    const totalValor = emitidosRaw.reduce((s, r) => s + (r.valor_financiado ?? 0), 0)
    const totalQtd   = emitidosRaw.length

    return todosBancos.map(b => {
      const d = agrupado.get(b.id) ?? { valor: 0, qtd: 0 }
      return {
        banco_nome:           b.nome,
        banco_cor:            b.cor ?? null,
        realizado:            d.valor,
        percentual_valor:     totalValor > 0 ? Math.round(d.valor / totalValor * 100 * 1000) / 1000 : 0,
        num_contratos:        d.qtd,
        percentual_contratos: totalQtd > 0   ? Math.round(d.qtd   / totalQtd   * 100 * 1000) / 1000 : 0,
      }
    }).sort((a, b) => b.realizado - a.realizado)
  }, [todosBancos, emitidosRaw])

  const { data: estoque } = useQuery<ResumoEstoque>({
    queryKey: ['processos', 'resumo-estoque', usuario?.empresa_id],
    queryFn: async () => {
      const { data: result, error } = await supabase.rpc('resumo_estoque', {
        p_empresa_id: usuario!.empresa_id,
      })
      if (error) throw error
      return (result as ResumoEstoque[])?.[0] ?? null
    },
    enabled: !!usuario,
    staleTime: 1000 * 60 * 5,
  })

  const { data: metas = [] } = useMetas(ano)
  const metaMes = metas.find((m) => m.mes === mes)

  const totalEmitidos = emissoes.reduce((s, e) => s + e.emitidos, 0)
  const totalProducao = emissoes.reduce((s, e) => s + e.producao, 0)

  const pctMetaValor = metaMes && metaMes.meta_valor > 0
    ? Math.min((totalProducao / metaMes.meta_valor) * 100, 150)
    : null
  const pctMetaContratos = metaMes && metaMes.meta_contratos > 0
    ? Math.min((totalEmitidos / metaMes.meta_contratos) * 100, 150)
    : null

  function navegar(direcao: -1 | 1) {
    setData((d) => {
      const nova = new Date(d)
      nova.setMonth(nova.getMonth() + direcao)
      return nova
    })
  }

  const temEmissoes = emitidosRaw.length > 0

  return (
    <div className="space-y-5">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-fonti-accent-hover rounded-lg flex items-center justify-center">
            <BarChart2 className="h-4 w-4 text-fonti-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-fonti-primary">
              Emissões — {nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1)}
            </h3>
            <p className="text-xs text-gray-400">Produção mensal e estoque total</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navegar(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium text-fonti-primary min-w-[140px] text-center capitalize">{nomeMes}</span>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navegar(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Blocos Certeza / Incerteza / Total em Estoque */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Soma Certeza</span>
          </div>
          <p className="text-xl font-bold text-fonti-primary">{fmt(estoque?.certeza_valor ?? 0)}</p>
          <p className="text-sm text-gray-400 mt-0.5">{estoque?.certeza_total ?? 0} contratos</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="h-4 w-4 text-amber-500" />
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Soma Incerteza</span>
          </div>
          <p className="text-xl font-bold text-fonti-primary">{fmt(estoque?.incerteza_valor ?? 0)}</p>
          <p className="text-sm text-gray-400 mt-0.5">{estoque?.incerteza_total ?? 0} contratos</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Package className="h-4 w-4 text-fonti-primary" />
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Total em Estoque</span>
          </div>
          <p className="text-xl font-bold text-fonti-primary">{fmt(estoque?.total_valor ?? 0)}</p>
          <p className="text-sm text-gray-400 mt-0.5">{estoque?.total_estoque ?? 0} contratos</p>
        </div>
      </div>

      {/* Tabela semanal + Tabela por banco */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Tabela semanal */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-sm font-semibold text-fonti-primary mb-4">Emissões por semana</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {['Emitidos', 'Produção (R$)', 'Emitidos até', '% Valor', '% Contratos'].map((h) => (
                    <th key={h} className="text-left text-xs text-gray-400 font-medium pb-2 pr-3 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {emissoes.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-xs text-gray-400">Nenhuma emissão no período</td>
                  </tr>
                ) : (
                  emissoes.map((semana, i) => (
                    <tr key={i} className="border-b border-gray-50 last:border-0">
                      <td className="py-2.5 pr-3 font-medium text-fonti-primary">{semana.emitidos}</td>
                      <td className="py-2.5 pr-3 text-blue-600 font-medium whitespace-nowrap">{fmt(semana.producao)}</td>
                      <td className="py-2.5 pr-3 text-gray-500 whitespace-nowrap">{fmtData(semana.emitidos_ate)}</td>
                      <td className="py-2.5 pr-3 text-gray-600">{pct(semana.percentual_valor)}</td>
                      <td className="py-2.5 text-gray-600">{pct(semana.percentual_contratos)}</td>
                    </tr>
                  ))
                )}
                {emissoes.length > 0 && (
                  <tr className="bg-gray-50">
                    <td className="py-2.5 pr-3 font-bold text-fonti-primary">{totalEmitidos}</td>
                    <td className="py-2.5 pr-3 font-bold text-blue-600 whitespace-nowrap">{fmt(totalProducao)}</td>
                    <td className="py-2.5 pr-3 text-gray-500 font-medium text-xs">Total</td>
                    <td colSpan={2} />
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Tabela por banco — todos os bancos cadastrados */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <p className="text-sm font-semibold text-fonti-primary mb-4">Realizado por banco</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {['Banco', 'Valor (R$)', '% Valor', 'Nº Ctos', '% Ctos'].map((h) => (
                    <th key={h} className="text-left text-xs text-gray-400 font-medium pb-2 pr-3 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bancosPerformance.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-xs text-gray-400">Nenhum banco cadastrado</td>
                  </tr>
                ) : (
                  bancosPerformance.map((b, i) => (
                    <tr key={i} className={`border-b border-gray-50 last:border-0 ${b.realizado === 0 ? 'opacity-50' : ''}`}>
                      <td className="py-2.5 pr-3">
                        <div className="flex items-center gap-1.5">
                          <div
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: b.banco_cor ?? '#9ca3af' }}
                          />
                          <span className="text-xs font-medium text-fonti-primary whitespace-nowrap">{b.banco_nome}</span>
                        </div>
                      </td>
                      <td className={`py-2.5 pr-3 font-medium whitespace-nowrap ${b.realizado > 0 ? 'text-blue-600' : 'text-gray-300'}`}>
                        {fmt(b.realizado)}
                      </td>
                      <td className={`py-2.5 pr-3 ${b.realizado > 0 ? 'text-gray-600' : 'text-gray-300'}`}>{pct(b.percentual_valor)}</td>
                      <td className={`py-2.5 pr-3 font-medium ${b.realizado > 0 ? 'text-fonti-primary' : 'text-gray-300'}`}>{b.num_contratos}</td>
                      <td className={`py-2.5 ${b.realizado > 0 ? 'text-gray-600' : 'text-gray-300'}`}>{pct(b.percentual_contratos)}</td>
                    </tr>
                  ))
                )}
                {temEmissoes && (
                  <tr className="bg-gray-50">
                    <td className="py-2.5 pr-3 font-bold text-fonti-primary text-xs">Total</td>
                    <td className="py-2.5 pr-3 font-bold text-blue-600 whitespace-nowrap">{fmt(totalProducao)}</td>
                    <td className="py-2.5 pr-3 font-bold text-gray-600">100,000%</td>
                    <td className="py-2.5 pr-3 font-bold text-fonti-primary">{totalEmitidos}</td>
                    <td className="py-2.5 font-bold text-gray-600">100,000%</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Metas */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <MetaCard
          label="Meta Valor"
          sublabel={metaMes ? `Meta do mês: ${fmt(metaMes.meta_valor)}` : 'Meta não configurada'}
          realizado={totalProducao}
          meta={metaMes?.meta_valor ?? null}
          pctAtingido={pctMetaValor}
          cor="#3b82f6"
          formatarRealizado={fmt}
          formatarMeta={fmt}
        />
        <MetaCard
          label="Meta Contratos"
          sublabel={metaMes ? `Meta do mês: ${metaMes.meta_contratos} contratos` : 'Meta não configurada'}
          realizado={totalEmitidos}
          meta={metaMes?.meta_contratos ?? null}
          pctAtingido={pctMetaContratos}
          cor="#22c55e"
          formatarRealizado={(v) => String(Math.round(v))}
          formatarMeta={(v) => String(Math.round(v))}
        />
      </div>
    </div>
  )
}

interface MetaCardProps {
  label: string
  sublabel: string
  realizado: number
  meta: number | null
  pctAtingido: number | null
  cor: string
  formatarRealizado: (v: number) => string
  formatarMeta: (v: number) => string
}

function MetaCard({ label, sublabel, realizado, meta, pctAtingido, cor, formatarRealizado, formatarMeta }: MetaCardProps) {
  const barra = Math.min(pctAtingido ?? 0, 100)
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ backgroundColor: cor + '20' }}>
            <TrendingUp className="w-3.5 h-3.5" style={{ color: cor }} />
          </div>
          <div>
            <p className="text-sm font-semibold text-fonti-primary">{label}</p>
            <p className="text-xs text-gray-400">{sublabel}</p>
          </div>
        </div>
        {pctAtingido !== null && (
          <span
            className="text-sm font-bold px-2 py-0.5 rounded-full"
            style={{ color: cor, backgroundColor: cor + '15' }}
          >
            {pctAtingido.toFixed(1)}%
          </span>
        )}
      </div>

      {meta !== null ? (
        <div className="space-y-2">
          <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${barra}%`, backgroundColor: cor }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-400">
            <span>Realizado: <span className="font-medium text-fonti-primary">{formatarRealizado(realizado)}</span></span>
            <span>Meta: <span className="font-medium text-fonti-primary">{formatarMeta(meta)}</span></span>
          </div>
        </div>
      ) : (
        <p className="text-xs text-gray-400 italic">Configure as metas em Configurações → Metas da Equipe</p>
      )}
    </div>
  )
}
