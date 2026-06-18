'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useCargos } from '@/hooks/rh/useCargos'
import { useDepartamentos } from '@/hooks/rh/useCargos'
import { useCriarFuncionario, useAtualizarFuncionario } from '@/hooks/rh/useFuncionarios'
import { RH_TIPO_CONTRATO_LABELS, RH_STATUS_FUNCIONARIO_LABELS } from '@/types/rh'
import type { RhFuncionario, RhTipoContrato, RhStatusFuncionario } from '@/types/rh'
import { toast } from 'sonner'

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
  status: 'ativo' as RhStatusFuncionario,
  salario_base: 0,
  observacoes: '',
}

export function FuncionarioModal({ aberto, onFechar, funcionario }: Props) {
  const [form, setForm] = useState(VAZIO)
  const { data: cargos = [] } = useCargos()
  const { data: departamentos = [] } = useDepartamentos()
  const criar = useCriarFuncionario()
  const atualizar = useAtualizarFuncionario()

  const isPending = criar.isPending || atualizar.isPending
  const isEdicao = !!funcionario

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
        status: funcionario.status,
        salario_base: funcionario.salario_base,
        observacoes: funcionario.observacoes ?? '',
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

    try {
      if (isEdicao) {
        await atualizar.mutateAsync({
          id: funcionario!.id,
          ...form,
          cpf: form.cpf || null,
          telefone: form.telefone || null,
          data_nascimento: form.data_nascimento || null,
          cargo_id: form.cargo_id || null,
          observacoes: form.observacoes || null,
        })
        toast.success('Funcionário atualizado.')
      } else {
        await criar.mutateAsync({
          ...form,
          cpf: form.cpf || null,
          telefone: form.telefone || null,
          data_nascimento: form.data_nascimento || null,
          cargo_id: form.cargo_id || null,
          observacoes: form.observacoes || null,
        })
        toast.success('Funcionário criado.')
      }
      onFechar()
    } catch {
      toast.error('Erro ao salvar funcionário.')
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={o => { if (!o) onFechar() }}>
      <DialogContent className="max-w-xl w-full">
        <DialogHeader>
          <DialogTitle>{isEdicao ? 'Editar Funcionário' : 'Novo Funcionário'}</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="geral">
          <TabsList className="w-full">
            <TabsTrigger value="geral" className="flex-1">Dados Gerais</TabsTrigger>
            <TabsTrigger value="beneficios" className="flex-1">Benefícios</TabsTrigger>
          </TabsList>

          <TabsContent value="geral" className="space-y-3 pt-3">
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
          </TabsContent>

          <TabsContent value="beneficios" className="pt-3">
            <p className="text-sm text-gray-400 text-center py-10">Em breve: VR, VT, Plano de saúde, etc.</p>
          </TabsContent>
        </Tabs>

        <DialogFooter className="pt-2 border-t border-gray-100">
          <Button variant="outline" onClick={onFechar} disabled={isPending}>Cancelar</Button>
          <Button onClick={handleSalvar} disabled={isPending} className="bg-[#253B29] text-white hover:bg-[#1a2b1e]">
            {isPending ? 'Salvando...' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
