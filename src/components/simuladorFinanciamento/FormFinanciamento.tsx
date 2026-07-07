'use client'

import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { BANCOS_CONFIG, TODOS_BANCOS } from '@/lib/simuladorFinanciamento/constantes'
import type { BancoId, InputFinanciamento, TipoAmortizacao, TipoImovel, FinalidadeImovel, TipoOperacao } from '@/lib/simuladorFinanciamento/tipos'

// abrevBanco(bancoId, nome).split(' ')[0] colide para bb ("Banco do Brasil") e inter
// ("Banco Inter") — os dois viram "Banco". Rótulo curto explícito por banco em vez de
// derivar da primeira palavra do nome.
const NOME_CURTO_BANCO: Record<BancoId, string> = {
  caixa: 'Caixa', itau: 'Itaú', bradesco: 'Bradesco',
  santander: 'Santander', bb: 'BB', inter: 'Inter', daycoval: 'Daycoval',
}

const OPCOES_PRAZO = ['360', '420'] as const

export interface InitialValuesFinanciamento {
  valorImovel?: string
  valorEntrada?: string
  dataNascimento?: string
  rendaMensal?: string
}

interface Props {
  onSimular: (input: InputFinanciamento) => void
  loading?: boolean
  nomeCliente?: string
  cpfCliente?: string
  initialValues?: InitialValuesFinanciamento
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

// Formata um número (reais) no mesmo padrão exibido nos campos de moeda (ex.: 500000 →
// "500.000,00") — usado para sincronizar Entrada ↔ Financiado sem passar pelo parsing de
// dígitos digitados (fmtMoedaInput espera uma string de centavos, não um valor já em reais).
function formatarValor(n: number): string {
  return n > 0 ? n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''
}

export function FormFinanciamento({ onSimular, loading, nomeCliente, cpfCliente, initialValues }: Props) {
  const [valorImovel, setValorImovel] = useState(initialValues?.valorImovel ?? '')
  const [valorEntrada, setValorEntrada] = useState(initialValues?.valorEntrada ?? '')
  const [valorFinanciado, setValorFinanciado] = useState('')
  const [dataNascimento, setDataNascimento] = useState(initialValues?.dataNascimento ?? '')
  const [rendaMensal, setRendaMensal] = useState(initialValues?.rendaMensal ?? '')

  // Atualiza campos com dados do lead quando chegam de forma assíncrona.
  // Só sobrescreve se o usuário ainda não editou (campo estava vazio).
  const touchedRef = useRef({ valorImovel: false, valorEntrada: false, dataNascimento: false, rendaMensal: false })
  useEffect(() => {
    if (initialValues?.valorImovel && !touchedRef.current.valorImovel)
      setValorImovel(initialValues.valorImovel)
    if (initialValues?.valorEntrada && !touchedRef.current.valorEntrada)
      setValorEntrada(initialValues.valorEntrada)
    if (initialValues?.dataNascimento && !touchedRef.current.dataNascimento)
      setDataNascimento(initialValues.dataNascimento)
    if (initialValues?.rendaMensal && !touchedRef.current.rendaMensal)
      setRendaMensal(initialValues.rendaMensal)
    if (initialValues?.valorImovel || initialValues?.valorEntrada) {
      const im = parseMoeda(initialValues?.valorImovel ?? valorImovel)
      const en = parseMoeda(initialValues?.valorEntrada ?? valorEntrada)
      setValorFinanciado(formatarValor(Math.max(0, im - en)))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialValues?.valorImovel, initialValues?.valorEntrada, initialValues?.dataNascimento, initialValues?.rendaMensal])
  const [tipoOperacao, setTipoOperacao] = useState<TipoOperacao>('aquisicao')
  const [valorTerreno, setValorTerreno] = useState('')
  const [valorObra, setValorObra] = useState('')
  const [tipoAmortizacao, setTipoAmortizacao] = useState<TipoAmortizacao>('SAC')
  const [tipoImovel, setTipoImovel] = useState<TipoImovel>('novo')
  const [finalidade, setFinalidade] = useState<FinalidadeImovel>('residencial')
  const [usaFgts, setUsaFgts] = useState(false)
  const [jaRecebeuSubsidio, setJaRecebeuSubsidio] = useState(false)
  const [correntista, setCorrentista] = useState(false)
  const [bancosIds, setBancosIds] = useState<BancoId[]>([...TODOS_BANCOS])
  const [prazoOpcao, setPrazoOpcao] = useState<string>('auto')
  const [prazoCustomizado, setPrazoCustomizado] = useState('')

  const ehObra = tipoOperacao === 'construcao_terreno_proprio' || tipoOperacao === 'terreno_mais_construcao'
  const ehLote = tipoOperacao === 'lote_urbanizado'

  const vTerreno = parseMoeda(valorTerreno)
  const vObra    = parseMoeda(valorObra)
  const vImovel  = ehObra ? vTerreno + vObra : parseMoeda(valorImovel)
  const vEntrada = parseMoeda(valorEntrada)
  const vFinanciado = Math.max(0, vImovel - vEntrada)
  const pctEntrada = vImovel > 0 ? ((vEntrada / vImovel) * 100).toFixed(1) : '0.0'

  const prazoMeses = prazoOpcao === 'auto'
    ? undefined
    : prazoOpcao === 'outro'
      ? (parseInt(prazoCustomizado, 10) || undefined)
      : parseInt(prazoOpcao, 10)

  function toggleBanco(id: BancoId) {
    setBancosIds((prev) =>
      prev.includes(id) ? prev.filter((b) => b !== id) : [...prev, id]
    )
  }

  // Entrada e Financiado são duas formas de editar a mesma coisa (Imóvel = Entrada +
  // Financiado) — cada input, ao ser digitado, recalcula o outro. `lastEditadoRef` guarda
  // qual dos dois foi editado por último, para que alterar o Valor do Imóvel depois
  // recalcule o campo correto (preserva o que o usuário já digitou manualmente).
  const lastEditadoRef = useRef<'entrada' | 'financiado'>('entrada')

  function handleEntradaChange(e: React.ChangeEvent<HTMLInputElement>) {
    touchedRef.current.valorEntrada = true
    lastEditadoRef.current = 'entrada'
    const formatted = fmtMoedaInput(e.target.value.replace(/\D/g, ''))
    setValorEntrada(formatted)
    setValorFinanciado(formatarValor(Math.max(0, vImovel - parseMoeda(formatted))))
  }

  function handleFinanciadoChange(e: React.ChangeEvent<HTMLInputElement>) {
    lastEditadoRef.current = 'financiado'
    const formatted = fmtMoedaInput(e.target.value.replace(/\D/g, ''))
    setValorFinanciado(formatted)
    setValorEntrada(formatarValor(Math.max(0, vImovel - parseMoeda(formatted))))
  }

  function handleImovelChange(e: React.ChangeEvent<HTMLInputElement>) {
    touchedRef.current.valorImovel = true
    const formatted = fmtMoedaInput(e.target.value.replace(/\D/g, ''))
    setValorImovel(formatted)
    const novoImovel = parseMoeda(formatted)
    if (lastEditadoRef.current === 'financiado') {
      setValorEntrada(formatarValor(Math.max(0, novoImovel - parseMoeda(valorFinanciado))))
    } else {
      setValorFinanciado(formatarValor(Math.max(0, novoImovel - parseMoeda(valorEntrada))))
    }
  }

  function handleMoedaInput(
    e: React.ChangeEvent<HTMLInputElement>,
    setter: (v: string) => void,
    field: keyof typeof touchedRef.current
  ) {
    touchedRef.current[field] = true
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

  // Finalidade implícita pela operação (comercial → comercial; demais → residencial)
  const finalidadeEfetiva: FinalidadeImovel = tipoOperacao === 'comercial' ? 'comercial' : finalidade

  // FGTS se aplica apenas para aquisição e construção (lote e comercial não têm MCMV/Pró-Cotista)
  const fgtsAplicavel = tipoOperacao === 'aquisicao' || tipoOperacao === 'construcao_terreno_proprio' || tipoOperacao === 'terreno_mais_construcao'

  function handleSubmit() {
    if (!podeSimular) return
    onSimular({
      valorImovel: vImovel,
      valorEntrada: vEntrada,
      dataNascimento,
      rendaMensal: parseMoeda(rendaMensal),
      tipoAmortizacao,
      tipoOperacao,
      tipoImovel: tipoOperacao === 'aquisicao' ? tipoImovel : undefined,
      finalidade: finalidadeEfetiva,
      valorTerreno: ehObra ? vTerreno || undefined : undefined,
      valorObra:    ehObra ? vObra    || undefined : undefined,
      usaFgts:       fgtsAplicavel ? usaFgts : false,
      jaRecebeuSubsidio: fgtsAplicavel && usaFgts ? jaRecebeuSubsidio : false,
      correntista,
      bancosIds,
      nomeCliente,
      cpfCliente,
      prazoMeses,
    })
  }

  return (
    <div className="space-y-5">

      {/* Tipo de Operação */}
      <div className="space-y-1.5">
        <Label className="text-xs text-gray-500">Tipo de Operação</Label>
        <div className="flex flex-wrap gap-1.5">
          {([
            { value: 'aquisicao',                label: 'Aquisição',       hint: null },
            { value: 'comercial',                label: 'Comercial',       hint: null },
            { value: 'lote_urbanizado',          label: 'Lote / Terreno',  hint: 'terreno, lote, data, gleba' },
            { value: 'construcao_terreno_proprio', label: 'Constr. Própria', hint: null },
            { value: 'terreno_mais_construcao',  label: 'Terreno + Obra',  hint: null },
          ] as const).map(({ value, label, hint }) => (
            <button
              key={value}
              type="button"
              onClick={() => setTipoOperacao(value)}
              title={hint ?? label}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium border transition-all',
                tipoOperacao === value
                  ? 'bg-fonti-primary text-white border-fonti-primary'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {ehLote && (
          <p className="text-xs text-gray-400">Inclui: terreno, lote, data, data de terra, gleba, greba, fração de terra, pedaço de terra</p>
        )}
      </div>

      {/* Valores — campos variam por tipo de operação */}
      {ehObra ? (
        /* Construção: dois campos separados */
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-500">
                {tipoOperacao === 'construcao_terreno_proprio' ? 'Valor estimado do terreno' : 'Valor de compra do terreno'}
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">R$</span>
                <Input
                  className="pl-8 text-sm"
                  placeholder="0,00"
                  value={valorTerreno}
                  onChange={(e) => setValorTerreno(fmtMoedaInput(e.target.value.replace(/\D/g, '')))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-500">Orçamento estimado da obra</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">R$</span>
                <Input
                  className="pl-8 text-sm"
                  placeholder="0,00"
                  value={valorObra}
                  onChange={(e) => setValorObra(fmtMoedaInput(e.target.value.replace(/\D/g, '')))}
                />
              </div>
            </div>
          </div>
          {vImovel > 0 && (
            <div className="rounded-lg bg-fonti-primary/5 border border-fonti-primary/20 px-3 py-2 text-sm text-fonti-primary font-medium">
              Total do empreendimento: {vImovel.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-500">
              Valor de Entrada
              {vImovel > 0 && <span className="ml-1 text-fonti-primary font-medium">{pctEntrada}%</span>}
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">R$</span>
              <Input
                className="pl-8 text-sm"
                placeholder="0,00"
                value={valorEntrada}
                onChange={(e) => handleMoedaInput(e, setValorEntrada, 'valorEntrada')}
              />
            </div>
          </div>
        </div>
      ) : (
        /* Aquisição / Lote / Comercial: Imóvel, Entrada e Financiado — Entrada e
           Financiado se recalculam um ao outro (Imóvel = Entrada + Financiado) */
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-500">
              {ehLote ? 'Valor do Terreno / Lote' : 'Valor do Imóvel'}
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">R$</span>
              <Input
                className="pl-8 text-sm"
                placeholder="0,00"
                value={valorImovel}
                onChange={handleImovelChange}
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
                onChange={handleEntradaChange}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-gray-500">Valor Financiado</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">R$</span>
              <Input
                className="pl-8 text-sm"
                placeholder="0,00"
                value={valorFinanciado}
                onChange={handleFinanciadoChange}
              />
            </div>
          </div>
        </div>
      )}

      {/* Barra de referência — só para aquisição simples */}
      {!ehObra && vImovel > 0 && (
        <div className="flex flex-wrap gap-x-5 gap-y-1 rounded-md bg-yellow-300 px-3 py-1.5 text-xs font-bold text-yellow-900">
          {([80, 90, 75, 5] as const).map((pct) => {
            const val = (vImovel * pct) / 100
            return (
              <button
                key={pct}
                type="button"
                title={`Usar ${pct}% como entrada`}
                onClick={() => {
                  lastEditadoRef.current = 'entrada'
                  const entradaFormatted = fmtMoedaInput(String(Math.round(val * 100)))
                  setValorEntrada(entradaFormatted)
                  setValorFinanciado(formatarValor(Math.max(0, vImovel - val)))
                }}
                className="whitespace-nowrap hover:underline"
              >
                {pct}% = {val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}
              </button>
            )
          })}
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
            onChange={(e) => { touchedRef.current.dataNascimento = true; setDataNascimento(e.target.value) }}
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
              onChange={(e) => handleMoedaInput(e, setRendaMensal, 'rendaMensal')}
            />
          </div>
        </div>
      </div>

      {/* Amortização + Prazo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

        <div className="space-y-1.5">
          <Label className="text-xs text-gray-500">Prazo</Label>
          <Select value={prazoOpcao} onValueChange={setPrazoOpcao}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Prazo máximo permitido</SelectItem>
              {OPCOES_PRAZO.map((p) => (
                <SelectItem key={p} value={p}>{p} meses</SelectItem>
              ))}
              <SelectItem value="outro">Outro (personalizado)</SelectItem>
            </SelectContent>
          </Select>
          {prazoOpcao === 'outro' && (
            <Input
              type="number"
              min={12}
              className="text-sm"
              placeholder="Prazo em meses"
              value={prazoCustomizado}
              onChange={(e) => setPrazoCustomizado(e.target.value.replace(/\D/g, ''))}
            />
          )}
          <p className="text-xs text-gray-400">
            {prazoOpcao === 'auto'
              ? 'Sem prazo definido, cada banco calcula seu próprio prazo máximo (conforme idade).'
              : 'O prazo pedido ainda respeita o teto de cada banco e a regra de idade + prazo.'}
          </p>
        </div>
      </div>

      {/* Tipo de imóvel + Finalidade — só para aquisição */}
      {tipoOperacao === 'aquisicao' && (
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
      )}

      {/* FGTS + Correntista — lado a lado quando FGTS se aplica */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
        {fgtsAplicavel && (
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
        )}

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
      </div>

      {/* Bancos */}
      <div className="space-y-2">
        <Label className="text-xs text-gray-500">Bancos para simular</Label>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
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
                <span className="truncate text-xs font-medium">{NOME_CURTO_BANCO[id]}</span>
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
