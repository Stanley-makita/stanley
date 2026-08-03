'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCargos } from '@/hooks/rh/useCargos'
import { useRegrasComissao } from '@/hooks/rh/useComissoes'
import { useCriarFuncionario, useAtualizarFuncionario } from '@/hooks/rh/useFuncionarios'
import { useFerias } from '@/hooks/rh/useFerias'
import { useAssiduidadeFuncionario } from '@/hooks/rh/useAssiduidade'
import { proximaOcorrenciaAnual, formatarTempoDeEmpresa } from '@/lib/rh/datasFuncionario'
import {
  RH_TIPO_CONTRATO_LABELS, RH_STATUS_FUNCIONARIO_LABELS, RH_STATUS_FUNCIONARIO_CORES,
  RH_TIPO_CONTA_BANCARIA_LABELS,
} from '@/types/rh'
import type { RhFuncionario, RhTipoContrato, RhStatusFuncionario, RhTipoContaBancaria } from '@/types/rh'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Cake, Building2, Plane, PlaneLanding, Percent } from 'lucide-react'
import { format, parseISO, differenceInYears } from 'date-fns'
import { ptBR } from 'date-fns/locale'

interface Props {
  aberto: boolean
  onFechar: () => void
  funcionario?: RhFuncionario | null
}

const VAZIO = {
  nome: '',
  cpf: '',
  email: '',
  telefone: '',
  data_nascimento: '',
  data_admissao: '',
  tipo_contrato: 'clt' as RhTipoContrato,
  cargo_id: null as string | null,
  regra_comissao_id: null as string | null,
  status: 'ativo' as RhStatusFuncionario,
  salario_base: 0,
  observacoes: '',
  beneficio_vale_transporte: '',
  beneficio_vale_alimentacao: '',
  beneficio_plano_saude: '',
  beneficio_plano_odontologico: '',
  pis: '',
  banco_nome: '',
  agencia: '',
  conta: '',
  tipo_conta: '' as '' | RhTipoContaBancaria,
  chave_pix: '',
}

function iniciais(nome: string) {
  return nome.split(' ').filter(Boolean).slice(0, 2).map(n => n[0]).join('').toUpperCase()
}

export function FuncionarioFichaModal({ aberto, onFechar, funcionario }: Props) {
  const [form, setForm] = useState(VAZIO)
  const { data: cargos = [] } = useCargos()
  const { data: regrasComissao = [] } = useRegrasComissao()
  const criar = useCriarFuncionario()
  const atualizar = useAtualizarFuncionario()

  const isEdicao = !!funcionario
  const isPending = criar.isPending || atualizar.isPending

  const { data: ferias = [] } = useFerias({ funcionarioId: funcionario?.id })
  const assiduidade = useAssiduidadeFuncionario(funcionario?.id ?? '', funcionario?.data_admissao ?? '')

  useEffect(() => {
    if (funcionario) {
      setForm({
        nome: funcionario.nome,
        cpf: funcionario.cpf ?? '',
        email: funcionario.email,
        telefone: funcionario.telefone ?? '',
        data_nascimento: funcionario.data_nascimento ?? '',
        data_admissao: funcionario.data_admissao,
        tipo_contrato: funcionario.tipo_contrato,
        cargo_id: funcionario.cargo_id,
        regra_comissao_id: funcionario.regra_comissao_id,
        status: funcionario.status,
        salario_base: funcionario.salario_base,
        observacoes: funcionario.observacoes ?? '',
        beneficio_vale_transporte: funcionario.beneficio_vale_transporte != null ? String(funcionario.beneficio_vale_transporte) : '',
        beneficio_vale_alimentacao: funcionario.beneficio_vale_alimentacao != null ? String(funcionario.beneficio_vale_alimentacao) : '',
        beneficio_plano_saude: funcionario.beneficio_plano_saude != null ? String(funcionario.beneficio_plano_saude) : '',
        beneficio_plano_odontologico: funcionario.beneficio_plano_odontologico != null ? String(funcionario.beneficio_plano_odontologico) : '',
        pis: funcionario.pis ?? '',
        banco_nome: funcionario.banco_nome ?? '',
        agencia: funcionario.agencia ?? '',
        conta: funcionario.conta ?? '',
        tipo_conta: funcionario.tipo_conta ?? '',
        chave_pix: funcionario.chave_pix ?? '',
      })
    } else {
      setForm(VAZIO)
    }
  }, [funcionario, aberto])

  function set(key: keyof typeof VAZIO, val: unknown) {
    setForm(f => ({ ...f, [key]: val }))
  }

  async function handleSalvar() {
    if (!form.nome.trim()) { toast.error('Nome é obrigatório'); return }
    if (!form.email.trim()) { toast.error('E-mail é obrigatório'); return }
    if (!form.data_admissao) { toast.error('Data de admissão é obrigatória'); return }

    const paraNumero = (v: string) => v.trim() ? Number(v) : null
    const payload = {
      nome: form.nome,
      cpf: form.cpf || null,
      email: form.email,
      telefone: form.telefone || null,
      data_nascimento: form.data_nascimento || null,
      data_admissao: form.data_admissao,
      tipo_contrato: form.tipo_contrato,
      cargo_id: form.cargo_id || null,
      regra_comissao_id: form.regra_comissao_id || null,
      status: form.status,
      salario_base: form.salario_base,
      observacoes: form.observacoes || null,
      beneficio_vale_transporte: paraNumero(form.beneficio_vale_transporte),
      beneficio_vale_alimentacao: paraNumero(form.beneficio_vale_alimentacao),
      beneficio_plano_saude: paraNumero(form.beneficio_plano_saude),
      beneficio_plano_odontologico: paraNumero(form.beneficio_plano_odontologico),
      pis: form.pis || null,
      banco_nome: form.banco_nome || null,
      agencia: form.agencia || null,
      conta: form.conta || null,
      tipo_conta: form.tipo_conta || null,
      chave_pix: form.chave_pix || null,
    }

    try {
      if (isEdicao) {
        await atualizar.mutateAsync({ id: funcionario!.id, ...payload })
        toast.success('Funcionário atualizado.')
      } else {
        await criar.mutateAsync(payload)
        toast.success('Funcionário criado.')
      }
      onFechar()
    } catch {
      toast.error('Erro ao salvar funcionário.')
    }
  }

  const hoje = new Date()
  const proximasFerias = isEdicao
    ? ferias.filter(f => (f.status === 'agendado' || f.status === 'em_andamento') && f.ferias_inicio)
        .sort((a, b) => parseISO(a.ferias_inicio!).getTime() - parseISO(b.ferias_inicio!).getTime())[0] ?? null
    : null
  const ultimasFerias = isEdicao
    ? ferias.filter(f => f.status === 'concluido' && f.ferias_fim)
        .sort((a, b) => parseISO(b.ferias_fim!).getTime() - parseISO(a.ferias_fim!).getTime())[0] ?? null
    : null
  const proximoAniversario = funcionario?.data_nascimento ? proximaOcorrenciaAnual(parseISO(funcionario.data_nascimento), hoje) : null
  const aniversarioEmpresa = funcionario?.data_admissao ? proximaOcorrenciaAnual(parseISO(funcionario.data_admissao), hoje) : null
  const anosDeEmpresa = funcionario?.data_admissao && aniversarioEmpresa
    ? differenceInYears(aniversarioEmpresa, parseISO(funcionario.data_admissao))
    : null
  const tempoDeEmpresa = funcionario?.data_admissao ? formatarTempoDeEmpresa(parseISO(funcionario.data_admissao), hoje) : '—'

  return (
    <Dialog open={aberto} onOpenChange={o => { if (!o) onFechar() }}>
      <DialogContent className="max-w-3xl w-full max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdicao ? 'Ficha do Funcionário' : 'Novo Funcionário'}</DialogTitle>
        </DialogHeader>

        {isEdicao && (
          <div className="space-y-4 pb-4 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-fonti-accent-hover flex items-center justify-center text-fonti-primary text-sm font-bold shrink-0">
                {iniciais(funcionario!.nome)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-800 truncate">{funcionario!.nome}</p>
                <p className="text-xs text-gray-400 truncate">
                  {funcionario!.cargo?.nome ?? 'Sem cargo'}
                  {funcionario!.cargo?.departamento?.nome ? ` · ${funcionario!.cargo.departamento.nome}` : ''}
                </p>
              </div>
              <span className={cn('text-xs font-medium rounded-full px-2 py-0.5 shrink-0', RH_STATUS_FUNCIONARIO_CORES[funcionario!.status])}>
                {RH_STATUS_FUNCIONARIO_LABELS[funcionario!.status]}
              </span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                <p className="text-[10px] text-gray-400 uppercase tracking-wide">Tempo de Empresa</p>
                <p className="text-sm font-semibold text-gray-800">{tempoDeEmpresa}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                <div className="flex items-center gap-1"><Cake className="h-3 w-3 text-pink-500" /><p className="text-[10px] text-gray-400 uppercase tracking-wide">Próx. Aniversário</p></div>
                <p className="text-sm font-semibold text-gray-800">
                  {proximoAniversario ? format(proximoAniversario, "dd 'de' MMM", { locale: ptBR }) : '—'}
                </p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                <div className="flex items-center gap-1"><Building2 className="h-3 w-3 text-amber-500" /><p className="text-[10px] text-gray-400 uppercase tracking-wide">Aniversário de Empresa</p></div>
                <p className="text-sm font-semibold text-gray-800">
                  {aniversarioEmpresa ? format(aniversarioEmpresa, "dd 'de' MMM", { locale: ptBR }) : '—'}
                  {anosDeEmpresa != null && anosDeEmpresa > 0 ? ` · ${anosDeEmpresa} ${anosDeEmpresa === 1 ? 'ano' : 'anos'}` : ''}
                </p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                <div className="flex items-center gap-1"><Plane className="h-3 w-3 text-blue-500" /><p className="text-[10px] text-gray-400 uppercase tracking-wide">Próximas Férias</p></div>
                {proximasFerias ? (
                  <p className="text-sm font-semibold text-gray-800">{format(parseISO(proximasFerias.ferias_inicio!), 'dd/MM/yyyy', { locale: ptBR })}</p>
                ) : <p className="text-sm text-gray-400">Nenhuma agendada</p>}
              </div>
              <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                <div className="flex items-center gap-1"><PlaneLanding className="h-3 w-3 text-gray-400" /><p className="text-[10px] text-gray-400 uppercase tracking-wide">Últimas Férias</p></div>
                {ultimasFerias ? (
                  <p className="text-sm font-semibold text-gray-800">{format(parseISO(ultimasFerias.ferias_fim!), 'dd/MM/yyyy', { locale: ptBR })}</p>
                ) : <p className="text-sm text-gray-400">Nenhuma registrada</p>}
              </div>
              <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                <div className="flex items-center gap-1"><Percent className="h-3 w-3 text-green-600" /><p className="text-[10px] text-gray-400 uppercase tracking-wide">Assiduidade (30d)</p></div>
                <p className="text-sm font-semibold text-gray-800">
                  {assiduidade.isLoading ? '...' : `${assiduidade.data?.percentual.toFixed(0) ?? '—'}%`}
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-5 py-1">
          {/* Dados Gerais */}
          <div className="space-y-3">
            <p className="text-[11px] font-bold text-fonti-primary uppercase tracking-widest border-b border-gray-100 pb-2">Dados Gerais</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1">
                <Label className="text-xs">Nome Completo *</Label>
                <Input placeholder="Nome do funcionário" value={form.nome} onChange={e => set('nome', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">CPF</Label>
                <Input placeholder="000.000.000-00" value={form.cpf} onChange={e => set('cpf', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">E-mail *</Label>
                <Input type="email" placeholder="email@exemplo.com" value={form.email} onChange={e => set('email', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Telefone</Label>
                <Input placeholder="(00) 00000-0000" value={form.telefone} onChange={e => set('telefone', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Data de Nascimento</Label>
                <Input type="date" value={form.data_nascimento} onChange={e => set('data_nascimento', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Data de Admissão *</Label>
                <Input type="date" value={form.data_admissao} onChange={e => set('data_admissao', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Tipo de Contrato</Label>
                <Select value={form.tipo_contrato} onValueChange={v => set('tipo_contrato', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.entries(RH_TIPO_CONTRATO_LABELS) as [RhTipoContrato, string][]).map(([v, l]) => (
                      <SelectItem key={v} value={v}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Cargo</Label>
                <Select value={form.cargo_id ?? '__none'} onValueChange={v => set('cargo_id', v === '__none' ? null : v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">— Sem cargo —</SelectItem>
                    {cargos.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Regra de Comissão (override individual)</Label>
                <Select value={form.regra_comissao_id ?? '__cargo'} onValueChange={v => set('regra_comissao_id', v === '__cargo' ? null : v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__cargo">— Usar a regra do cargo —</SelectItem>
                    {regrasComissao.filter(r => r.ativa).map(r => <SelectItem key={r.id} value={r.id}>{r.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-gray-400">
                  {form.regra_comissao_id
                    ? 'Sobrescreve a regra do cargo só para este funcionário.'
                    : 'Sem override — usa a regra vinculada ao cargo selecionado acima, se houver.'}
                </p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Status</Label>
                <Select value={form.status} onValueChange={v => set('status', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.entries(RH_STATUS_FUNCIONARIO_LABELS) as [RhStatusFuncionario, string][]).map(([v, l]) => (
                      <SelectItem key={v} value={v}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Salário Base</Label>
                <Input type="number" min={0} value={form.salario_base} onChange={e => set('salario_base', Number(e.target.value))} />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Observações</Label>
              <Textarea rows={2} value={form.observacoes} onChange={e => set('observacoes', e.target.value)} />
            </div>
          </div>

          {/* Dados Bancários */}
          <div className="space-y-3">
            <p className="text-[11px] font-bold text-fonti-primary uppercase tracking-widest border-b border-gray-100 pb-2">Dados Bancários</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">PIS</Label>
                <Input placeholder="000.00000.00-0" value={form.pis} onChange={e => set('pis', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Chave PIX</Label>
                <Input placeholder="CPF, e-mail, telefone ou aleatória" value={form.chave_pix} onChange={e => set('chave_pix', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Banco</Label>
                <Input placeholder="Ex: Itaú, Nubank..." value={form.banco_nome} onChange={e => set('banco_nome', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Tipo de Conta</Label>
                <Select value={form.tipo_conta || '__none'} onValueChange={v => set('tipo_conta', v === '__none' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">— Não informado —</SelectItem>
                    {(Object.entries(RH_TIPO_CONTA_BANCARIA_LABELS) as [RhTipoContaBancaria, string][]).map(([v, l]) => (
                      <SelectItem key={v} value={v}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Agência</Label>
                <Input placeholder="0000" value={form.agencia} onChange={e => set('agencia', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Conta</Label>
                <Input placeholder="00000-0" value={form.conta} onChange={e => set('conta', e.target.value)} />
              </div>
            </div>
          </div>

          {/* Benefícios */}
          <div className="space-y-3">
            <p className="text-[11px] font-bold text-fonti-primary uppercase tracking-widest border-b border-gray-100 pb-2">Benefícios</p>
            <p className="text-xs text-gray-400">
              Valores mensais concedidos ao funcionário. Cadastro informativo — o lançamento na Folha de Pagamento continua sendo feito por competência.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Vale Transporte (R$)</Label>
                <Input type="number" min={0} step="0.01" placeholder="0,00" value={form.beneficio_vale_transporte} onChange={e => set('beneficio_vale_transporte', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Vale Alimentação (R$)</Label>
                <Input type="number" min={0} step="0.01" placeholder="0,00" value={form.beneficio_vale_alimentacao} onChange={e => set('beneficio_vale_alimentacao', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Plano de Saúde (R$)</Label>
                <Input type="number" min={0} step="0.01" placeholder="0,00" value={form.beneficio_plano_saude} onChange={e => set('beneficio_plano_saude', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Plano Odontológico (R$)</Label>
                <Input type="number" min={0} step="0.01" placeholder="0,00" value={form.beneficio_plano_odontologico} onChange={e => set('beneficio_plano_odontologico', e.target.value)} />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="pt-2 border-t border-gray-100">
          <Button variant="outline" onClick={onFechar} disabled={isPending}>Cancelar</Button>
          <Button onClick={handleSalvar} disabled={isPending} className="bg-fonti-primary text-white hover:bg-fonti-primary-hover">
            {isPending ? 'Salvando...' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
