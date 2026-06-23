'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Calculator, Clock, Download, Eye, Printer, Save } from 'lucide-react'
import { toast } from 'sonner'
import { calcularCustas, calcIofVisivel } from '@/lib/simulador/calcular'
import { useItbiConfig, useCustasConfig } from '@/hooks/simulador/useSimuladorConfig'
import { useSalvarSimulacao, useHistoricoSimulacoes } from '@/hooks/simulador/useSalvarSimulacao'
import type {
  EntradaSimulador,
  ResultadoSimulador,
  Modalidade,
  Produto,
  TipoImovel,
  SimNaoPerguntar,
} from '@/types/simulador'
import { MODALIDADE_LABELS } from '@/types/simulador'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const DASH = '—'

const CIDADES_REGIAO = ['Curitiba', 'Londrina', 'Mandaguaçu', 'Marialva', 'Maringá', 'Paiçandu', 'Sarandi']

const BANCOS_PRIORITY = ['Caixa Econômica Federal', 'Itaú', 'Santander', 'Bradesco']

function entradaParaForm(e: EntradaSimulador): Partial<FormState> {
  return {
    tipoImovel: e.tipoImovel,
    cidade: e.cidade,
    valorCV: fmtInput(e.valorCV),
    valorFinanciado: fmtInput(e.valorFinanciado),
    valorTerreno: fmtInput(e.valorTerreno),
    servicoRegistro: fmtInput(e.servicoRegistro),
    valorCertidoes: fmtInput(e.valorCertidoes),
    contratoParticular: fmtInput(e.contratoParticular),
    primeiraAquisicao: e.primeiraAquisicao,
    isentoFunRejus: e.isentoFunRejus,
    banco: e.banco,
    modalidade: e.modalidade,
    produto: e.produto,
    iof: fmtInput(e.iof),
  }
}

function parseBRL(s: string): number {
  if (!s) return 0
  const clean = s.replace(/\./g, '').replace(',', '.').replace(/[^\d.]/g, '')
  return parseFloat(clean) || 0
}

function fmtInput(v: number): string {
  if (!v) return ''
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)
}

interface FormState {
  tipoImovel: TipoImovel
  cidade: string
  valorCV: string
  valorFinanciado: string
  valorTerreno: string
  servicoRegistro: string
  valorCertidoes: string
  contratoParticular: string
  primeiraAquisicao: SimNaoPerguntar
  isentoFunRejus: SimNaoPerguntar
  banco: string
  modalidade: Modalidade | ''
  produto: Produto | ''
  iof: string
}

const FORM_VAZIO: FormState = {
  tipoImovel: 'Residencial',
  cidade: 'Maringá',
  valorCV: '',
  valorFinanciado: '',
  valorTerreno: '',
  servicoRegistro: '',
  valorCertidoes: '',
  contratoParticular: '',
  primeiraAquisicao: 'perguntar',
  isentoFunRejus: 'perguntar',
  banco: '',
  modalidade: '',
  produto: '',
  iof: '',
}

interface Props {
  processoId?: string
  leadId?: string
  numero?: string
  bancoNomeInicial?: string
  valorCVInicial?: number
  valorFinanciadoInicial?: number
  clienteNome?: string
  responsavelNome?: string
  entradaInicial?: EntradaSimulador
  onResultadoChange?: (r: ResultadoSimulador | null) => void
  modoAvulso?: boolean  // Central de Simulações: oculta aba Histórico e botão Salvar interno
}

// ── Currency input ────────────────────────────────────────────────────────────
function CI({
  value,
  onChange,
  placeholder = 'R$ 0,00',
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '')
    if (!raw) { onChange(''); return }
    onChange(fmtInput(parseInt(raw, 10) / 100))
  }
  return (
    <Input
      className="h-7 text-xs px-2"
      placeholder={placeholder}
      value={value ? `R$ ${value}` : ''}
      onChange={handleChange}
    />
  )
}

// ── Sel helper ────────────────────────────────────────────────────────────────
function Sel<T extends string>({
  value,
  onChange,
  placeholder,
  options,
}: {
  value: T | ''
  onChange: (v: T) => void
  placeholder?: string
  options: { value: T; label: string }[]
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as T)}>
      <SelectTrigger className="h-7 text-xs px-2">
        <SelectValue placeholder={placeholder ?? 'Selecione'} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

// ── Row helper ────────────────────────────────────────────────────────────────
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <div className="flex items-center h-8 text-xs text-gray-600 font-medium pr-2 border-b border-gray-100 last:border-0">
        {label}
      </div>
      <div className="flex items-center h-8 pr-2 border-b border-gray-100 last:border-0">
        {children}
      </div>
    </>
  )
}

// ── Histórico ─────────────────────────────────────────────────────────────────
function PainelHistorico({
  historico,
  clienteNome,
  responsavelNome,
}: {
  historico: ReturnType<typeof useHistoricoSimulacoes>['data']
  clienteNome?: string
  responsavelNome?: string
}) {
  if (!historico || historico.length === 0) {
    return <p className="text-center text-gray-400 text-sm py-10">Nenhuma simulação salva ainda.</p>
  }

  return (
    <div className="space-y-3">
      {historico.map((sim) => {
        const res = sim.resultado_json as ResultadoSimulador | undefined
        return (
          <div key={sim.id} className="border border-gray-200 rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">{sim.banco_nome}</Badge>
                <span className="text-xs text-gray-400">{sim.municipio}</span>
              </div>
              <span className="text-xs text-gray-400">
                {format(new Date(sim.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div><p className="text-xs text-gray-400">C&V</p><p className="font-medium text-fonti-primary">{BRL.format(sim.valor_imovel)}</p></div>
              <div><p className="text-xs text-gray-400">Sem Desconto</p><p className="font-bold text-fonti-primary">{BRL.format(sim.total_custas)}</p></div>
              <div><p className="text-xs text-gray-400">Com Desconto</p><p className="font-bold text-[#1E7B34]">{BRL.format(res?.totalComDesconto ?? sim.total_custas)}</p></div>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="text-xs border-fonti-primary text-fonti-primary hover:bg-fonti-accent-hover gap-1.5"
                onClick={async () => {
                  if (!res) return
                  try {
                    const { gerarPDFSimulacao } = await import('./gerarPDF')
                    await gerarPDFSimulacao(res, {
                      clienteNome,
                      responsavelNome,
                      valorAssessoria: res.entrada.servicoRegistro,
                      valorContratoServico: res.entrada.contratoParticular,
                      mode: 'preview',
                    })
                  } catch (err) {
                    console.error('Erro ao gerar preview:', err)
                    toast.error('Não foi possível abrir a visualização. Tente o botão de download.')
                  }
                }}
              >
                <Eye className="h-3.5 w-3.5" /> Ver
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-xs border-fonti-accent text-fonti-primary hover:bg-fonti-accent-hover gap-1.5"
                onClick={async () => {
                  if (!res) return
                  const { gerarPDFSimulacao } = await import('./gerarPDF')
                  await gerarPDFSimulacao(res, {
                    clienteNome,
                    responsavelNome,
                    valorAssessoria: res.entrada.servicoRegistro,
                    valorContratoServico: res.entrada.contratoParticular,
                  })
                }}
              >
                <Download className="h-3.5 w-3.5" /> Baixar
              </Button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export function SimuladorCustas({
  processoId,
  leadId,
  numero,
  bancoNomeInicial = '',
  valorCVInicial = 0,
  valorFinanciadoInicial = 0,
  clienteNome,
  responsavelNome,
  entradaInicial,
  onResultadoChange,
  modoAvulso = false,
}: Props) {
  const { data: itbiConfigs = [] } = useItbiConfig()
  const { data: custasConfigs = [] } = useCustasConfig()
  const { data: historico = [] } = useHistoricoSimulacoes(processoId, leadId)
  const salvar = useSalvarSimulacao()

  const [form, setForm] = useState<FormState>(() => ({
    ...FORM_VAZIO,
    banco: bancoNomeInicial,
    valorCV: valorCVInicial ? fmtInput(valorCVInicial) : '',
    valorFinanciado: valorFinanciadoInicial ? fmtInput(valorFinanciadoInicial) : '',
    ...(entradaInicial ? entradaParaForm(entradaInicial) : {}),
  }))
  const [abaAtiva, setAbaAtiva] = useState<'simulador' | 'historico'>('simulador')
  const jaCarregouHistorico = useRef(false)

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }))

  useEffect(() => { if (bancoNomeInicial) set('banco', bancoNomeInicial) }, [bancoNomeInicial])

  // Opção C: pré-preenche o formulário com a última simulação salva
  useEffect(() => {
    if (jaCarregouHistorico.current || historico.length === 0) return
    const ultima = historico[0].resultado_json as ResultadoSimulador | undefined
    if (!ultima?.entrada) return
    jaCarregouHistorico.current = true
    setForm((f) => ({ ...f, ...entradaParaForm(ultima.entrada) }))
  }, [historico])

  const cidadesDisponiveis = useMemo(() => {
    const fromDb = itbiConfigs.map((c) => c.municipio)
    return Array.from(new Set([...CIDADES_REGIAO, ...fromDb])).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [itbiConfigs])
  const bancosDisponiveis = useMemo(() => {
    const fromDb = custasConfigs.map((c) => c.bancoNome)
    const extras = fromDb.filter((b) => !BANCOS_PRIORITY.some((p) => p.toLowerCase() === b.toLowerCase()))
    return [...BANCOS_PRIORITY, ...extras.sort((a, b) => a.localeCompare(b, 'pt-BR'))]
  }, [custasConfigs])

  const itbiSelecionado = useMemo(
    () => itbiConfigs.find((c) => c.municipio.toLowerCase() === form.cidade.toLowerCase()),
    [itbiConfigs, form.cidade],
  )
  const custasDosBanco = useMemo(
    () => custasConfigs.find((c) => c.bancoNome.toLowerCase() === form.banco.toLowerCase()),
    [custasConfigs, form.banco],
  )

  const recursosPropriosValue = useMemo(
    () => Math.max(0, parseBRL(form.valorCV) - parseBRL(form.valorFinanciado)),
    [form.valorCV, form.valorFinanciado],
  )

  const isTC = form.modalidade === 'terreno_construcao'

  const iofVisivel = useMemo(
    () =>
      form.modalidade
        ? calcIofVisivel({ tipoImovel: form.tipoImovel, modalidade: form.modalidade as Modalidade, banco: form.banco })
        : false,
    [form.tipoImovel, form.modalidade, form.banco],
  )

  // Reactive calculation — runs whenever form changes
  const resultado = useMemo((): ResultadoSimulador | null => {
    const cv = parseBRL(form.valorCV)
    const fi = parseBRL(form.valorFinanciado)
    if (!cv || !fi || !form.banco || !form.cidade || !form.modalidade || !form.produto) return null
    if (isTC && !parseBRL(form.valorTerreno)) return null
    const entrada: EntradaSimulador = {
      tipoImovel: form.tipoImovel,
      cidade: form.cidade,
      valorCV: cv,
      valorFinanciado: fi,
      valorTerreno: parseBRL(form.valorTerreno),
      servicoRegistro: parseBRL(form.servicoRegistro),
      valorCertidoes: parseBRL(form.valorCertidoes),
      contratoParticular: parseBRL(form.contratoParticular),
      primeiraAquisicao: form.primeiraAquisicao,
      isentoFunRejus: form.isentoFunRejus,
      banco: form.banco,
      modalidade: form.modalidade as Modalidade,
      produto: form.produto as Produto,
      iof: iofVisivel ? parseBRL(form.iof) : 0,
      iofVisivel,
    }
    return calcularCustas(entrada, itbiSelecionado, custasDosBanco)
  }, [form, isTC, iofVisivel, itbiSelecionado, custasDosBanco])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { onResultadoChange?.(resultado) }, [resultado])

  const linhasVisiveis = resultado?.linhas.filter((l) => l.visivel) ?? []

  async function salvarSimulacao() {
    if (!resultado) return
    await salvar.mutateAsync({ processoId, leadId, resultado })
    toast.success('Simulação salva no histórico')
  }

  async function baixarPDF() {
    if (!resultado) return
    // Auto-salva no histórico antes de gerar o PDF
    if (processoId || leadId) {
      await salvar.mutateAsync({ processoId, leadId, resultado })
    }
    const { gerarPDFSimulacao } = await import('./gerarPDF')
    await gerarPDFSimulacao(resultado, {
      numero,
      clienteNome,
      responsavelNome,
      valorAssessoria: parseBRL(form.servicoRegistro),
      valorContratoServico: parseBRL(form.contratoParticular),
    })
  }

  return (
    <div className={modoAvulso ? 'h-full flex flex-col' : 'space-y-4'}>
      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 shrink-0">
        <button
          onClick={() => setAbaAtiva('simulador')}
          className={`px-4 py-2 text-xs font-medium rounded-t-lg border-b-2 transition-colors ${
            abaAtiva === 'simulador'
              ? 'border-fonti-primary text-fonti-primary'
              : 'border-transparent text-gray-400 hover:text-gray-600'
          }`}
        >
          <span className="flex items-center gap-1.5"><Calculator className="h-3.5 w-3.5" />Simulador</span>
        </button>
        {!modoAvulso && (
          <button
            onClick={() => setAbaAtiva('historico')}
            className={`px-4 py-2 text-xs font-medium rounded-t-lg border-b-2 transition-colors ${
              abaAtiva === 'historico'
                ? 'border-fonti-primary text-fonti-primary'
                : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}
          >
            <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />Histórico ({historico.length})</span>
          </button>
        )}
      </div>

      {!modoAvulso && abaAtiva === 'historico' && (
        <PainelHistorico historico={historico} clienteNome={clienteNome} responsavelNome={responsavelNome} />
      )}

      {abaAtiva === 'simulador' && (
        <div className={`rounded-2xl border-2 border-fonti-primary overflow-hidden${modoAvulso ? ' flex-1 min-h-0 flex flex-col' : ''}`}>

          {/* ── Cabeçalho ─────────────────────────────────────────── */}
          <div className="flex items-center justify-between gap-4 px-5 py-3 bg-white border-b border-gray-100">
            <div className="flex items-center gap-3 min-w-0">
              <Calculator className="h-5 w-5 text-fonti-primary shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-bold text-fonti-primary leading-tight">
                  Cálculo de estimativa de custas para contratação de Financiamento
                </p>
                {clienteNome && (
                  <p className="text-sm font-semibold text-[#5B8C5A] mt-0.5">{clienteNome}</p>
                )}
              </div>
            </div>
            {responsavelNome && (
              <span className="text-xs text-gray-400 shrink-0">Usuário: {responsavelNome}</span>
            )}
          </div>

          {/* ── Corpo: formulário | resultados ────────────────────── */}
          <div className={`flex min-h-0${modoAvulso ? ' flex-1 overflow-y-auto' : ''}`}>

            {/* Formulário: col labels + col inputs */}
            <div
              className="shrink-0 bg-[#F2F0E8] border-r border-[#D5CFA8]"
              style={{ width: 340 }}
            >
              <div className="grid grid-cols-2 px-3 pt-2 pb-1">
                {/* Header */}
                <div className="col-span-2 pb-1 mb-1 border-b border-[#D5CFA8]">
                  <p className="text-[10px] font-semibold text-fonti-primary uppercase tracking-wide">Dados da Operação</p>
                </div>

                <Row label="Tipo de Imóvel">
                  <Sel<TipoImovel>
                    value={form.tipoImovel}
                    onChange={(v) => set('tipoImovel', v)}
                    options={[{ value: 'Residencial', label: 'Residencial' }, { value: 'Comercial', label: 'Comercial' }]}
                  />
                </Row>

                <Row label="Cidade do Imóvel">
                  <Sel<string>
                    value={form.cidade}
                    onChange={(v) => set('cidade', v)}
                    placeholder="Selecione"
                    options={cidadesDisponiveis.map((c) => ({ value: c, label: c }))}
                  />
                </Row>

                <Row label="Valor C&V">
                  <CI value={form.valorCV} onChange={(v) => set('valorCV', v)} />
                </Row>

                <Row label="Valor Financiado">
                  <CI value={form.valorFinanciado} onChange={(v) => set('valorFinanciado', v)} />
                </Row>

                <Row label="Recursos Próprios">
                  <div className="h-7 flex items-center px-2 bg-white/60 border border-[#D5CFA8] rounded-md text-xs font-semibold text-fonti-primary w-full">
                    {BRL.format(recursosPropriosValue)}
                  </div>
                </Row>

                {isTC && (
                  <Row label="Valor do Terreno">
                    <CI value={form.valorTerreno} onChange={(v) => set('valorTerreno', v)} />
                  </Row>
                )}

                <Row label="Serviço de Registro">
                  <CI value={form.servicoRegistro} onChange={(v) => set('servicoRegistro', v)} />
                </Row>

                <Row label="Valor Certidões">
                  <CI value={form.valorCertidoes} onChange={(v) => set('valorCertidoes', v)} />
                </Row>

                <Row label="Contrato Particular">
                  <CI value={form.contratoParticular} onChange={(v) => set('contratoParticular', v)} />
                </Row>

                {/* Separator */}
                <div className="col-span-2 mt-1 mb-1 border-t border-[#D5CFA8]">
                  <p className="text-[10px] font-semibold text-fonti-primary uppercase tracking-wide pt-1">Parâmetros</p>
                </div>

                <Row label="1ª Aquisição">
                  <Sel<SimNaoPerguntar>
                    value={form.primeiraAquisicao}
                    onChange={(v) => set('primeiraAquisicao', v)}
                    options={[
                      { value: 'perguntar', label: 'A confirmar' },
                      { value: 'sim', label: 'Sim' },
                      { value: 'nao', label: 'Não' },
                    ]}
                  />
                </Row>

                <Row label="Isento FunRejus">
                  <Sel<SimNaoPerguntar>
                    value={form.isentoFunRejus}
                    onChange={(v) => set('isentoFunRejus', v)}
                    options={[
                      { value: 'perguntar', label: 'A confirmar' },
                      { value: 'sim', label: 'Sim' },
                      { value: 'nao', label: 'Não' },
                    ]}
                  />
                </Row>

                <Row label="Banco">
                  <Sel<string>
                    value={form.banco}
                    onChange={(v) => set('banco', v)}
                    placeholder="Selecione"
                    options={bancosDisponiveis.map((b) => ({ value: b, label: b }))}
                  />
                </Row>

                <Row label="Modalidade">
                  <Sel<Modalidade>
                    value={form.modalidade as Modalidade}
                    onChange={(v) => set('modalidade', v)}
                    placeholder="Selecione"
                    options={(Object.entries(MODALIDADE_LABELS) as [Modalidade, string][]).map(([k, v]) => ({ value: k, label: v }))}
                  />
                </Row>

                <Row label="Produto">
                  <Sel<Produto>
                    value={form.produto as Produto}
                    onChange={(v) => set('produto', v)}
                    placeholder="Selecione"
                    options={[
                      { value: 'SBPE', label: 'SBPE' },
                      { value: 'PMCMV', label: 'PMCMV' },
                      { value: 'Pro_Cotista', label: 'Pro-Cotista' },
                    ]}
                  />
                </Row>

                {iofVisivel && (
                  <Row label="IOF">
                    <CI value={form.iof} onChange={(v) => set('iof', v)} />
                  </Row>
                )}
              </div>
            </div>

            {/* Resultados */}
            <div className="flex-1 min-w-0 flex flex-col">
              {/* Tabela de itens */}
              <div className="flex-1">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-[#F8F8F5] border-b border-gray-200">
                      <th className="text-left font-semibold text-gray-500 px-3 py-2">Item</th>
                      <th className="text-right font-semibold text-gray-500 px-3 py-2 w-28">Sem Desconto</th>
                      <th className="text-right font-semibold text-[#1E7B34] px-3 py-2 w-28">Com Desconto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resultado
                      ? linhasVisiveis.map((linha, idx) => {
                          const menor = linha.comDesconto < linha.semDesconto
                          return (
                            <tr
                              key={linha.id}
                              className={`border-b border-gray-100 ${idx % 2 === 1 ? 'bg-gray-50/60' : 'bg-white'}`}
                            >
                              <td className="px-3 py-2 text-gray-700 leading-snug">{linha.label}</td>
                              <td className="px-3 py-2 text-right font-medium text-gray-700 whitespace-nowrap">
                                {BRL.format(linha.semDesconto)}
                              </td>
                              <td className={`px-3 py-2 text-right font-medium whitespace-nowrap ${menor ? 'text-[#1E7B34] font-bold' : 'text-gray-700'}`}>
                                {BRL.format(linha.comDesconto)}
                              </td>
                            </tr>
                          )
                        })
                      : (
                        <tr>
                          <td colSpan={3} className="px-3 py-8 text-center text-gray-300 text-xs">
                            Preencha os campos obrigatórios para ver os resultados
                          </td>
                        </tr>
                      )
                    }
                  </tbody>
                </table>
              </div>

              {/* Estimativas de Despesas */}
              <div className="bg-fonti-primary px-4 py-3 flex items-center justify-between gap-4 shrink-0">
                <p className="text-xs font-bold text-white uppercase tracking-wide">Estimativas de Despesas</p>
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <p className="text-[10px] text-white/60">Sem Desconto</p>
                    <p className="text-sm font-bold text-white">
                      {resultado ? BRL.format(resultado.totalSemDesconto) : DASH}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-[#A8E6B0]">Com Desconto</p>
                    <p className="text-sm font-bold text-[#A8E6B0]">
                      {resultado ? BRL.format(resultado.totalComDesconto) : DASH}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Rodapé: percentuais + botões ──────────────────────── */}
          <div className="flex items-center justify-between gap-3 px-5 py-2.5 bg-[#F2F0E8] border-t border-[#D5CFA8] shrink-0">
            <div className="flex items-center gap-3 text-xs text-[#5B8C5A] font-medium flex-wrap">
              {resultado ? (
                <>
                  <span>{resultado.percentualSemDesconto.toFixed(1)}% do C&V (sem desc.)</span>
                  <span className="text-[#D5CFA8]">|</span>
                  <span>{resultado.percentualComDesconto.toFixed(1)}% do C&V (com desc.)</span>
                </>
              ) : (
                <span className="text-gray-300 text-xs">Preencha os campos obrigatórios para calcular</span>
              )}
            </div>
            <div className="flex gap-2 shrink-0">
              {!modoAvulso && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs border-fonti-accent text-fonti-primary hover:bg-fonti-accent-hover gap-1"
                  onClick={salvarSimulacao}
                  disabled={!resultado || salvar.isPending}
                >
                  <Save className="h-3 w-3" /> Salvar
                </Button>
              )}
              <Button
                size="sm"
                className="h-7 text-xs bg-fonti-primary hover:bg-fonti-primary-hover text-white gap-1"
                onClick={baixarPDF}
                disabled={!resultado}
              >
                <Printer className="h-3 w-3" /> Imprimir PDF
              </Button>
            </div>
          </div>

        </div>
      )}
    </div>
  )
}
