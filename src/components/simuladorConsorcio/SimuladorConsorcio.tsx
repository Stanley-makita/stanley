'use client'

import { useEffect, useMemo, useState } from 'react'
import { PainelConsorcio, FORM_CONSORCIO_VAZIO, type FormStateConsorcio } from './PainelConsorcio'
import { CronogramaModal } from './CronogramaModal'
import { simularConsorcio } from '@/lib/simuladorConsorcio/engine'
import type { InputConsorcio, ResultadoConsorcio } from '@/lib/simuladorConsorcio/tipos'
import { useSalvarConsorcioCentral } from '@/hooks/simulacoes/useSalvarConsorcioCentral'
import { SimulacaoCompartilharModal } from '@/components/simulacoes/SimulacaoCompartilharModal'
import { PropostaModal } from './PropostaModal'
import { Button } from '@/components/ui/button'
import { Printer, Send, FileText } from 'lucide-react'
import { toast } from 'sonner'

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
    prazoEstimadoContemplacao: input.prazoEstimadoContemplacao ?? '',
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
  /**
   * ID de uma simulação já salva (ex.: "Ver simulação" no histórico) — quando
   * presente, Imprimir/Compartilhar não salvam de novo no histórico, só
   * reaproveitam este ID. Mesmo padrão de SimuladorFinanciamento/SimuladorCustas.
   */
  simulacaoExistenteId?: string
  resultadoInicial?: ResultadoConsorcio
  clienteNome?: string
  clienteCpf?: string
  responsavelNome?: string
}

export function SimuladorConsorcio({
  onResultadoChange,
  simulacaoExistenteId,
  resultadoInicial,
  clienteNome,
  clienteCpf,
  responsavelNome,
}: Props) {
  const [form, setForm] = useState<FormStateConsorcio>(() =>
    resultadoInicial ? inputParaForm(resultadoInicial.input) : FORM_CONSORCIO_VAZIO,
  )
  const [gerandoPDF, setGerandoPDF] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [modalCompartilhar, setModalCompartilhar] = useState<{ id: string; nome: string } | null>(null)
  const [propostaAberta, setPropostaAberta] = useState(false)
  const salvarConsorcioCentral = useSalvarConsorcioCentral()

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
      prazoEstimadoContemplacao: form.prazoEstimadoContemplacao || undefined,
    }

    if (input.prazoMeses <= 0 || input.mesLanceContemplacao <= 0) return null

    return simularConsorcio(input)
  }, [form, clienteNome, clienteCpf])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { onResultadoChange?.(resultado) }, [resultado])

  async function baixarPDF() {
    if (!resultado) return
    setGerandoPDF(true)
    try {
      const { gerarPDFConsorcio } = await import('@/lib/simuladorConsorcio/gerarPDF')
      await gerarPDFConsorcio(resultado, { clienteNome, responsavelNome })
    } finally {
      setGerandoPDF(false)
    }
  }

  async function compartilharSimulacao() {
    if (!resultado) return
    const nome = `Simulação de Consórcio${clienteNome ? ` — ${clienteNome}` : ''}`
    // Se já é uma simulação existente, reaproveita o ID em vez de salvar uma
    // cópia nova a cada Compartilhar — mesmo padrão de SimuladorFinanciamento.
    if (simulacaoExistenteId) {
      setModalCompartilhar({ id: simulacaoExistenteId, nome })
      return
    }
    setEnviando(true)
    try {
      const salvo = await salvarConsorcioCentral.mutateAsync({ resultado })
      setModalCompartilhar({ id: salvo.id, nome })
    } catch {
      toast.error('Erro ao salvar simulação para compartilhamento.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        <PainelConsorcio form={form} onChange={setForm} resultado={resultado} />
        <CronogramaModal linhas={resultado?.linhas ?? []} />
      </div>

      <div className="flex items-center justify-end gap-2 px-4 py-2.5 border-t border-gray-100 bg-white shrink-0">
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs border-fonti-primary text-fonti-primary hover:bg-fonti-primary/5 gap-1"
          onClick={() => setPropostaAberta(true)}
          disabled={!resultado}
        >
          <FileText className="h-3 w-3" /> Versão Proposta
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs border-fonti-accent text-fonti-primary hover:bg-fonti-accent-hover gap-1"
          onClick={baixarPDF}
          disabled={!resultado || gerandoPDF}
        >
          <Printer className="h-3 w-3" /> {gerandoPDF ? 'Gerando...' : 'Imprimir PDF'}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs border-green-600 text-green-700 hover:bg-green-50 gap-1"
          onClick={compartilharSimulacao}
          disabled={!resultado || enviando}
        >
          <Send className="h-3 w-3" /> {enviando ? 'Enviando...' : 'Compartilhar'}
        </Button>
      </div>

      {modalCompartilhar && (
        <SimulacaoCompartilharModal
          simulacao={{ id: modalCompartilhar.id, tipo: 'consorcio', nome: modalCompartilhar.nome }}
          onClose={() => setModalCompartilhar(null)}
          onEnviado={() => setModalCompartilhar(null)}
        />
      )}

      <PropostaModal
        open={propostaAberta}
        onOpenChange={setPropostaAberta}
        resultado={resultado}
        simulacaoExistenteId={simulacaoExistenteId}
      />
    </div>
  )
}
