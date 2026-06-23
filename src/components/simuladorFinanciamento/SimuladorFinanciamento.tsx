'use client'

import { useState } from 'react'
import { FormFinanciamento } from './FormFinanciamento'
import { ResultadosFinanciamento } from './ResultadosFinanciamento'
import { AnalisePredicativaCard } from './AnalisePredicativaCard'
import { simularTodosBancos, calcularAnalise } from '@/lib/simuladorFinanciamento/engine'
import type { InputFinanciamento, ResultadoCompleto } from '@/lib/simuladorFinanciamento/tipos'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'

interface Props {
  nomeCliente?: string
  cpfCliente?: string
  onSalvar?: (resultado: ResultadoCompleto) => void
  salvando?: boolean
}

export function SimuladorFinanciamento({ nomeCliente, cpfCliente, onSalvar, salvando }: Props) {
  const [resultado, setResultado] = useState<ResultadoCompleto | null>(null)
  const [loading, setLoading] = useState(false)

  function handleSimular(input: InputFinanciamento) {
    setLoading(true)
    try {
      const bancos = simularTodosBancos(input)
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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <ResultadosFinanciamento resultados={resultado.bancos} valorImovel={resultado.input.valorImovel} />
          </div>
          <div>
            <AnalisePredicativaCard analise={resultado.analise} />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto p-4">
      <FormFinanciamento
        onSimular={handleSimular}
        loading={loading}
        nomeCliente={nomeCliente}
        cpfCliente={cpfCliente}
      />
    </div>
  )
}
