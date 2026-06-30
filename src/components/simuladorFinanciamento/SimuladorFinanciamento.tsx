'use client'

import { useState, useMemo } from 'react'
import { FormFinanciamento, type InitialValuesFinanciamento } from './FormFinanciamento'
import { ResultadosFinanciamento } from './ResultadosFinanciamento'
import { AnalisePredicativaCard } from './AnalisePredicativaCard'
import { SimulacaoCompartilharModal } from '@/components/simulacoes/SimulacaoCompartilharModal'
import { simularTodosBancos, calcularAnalise } from '@/lib/simuladorFinanciamento/engine'
import type { BancoSimOverrides } from '@/lib/simuladorFinanciamento/engine'
import type { InputFinanciamento, ResultadoBanco, ResultadoCompleto } from '@/lib/simuladorFinanciamento/tipos'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Printer, Send } from 'lucide-react'
import { useBancos } from '@/app/(protected)/configuracoes/_hooks/useBancos'
import { imprimirSimulacaoComPersistencia } from './printFlow'
import { useSalvarSimulacaoCentral } from '@/hooks/simulacoes/useSalvarSimulacaoCentral'
import { toast } from 'sonner'

interface Props {
  nomeCliente?: string
  cpfCliente?: string
  onSalvar?: (resultado: ResultadoCompleto) => void
  salvando?: boolean
  leadId?: string
  initialValues?: InitialValuesFinanciamento
}

export function SimuladorFinanciamento({ nomeCliente, cpfCliente, onSalvar, salvando, leadId: _leadId, initialValues }: Props) {
  const [resultado, setResultado] = useState<ResultadoCompleto | null>(null)
  const [loading, setLoading] = useState(false)
  const [gerandoPDF, setGerandoPDF] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [gerandoPDFId, setGerandoPDFId] = useState<string | null>(null)
  const [modalCompartilhar, setModalCompartilhar] = useState<{ id: string; nome: string } | null>(null)
  const salvarSimulacaoCentral = useSalvarSimulacaoCentral()

  // Busca configurações dos bancos do banco de dados
  // Bancos com simulador_key vinculado sobrescrevem os valores fixados em constantes.ts
  const { data: bancosDB } = useBancos()

  const overridesMap = useMemo((): Partial<Record<string, BancoSimOverrides>> => {
    if (!bancosDB) return {}
    const map: Partial<Record<string, BancoSimOverrides>> = {}
    for (const b of bancosDB as any[]) {
      if (!b.simulador_key) continue
      map[b.simulador_key] = {
        taxaAnual:         b.taxa_anual   != null ? b.taxa_anual / 100   : undefined,
        maxLtv:            b.ltv_maximo   != null ? b.ltv_maximo / 100   : undefined,
        prazoMaximoMeses:  b.prazo_maximo != null ? b.prazo_maximo       : undefined,
        mipRate:           b.seguro_mip   != null ? b.seguro_mip / 100   : undefined,
        dfiRate:           b.seguro_dfi   != null ? b.seguro_dfi / 100   : undefined,
        taxaAdmin:         b.taxa_admin   != null ? b.taxa_admin          : undefined,
      }
    }
    return map
  }, [bancosDB])

  async function baixarPDF() {
    if (!resultado) return
    setGerandoPDF(true)
    try {
      const { gerarPDFFinanciamento } = await import('./gerarPDFFinanciamento')
      await imprimirSimulacaoComPersistencia({
        resultado,
        onSalvarAntesImprimir: async (sim) => {
          if (_leadId) {
            await salvarSimulacaoCentral.mutateAsync({ resultado: sim, leadId: _leadId })
          }
        },
        gerarPdf: async (sim) => {
          await gerarPDFFinanciamento(sim, {
            clienteNome: sim.input.nomeCliente ?? nomeCliente,
          })
        },
      })
    } finally {
      setGerandoPDF(false)
    }
  }

  async function baixarPDFBanco(banco: ResultadoBanco) {
    if (!resultado) return
    setGerandoPDFId(banco.resultadoId)
    try {
      const { gerarPDFFinanciamento } = await import('./gerarPDFFinanciamento')
      await gerarPDFFinanciamento(
        { ...resultado, bancos: [banco] },
        { clienteNome: resultado.input.nomeCliente ?? nomeCliente },
      )
    } finally {
      setGerandoPDFId(null)
    }
  }

  async function compartilharSimulacao() {
    if (!resultado) return
    setEnviando(true)
    try {
      const salvo = await salvarSimulacaoCentral.mutateAsync({ resultado, leadId: _leadId })
      const melhor = resultado.bancos.find((b) => b.elegivel)
      setModalCompartilhar({
        id: salvo.id,
        nome: `Simulação Financiamento${melhor ? ` — ${melhor.bancoNome}` : ''}`,
      })
    } catch {
      toast.error('Erro ao salvar simulação para compartilhamento.')
    } finally {
      setEnviando(false)
    }
  }

  function handleSimular(input: InputFinanciamento) {
    setLoading(true)
    try {
      const bancos = simularTodosBancos(input, overridesMap)
      const analise = calcularAnalise(input, bancos)
      setResultado({
        input,
        bancos,
        analise,
        dataSimulacao: new Date().toISOString(),
      })
    } finally {
      setLoading(false)
    }
  }

  if (resultado) {
    return (
      <div className="space-y-4 p-4">
        {/* Header com voltar */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setResultado(null)}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
          >
            <ArrowLeft className="w-4 h-4" />
            Nova simulação
          </button>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="gap-1 border-fonti-accent text-fonti-primary hover:bg-fonti-accent-hover"
              onClick={baixarPDF}
              disabled={gerandoPDF}
            >
              <Printer className="w-3.5 h-3.5" />
              {gerandoPDF ? 'Gerando...' : 'Imprimir PDF'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1 border-green-600 text-green-700 hover:bg-green-50"
              onClick={compartilharSimulacao}
              disabled={enviando || !resultado}
            >
              <Send className="w-3.5 h-3.5" />
              {enviando ? 'Enviando...' : 'Compartilhar'}
            </Button>
            {onSalvar && (
              <Button
                size="sm"
                className="bg-fonti-primary hover:bg-fonti-primary-hover text-white"
                onClick={() => onSalvar(resultado)}
                disabled={salvando}
              >
                {salvando ? 'Salvando...' : 'Salvar no histórico'}
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <ResultadosFinanciamento
              resultados={resultado.bancos}
              valorImovel={resultado.input.valorImovel}
              rendaMensal={resultado.input.rendaMensal}
              rendaMinimaNecessaria={resultado.analise.rendaMinimaNecessaria}
              onPDFBanco={baixarPDFBanco}
              salvandoId={gerandoPDFId ?? undefined}
            />
          </div>
          <div>
            <AnalisePredicativaCard analise={resultado.analise} />
          </div>
        </div>

        {modalCompartilhar && (
          <SimulacaoCompartilharModal
            simulacao={{ id: modalCompartilhar.id, tipo: 'financiamento', nome: modalCompartilhar.nome }}
            leadId={_leadId}
            onClose={() => setModalCompartilhar(null)}
            onEnviado={() => setModalCompartilhar(null)}
          />
        )}
      </div>
    )
  }

  return (
    <div className="w-full max-w-lg mx-auto">
      <FormFinanciamento
        onSimular={handleSimular}
        loading={loading}
        nomeCliente={nomeCliente}
        cpfCliente={cpfCliente}
        initialValues={initialValues}
      />
    </div>
  )
}
