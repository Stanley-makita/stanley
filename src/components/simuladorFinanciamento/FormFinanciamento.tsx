'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { BANCOS_CONFIG, TODOS_BANCOS } from '@/lib/simuladorFinanciamento/constantes'
import type { BancoId, InputFinanciamento, TipoAmortizacao, TipoImovel, FinalidadeImovel } from '@/lib/simuladorFinanciamento/tipos'

interface Props {
  onSimular: (input: InputFinanciamento) => void
  loading?: boolean
  nomeCliente?: string
  cpfCliente?: string
}

function fmtNum(v: string): string {
  return v.replace(/\D/g, '')
}

function parseMoeda(v: string): number {
  return parseFloat(v.replace(/\./g, '').replace(',', '.')) || 0
}

function fmtMoedaInput(v: string): string {
  const num = fmtNum(v)
  if (!num) return ''
  const n = parseInt(num, 10) / 100
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function FormFinanciamento({ onSimular, loading, nomeCliente, cpfCliente }: Props) {
  const [valorImovel, setValorImovel] = useState('')
  const [valorEntrada, setValorEntrada] = useState('')
  const [dataNascimento, setDataNascimento] = useState('')
  const [rendaMensal, setRendaMensal] = useState('')
  const [tipoAmortizacao, setTipoAmortizacao] = useState<TipoAmortizacao>('SAC')
  const [tipoImovel, setTipoImovel] = useState<TipoImovel>('novo')
  const [finalidade, setFinalidade] = useState<FinalidadeImovel>('residencial')
  const [usaFgts, setUsaFgts] = useState(false)
  const [jaRecebeuSubsidio, setJaRecebeuSubsidio] = useState(false)
  const [correntista, setCorrentista] = useState(false)
  const [bancosIds, setBancosIds] = useState<BancoId[]>([...TODOS_BANCOS])

  const vImovel = parseMoeda(valorImovel)
  const vEntrada = parseMoeda(valorEntrada)
  const vFinanciado = Math.max(0, vImovel - vEntrada)
  const pctEntrada = vImovel > 0 ? ((vEntrada / vImovel) * 100).toFixed(1) : '0.0'

  function toggleBanco(id: BancoId) {
    setBancosIds((prev) =>
      prev.includes(id) ? prev.filter((b) => b !== id) : [...prev, id]
    )
  }

  function handleMoedaInput(
    e: React.ChangeEvent<HTMLInputElement>,
    setter: (v: string) => void
  ) {
    const raw = e.target.value.replace(/\D/g, '')
    setter(fmtMoedaInput(raw))
  }

  const podeSimular =
    vImovel > 0 &&
    vEntrada >= 0 &&
    vFinanciado > 0 &&
    dataNascimento.length === 10 &&
    parseMoeda(rendaMensal) > 0 &&
    bancosIds.length > 0

  function handleSubmit() {
    if (!podeSimular) return
    onSimular({
      valorImovel: vImovel,
      valorEntrada: vEntrada,
      dataNascimento,
      rendaMensal: parseMoeda(rendaMensal),
      tipoAmortizacao,
      tipoImovel,
      finalidade,
      usaFgts,
      jaRecebeuSubsidio: usaFgts ? jaRecebeuSubsidio : false,
      correntista,
      bancosIds,
      nomeCliente,
      cpfCliente,
    })
  }

  return (
    <div className="space-y-5">
      {/* Valores */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs text-gray-500">Valor do Imóvel</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">R$</span>
            <Input
              className="pl-8 text-sm"
              placeholder="0,00"
              value={valorImovel}
              onChange={(e) => handleMoedaInput(e, setValorImovel)}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-gray-500">
            Valor de Entrada
            {vImovel > 0 && (
              <span className="ml-1 text-fonti-primary font-medium">{pctEntrada}%</span>
            )}
          </Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">R$</span>
            <Input
              className="pl-8 text-sm"
              placeholder="0,00"
              value={valorEntrada}
              onChange={(e) => handleMoedaInput(e, setValorEntrada)}
            />
          </div>
        </div>
      </div>

      {/* Preview financiado */}
      {vFinanciado > 0 && (
        <div className="rounded-lg bg-fonti-primary/5 border border-fonti-primary/20 px-3 py-2 text-sm text-fonti-primary font-medium">
          Valor financiado: {vFinanciado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}
        </div>
      )}

      {/* Data de nascimento e Renda */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs text-gray-500">Data de Nascimento</Label>
          <Input
            type="date"
            className="text-sm"
            value={dataNascimento}
            onChange={(e) => setDataNascimento(e.target.value)}
            max={new Date(Date.now() - 18 * 365.25 * 86400000).toISOString().split('T')[0]}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-gray-500">Renda Mensal Bruta</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">R$</span>
            <Input
              className="pl-8 text-sm"
              placeholder="0,00"
              value={rendaMensal}
              onChange={(e) => handleMoedaInput(e, setRendaMensal)}
            />
          </div>
        </div>
      </div>

      {/* Amortização */}
      <div className="space-y-1.5">
        <Label className="text-xs text-gray-500">Tipo de Amortização</Label>
        <div className="flex gap-2">
          {(['SAC', 'PRICE'] as TipoAmortizacao[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTipoAmortizacao(t)}
              className={cn(
                'flex-1 py-2 rounded-lg text-sm font-medium border transition-all',
                tipoAmortizacao === t
                  ? 'bg-fonti-primary text-white border-fonti-primary'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
              )}
            >
              {t}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-400">
          {tipoAmortizacao === 'SAC'
            ? 'SAC: parcelas decrescentes — juros menores no total'
            : 'PRICE: parcelas fixas — mais fácil de planejar'}
        </p>
      </div>

      {/* Tipo de imóvel + Finalidade */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs text-gray-500">Tipo de Imóvel</Label>
          <div className="flex gap-2">
            {(['novo', 'usado'] as TipoImovel[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTipoImovel(t)}
                className={cn(
                  'flex-1 py-2 rounded-lg text-sm font-medium border transition-all capitalize',
                  tipoImovel === t
                    ? 'bg-fonti-primary text-white border-fonti-primary'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                )}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-gray-500">Finalidade</Label>
          <div className="flex gap-2">
            {(['residencial', 'comercial'] as FinalidadeImovel[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFinalidade(f)}
                className={cn(
                  'flex-1 py-2 rounded-lg text-sm font-medium border transition-all',
                  finalidade === f
                    ? 'bg-fonti-primary text-white border-fonti-primary'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                )}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* FGTS */}
      <div className="space-y-2">
        <label className="flex items-center gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={usaFgts}
            onChange={(e) => { setUsaFgts(e.target.checked); if (!e.target.checked) setJaRecebeuSubsidio(false) }}
            className="w-4 h-4 accent-fonti-primary"
          />
          <span className="text-sm text-gray-700">
            Possui 3+ anos de trabalho no regime FGTS
            <span className="ml-1 text-xs text-gray-400">(habilita Pró-Cotista)</span>
          </span>
        </label>
        {usaFgts && (
          <label className="flex items-center gap-3 cursor-pointer select-none ml-7">
            <input
              type="checkbox"
              checked={jaRecebeuSubsidio}
              onChange={(e) => setJaRecebeuSubsidio(e.target.checked)}
              className="w-4 h-4 accent-fonti-primary"
            />
            <span className="text-sm text-gray-700">
              Já foi beneficiado com subsídio FGTS/União
              <span className="ml-1 text-xs text-gray-400">(bloqueia MCMV)</span>
            </span>
          </label>
        )}
      </div>

      {/* Correntista */}
      <label className="flex items-center gap-3 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={correntista}
          onChange={(e) => setCorrentista(e.target.checked)}
          className="w-4 h-4 accent-fonti-primary"
        />
        <span className="text-sm text-gray-700">
          Correntista / relacionamento bancário
          <span className="ml-1 text-xs text-gray-400">(taxa preferencial em alguns bancos)</span>
        </span>
      </label>

      {/* Bancos */}
      <div className="space-y-2">
        <Label className="text-xs text-gray-500">Bancos para simular</Label>
        <div className="grid grid-cols-2 gap-2">
          {TODOS_BANCOS.map((id) => {
            const cfg = BANCOS_CONFIG[id]
            const sel = bancosIds.includes(id)
            return (
              <button
                key={id}
                type="button"
                onClick={() => toggleBanco(id)}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-lg border text-sm text-left transition-all',
                  sel
                    ? 'border-transparent text-white'
                    : 'border-gray-200 text-gray-500 hover:border-gray-300 bg-white'
                )}
                style={sel ? { backgroundColor: cfg.cor, color: cfg.corTexto } : undefined}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: sel ? cfg.corTexto : cfg.cor, opacity: sel ? 0.7 : 1 }}
                />
                <span className="truncate text-xs font-medium">{cfg.nome.split(' ')[0]}</span>
              </button>
            )
          })}
        </div>
      </div>

      <Button
        className="w-full bg-fonti-primary hover:bg-fonti-primary-hover text-white"
        onClick={handleSubmit}
        disabled={!podeSimular || loading}
      >
        {loading ? 'Calculando...' : 'Simular Financiamento'}
      </Button>
    </div>
  )
}
