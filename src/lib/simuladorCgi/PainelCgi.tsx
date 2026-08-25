'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { BANCOS_CGI_CONFIG, TODOS_BANCOS_CGI, notaTaxaCgi, NOTA_IOF_CGI, NOTA_IDADE_NAO_INFORMADA_CGI, notaLimitadoPelaIdadeCgi } from './constantes'
import type { BancoCgiId, ResultadoCgiCompleto } from './tipos'

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export interface FormStateCgi {
  valorImovel: string
  valorDesejado: string
  prazoMeses: string
  rendaMensal: string
  dataNascimento: string
  bancosIds: BancoCgiId[]
}

export const FORM_CGI_VAZIO: FormStateCgi = {
  valorImovel: '',
  valorDesejado: '',
  prazoMeses: '',
  rendaMensal: '',
  dataNascimento: '',
  bancosIds: [],
}

function fmtNum(v: string): string {
  return v.replace(/\D/g, '')
}

function fmtMoedaInput(v: string): string {
  const num = fmtNum(v)
  if (!num) return ''
  const n = parseInt(num, 10) / 100
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function parseMoedaCgi(v: string): number {
  return parseFloat(v.replace(/\./g, '').replace(',', '.')) || 0
}

function SecaoTitulo({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">{children}</p>
}

interface Props {
  form: FormStateCgi
  onChange: (form: FormStateCgi) => void
  resultado: ResultadoCgiCompleto | null
}

export function PainelCgi({ form, onChange, resultado }: Props) {
  const set = <K extends keyof FormStateCgi>(k: K, v: FormStateCgi[K]) => onChange({ ...form, [k]: v })

  function handleMoeda(campo: 'valorImovel' | 'valorDesejado' | 'rendaMensal', v: string) {
    set(campo, fmtMoedaInput(v))
  }

  function toggleBanco(id: BancoCgiId) {
    const sel = form.bancosIds.includes(id)
    set('bancosIds', sel ? form.bancosIds.filter((b) => b !== id) : [...form.bancosIds, id])
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8 p-6 sm:p-8">
      {/* ── Dados da operação ─────────────────────────────────────────── */}
      <section>
        <SecaoTitulo>Dados da Operação</SecaoTitulo>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">
          <div className="space-y-2">
            <Label className="text-sm text-gray-600">Valor do Imóvel (garantia)</Label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-gray-400">R$</span>
              <Input className="pl-10 h-11 text-base" placeholder="0,00" value={form.valorImovel} onChange={(e) => handleMoeda('valorImovel', e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-sm text-gray-600">Crédito Desejado</Label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-gray-400">R$</span>
              <Input className="pl-10 h-11 text-base" placeholder="0,00" value={form.valorDesejado} onChange={(e) => handleMoeda('valorDesejado', e.target.value)} />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-5 mt-5">
          <div className="space-y-2">
            <Label className="text-sm text-gray-600">Prazo (meses)</Label>
            <Input className="h-11 text-base" placeholder="240 (padrão)" inputMode="numeric" value={form.prazoMeses} onChange={(e) => set('prazoMeses', e.target.value.replace(/\D/g, ''))} />
          </div>
          <div className="space-y-2">
            <Label className="text-sm text-gray-600">Data de Nascimento</Label>
            <Input type="date" className="h-11 text-base" value={form.dataNascimento} onChange={(e) => set('dataNascimento', e.target.value)} />
            <p className="text-xs text-gray-400 leading-snug">Usada na regra idade + prazo ≤ 80 anos e 3 meses.</p>
          </div>
          <div className="space-y-2">
            <Label className="text-sm text-gray-600">Renda Mensal (informativo)</Label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-gray-400">R$</span>
              <Input className="pl-10 h-11 text-base" placeholder="0,00" value={form.rendaMensal} onChange={(e) => handleMoeda('rendaMensal', e.target.value)} />
            </div>
          </div>
        </div>
      </section>

      {/* ── Bancos ─────────────────────────────────────────────────────── */}
      <section>
        <SecaoTitulo>Bancos para simular (vazio = todos)</SecaoTitulo>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {TODOS_BANCOS_CGI.map((id) => {
            const cfg = BANCOS_CGI_CONFIG[id]
            const sel = form.bancosIds.includes(id)
            return (
              <button
                key={id}
                type="button"
                onClick={() => toggleBanco(id)}
                className={cn(
                  'flex items-center gap-2.5 px-4 py-3 rounded-xl border text-sm text-left transition-all',
                  sel ? 'border-transparent text-white shadow-sm' : 'border-gray-200 text-gray-500 hover:border-gray-300 bg-white',
                )}
                style={sel ? { backgroundColor: cfg.cor, color: cfg.corTexto } : undefined}
              >
                <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: sel ? cfg.corTexto : cfg.cor, opacity: sel ? 0.7 : 1 }} />
                <span className="truncate text-sm font-medium">{cfg.nome}</span>
              </button>
            )
          })}
        </div>
      </section>

      {!form.dataNascimento && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 leading-relaxed">
          ℹ️ {NOTA_IDADE_NAO_INFORMADA_CGI}
        </p>
      )}

      {/* ── Resultado ──────────────────────────────────────────────────── */}
      {resultado && (
        <section className="space-y-5 pt-2 border-t border-gray-100">
          <SecaoTitulo>Resultado da Simulação</SecaoTitulo>

          <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-fonti-primary text-white">
                  <th className="px-4 py-3 text-left font-medium whitespace-nowrap">Banco</th>
                  <th className="px-4 py-3 text-left font-medium whitespace-nowrap">Sistema</th>
                  <th className="px-4 py-3 text-right font-medium whitespace-nowrap">Vlr Simulado</th>
                  <th className="px-4 py-3 text-right font-medium whitespace-nowrap">% Imóvel</th>
                  <th className="px-4 py-3 text-right font-medium whitespace-nowrap">Taxa a.a.</th>
                  <th className="px-4 py-3 text-right font-medium whitespace-nowrap">Prazo Máx.</th>
                  <th className="px-4 py-3 text-right font-medium whitespace-nowrap">Prazo Usado</th>
                  <th className="px-4 py-3 text-right font-medium whitespace-nowrap">IOF</th>
                  <th className="px-4 py-3 text-right font-medium whitespace-nowrap">Prestação</th>
                </tr>
              </thead>
              <tbody>
                {resultado.bancos.map((b) => {
                  const ehMenor = b.bancoId === resultado.bancoMenorPrestacaoId
                  if (!b.elegivel) {
                    return (
                      <tr key={b.bancoId} className="border-t border-gray-100 bg-red-50">
                        <td className="px-4 py-3 font-medium text-red-700 whitespace-nowrap">{b.bancoNome}</td>
                        <td colSpan={8} className="px-4 py-3 text-red-700">⚠️ {b.motivoInelegivel}</td>
                      </tr>
                    )
                  }
                  return (
                    <tr key={b.bancoId} className={cn('border-t border-gray-100', ehMenor && 'bg-green-50')}>
                      <td className="px-4 py-3 font-medium whitespace-nowrap">
                        {b.bancoNome}
                        {ehMenor && <span className="block text-xs text-green-700 mt-0.5">menor prestação estimada</span>}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">{b.sistemaAmortizacao}</td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">{BRL.format(b.valorSimulado)}</td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">{(b.percentualFinanciado * 100).toFixed(1)}%</td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">{(b.taxaAnualReferencia * 100).toFixed(2)}%{b.indexadoIpca ? '+IPCA' : ''}</td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">{b.prazoMaximoBanco}m</td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">{b.prazoConsiderado}m</td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">{BRL.format(b.iofEstimado)}</td>
                      <td className="px-4 py-3 text-right font-semibold whitespace-nowrap">{BRL.format(b.prestacaoEstimada)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {resultado.bancos.some((b) => b.elegivel && (b.limitadoPeloLtv || b.limitadoPeloPrazoBanco || b.limitadoPelaIdade)) && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3 space-y-1.5 leading-relaxed">
              {resultado.bancos.filter((b) => b.elegivel && (b.limitadoPeloLtv || b.limitadoPeloPrazoBanco || b.limitadoPelaIdade)).map((b) => (
                <p key={b.bancoId}>
                  <span className="font-medium">{b.bancoNome}:</span>{' '}
                  {b.limitadoPeloLtv && <>limitado a {BRL.format(b.valorMaximoPeloImovel)} (60% do imóvel). </>}
                  {b.limitadoPeloPrazoBanco && <>prazo limitado a {b.prazoMaximoBanco} meses (teto do banco). </>}
                  {b.limitadoPelaIdade && <>{notaLimitadoPelaIdadeCgi(b.prazoConsiderado)}</>}
                </p>
              ))}
            </div>
          )}

          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 leading-relaxed">
            {NOTA_IOF_CGI}
          </p>

          {resultado.bancos.some((b) => b.indexadoIpca) && (
            <p className="text-sm text-blue-800 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 leading-relaxed">
              {resultado.bancos.filter((b) => b.indexadoIpca).map((b) => `${b.bancoNome}: ${notaTaxaCgi(BANCOS_CGI_CONFIG[b.bancoId])}`).join(' ')}
            </p>
          )}
        </section>
      )}
    </div>
  )
}
