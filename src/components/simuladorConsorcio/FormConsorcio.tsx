'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { InputMoeda } from '@/components/ui/input-moeda'
import { Switch } from '@/components/ui/switch'

// Estado do formulário em strings — moeda como decimal ("900000.00", igual
// InputMoeda), percentuais como "20" (=20%, não 0.2), inteiros como texto puro.
export interface FormStateConsorcio {
  valorDisponivelLiquido: string
  valorBem: string
  valorCarta: string
  mesLanceContemplacao: string
  percentualLance: string
  rendimentoMensal: string
  percentualLanceEmbutido: string
  prazoMeses: string
  taxaAdmPercentual: string
  indiceCorrecaoAnual: string
  valorizacaoBemAnual: string
  percentualParcelaReduzida: string
  fundoReservaPercentual: string
  aluguelAtivo: boolean
  valorAluguelSaidaMensal: string
  valorAluguelEntradaMensal: string
}

export const FORM_CONSORCIO_VAZIO: FormStateConsorcio = {
  valorDisponivelLiquido: '',
  valorBem: '',
  valorCarta: '',
  mesLanceContemplacao: '',
  // Padrões da planilha (editáveis) — Valor do lance (%) e % Lance embutido.
  percentualLance: '40',
  rendimentoMensal: '',
  percentualLanceEmbutido: '30',
  prazoMeses: '',
  taxaAdmPercentual: '',
  indiceCorrecaoAnual: '',
  valorizacaoBemAnual: '',
  percentualParcelaReduzida: '',
  fundoReservaPercentual: '',
  aluguelAtivo: false,
  valorAluguelSaidaMensal: '',
  valorAluguelEntradaMensal: '',
}

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

function parseMoedaLocal(v: string): number {
  return Number(v) || 0
}
function parsePercentLocal(v: string): number {
  const n = parseFloat(v.replace(',', '.'))
  return isNaN(n) ? 0 : n / 100
}

interface Props {
  form: FormStateConsorcio
  onChange: (form: FormStateConsorcio) => void
}

function Sugestao({ label, valor }: { label: string; valor: number }) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] text-gray-500">{label}</Label>
      <div className="h-8 flex items-center px-2.5 bg-white/70 border border-[#D5CFA8] rounded-md text-xs font-semibold text-fonti-primary">
        {BRL.format(valor)}
      </div>
    </div>
  )
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2.5">
      <p className="text-[10px] font-semibold text-fonti-primary uppercase tracking-wide border-b border-gray-100 pb-1">
        {titulo}
      </p>
      <div className="grid grid-cols-2 gap-2.5">{children}</div>
    </div>
  )
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] text-gray-500">{label}</Label>
      {children}
    </div>
  )
}

function PercentInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative">
      <Input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, ''))}
        placeholder={placeholder ?? '0'}
        className="pr-7 text-right tabular-nums h-8 text-sm"
      />
      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">%</span>
    </div>
  )
}

function IntInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <Input
      type="text"
      inputMode="numeric"
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
      placeholder={placeholder ?? '0'}
      className="text-right tabular-nums h-8 text-sm"
    />
  )
}

export function FormConsorcio({ form, onChange }: Props) {
  const set = <K extends keyof FormStateConsorcio>(k: K, v: FormStateConsorcio[K]) =>
    onChange({ ...form, [k]: v })

  // Sugestão ao vivo (mesma fórmula do Excel: I11 = I3/(1-I10), I12 = I11*(1-I10))
  // — mostrada aqui do lado do campo, igual à planilha, em vez de só no
  // painel de Resultados (longe, difícil de acompanhar enquanto digita).
  const valorBemNum = parseMoedaLocal(form.valorBem)
  const pctLanceEmbutido = parsePercentLocal(form.percentualLanceEmbutido)
  const valorComLanceEmbutido = pctLanceEmbutido < 1 ? valorBemNum / (1 - pctLanceEmbutido) : 0
  const valorLiquidoDaCarta = valorComLanceEmbutido * (1 - pctLanceEmbutido)

  return (
    <div className="space-y-4">
      <Secao titulo="Bem, carta e disponibilidade">
        <Campo label="Valor do bem">
          <InputMoeda value={form.valorBem} onChange={(v) => set('valorBem', v)} />
        </Campo>
        <Campo label="Valor da carta">
          <InputMoeda value={form.valorCarta} onChange={(v) => set('valorCarta', v)} />
        </Campo>
        <Campo label="Valor disponível líquido">
          <InputMoeda value={form.valorDisponivelLiquido} onChange={(v) => set('valorDisponivelLiquido', v)} />
        </Campo>
        <Campo label="Prazo em meses">
          <IntInput value={form.prazoMeses} onChange={(v) => set('prazoMeses', v)} />
        </Campo>
      </Secao>

      <Secao titulo="Lance e contemplação">
        <Campo label="Mês do lance/contemplação">
          <IntInput value={form.mesLanceContemplacao} onChange={(v) => set('mesLanceContemplacao', v)} />
        </Campo>
        <Campo label="Valor do lance (%)">
          <PercentInput value={form.percentualLance} onChange={(v) => set('percentualLance', v)} />
        </Campo>
        <Campo label="% Lance embutido">
          <PercentInput value={form.percentualLanceEmbutido} onChange={(v) => set('percentualLanceEmbutido', v)} />
        </Campo>
        {valorBemNum > 0 && (
          <>
            <Sugestao label="Valor com lance embutido" valor={valorComLanceEmbutido} />
            <Sugestao label="Valor Líquido da carta" valor={valorLiquidoDaCarta} />
          </>
        )}
      </Secao>

      <Secao titulo="Condições do consórcio">
        <Campo label="Tx Adm (%)">
          <PercentInput value={form.taxaAdmPercentual} onChange={(v) => set('taxaAdmPercentual', v)} />
        </Campo>
        <Campo label="Fundo de reserva (%)">
          <PercentInput value={form.fundoReservaPercentual} onChange={(v) => set('fundoReservaPercentual', v)} />
        </Campo>
        <Campo label="% da parcela reduzida">
          <PercentInput value={form.percentualParcelaReduzida} onChange={(v) => set('percentualParcelaReduzida', v)} />
        </Campo>
      </Secao>

      <Secao titulo="Correção e rendimento">
        <Campo label="Índice de correção (a.a.)">
          <PercentInput value={form.indiceCorrecaoAnual} onChange={(v) => set('indiceCorrecaoAnual', v)} />
        </Campo>
        <Campo label="Valorização do bem (a.a.)">
          <PercentInput value={form.valorizacaoBemAnual} onChange={(v) => set('valorizacaoBemAnual', v)} />
        </Campo>
        <Campo label="Rendimento % a.m.">
          <PercentInput value={form.rendimentoMensal} onChange={(v) => set('rendimentoMensal', v)} />
        </Campo>
      </Secao>

      <div className="space-y-2.5">
        <div className="flex items-center justify-between border-b border-gray-100 pb-1">
          <p className="text-[10px] font-semibold text-fonti-primary uppercase tracking-wide">Comparar com aluguel</p>
          <Switch checked={form.aluguelAtivo} onCheckedChange={(v) => set('aluguelAtivo', v)} />
        </div>
        {form.aluguelAtivo && (
          <div className="grid grid-cols-2 gap-2.5">
            <Campo label="Aluguel saída mensal (até o lance)">
              <InputMoeda value={form.valorAluguelSaidaMensal} onChange={(v) => set('valorAluguelSaidaMensal', v)} />
            </Campo>
            <Campo label="Aluguel entrada mensal (após o lance)">
              <InputMoeda value={form.valorAluguelEntradaMensal} onChange={(v) => set('valorAluguelEntradaMensal', v)} />
            </Campo>
          </div>
        )}
      </div>
    </div>
  )
}
