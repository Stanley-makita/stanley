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
  rendimentoMensal: '1',
  percentualLanceEmbutido: '30',
  prazoMeses: '',
  taxaAdmPercentual: '',
  indiceCorrecaoAnual: '',
  valorizacaoBemAnual: '6',
  percentualParcelaReduzida: '',
  fundoReservaPercentual: '',
  aluguelAtivo: false,
  valorAluguelSaidaMensal: '',
  valorAluguelEntradaMensal: '',
  prazoEstimadoContemplacao: '',
}

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const PCT = (v: number) => `${(v * 100).toFixed(2)}%`
// Verde mais claro que o usado no PDF — o card verde-escuro original ficava
// pesado demais pra leitura prolongada na tela.
const COR_VERDE = '#3D6B4A'

function parsePercentLocal(v: string): number {
  const n = parseFloat(v.replace(',', '.'))
  return isNaN(n) ? 0 : n / 100
}

// ── Linha "estilo planilha" — metade esquerda (rótulo) sempre verde, metade
// direita (valor) sempre branca — divisão fixa no meio do card, igual à
// planilha, em vez de uma "pílula" branca dinâmica por linha. Cada
// LinhaCampo emite 2 células-irmãs direto no grid de 2 colunas do
// BlocoVerde (ver função abaixo) — por isso não tem wrapper próprio.

function LinhaCampo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <div className="flex items-center px-3 py-1" style={{ backgroundColor: COR_VERDE }}>
        <span className="text-sm text-white leading-tight">{label}</span>
      </div>
      <div className="flex items-center justify-end px-3 py-1 bg-white">{children}</div>
    </>
  )
}

function ValorComputado({ children }: { children: React.ReactNode }) {
  return <span className="text-base font-bold text-gray-800 tabular-nums">{children}</span>
}

// ── Inputs compactos, estilo "célula de planilha" (fundo branco, fonte
// preta — mesma cor da célula de input na planilha original) ──────────────

function inputBaseClass() {
  return 'bg-transparent text-gray-800 text-base font-bold text-right outline-none placeholder:text-gray-300 w-28 tabular-nums'
}

function CampoMoeda({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const digitos = e.target.value.replace(/\D/g, '')
    onChange(digitos ? (parseInt(digitos, 10) / 100).toFixed(2) : '')
  }
  const exibicao = value ? Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''
  return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-gray-400">R$</span>
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
        className={cn(inputBaseClass(), 'w-16')}
      />
      <span className="text-xs text-gray-400">%</span>
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
      className={cn(inputBaseClass(), 'w-16')}
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
      className={cn(inputBaseClass(), 'w-36 text-left')}
    />
  )
}

// ── Bloco verde (grupo de linhas, com um separador visual interno) ─────────

function BlocoVerde({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex-1 min-w-[280px] rounded-lg overflow-hidden grid grid-cols-[3fr_2fr] auto-rows-min">
      {children}
    </div>
  )
}

function Separador() {
  return <div className="col-span-2 h-2 bg-white" />
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

  const res = resultado?.resumo
  const comp = resultado?.comparativo
  const dash = '—'

  // Campos "calculados disfarçados de input" (Taxa de Adm, Valor com lance
  // embutido, Valor Líquido da carta, Valorização do bem a.m.) respondem
  // direto do form, sem esperar o resultado completo (que só existe quando
  // TODOS os campos obrigatórios estão preenchidos) — na planilha, digitar
  // só "Valor do bem" já atualiza "Valor com lance embutido" na hora.
  const valorBemNum = Number(form.valorBem) || 0
  const valorCartaNum = Number(form.valorCarta) || 0
  const pctLanceEmbutido = parsePercentLocal(form.percentualLanceEmbutido)
  const pctTaxaAdm = parsePercentLocal(form.taxaAdmPercentual)
  const pctFundoReserva = parsePercentLocal(form.fundoReservaPercentual)
  const pctValorizacaoAnual = parsePercentLocal(form.valorizacaoBemAnual)

  const taxaAdmReaisLocal = valorCartaNum * (pctTaxaAdm + pctFundoReserva)
  const valorComLanceEmbutidoLocal = pctLanceEmbutido < 1 ? valorBemNum / (1 - pctLanceEmbutido) : 0
  const valorLiquidoDaCartaLocal = valorComLanceEmbutidoLocal * (1 - pctLanceEmbutido)
  const valorizacaoBemMensalLocal = form.valorizacaoBemAnual !== '' ? Math.pow(1 + pctValorizacaoAnual, 1 / 12) - 1 : 0

  return (
    <div className="space-y-3">
      {/* Linha 1 — Patrimônio (horizontal — única mudança pedida em relação
          à planilha, que tem isso empilhado verticalmente) */}
      <div className="rounded-lg overflow-hidden border border-gray-200">
        <div className="grid grid-cols-2">
          <div className="bg-[#F8D7DA] px-4 py-3">
            <p className="text-sm text-gray-500 flex items-center gap-1"><Home className="h-3.5 w-3.5" /> Patrimônio compra à vista</p>
            <p className="text-xl font-bold text-[#7A2E2E] tabular-nums">
              {comp ? BRL.format(comp.patrimonioCompraAVista) : dash}
            </p>
          </div>
          <div className="bg-[#D9EAD3] px-4 py-3">
            <p className="text-sm text-gray-600 flex items-center gap-1"><Landmark className="h-3.5 w-3.5" /> Patrimônio compra consórcio + aplicação</p>
            <p className="text-xl font-bold text-[#274E13] tabular-nums">
              {comp ? BRL.format(comp.patrimonioCompraConsorcio) : dash}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-6 px-4 py-1.5 bg-gray-50 border-t border-gray-100">
          <span className="text-sm text-gray-500">
            Imóvel <span className="font-semibold text-[#274E13]">{resultado ? BRL.format(resultado.linhas.at(-1)?.imovelConsorcio ?? 0) : dash}</span>
          </span>
          <span className="text-sm text-gray-500">
            Saldo <span className="font-semibold text-[#274E13]">{resultado ? BRL.format(resultado.linhas.at(-1)?.saldoAplicacao ?? 0) : dash}</span>
          </span>
        </div>
        <div className="grid grid-cols-2 border-t border-gray-100">
          <div className="px-4 py-2 border-r border-gray-100">
            <p className="text-xs text-gray-400">Prazo em anos</p>
            <p className="text-base font-bold text-gray-700">{comp ? comp.prazoEmAnos : dash}</p>
          </div>
          <div className="px-4 py-2">
            <p className="text-xs text-gray-400">CET a.a</p>
            <p className="text-base font-bold text-gray-700">{comp ? PCT(comp.cetAnual) : dash}</p>
          </div>
        </div>
      </div>

      {/* Linha 2 — 3 blocos verdes, ordem exata da planilha (G/I, K/L, N/O) */}
      <div className="flex flex-col md:flex-row gap-3">

        {/* Bloco G/I */}
        <BlocoVerde>
          <LinhaCampo label="Valor disponível líquido"><CampoMoeda value={form.valorDisponivelLiquido} onChange={(v) => set('valorDisponivelLiquido', v)} /></LinhaCampo>
          <LinhaCampo label="Valor do bem"><CampoMoeda value={form.valorBem} onChange={(v) => set('valorBem', v)} /></LinhaCampo>
          <LinhaCampo label="Valor da carta"><CampoMoeda value={form.valorCarta} onChange={(v) => set('valorCarta', v)} /></LinhaCampo>
          <LinhaCampo label="Mês do lance/Contemplação"><CampoInt value={form.mesLanceContemplacao} onChange={(v) => set('mesLanceContemplacao', v)} /></LinhaCampo>
          <LinhaCampo label="Prazo estimado de contemplação"><CampoTexto value={form.prazoEstimadoContemplacao} onChange={(v) => set('prazoEstimadoContemplacao', v)} /></LinhaCampo>
          <LinhaCampo label="Valor do lance (%)"><CampoPercent value={form.percentualLance} onChange={(v) => set('percentualLance', v)} /></LinhaCampo>
          <LinhaCampo label="Taxa de Adm"><ValorComputado>{valorCartaNum > 0 ? BRL.format(taxaAdmReaisLocal) : dash}</ValorComputado></LinhaCampo>
          <LinhaCampo label="Rendimento % a.m."><CampoPercent value={form.rendimentoMensal} onChange={(v) => set('rendimentoMensal', v)} /></LinhaCampo>
          <Separador />
          <LinhaCampo label="% Lance embutido"><CampoPercent value={form.percentualLanceEmbutido} onChange={(v) => set('percentualLanceEmbutido', v)} /></LinhaCampo>
          <LinhaCampo label="Valor com lance embutido"><ValorComputado>{valorBemNum > 0 ? BRL.format(valorComLanceEmbutidoLocal) : dash}</ValorComputado></LinhaCampo>
          <LinhaCampo label="Valor Líquido da carta"><ValorComputado>{valorBemNum > 0 ? BRL.format(valorLiquidoDaCartaLocal) : dash}</ValorComputado></LinhaCampo>
        </BlocoVerde>

        {/* Bloco K/L */}
        <BlocoVerde>
          <LinhaCampo label="Prazo em meses"><CampoInt value={form.prazoMeses} onChange={(v) => set('prazoMeses', v)} /></LinhaCampo>
          <LinhaCampo label="Tx Adm"><CampoPercent value={form.taxaAdmPercentual} onChange={(v) => set('taxaAdmPercentual', v)} /></LinhaCampo>
          <LinhaCampo label="Índice de correção (a.a.)"><CampoPercent value={form.indiceCorrecaoAnual} onChange={(v) => set('indiceCorrecaoAnual', v)} /></LinhaCampo>
          <LinhaCampo label="Valorização do bem (a.a.)"><CampoPercent value={form.valorizacaoBemAnual} onChange={(v) => set('valorizacaoBemAnual', v)} /></LinhaCampo>
          <LinhaCampo label="Valorização do bem (a.m)"><ValorComputado>{form.valorizacaoBemAnual !== '' ? PCT(valorizacaoBemMensalLocal) : dash}</ValorComputado></LinhaCampo>
          <LinhaCampo label="% da parcela reduzida"><CampoPercent value={form.percentualParcelaReduzida} onChange={(v) => set('percentualParcelaReduzida', v)} /></LinhaCampo>
          <LinhaCampo label="Fundo de reserva (%)"><CampoPercent value={form.fundoReservaPercentual} onChange={(v) => set('fundoReservaPercentual', v)} /></LinhaCampo>
          <Separador />
          <LinhaCampo label="Aluguel (X)">
            <Switch checked={form.aluguelAtivo} onCheckedChange={(v) => set('aluguelAtivo', v)} />
          </LinhaCampo>
          {form.aluguelAtivo && (
            <>
              <LinhaCampo label="Valor aluguel saída mensal"><CampoMoeda value={form.valorAluguelSaidaMensal} onChange={(v) => set('valorAluguelSaidaMensal', v)} /></LinhaCampo>
              <LinhaCampo label="Valor aluguel entrada mensal"><CampoMoeda value={form.valorAluguelEntradaMensal} onChange={(v) => set('valorAluguelEntradaMensal', v)} /></LinhaCampo>
            </>
          )}
        </BlocoVerde>

        {/* Bloco N/O — 100% resultado */}
        <BlocoVerde>
          <LinhaCampo label="Valor do lance"><ValorComputado>{res ? BRL.format(res.valorDoLance) : dash}</ValorComputado></LinhaCampo>
          <LinhaCampo label="Lance embutido"><ValorComputado>{res ? BRL.format(res.lanceEmbutido) : dash}</ValorComputado></LinhaCampo>
          <LinhaCampo label="Lance próprio"><ValorComputado>{res ? BRL.format(res.lanceProprio) : dash}</ValorComputado></LinhaCampo>
          <LinhaCampo label="Valor Líquido"><ValorComputado>{res ? BRL.format(res.valorLiquido) : dash}</ValorComputado></LinhaCampo>
          <LinhaCampo label="Devolução"><ValorComputado>{res ? BRL.format(res.devolucao) : dash}</ValorComputado></LinhaCampo>
          <Separador />
          <LinhaCampo label="Correção saldo devedor"><ValorComputado>{res ? BRL.format(res.correcaoSaldoDevedor) : dash}</ValorComputado></LinhaCampo>
          <LinhaCampo label="Correção valor da carta"><ValorComputado>{res ? BRL.format(res.correcaoValorDaCarta) : dash}</ValorComputado></LinhaCampo>
          <LinhaCampo label="Custo de correção"><ValorComputado>{res ? BRL.format(res.custoDeCorrecao) : dash}</ValorComputado></LinhaCampo>
          <LinhaCampo label="Custo de adm"><ValorComputado>{res ? BRL.format(res.custoDeAdm) : dash}</ValorComputado></LinhaCampo>
          <LinhaCampo label="Custo total"><ValorComputado>{res ? BRL.format(res.custoTotal) : dash}</ValorComputado></LinhaCampo>
          <LinhaCampo label="Saldo Líquido"><ValorComputado>{res ? BRL.format(res.saldoLiquido) : dash}</ValorComputado></LinhaCampo>
        </BlocoVerde>
      </div>
    </div>
  )
}
