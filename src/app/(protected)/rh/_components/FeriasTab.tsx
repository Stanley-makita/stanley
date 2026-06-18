'use client'

import { useState } from 'react'
import { Plus, MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useFerias, useCriarFerias, useAtualizarFerias, useExcluirFerias, useAusencias, useCriarAusencia } from '@/hooks/rh/useFerias'
import { useFuncionarios } from '@/hooks/rh/useFuncionarios'
import { RH_STATUS_FERIAS_LABELS, RH_STATUS_FERIAS_CORES, RH_TIPO_AUSENCIA_LABELS } from '@/types/rh'
import type { RhStatusFerias, RhTipoAusencia } from '@/types/rh'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

const VAZIO_FERIAS = {
  funcionario_id: '',
  periodo_aq_inicio: '', periodo_aq_fim: '',
  ferias_inicio: '', ferias_fim: '',
  dias_totais: 30, dias_usados: 0,
  status: 'agendado' as RhStatusFerias,
  observacoes: '',
}

const VAZIO_AUS = {
  funcionario_id: '', data_inicio: '', data_fim: '',
  tipo: 'outros' as RhTipoAusencia, motivo: '',
}

function fmtData(d: string | null) {
  if (!d) return '—'
  return format(parseISO(d), 'dd/MM/yyyy', { locale: ptBR })
}

export function FeriasTab() {
  const [modalFerias, setModalFerias] = useState(false)
  const [modalAus, setModalAus] = useState(false)
  const [formF, setFormF] = useState(VAZIO_FERIAS)
  const [formA, setFormA] = useState(VAZIO_AUS)

  const { data: ferias = [] } = useFerias()
  const { data: ausencias = [] } = useAusencias()
  const { data: funcionarios = [] } = useFuncionarios()
  const criarF = useCriarFerias()
  const criarA = useCriarAusencia()
  const excluirF = useExcluirFerias()

  async function handleSalvarFerias() {
    if (!formF.funcionario_id) { toast.error('Selecione o funcionário'); return }
    if (!formF.periodo_aq_inicio || !formF.periodo_aq_fim) { toast.error('Período aquisitivo obrigatório'); return }
    try {
      await criarF.mutateAsync({ ...formF, ferias_inicio: formF.ferias_inicio || null, ferias_fim: formF.ferias_fim || null, observacoes: formF.observacoes || null })
      toast.success('Férias registradas.')
      setModalFerias(false)
      setFormF(VAZIO_FERIAS)
    } catch { toast.error('Erro ao salvar.') }
  }

  async function handleSalvarAus() {
    if (!formA.funcionario_id) { toast.error('Selecione o funcionário'); return }
    if (!formA.data_inicio || !formA.data_fim) { toast.error('Datas obrigatórias'); return }
    try {
      await criarA.mutateAsync({ ...formA, motivo: formA.motivo || null })
      toast.success('Ausência registrada.')
      setModalAus(false)
      setFormA(VAZIO_AUS)
    } catch { toast.error('Erro ao salvar.') }
  }

  return (
    <div className="space-y-4">
      <Tabs defaultValue="ferias">
        <div className="flex items-center justify-between">
          <TabsList className="h-9">
            <TabsTrigger value="ferias" className="text-xs">Férias</TabsTrigger>
            <TabsTrigger value="ausencias" className="text-xs">Ausências</TabsTrigger>
          </TabsList>
          <div className="flex gap-2">
            <Button size="sm" className="bg-[#253B29] text-white hover:bg-[#1a2b1e] gap-1.5" onClick={() => setModalFerias(true)}>
              <Plus className="h-3.5 w-3.5" /> Nova Férias
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setModalAus(true)}>
              <Plus className="h-3.5 w-3.5" /> Nova Ausência
            </Button>
          </div>
        </div>

        <TabsContent value="ferias">
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden mt-3">
            {ferias.length === 0 ? (
              <p className="p-8 text-center text-sm text-gray-400">Nenhuma férias cadastrada.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Funcionário</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Período Aquisitivo</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Férias</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Dias</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Status</th>
                    <th className="px-4 py-3 w-10" />
                  </tr>
                </thead>
                <tbody>
                  {ferias.map(f => (
                    <tr key={f.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                      <td className="px-4 py-3 text-sm font-medium text-gray-800">{f.funcionario?.nome ?? '—'}</td>
                      <td className="px-4 py-3 text-xs text-gray-600">{fmtData(f.periodo_aq_inicio)} – {fmtData(f.periodo_aq_fim)}</td>
                      <td className="px-4 py-3 text-xs text-gray-600">{f.ferias_inicio ? `${fmtData(f.ferias_inicio)} – ${fmtData(f.ferias_fim)}` : '—'}</td>
                      <td className="px-4 py-3 text-xs text-gray-600">{f.dias_usados} / {f.dias_totais} dias</td>
                      <td className="px-4 py-3">
                        <span className={cn('text-xs font-medium rounded-full px-2 py-0.5', RH_STATUS_FERIAS_CORES[f.status])}>
                          {RH_STATUS_FERIAS_LABELS[f.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7"><MoreHorizontal className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem className="text-red-600" onClick={async () => { if (confirm('Excluir?')) { await excluirF.mutateAsync(f.id); toast.success('Excluído.') } }}>
                              Excluir
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </TabsContent>

        <TabsContent value="ausencias">
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden mt-3">
            {ausencias.length === 0 ? (
              <p className="p-8 text-center text-sm text-gray-400">Nenhuma ausência registrada.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Funcionário</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Período</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Tipo</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {ausencias.map(a => (
                    <tr key={a.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                      <td className="px-4 py-3 text-sm font-medium text-gray-800">{a.funcionario?.nome ?? '—'}</td>
                      <td className="px-4 py-3 text-xs text-gray-600">{fmtData(a.data_inicio)} – {fmtData(a.data_fim)}</td>
                      <td className="px-4 py-3 text-xs text-gray-600">{RH_TIPO_AUSENCIA_LABELS[a.tipo]}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">{a.motivo ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Modal Férias */}
      <Dialog open={modalFerias} onOpenChange={o => { if (!o) setModalFerias(false) }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Nova Férias</DialogTitle></DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1">
              <Label className="text-xs">Funcionário *</Label>
              <Select value={formF.funcionario_id} onValueChange={v => setFormF(f => ({ ...f, funcionario_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{funcionarios.map(f => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Período Aquisitivo — Início *</Label>
                <Input type="date" value={formF.periodo_aq_inicio} onChange={e => setFormF(f => ({ ...f, periodo_aq_inicio: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Período Aquisitivo — Fim *</Label>
                <Input type="date" value={formF.periodo_aq_fim} onChange={e => setFormF(f => ({ ...f, periodo_aq_fim: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Férias — Início</Label>
                <Input type="date" value={formF.ferias_inicio} onChange={e => setFormF(f => ({ ...f, ferias_inicio: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Férias — Fim</Label>
                <Input type="date" value={formF.ferias_fim} onChange={e => setFormF(f => ({ ...f, ferias_fim: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Dias Totais</Label>
                <Input type="number" min={1} value={formF.dias_totais} onChange={e => setFormF(f => ({ ...f, dias_totais: Number(e.target.value) }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Dias Usados</Label>
                <Input type="number" min={0} value={formF.dias_usados} onChange={e => setFormF(f => ({ ...f, dias_usados: Number(e.target.value) }))} />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Status</Label>
              <Select value={formF.status} onValueChange={v => setFormF(f => ({ ...f, status: v as RhStatusFerias }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{(Object.entries(RH_STATUS_FERIAS_LABELS) as [RhStatusFerias, string][]).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Observações</Label>
              <Textarea rows={2} value={formF.observacoes} onChange={e => setFormF(f => ({ ...f, observacoes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalFerias(false)}>Cancelar</Button>
            <Button onClick={handleSalvarFerias} disabled={criarF.isPending} className="bg-[#253B29] text-white hover:bg-[#1a2b1e]">
              {criarF.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Ausência */}
      <Dialog open={modalAus} onOpenChange={o => { if (!o) setModalAus(false) }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Nova Ausência</DialogTitle></DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1">
              <Label className="text-xs">Funcionário *</Label>
              <Select value={formA.funcionario_id} onValueChange={v => setFormA(f => ({ ...f, funcionario_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{funcionarios.map(f => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Data Início *</Label>
                <Input type="date" value={formA.data_inicio} onChange={e => setFormA(f => ({ ...f, data_inicio: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Data Fim *</Label>
                <Input type="date" value={formA.data_fim} onChange={e => setFormA(f => ({ ...f, data_fim: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Tipo</Label>
              <Select value={formA.tipo} onValueChange={v => setFormA(f => ({ ...f, tipo: v as RhTipoAusencia }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{(Object.entries(RH_TIPO_AUSENCIA_LABELS) as [RhTipoAusencia, string][]).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Motivo</Label>
              <Textarea rows={2} value={formA.motivo} onChange={e => setFormA(f => ({ ...f, motivo: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalAus(false)}>Cancelar</Button>
            <Button onClick={handleSalvarAus} disabled={criarA.isPending} className="bg-[#253B29] text-white hover:bg-[#1a2b1e]">
              {criarA.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
