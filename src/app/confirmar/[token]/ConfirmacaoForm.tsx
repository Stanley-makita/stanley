'use client'

import { useState } from 'react'
import { CheckCircle2, AlertCircle } from 'lucide-react'

interface DadosJson {
  engenharia_laudo?: number | null
  compra_venda?: number | null
  entrada?: number | null
  fgts?: number | null
  subsidio?: number | null
  valor_financiado?: number | null
  despesas_financiadas?: number | null
  valor_total_financiado?: number | null
  prazo_meses?: number | null
  modalidade?: string | null
  amortizacao?: string | null
  taxa?: string | null
  iof?: number | null
  [key: string]: unknown
}

interface Props {
  token: string
  template: string
  dadosJson: DadosJson | null
  jaConfirmado: boolean
  confirmadoEm: string | null
  protocolo: string | null
}

function fmt(v: number | null | undefined): string {
  if (v == null) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

const NOMES_BANCO: Record<string, string> = {
  caixa:         'Caixa Econômica Federal',
  bradesco:      'Bradesco',
  bancoDoBrasil: 'Banco do Brasil',
  itau:          'Itaú',
  santander:     'Santander',
}

function linhasTabela(d: DadosJson, template: string): [string, string][] {
  const linhas: [string, string][] = [
    ['Engenharia (Laudo de Avaliação Banco)', fmt(d.engenharia_laudo)],
    ['Compra e Venda (Escritura)',            fmt(d.compra_venda)],
    ['Entrada',                              fmt(d.entrada)],
    ['FGTS',                                 fmt(d.fgts)],
  ]
  if (template === 'caixa' && d.subsidio != null) {
    linhas.push(['Subsídio', fmt(d.subsidio)])
  }
  linhas.push(
    ['Valor Financiado',       fmt(d.valor_financiado)],
    ['Despesas Financiadas',   fmt(d.despesas_financiadas)],
    ['Valor Total Financiado', fmt(d.valor_total_financiado)],
    ['Prazo',                  d.prazo_meses ? `${d.prazo_meses} meses` : '—'],
    ['Modalidade',             d.modalidade ?? '—'],
    ['Amortização',            d.amortizacao ?? '—'],
    ['Taxa',                   d.taxa ?? '—'],
  )
  if (template === 'bradesco') {
    linhas.push(['IOF', fmt(d.iof)])
  }
  return linhas
}

export default function ConfirmacaoForm({ token, template, dadosJson, jaConfirmado, confirmadoEm, protocolo }: Props) {
  const [v1, setV1] = useState(false)
  const [v2, setV2] = useState(false)
  const [v3, setV3] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState<{ protocolo: string; confirmadoEm: string } | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const podeConfirmar = v1 && v2 && v3

  async function confirmar() {
    setEnviando(true)
    setErro(null)
    try {
      const res = await fetch(`/api/confirmar/${token}`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Erro ao registrar confirmação.')
      setResultado({ protocolo: json.protocolo, confirmadoEm: json.confirmadoEm })
    } catch (e: any) {
      setErro(e.message)
    } finally {
      setEnviando(false)
    }
  }

  const confirmacaoFinal = resultado ?? (jaConfirmado && confirmadoEm
    ? { protocolo: protocolo ?? '', confirmadoEm }
    : null)

  const bancoNome = NOMES_BANCO[template] ?? template

  if (confirmacaoFinal) {
    return (
      <div className="min-h-screen bg-fonti-surface-muted flex items-center justify-center p-4">
        <div className="bg-white rounded-xl max-w-md w-full overflow-hidden shadow-sm">
          <div className="bg-fonti-primary px-8 py-5">
            <span className="text-fonti-accent text-lg font-bold">Fontinhas Assessoria</span>
          </div>
          <div className="p-8 text-center space-y-4">
            <CheckCircle2 className="h-14 w-14 text-emerald-500 mx-auto" />
            <h2 className="text-xl font-bold text-fonti-primary">Confirmação registrada</h2>
            <p className="text-sm text-gray-600">
              Obrigado! Seu aceite foi registrado com sucesso.
            </p>
            {confirmacaoFinal.protocolo && (
              <div className="bg-gray-50 rounded-lg px-4 py-3 border border-gray-200">
                <p className="text-xs text-gray-500 mb-0.5">Protocolo</p>
                <p className="text-sm font-mono font-semibold text-fonti-primary">{confirmacaoFinal.protocolo}</p>
              </div>
            )}
            <p className="text-xs text-gray-400">
              {new Date(confirmacaoFinal.confirmadoEm).toLocaleString('pt-BR', {
                dateStyle: 'long',
                timeStyle: 'short',
              })}
            </p>
          </div>
        </div>
      </div>
    )
  }

  const linhas = dadosJson ? linhasTabela(dadosJson, template) : []

  return (
    <div className="min-h-screen bg-fonti-surface-muted p-4 py-8">
      <div className="max-w-lg mx-auto space-y-4">
        {/* Header */}
        <div className="bg-fonti-primary rounded-xl px-8 py-5">
          <span className="text-fonti-accent text-lg font-bold">Fontinhas Assessoria</span>
          {bancoNome && (
            <span className="text-fonti-accent-hover text-sm ml-3">Confirmação de Valores — {bancoNome}</span>
          )}
        </div>

        {/* Card */}
        <div className="bg-white rounded-xl p-6 shadow-sm space-y-5">
          <p className="text-sm text-gray-700 leading-relaxed">
            Segue abaixo o resumo dos valores enviados para sua confirmação.
            Verifique todas as informações e marque os itens abaixo para prosseguir.
          </p>

          {/* Tabela de valores */}
          {linhas.length > 0 && (
            <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
              <thead>
                <tr className="bg-fonti-table-warm">
                  <th className="text-left px-3 py-2 text-xs font-semibold text-fonti-primary">Descrição</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-fonti-primary">Valor</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map(([label, valor], i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td className="px-3 py-[5px] text-gray-600">{label}</td>
                    <td className="px-3 py-[5px] text-right font-semibold text-fonti-primary">{valor}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Checkboxes */}
          <div className="space-y-3 pt-1 border-t border-gray-100">
            <p className="text-xs text-gray-500 pt-3">Confirme os itens abaixo para habilitar o envio:</p>

            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={v1}
                onChange={e => setV1(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-fonti-primary flex-shrink-0"
              />
              <span className="text-sm text-gray-700">Estou de acordo com os valores informados.</span>
            </label>

            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={v2}
                onChange={e => setV2(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-fonti-primary flex-shrink-0"
              />
              <span className="text-sm text-gray-700">
                Estou ciente de que valores, taxas e prazos podem sofrer alteração por banco, prefeitura, cartório ou órgão responsável.
              </span>
            </label>

            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={v3}
                onChange={e => setV3(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-fonti-primary flex-shrink-0"
              />
              <span className="text-sm text-gray-700">Estou ciente dos prazos informados.</span>
            </label>
          </div>

          {erro && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {erro}
            </div>
          )}

          <button
            onClick={confirmar}
            disabled={!podeConfirmar || enviando}
            className="w-full py-3 rounded-lg text-sm font-semibold transition-colors bg-fonti-primary text-fonti-accent hover:bg-fonti-primary-hover disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-fonti-primary"
          >
            {enviando ? 'Registrando...' : 'Confirmar ciência e aceite'}
          </button>
        </div>

        <p className="text-center text-xs text-gray-400 pb-4">
          Este link é individual e de uso único · Fontinhas Assessoria
        </p>
      </div>
    </div>
  )
}
