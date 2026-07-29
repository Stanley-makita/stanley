'use client'

import { useEffect, useMemo, useState } from 'react'
import { FormConsorcio, FORM_CONSORCIO_VAZIO, type FormStateConsorcio } from './FormConsorcio'
import { ResultadosConsorcio } from './ResultadosConsorcio'
import { simularConsorcio } from '@/lib/simuladorConsorcio/engine'
import type { InputConsorcio, ResultadoConsorcio } from '@/lib/simuladorConsorcio/tipos'

function parseMoeda(v: string): number {
  return Number(v) || 0
}
function parsePercent(v: string): number {
  const n = parseFloat(v.replace(',', '.'))
  return isNaN(n) ? 0 : n / 100
}
function parseInt10(v: string): number {
  return parseInt(v, 10) || 0
}

function inputParaForm(input: InputConsorcio): FormStateConsorcio {
  const pct = (v: number) => (v * 100).toString()
  return {
    valorDisponivelLiquido: String(input.valorDisponivelLiquido || ''),
    valorBem: String(input.valorBem || ''),
    valorCarta: String(input.valorCarta || ''),
    mesLanceContemplacao: String(input.mesLanceContemplacao || ''),
    percentualLance: pct(input.percentualLance),
    rendimentoMensal: pct(input.rendimentoMensal),
    percentualLanceEmbutido: pct(input.percentualLanceEmbutido),
    prazoMeses: String(input.prazoMeses || ''),
    taxaAdmPercentual: pct(input.taxaAdmPercentual),
    indiceCorrecaoAnual: pct(input.indiceCorrecaoAnual),
    valorizacaoBemAnual: pct(input.valorizacaoBemAnual),
    percentualParcelaReduzida: pct(input.percentualParcelaReduzida),
    fundoReservaPercentual: pct(input.fundoReservaPercentual),
    aluguelAtivo: input.aluguelAtivo,
    valorAluguelSaidaMensal: String(input.valorAluguelSaidaMensal || ''),
    valorAluguelEntradaMensal: String(input.valorAluguelEntradaMensal || ''),
  }
}

const CAMPOS_OBRIGATORIOS: Array<keyof FormStateConsorcio> = [
  'valorDisponivelLiquido', 'valorBem', 'valorCarta', 'mesLanceContemplacao',
  'percentualLance', 'rendimentoMensal', 'prazoMeses', 'taxaAdmPercentual',
  'indiceCorrecaoAnual', 'valorizacaoBemAnual', 'percentualParcelaReduzida',
  'fundoReservaPercentual',
]

interface Props {
  modoAvulso?: boolean
  onResultadoChange?: (r: ResultadoConsorcio | null) => void
  simulacaoExistenteId?: string
  resultadoInicial?: ResultadoConsorcio
  clienteNome?: string
  clienteCpf?: string
}

export function SimuladorConsorcio({
  onResultadoChange,
  resultadoInicial,
  clienteNome,
  clienteCpf,
}: Props) {
  const [form, setForm] = useState<FormStateConsorcio>(() =>
    resultadoInicial ? inputParaForm(resultadoInicial.input) : FORM_CONSORCIO_VAZIO,
  )

  const resultado = useMemo((): ResultadoConsorcio | null => {
    const preenchido = CAMPOS_OBRIGATORIOS.every((k) => form[k] !== '')
    if (!preenchido) return null
    if (form.aluguelAtivo && (form.valorAluguelSaidaMensal === '' || form.valorAluguelEntradaMensal === '')) return null

    const input: InputConsorcio = {
      valorDisponivelLiquido: parseMoeda(form.valorDisponivelLiquido),
      valorBem: parseMoeda(form.valorBem),
      valorCarta: parseMoeda(form.valorCarta),
      mesLanceContemplacao: parseInt10(form.mesLanceContemplacao),
      percentualLance: parsePercent(form.percentualLance),
      rendimentoMensal: parsePercent(form.rendimentoMensal),
      percentualLanceEmbutido: parsePercent(form.percentualLanceEmbutido),
      prazoMeses: parseInt10(form.prazoMeses),
      taxaAdmPercentual: parsePercent(form.taxaAdmPercentual),
      indiceCorrecaoAnual: parsePercent(form.indiceCorrecaoAnual),
      valorizacaoBemAnual: parsePercent(form.valorizacaoBemAnual),
      percentualParcelaReduzida: parsePercent(form.percentualParcelaReduzida),
      fundoReservaPercentual: parsePercent(form.fundoReservaPercentual),
      aluguelAtivo: form.aluguelAtivo,
      valorAluguelSaidaMensal: parseMoeda(form.valorAluguelSaidaMensal),
      valorAluguelEntradaMensal: parseMoeda(form.valorAluguelEntradaMensal),
      nomeCliente: clienteNome || undefined,
      cpfCliente: clienteCpf || undefined,
    }

    if (input.prazoMeses <= 0 || input.mesLanceContemplacao <= 0) return null

    return simularConsorcio(input)
  }, [form, clienteNome, clienteCpf])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { onResultadoChange?.(resultado) }, [resultado])

  return (
    <div className="flex flex-col md:flex-row gap-4 h-full min-h-0">
      <div className="md:w-[380px] shrink-0 overflow-y-auto p-4 bg-[#F2F0E8] border-r border-[#D5CFA8]">
        <FormConsorcio form={form} onChange={setForm} />
      </div>
      <div className="flex-1 min-w-0 overflow-y-auto p-4">
        <ResultadosConsorcio resultado={resultado} />
      </div>
    </div>
  )
}
