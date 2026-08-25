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
    <div className="space-y-4 p-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs text-gray-500">Valor do Imóvel (garantia)</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">R$</span>
            <Input className="pl-8 text-sm" placeholder="0,00" value={form.valorImovel} onChange={(e) => handleMoeda('valorImovel', e.target.value)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-gray-500">Crédito Desejado</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">R$</span>
            <Input className="pl-8 text-sm" placeholder="0,00" value={form.valorDesejado} onChange={(e) => handleMoeda('valorDesejado', e.target.value)} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs text-gray-500">Prazo (meses)</Label>
          <Input className="text-sm" placeholder="240 (padrão)" inputMode="numeric" value={form.prazoMeses} onChange={(e) => set('prazoMeses', e.target.value.replace(/\D/g, ''))} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-gray-500">Data de Nascimento</Label>
          <Input type="date" className="text-sm" value={form.dataNascimento} onChange={(e) => set('dataNascimento', e.target.value)} />
          <p className="text-[10px] text-gray-400">Usada na regra idade + prazo ≤ 80 anos e 3 meses.</p>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-gray-500">Renda Mensal (informativo)</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">R$</span>
            <Input className="pl-8 text-sm" placeholder="0,00" value={form.rendaMensal} onChange={(e) => handleMoeda('rendaMensal', e.target.value)} />
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-xs text-gray-500">Bancos para simular (vazio = todos)</Label>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {TODOS_BANCOS_CGI.map((id) => {
            const cfg = BANCOS_CGI_CONFIG[id]
            const sel = form.bancosIds.includes(id)
            return (
              <button
                key={id}
                type="button"
                onClick={() => toggleBanco(id)}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-lg border text-sm text-left transition-all',
                  sel ? 'border-transparent text-white' : 'border-gray-200 text-gray-500 hover:border-gray-300 bg-white',
                )}
                style={sel ? { backgroundColor: cfg.cor, color: cfg.corTexto } : undefined}
              >
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: sel ? cfg.corTexto : cfg.cor, opacity: sel ? 0.7 : 1 }} />
                <span className="truncate text-xs font-medium">{cfg.nome}</span>
              </button>
            )
          })}
        </div>
      </div>

      {!form.dataNascimento && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          ℹ️ {NOTA_IDADE_NAO_INFORMADA_CGI}
        </p>
      )}

      {resultado && (
        <div className="space-y-3 pt-2">
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-fonti-primary text-white">
                  <th className="px-2 py-2 text-left">Banco</th>
                  <th className="px-2 py-2 text-left">Sistema</th>
                  <th className="px-2 py-2 text-right">Vlr Simulado</th>
                  <th className="px-2 py-2 text-right">% Imóvel</th>
                  <th className="px-2 py-2 text-right">Taxa a.a.</th>
                  <th className="px-2 py-2 text-right">Prazo Máx.</th>
                  <th className="px-2 py-2 text-right">Prazo Usado</th>
                  <th className="px-2 py-2 text-right">IOF</th>
                  <th className="px-2 py-2 text-right">Prestação</th>
                </tr>
              </thead>
              <tbody>
                {resultado.bancos.map((b) => {
                  const ehMenor = b.bancoId === resultado.bancoMenorPrestacaoId
                  if (!b.elegivel) {
                    return (
                      <tr key={b.bancoId} className="border-t border-gray-100 bg-red-50">
                        <td className="px-2 py-2 font-medium text-red-700">{b.bancoNome}</td>
                        <td colSpan={8} className="px-2 py-2 text-red-700">⚠️ {b.motivoInelegivel}</td>
                      </tr>
                    )
                  }
                  return (
                    <tr key={b.bancoId} className={cn('border-t border-gray-100', ehMenor && 'bg-green-50')}>
                      <td className="px-2 py-2 font-medium">
                        {b.bancoNome}
                        {ehMenor && <span className="block text-[10px] text-green-700">menor prestação estimada</span>}
                      </td>
                      <td className="px-2 py-2">{b.sistemaAmortizacao}</td>
                      <td className="px-2 py-2 text-right">{BRL.format(b.valorSimulado)}</td>
                      <td className="px-2 py-2 text-right">{(b.percentualFinanciado * 100).toFixed(1)}%</td>
                      <td className="px-2 py-2 text-right">{(b.taxaAnualReferencia * 100).toFixed(2)}%{b.indexadoIpca ? '+IPCA' : ''}</td>
                      <td className="px-2 py-2 text-right">{b.prazoMaximoBanco}m</td>
                      <td className="px-2 py-2 text-right">{b.prazoConsiderado}m</td>
                      <td className="px-2 py-2 text-right">{BRL.format(b.iofEstimado)}</td>
                      <td className="px-2 py-2 text-right font-semibold">{BRL.format(b.prestacaoEstimada)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {resultado.bancos.some((b) => b.elegivel && (b.limitadoPeloLtv || b.limitadoPeloPrazoBanco || b.limitadoPelaIdade)) && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 space-y-1">
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

          <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            {NOTA_IOF_CGI}
          </p>

          {resultado.bancos.some((b) => b.indexadoIpca) && (
            <p className="text-[11px] text-blue-800 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
              {resultado.bancos.filter((b) => b.indexadoIpca).map((b) => `${b.bancoNome}: ${notaTaxaCgi(BANCOS_CGI_CONFIG[b.bancoId])}`).join(' ')}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
