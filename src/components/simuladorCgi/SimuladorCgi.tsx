'use client'

import { useEffect, useMemo, useState } from 'react'
import { PainelCgi, FORM_CGI_VAZIO, parseMoedaCgi, type FormStateCgi } from '@/lib/simuladorCgi/PainelCgi'
import { executarSimulacaoCgi } from '@/lib/simuladorCgi/engine'
import type { InputCgi, ResultadoCgiCompleto } from '@/lib/simuladorCgi/tipos'
import { useSalvarCgiCentral } from '@/hooks/simulacoes/useSalvarCgiCentral'
import { SimulacaoCompartilharModal } from '@/components/simulacoes/SimulacaoCompartilharModal'
import { Button } from '@/components/ui/button'
import { Printer, Send } from 'lucide-react'
import { toast } from 'sonner'

function inputParaForm(input: InputCgi): FormStateCgi {
  const fmt = (n: number) => n > 0 ? n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''
  return {
    valorImovel: fmt(input.valorImovel),
    valorDesejado: fmt(input.valorDesejado),
    prazoMeses: input.prazoMeses ? String(input.prazoMeses) : '',
    rendaMensal: input.rendaMensal ? fmt(input.rendaMensal) : '',
    dataNascimento: input.dataNascimento ?? '',
    bancosIds: input.bancosIds,
  }
}

interface Props {
  onResultadoChange?: (r: ResultadoCgiCompleto | null) => void
  /**
   * ID de uma simulação já salva (ex.: "Ver simulação" no histórico) — quando
   * presente, Imprimir/Compartilhar não salvam de novo no histórico, só
   * reaproveitam este ID. Mesmo padrão de SimuladorConsorcio/SimuladorFinanciamento.
   */
  simulacaoExistenteId?: string
  resultadoInicial?: ResultadoCgiCompleto
  clienteNome?: string
  clienteCpf?: string
  responsavelNome?: string
  leadId?: string
  processoId?: string
}

export function SimuladorCgi({
  onResultadoChange,
  simulacaoExistenteId,
  resultadoInicial,
  clienteNome,
  clienteCpf,
  responsavelNome,
  leadId,
  processoId,
}: Props) {
  const [form, setForm] = useState<FormStateCgi>(() =>
    resultadoInicial ? inputParaForm(resultadoInicial.input) : FORM_CGI_VAZIO,
  )
  const [gerandoPDF, setGerandoPDF] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [modalCompartilhar, setModalCompartilhar] = useState<{ id: string; nome: string } | null>(null)
  const salvarCgiCentral = useSalvarCgiCentral()

  const resultado = useMemo((): ResultadoCgiCompleto | null => {
    const valorImovel = parseMoedaCgi(form.valorImovel)
    const valorDesejado = parseMoedaCgi(form.valorDesejado)
    if (valorImovel <= 0 || valorDesejado <= 0) return null

    const input: InputCgi = {
      valorImovel,
      valorDesejado,
      prazoMeses: form.prazoMeses ? parseInt(form.prazoMeses, 10) : undefined,
      rendaMensal: form.rendaMensal ? parseMoedaCgi(form.rendaMensal) : undefined,
      dataNascimento: form.dataNascimento || undefined,
      bancosIds: form.bancosIds,
      nomeCliente: clienteNome || undefined,
      cpfCliente: clienteCpf || undefined,
    }
    return executarSimulacaoCgi(input)
  }, [form, clienteNome, clienteCpf])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { onResultadoChange?.(resultado) }, [resultado])

  async function baixarPDF() {
    if (!resultado) return
    setGerandoPDF(true)
    try {
      const { baixarPDFCgi } = await import('@/lib/simuladorCgi/gerarPDFBuffer')
      await baixarPDFCgi(resultado, { clienteNome, responsavelNome })
    } finally {
      setGerandoPDF(false)
    }
  }

  async function compartilharSimulacao() {
    if (!resultado) return
    const nome = `Simulação de CGI${clienteNome ? ` — ${clienteNome}` : ''}`
    if (simulacaoExistenteId) {
      setModalCompartilhar({ id: simulacaoExistenteId, nome })
      return
    }
    setEnviando(true)
    try {
      const salvo = await salvarCgiCentral.mutateAsync({ resultado, leadId, processoId })
      setModalCompartilhar({ id: salvo.id, nome })
    } catch {
      toast.error('Erro ao salvar simulação para compartilhamento.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 overflow-y-auto">
        <PainelCgi form={form} onChange={setForm} resultado={resultado} />
      </div>

      <div className="flex items-center justify-end gap-2 px-4 py-2.5 border-t border-gray-100 bg-white shrink-0">
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
          simulacao={{ id: modalCompartilhar.id, tipo: 'cgi', nome: modalCompartilhar.nome }}
          leadId={leadId}
          processoId={processoId}
          onClose={() => setModalCompartilhar(null)}
          onEnviado={() => setModalCompartilhar(null)}
        />
      )}
    </div>
  )
}
