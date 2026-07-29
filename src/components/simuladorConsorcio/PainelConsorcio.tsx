'use client'

import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import type { ResultadoConsorcio } from '@/lib/simuladorConsorcio/tipos'
import { Home, Landmark } from 'lucide-react'

// Layout espelha a planilha Excel original (mesma ordem de colunas G/I, K/L,
// N/O) — pedido explícito do usuário pra conforto visual de quem já usa a
// planilha: rótulo e valor na mesma linha, mesmas cores (verde escuro, rosa
// no Patrimônio à vista / verde claro no Patrimônio consórcio).

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
  prazoEstimadoContemplacao: string
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
  prazoEstimadoContemplacao: '',
}

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const PCT = (v: number) => `${(v * 100).toFixed(2)}%`
const COR_VERDE = '#1B3A2B'

// ── Linha "estilo planilha" — rótulo à esquerda, valor à direita ───────────

function LinhaCampo({ label, index, children }: { label: string; index: number; children: React.ReactNode }) {
  return (
    <div className={cn('flex items-center justify-between gap-2 px-3 py-1.5', index % 2 === 1 && 'bg-white/[0.04]')}>
      <span className="text-[11px] text-white/85 leading-tight">{label}</span>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function ValorComputado({ children }: { children: React.ReactNode }) {
  return <span className="text-xs font-bold text-white tabular-nums">{children}</span>
}

// ── Inputs compactos, estilo "célula de planilha" (fundo transparente,
// texto branco, sem borda visível — combinam com o fundo verde escuro) ────

function inputBaseClass() {
  return 'bg-transparent text-white text-xs font-bold text-right outline-none placeholder:text-white/30 w-24 tabular-nums'
}

function CampoMoeda({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const digitos = e.target.value.replace(/\D/g, '')
    onChange(digitos ? (parseInt(digitos, 10) / 100).toFixed(2) : '')
  }
  const exibicao = value ? Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''
  return (
    <div className="flex items-center gap-1">
      <span className="text-[10px] text-white/60">R$</span>
      <input type="text" inputMode="numeric" value={exibicao} onChange={handleChange} placeholder="0,00" className={inputBaseClass()} />
    </div>
  )
}

function CampoPercent({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-1">
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, ''))}
        placeholder="0"
        className={cn(inputBaseClass(), 'w-14')}
      />
      <span className="text-[10px] text-white/60">%</span>
    </div>
  )
}

function CampoInt({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="text"
      inputMode="numeric"
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
      placeholder="0"
      className={cn(inputBaseClass(), 'w-14')}
    />
  )
}

function CampoTexto({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Ex.: 36 a 40 meses"
      className={cn(inputBaseClass(), 'w-32 text-left')}
    />
  )
}

// ── Bloco verde (grupo de linhas, com um separador visual interno) ─────────

function BlocoVerde({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex-1 min-w-[220px] rounded-lg overflow-hidden" style={{ backgroundColor: COR_VERDE }}>
      {children}
    </div>
  )
}

function Separador() {
  return <div className="h-2" />
}

// ── Painel principal ────────────────────────────────────────────────────────

interface Props {
  form: FormStateConsorcio
  onChange: (form: FormStateConsorcio) => void
  resultado: ResultadoConsorcio | null
}

export function PainelConsorcio({ form, onChange, resultado }: Props) {
  const set = <K extends keyof FormStateConsorcio>(k: K, v: FormStateConsorcio[K]) =>
    onChange({ ...form, [k]: v })

  const ag = resultado?.agregados
  const res = resultado?.resumo
  const comp = resultado?.comparativo
  const dash = '—'

  return (
    <div className="space-y-3">
      {/* Linha 1 — Patrimônio (horizontal — única mudança pedida em relação
          à planilha, que tem isso empilhado verticalmente) */}
      <div className="rounded-lg overflow-hidden border border-gray-200">
        <div className="grid grid-cols-2">
          <div className="bg-[#F8D7DA] px-4 py-3">
            <p className="text-[11px] text-gray-500 flex items-center gap-1"><Home className="h-3 w-3" /> Patrimônio compra à vista</p>
            <p className="text-lg font-bold text-[#7A2E2E] tabular-nums">
              {comp ? BRL.format(comp.patrimonioCompraAVista) : dash}
            </p>
          </div>
          <div className="bg-[#D9EAD3] px-4 py-3">
            <p className="text-[11px] text-gray-600 flex items-center gap-1"><Landmark className="h-3 w-3" /> Patrimônio compra consórcio + aplicação</p>
            <p className="text-lg font-bold text-[#274E13] tabular-nums">
              {comp ? BRL.format(comp.patrimonioCompraConsorcio) : dash}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-6 px-4 py-1.5 bg-gray-50 border-t border-gray-100">
          <span className="text-[11px] text-gray-500">
            Imóvel <span className="font-semibold text-[#274E13]">{resultado ? BRL.format(resultado.linhas.at(-1)?.imovelConsorcio ?? 0) : dash}</span>
          </span>
          <span className="text-[11px] text-gray-500">
            Saldo <span className="font-semibold text-[#274E13]">{resultado ? BRL.format(resultado.linhas.at(-1)?.saldoAplicacao ?? 0) : dash}</span>
          </span>
        </div>
        <div className="grid grid-cols-2 border-t border-gray-100">
          <div className="px-4 py-2 border-r border-gray-100">
            <p className="text-[10px] text-gray-400">Prazo em anos</p>
            <p className="text-sm font-bold text-gray-700">{comp ? comp.prazoEmAnos : dash}</p>
          </div>
          <div className="px-4 py-2">
            <p className="text-[10px] text-gray-400">CET a.a</p>
            <p className="text-sm font-bold text-gray-700">{comp ? PCT(comp.cetAnual) : dash}</p>
          </div>
        </div>
      </div>

      {/* Linha 2 — 3 blocos verdes, ordem exata da planilha (G/I, K/L, N/O) */}
      <div className="flex flex-col md:flex-row gap-3">

        {/* Bloco G/I */}
        <BlocoVerde>
          <LinhaCampo label="Valor disponível líquido" index={0}><CampoMoeda value={form.valorDisponivelLiquido} onChange={(v) => set('valorDisponivelLiquido', v)} /></LinhaCampo>
          <LinhaCampo label="Valor do bem" index={1}><CampoMoeda value={form.valorBem} onChange={(v) => set('valorBem', v)} /></LinhaCampo>
          <LinhaCampo label="Valor da carta" index={2}><CampoMoeda value={form.valorCarta} onChange={(v) => set('valorCarta', v)} /></LinhaCampo>
          <LinhaCampo label="Mês do lance/Contemplação" index={3}><CampoInt value={form.mesLanceContemplacao} onChange={(v) => set('mesLanceContemplacao', v)} /></LinhaCampo>
          <LinhaCampo label="Prazo estimado de contemplação" index={4}><CampoTexto value={form.prazoEstimadoContemplacao} onChange={(v) => set('prazoEstimadoContemplacao', v)} /></LinhaCampo>
          <LinhaCampo label="Valor do lance (%)" index={5}><CampoPercent value={form.percentualLance} onChange={(v) => set('percentualLance', v)} /></LinhaCampo>
          <LinhaCampo label="Taxa de Adm" index={6}><ValorComputado>{ag ? BRL.format(ag.taxaAdmReais) : dash}</ValorComputado></LinhaCampo>
          <LinhaCampo label="Rendimento % a.m." index={7}><CampoPercent value={form.rendimentoMensal} onChange={(v) => set('rendimentoMensal', v)} /></LinhaCampo>
          <Separador />
          <LinhaCampo label="% Lance embutido" index={0}><CampoPercent value={form.percentualLanceEmbutido} onChange={(v) => set('percentualLanceEmbutido', v)} /></LinhaCampo>
          <LinhaCampo label="Valor com lance embutido" index={1}><ValorComputado>{ag ? BRL.format(ag.valorComLanceEmbutido) : dash}</ValorComputado></LinhaCampo>
          <LinhaCampo label="Valor Líquido da carta" index={2}><ValorComputado>{ag ? BRL.format(ag.valorLiquidoDaCarta) : dash}</ValorComputado></LinhaCampo>
        </BlocoVerde>

        {/* Bloco K/L */}
        <BlocoVerde>
          <LinhaCampo label="Prazo em meses" index={0}><CampoInt value={form.prazoMeses} onChange={(v) => set('prazoMeses', v)} /></LinhaCampo>
          <LinhaCampo label="Tx Adm" index={1}><CampoPercent value={form.taxaAdmPercentual} onChange={(v) => set('taxaAdmPercentual', v)} /></LinhaCampo>
          <LinhaCampo label="Índice de correção (a.a.)" index={2}><CampoPercent value={form.indiceCorrecaoAnual} onChange={(v) => set('indiceCorrecaoAnual', v)} /></LinhaCampo>
          <LinhaCampo label="Valorização do bem (a.a.)" index={3}><CampoPercent value={form.valorizacaoBemAnual} onChange={(v) => set('valorizacaoBemAnual', v)} /></LinhaCampo>
          <LinhaCampo label="Valorização do bem (a.m)" index={4}><ValorComputado>{ag ? PCT(ag.valorizacaoBemMensal) : dash}</ValorComputado></LinhaCampo>
          <LinhaCampo label="% da parcela reduzida" index={5}><CampoPercent value={form.percentualParcelaReduzida} onChange={(v) => set('percentualParcelaReduzida', v)} /></LinhaCampo>
          <LinhaCampo label="Fundo de reserva (%)" index={6}><CampoPercent value={form.fundoReservaPercentual} onChange={(v) => set('fundoReservaPercentual', v)} /></LinhaCampo>
          <Separador />
          <LinhaCampo label="Aluguel (X)" index={0}>
            <Switch checked={form.aluguelAtivo} onCheckedChange={(v) => set('aluguelAtivo', v)} />
          </LinhaCampo>
          {form.aluguelAtivo && (
            <>
              <LinhaCampo label="Valor aluguel saída mensal" index={1}><CampoMoeda value={form.valorAluguelSaidaMensal} onChange={(v) => set('valorAluguelSaidaMensal', v)} /></LinhaCampo>
              <LinhaCampo label="Valor aluguel entrada mensal" index={2}><CampoMoeda value={form.valorAluguelEntradaMensal} onChange={(v) => set('valorAluguelEntradaMensal', v)} /></LinhaCampo>
            </>
          )}
        </BlocoVerde>

        {/* Bloco N/O — 100% resultado */}
        <BlocoVerde>
          <LinhaCampo label="Valor do lance" index={0}><ValorComputado>{res ? BRL.format(res.valorDoLance) : dash}</ValorComputado></LinhaCampo>
          <LinhaCampo label="Lance embutido" index={1}><ValorComputado>{res ? BRL.format(res.lanceEmbutido) : dash}</ValorComputado></LinhaCampo>
          <LinhaCampo label="Lance próprio" index={2}><ValorComputado>{res ? BRL.format(res.lanceProprio) : dash}</ValorComputado></LinhaCampo>
          <LinhaCampo label="Valor Líquido" index={3}><ValorComputado>{res ? BRL.format(res.valorLiquido) : dash}</ValorComputado></LinhaCampo>
          <LinhaCampo label="Devolução" index={4}><ValorComputado>{res ? BRL.format(res.devolucao) : dash}</ValorComputado></LinhaCampo>
          <Separador />
          <LinhaCampo label="Correção saldo devedor" index={0}><ValorComputado>{res ? BRL.format(res.correcaoSaldoDevedor) : dash}</ValorComputado></LinhaCampo>
          <LinhaCampo label="Correção valor da carta" index={1}><ValorComputado>{res ? BRL.format(res.correcaoValorDaCarta) : dash}</ValorComputado></LinhaCampo>
          <LinhaCampo label="Custo de correção" index={2}><ValorComputado>{res ? BRL.format(res.custoDeCorrecao) : dash}</ValorComputado></LinhaCampo>
          <LinhaCampo label="Custo de adm" index={3}><ValorComputado>{res ? BRL.format(res.custoDeAdm) : dash}</ValorComputado></LinhaCampo>
          <LinhaCampo label="Custo total" index={4}><ValorComputado>{res ? BRL.format(res.custoTotal) : dash}</ValorComputado></LinhaCampo>
          <LinhaCampo label="Saldo Líquido" index={5}><ValorComputado>{res ? BRL.format(res.saldoLiquido) : dash}</ValorComputado></LinhaCampo>
        </BlocoVerde>
      </div>
    </div>
  )
}
