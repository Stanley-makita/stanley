'use client'

import { useState, useMemo } from 'react'
import { FormFinanciamento, type InitialValuesFinanciamento } from './FormFinanciamento'
import { ResultadosFinanciamento } from './ResultadosFinanciamento'
import { AnalisePredicativaCard } from './AnalisePredicativaCard'
import { simularTodosBancos, calcularAnalise } from '@/lib/simuladorFinanciamento/engine'
import type { BancoSimOverrides } from '@/lib/simuladorFinanciamento/engine'
import type { InputFinanciamento, ResultadoBanco, ResultadoCompleto } from '@/lib/simuladorFinanciamento/tipos'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Printer } from 'lucide-react'
import { useBancos } from '@/app/(protected)/configuracoes/_hooks/useBancos'

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
  const [gerandoPDFId, setGerandoPDFId] = useState<string | null>(null)

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
      await gerarPDFFinanciamento(resultado, {
        clienteNome: resultado.input.nomeCliente ?? nomeCliente,
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
              onPDFBanco={baixarPDFBanco}
              salvandoId={gerandoPDFId ?? undefined}
            />
          </div>
          <div>
            <AnalisePredicativaCard analise={resultado.analise} />
          </div>
        </div>
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
