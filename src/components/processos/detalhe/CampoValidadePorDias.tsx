'use client'

import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { Input } from '@/components/ui/input'
import type { TipoValidade } from '@/hooks/processos/useSalvarValidadeProcesso'
import {
  MAX_DIAS_VALIDADE_CREDITO, dataPorDias, diasEntre, erroDiasValidade, hojeISO,
} from '@/lib/validade/diasValidade'

// Padrão único dos modais de validade (crédito, matrícula, engenharia):
// "Válido por [__] dias" calcula o vencimento a partir da data base, e o
// calendário continua editável — escolher a data recalcula os dias.
// Crédito: base = Data da Aprovação (hoje se não preenchida), máx. 180 dias.
// Matrícula/Engenharia: base = hoje. Regras em src/lib/validade/diasValidade.ts.

const CONFIG: Record<TipoValidade, { placeholder: number; maxDias?: number; usaDataBase: boolean }> = {
  credito:    { placeholder: 60,  maxDias: MAX_DIAS_VALIDADE_CREDITO, usaDataBase: true },
  matricula:  { placeholder: 30,  usaDataBase: false },
  engenharia: { placeholder: 180, usaDataBase: false },
}

function baseDoCalculo(tipo: TipoValidade, dataBase?: string | null): string {
  return (CONFIG[tipo].usaDataBase && dataBase) || hojeISO()
}

/** Erro da data escolhida (null = pode salvar). Data vazia não é erro. */
export function erroCampoValidade(tipo: TipoValidade, data: string, dataBase?: string | null): string | null {
  if (!data) return null
  return erroDiasValidade(diasEntre(baseDoCalculo(tipo, dataBase), data), CONFIG[tipo].maxDias)
}

interface Props {
  tipo: TipoValidade
  /** Data de vencimento ('yyyy-MM-dd' ou ''). */
  valor: string
  onChange: (data: string) => void
  /** Só usada no crédito (Data da Aprovação). Vazia = hoje. */
  dataBase?: string | null
  autoFocus?: boolean
}

/**
 * Os dias são inicializados a partir de `valor` na montagem — o conteúdo do
 * Dialog é desmontado ao fechar, então cada abertura começa do valor atual.
 */
export function CampoValidadePorDias({ tipo, valor, onChange, dataBase, autoFocus }: Props) {
  const config = CONFIG[tipo]
  const base = baseDoCalculo(tipo, dataBase)
  const [dias, setDias] = useState(() => (valor ? String(diasEntre(base, valor)) : ''))

  function alterarDias(texto: string) {
    const limpo = texto.replace(/\D/g, '').slice(0, 4)
    setDias(limpo)
    const n = limpo ? parseInt(limpo, 10) : NaN
    if (n > 0) onChange(dataPorDias(base, n))
  }

  function alterarData(data: string) {
    onChange(data)
    setDias(data ? String(diasEntre(base, data)) : '')
  }

  const erro = erroCampoValidade(tipo, valor, dataBase)
  const textoBase = config.usaDataBase
    ? dataBase
      ? `a partir da Data da Aprovação (${format(parseISO(dataBase), 'dd/MM/yyyy')})`
      : 'a partir de hoje — Data da Aprovação não preenchida'
    : 'a partir de hoje'

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <label className="flex items-center gap-2 text-sm text-gray-700">
          Válido por
          <Input
            inputMode="numeric"
            value={dias}
            placeholder={String(config.placeholder)}
            onChange={(e) => alterarDias(e.target.value)}
            className="h-8 w-20 text-sm text-center"
            aria-label="Dias de validade"
            autoFocus={autoFocus}
          />
          dias
        </label>
        <p className="text-xs text-gray-400">
          {textoBase}{config.maxDias ? ` · máximo ${config.maxDias} dias` : ''}
        </p>
      </div>
      <div className="space-y-1">
        <p className="text-xs text-gray-500">Vence em</p>
        <Input type="date" value={valor} onChange={(e) => alterarData(e.target.value)} className="text-sm" />
      </div>
      {erro && <p className="text-xs text-red-600">{erro}</p>}
    </div>
  )
}
