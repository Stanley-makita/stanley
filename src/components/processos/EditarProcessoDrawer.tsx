'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import { useBancos } from '@/hooks/useBancos'
import { useAtualizarDadosProcesso } from '@/hooks/processos/useProcessos'
import { useComissoesPadrao } from '@/hooks/configuracoes/useComissoesPadrao'
import type { Processo } from '@/types/processos'

const MODALIDADES = [
  'SFI', 'SBPE', 'PMCMV', 'Pro_Cotista', 'CGI', 'Contrato', 'Consorcio',
] as const

const SISTEMAS_AMORTIZACAO = [
  { value: 'SAC',   label: 'SAC — Amortização Constante' },
  { value: 'PRICE', label: 'PRICE — Tabela Price' },
] as const

const INDEXADORES = [
  { value: 'TR',   label: 'TR — Taxa Referencial' },
  { value: 'IPCA', label: 'IPCA — Índice de Preços' },
] as const

const numField = z.number().or(z.nan()).nullable()

const schema = z.object({
  numero_proposta:                 z.string().nullable(),
  banco_id:                        z.string().min(1, 'Selecione o banco'),
  modalidade:                      z.string().min(1),
  taxa_juros:                      z.number({ error: 'Informe a taxa de juros' })
                                     .refine((v) => v > 0, 'A taxa deve ser maior que 0'),
  tem_assessoria:                  z.boolean(),
  valor_assessoria:                numField,
  valor_imovel:                    z.number({ error: 'Informe o valor do imóvel' })
                                     .refine((v) => v > 0, 'O valor do imóvel deve ser positivo'),
  valor_financiado:                z.number({ error: 'Informe o valor financiado' })
                                     .refine((v) => v > 0, 'O valor financiado deve ser positivo'),
  valor_fgts:                      z.number().min(0).nullable(),
  prazo_amortizacao_meses:         z.number().int().positive().nullable()
                                     .or(z.nan().transform(() => null)),
  dia_vencimento_parcela:          z.number().int().min(1).max(28).nullable()
                                     .or(z.nan().transform(() => null)),
  sistema_amortizacao:             z.enum(['SAC', 'PRICE']),
  indexador:                       z.enum(['TR', 'IPCA']).nullable(),
  financiar_despesas_cartorariais: z.boolean(),
})

type FormData = z.infer<typeof schema>

function normNum(v: number | null | undefined): number | null {
  if (v == null || isNaN(v)) return null
  return v
}

function fmtMoeda(v: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency', currency: 'BRL', maximumFractionDigits: 0,
  }).format(v)
}

function initFgtsOpcao(p: Processo): boolean | null {
  const vf = (p as any).valor_fgts as number | null | undefined
  if (vf === null || vf === undefined) return null
  return vf > 0
}

function buildDefaults(proc: Processo): Partial<FormData> {
  const pa = proc as any
  return {
    numero_proposta:                 proc.numero_proposta ?? null,
    banco_id:                        proc.banco_id ?? '',
    modalidade:                      proc.modalidade,
    taxa_juros:                      pa.taxa_juros ?? undefined,
    tem_assessoria:                  proc.tem_assessoria,
    valor_assessoria:                proc.valor_assessoria ?? null,
    valor_imovel:                    proc.valor_imovel ?? undefined,
    valor_financiado:                proc.valor_financiado ?? undefined,
    valor_fgts:                      pa.valor_fgts ?? null,
    prazo_amortizacao_meses:         pa.prazo_amortizacao_meses ?? null,
    dia_vencimento_parcela:          pa.dia_vencimento_parcela ?? null,
    sistema_amortizacao:             pa.sistema_amortizacao as ('SAC' | 'PRICE') | undefined,
    indexador:                       pa.indexador as ('TR' | 'IPCA') | null ?? null,
    financiar_despesas_cartorariais: pa.financiar_despesas_cartorariais ?? false,
  }
}

interface Props {
  aberto: boolean
  onFechar: () => void
  processo: Processo
}

export function EditarProcessoDrawer({ aberto, onFechar, processo }: Props) {
  const { data: bancos = [] } = useBancos()
  const { data: comissoesPadrao = [] } = useComissoesPadrao()
  const { mutateAsync, isPending } = useAtualizarDadosProcesso()
  const p = processo as any
  // Modalidade tambem controla o fluxo do processo (Financiamento <-> Registro).
  // Enquanto em Registro, "Modalidade" nao e um produto de financiamento valido
  // (nao esta em MODALIDADES) — nao deixa editar nem reenviar aqui, senao o
  // save de dados financeiros derruba o processo de volta pro fluxo errado.
  const emFluxoRegistro = processo.modalidade === 'Registro'

  const [comissaoComercial, setComissaoComercial] = useState<number | null>(p.comissao_comercial ?? null)
  const [comissaoEmpresa,   setComissaoEmpresa]   = useState<number | null>(p.comissao_empresa ?? null)
  // null = não declarado | true = usará FGTS | false = não usará FGTS
  const [fgtsOpcao, setFgtsOpcao] = useState<boolean | null>(initFgtsOpcao(processo))
  const [fgtsErro,  setFgtsErro]  = useState('')

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: buildDefaults(processo),
  })

  useEffect(() => {
    if (aberto) {
      const pa = processo as any
      setComissaoComercial(pa.comissao_comercial ?? null)
      setComissaoEmpresa(pa.comissao_empresa ?? null)
      setFgtsOpcao(initFgtsOpcao(processo))
      setFgtsErro('')
      form.reset(buildDefaults(processo))
    }
  }, [aberto, processo, form])

  // ── Cálculo automático de Recursos Próprios ─────────────────────────────────
  const valorImovel    = (form.watch('valor_imovel')   as number) || 0
  const valorFinanciado = (form.watch('valor_financiado') as number) || 0
  const valorFgtsInput = form.watch('valor_fgts') ?? 0
  const valorFgtsEfetivo = fgtsOpcao === true ? (valorFgtsInput || 0) : 0
  const recursosProprios = valorImovel - valorFinanciado - valorFgtsEfetivo

  const temAssessoria = form.watch('tem_assessoria')
  const errors = form.formState.errors

  // ── Submit ──────────────────────────────────────────────────────────────────
  async function onSubmit(dados: FormData) {
    // FGTS obrigatoriamente declarado
    if (fgtsOpcao === null) {
      setFgtsErro('Declare se utilizará FGTS nesta operação')
      return
    }
    if (fgtsOpcao === true && (!dados.valor_fgts || dados.valor_fgts <= 0)) {
      setFgtsErro('Informe o valor do FGTS')
      return
    }
    setFgtsErro('')

    // Consistência financeira: Imóvel = Financiado + FGTS + Recursos Próprios
    if (recursosProprios < 0) {
      const diferenca = Math.abs(recursosProprios)
      toast.error('Os valores financeiros da operação não fecham.', {
        description:
          `Imóvel: ${fmtMoeda(valorImovel)} | Financiado: ${fmtMoeda(valorFinanciado)} | `
          + `FGTS: ${fmtMoeda(valorFgtsEfetivo)} | Recursos próprios: ${fmtMoeda(recursosProprios)} | `
          + `Diferença: ${fmtMoeda(diferenca)}`,
        duration: 8000,
      })
      return
    }

    try {
      await mutateAsync({
        processoId:                     processo.id,
        numero_proposta:                dados.numero_proposta?.trim() || null,
        banco_id:                       dados.banco_id,
        ...(emFluxoRegistro ? {} : { modalidade: dados.modalidade }),
        taxa_juros:                     dados.taxa_juros,
        tem_assessoria:                 dados.tem_assessoria,
        valor_assessoria:               dados.tem_assessoria ? normNum(dados.valor_assessoria) : null,
        valor_imovel:                   normNum(dados.valor_imovel),
        valor_financiado:               normNum(dados.valor_financiado),
        valor_fgts:                     fgtsOpcao ? normNum(dados.valor_fgts) : 0,
        valor_recursos_proprios:        recursosProprios,
        comissao_comercial:             comissaoComercial,
        comissao_empresa:               comissaoEmpresa,
        prazo_amortizacao_meses:        dados.prazo_amortizacao_meses ?? null,
        dia_vencimento_parcela:         dados.dia_vencimento_parcela ?? null,
        sistema_amortizacao:            dados.sistema_amortizacao,
        indexador:                      dados.indexador ?? null,
        financiar_despesas_cartorariais: dados.financiar_despesas_cartorariais,
      })
      toast.success('Dados financeiros atualizados com sucesso.')
      onFechar()
    } catch {
      toast.error('Não foi possível salvar. Tente novamente.')
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={(open) => { if (!open) onFechar() }}>
      <DialogContent className="max-h-[92svh] w-[calc(100vw-1rem)] max-w-md overflow-y-auto sm:w-full">
        <DialogHeader>
          <DialogTitle className="text-fonti-primary">Dados do Negócio</DialogTitle>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="mt-6 space-y-5">

          {/* ── Nº da Proposta ────────────────────────────────────────────── */}
          <div className="space-y-1.5">
            <Label>Nº da Proposta</Label>
            <Input
              placeholder="Nº dado pelo banco"
              value={form.watch('numero_proposta') ?? ''}
              onChange={(e) => form.setValue('numero_proposta', e.target.value || null)}
            />
          </div>

          {/* ── Banco ─────────────────────────────────────────────────────── */}
          <div className="space-y-1.5">
            <Label>Banco <span className="text-red-500">*</span></Label>
            <Select
              value={form.watch('banco_id') || ''}
              onValueChange={(v) => {
                form.setValue('banco_id', v, { shouldValidate: true })
                const cp = comissoesPadrao.find(c => c.banco_id === v)
                setComissaoComercial(cp?.comissao_comercial ?? null)
                setComissaoEmpresa(cp?.comissao_empresa ?? null)
              }}
            >
              <SelectTrigger className={errors.banco_id ? 'border-red-400' : ''}>
                <SelectValue placeholder="Selecionar banco *" />
              </SelectTrigger>
              <SelectContent>
                {bancos.map((b) => (
                  <SelectItem key={b.id} value={b.id}>{b.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.banco_id && (
              <p className="text-xs text-red-500">{errors.banco_id.message}</p>
            )}
          </div>

          {/* ── Modalidade ────────────────────────────────────────────────── */}
          <div className="space-y-1.5">
            <Label>Modalidade <span className="text-red-500">*</span></Label>
            {emFluxoRegistro ? (
              <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500">
                Em fluxo de Registro
                {processo.modalidade_origem && <span className="text-gray-400"> (produto original: {processo.modalidade_origem})</span>}
              </div>
            ) : (
              <Select
                value={form.watch('modalidade')}
                onValueChange={(v) => form.setValue('modalidade', v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MODALIDADES.map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* ── Taxa de juros ──────────────────────────────────────────────── */}
          <div className="space-y-1.5">
            <Label>
              Taxa de juros (% a.a.) <span className="text-red-500">*</span>
            </Label>
            <div className="relative">
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="ex: 11.29"
                className={`pr-8 ${errors.taxa_juros ? 'border-red-400' : ''}`}
                {...form.register('taxa_juros', { valueAsNumber: true })}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                %
              </span>
            </div>
            {errors.taxa_juros && (
              <p className="text-xs text-red-500">{errors.taxa_juros.message}</p>
            )}
          </div>

          {/* ── Valores do imóvel ─────────────────────────────────────────── */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Valor do Imóvel (R$) <span className="text-red-500">*</span></Label>
              <Input
                type="number"
                placeholder="0"
                min="0"
                className={errors.valor_imovel ? 'border-red-400' : ''}
                {...form.register('valor_imovel', { valueAsNumber: true })}
              />
              {errors.valor_imovel && (
                <p className="text-xs text-red-500">{errors.valor_imovel.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Valor Financiado (R$) <span className="text-red-500">*</span></Label>
              <Input
                type="number"
                placeholder="0"
                min="0"
                className={errors.valor_financiado ? 'border-red-400' : ''}
                {...form.register('valor_financiado', { valueAsNumber: true })}
              />
              {errors.valor_financiado && (
                <p className="text-xs text-red-500">{errors.valor_financiado.message}</p>
              )}
            </div>
          </div>

          {/* ── FGTS ──────────────────────────────────────────────────────── */}
          <div className="space-y-3 rounded-lg border border-gray-200 p-4">
            <div>
              <Label>FGTS <span className="text-red-500">*</span></Label>
              <p className="mt-0.5 text-[11px] text-gray-400">
                Declare obrigatoriamente a intenção de uso do FGTS
              </p>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setFgtsOpcao(true); setFgtsErro('') }}
                className={`flex-1 rounded-lg border py-2 text-sm font-medium transition-colors ${
                  fgtsOpcao === true
                    ? 'border-fonti-primary bg-fonti-primary text-white'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                Utilizará FGTS
              </button>
              <button
                type="button"
                onClick={() => {
                  setFgtsOpcao(false)
                  setFgtsErro('')
                  form.setValue('valor_fgts', null)
                }}
                className={`flex-1 rounded-lg border py-2 text-sm font-medium transition-colors ${
                  fgtsOpcao === false
                    ? 'border-fonti-primary bg-fonti-primary text-white'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                Não utilizará FGTS
              </button>
            </div>

            {fgtsOpcao === true && (
              <div className="space-y-1.5">
                <Label>Valor do FGTS (R$) <span className="text-red-500">*</span></Label>
                <Input
                  type="number"
                  placeholder="0"
                  min="1"
                  {...form.register('valor_fgts', { valueAsNumber: true })}
                />
              </div>
            )}

            {fgtsOpcao === false && (
              <p className="rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-500">
                FGTS: <span className="font-medium">R$ 0,00</span> — não será utilizado nesta operação
              </p>
            )}

            {fgtsErro && <p className="text-xs text-red-500">{fgtsErro}</p>}
          </div>

          {/* ── Recursos Próprios (calculado) ──────────────────────────────── */}
          <div className="space-y-1.5">
            <Label className="text-gray-600">Recursos Próprios (calculado automaticamente)</Label>
            <div
              className={`flex h-9 items-center rounded-md border px-3 text-sm font-semibold ${
                recursosProprios < 0
                  ? 'border-red-300 bg-red-50 text-red-600'
                  : 'border-gray-200 bg-gray-50 text-fonti-primary'
              }`}
            >
              {fmtMoeda(recursosProprios)}
              {recursosProprios < 0 && (
                <span className="ml-2 text-xs font-normal">⚠ inconsistência</span>
              )}
            </div>
            <p className="text-[11px] text-gray-400">
              {fmtMoeda(valorImovel)} − {fmtMoeda(valorFinanciado)} − {fmtMoeda(valorFgtsEfetivo)} = {fmtMoeda(recursosProprios)}
            </p>
          </div>

          {/* ── Condições do Financiamento ─────────────────────────────────── */}
          <div className="space-y-4 rounded-lg border border-gray-200 p-4">
            <p className="text-sm font-medium text-fonti-primary">Condições do Financiamento</p>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Prazo (meses)</Label>
                <Input
                  type="number"
                  placeholder="360"
                  min={1}
                  {...form.register('prazo_amortizacao_meses', { valueAsNumber: true })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Dia vencimento (1–28)</Label>
                <Input
                  type="number"
                  placeholder="5"
                  min={1}
                  max={28}
                  {...form.register('dia_vencimento_parcela', { valueAsNumber: true })}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Sistema de Amortização <span className="text-red-500">*</span></Label>
              <Select
                value={form.watch('sistema_amortizacao') ?? ''}
                onValueChange={(v) =>
                  form.setValue('sistema_amortizacao', v as 'SAC' | 'PRICE', { shouldValidate: true })
                }
              >
                <SelectTrigger className={errors.sistema_amortizacao ? 'border-red-400' : ''}>
                  <SelectValue placeholder="Selecionar sistema *" />
                </SelectTrigger>
                <SelectContent>
                  {SISTEMAS_AMORTIZACAO.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.sistema_amortizacao && (
                <p className="text-xs text-red-500">{errors.sistema_amortizacao.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Indexador</Label>
              <Select
                value={form.watch('indexador') ?? '__nenhum__'}
                onValueChange={(v) =>
                  form.setValue('indexador', v === '__nenhum__' ? null : v as 'TR' | 'IPCA')
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Não definido" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__nenhum__">Não definido</SelectItem>
                  {INDEXADORES.map((idx) => (
                    <SelectItem key={idx.value} value={idx.value}>{idx.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between gap-3">
              <Label>Financiar despesas cartorárias</Label>
              <Switch
                checked={form.watch('financiar_despesas_cartorariais')}
                onCheckedChange={(v) => form.setValue('financiar_despesas_cartorariais', v)}
              />
            </div>
          </div>

          {/* ── Assessoria ────────────────────────────────────────────────── */}
          <div className="space-y-3 rounded-lg border border-gray-200 p-4">
            <div className="flex items-center justify-between gap-3">
              <Label>Com Assessoria</Label>
              <Switch
                checked={temAssessoria}
                onCheckedChange={(v) => form.setValue('tem_assessoria', v)}
              />
            </div>
            {temAssessoria && (
              <div className="space-y-1.5">
                <Label>Valor da Assessoria (R$)</Label>
                <Input
                  type="number"
                  placeholder="Deixe vazio se inclusa"
                  {...form.register('valor_assessoria', { valueAsNumber: true })}
                />
              </div>
            )}
          </div>

          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row">
            <Button type="button" variant="outline" className="flex-1" onClick={onFechar}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isPending}
              className="flex-1 bg-fonti-primary hover:bg-fonti-primary-hover text-white"
            >
              {isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
