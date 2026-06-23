'use client'

import { useState } from 'react'
import { Plus, Search, Pencil, MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useFuncionarios, useExcluirFuncionario } from '@/hooks/rh/useFuncionarios'
import { RH_STATUS_FUNCIONARIO_LABELS, RH_STATUS_FUNCIONARIO_CORES, RH_TIPO_CONTRATO_LABELS } from '@/types/rh'
import { FuncionarioModal } from './FuncionarioModal'
import type { RhFuncionario } from '@/types/rh'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

export function FuncionariosTab() {
  const [busca, setBusca] = useState('')
  const [modalAberto, setModalAberto] = useState(false)
  const [editando, setEditando] = useState<RhFuncionario | null>(null)

  const { data: funcionarios = [], isLoading } = useFuncionarios()
  const excluir = useExcluirFuncionario()

  const filtrados = funcionarios.filter(f =>
    f.nome.toLowerCase().includes(busca.toLowerCase()) ||
    f.email.toLowerCase().includes(busca.toLowerCase())
  )

  function abrir(f?: RhFuncionario) {
    setEditando(f ?? null)
    setModalAberto(true)
  }

  async function handleExcluir(id: string, nome: string) {
    if (!confirm(`Desativar "${nome}"?`)) return
    try {
      await excluir.mutateAsync(id)
      toast.success('Funcionário desativado.')
    } catch {
      toast.error('Erro ao desativar.')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <Input placeholder="Buscar funcionário..." className="pl-9 h-9 text-sm" value={busca} onChange={e => setBusca(e.target.value)} />
        </div>
        <Button size="sm" className="bg-fonti-primary text-white hover:bg-fonti-primary-hover gap-1.5" onClick={() => abrir()}>
          <Plus className="h-3.5 w-3.5" /> Novo Funcionário
        </Button>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-gray-400">Carregando...</div>
        ) : filtrados.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">
            {busca ? 'Nenhum resultado para a busca.' : 'Nenhum funcionário cadastrado.'}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-3 py-1.5 text-xs font-medium text-gray-500">Nome</th>
                <th className="text-left px-3 py-1.5 text-xs font-medium text-gray-500">Cargo / Dept.</th>
                <th className="text-left px-3 py-1.5 text-xs font-medium text-gray-500">Contrato</th>
                <th className="text-left px-3 py-1.5 text-xs font-medium text-gray-500">Admissão</th>
                <th className="text-left px-3 py-1.5 text-xs font-medium text-gray-500">Status</th>
                <th className="px-3 py-1.5 w-10" />
              </tr>
            </thead>
            <tbody>
              {filtrados.map(f => (
                <tr key={f.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                  <td className="px-3 py-1.5">
                    <div>
                      <p className="font-medium text-gray-800">{f.nome}</p>
                      <p className="text-xs text-gray-400">{f.email}</p>
                    </div>
                  </td>
                  <td className="px-3 py-1.5 text-xs text-gray-600">
                    <p>{f.cargo?.nome ?? '—'}</p>
                    <p className="text-gray-400">{f.cargo?.departamento?.nome ?? ''}</p>
                  </td>
                  <td className="px-3 py-1.5 text-xs text-gray-600">{RH_TIPO_CONTRATO_LABELS[f.tipo_contrato]}</td>
                  <td className="px-3 py-1.5 text-xs text-gray-600">
                    {f.data_admissao ? format(parseISO(f.data_admissao), 'dd/MM/yyyy', { locale: ptBR }) : '—'}
                  </td>
                  <td className="px-3 py-1.5">
                    <span className={cn('inline-flex items-center text-xs font-medium rounded-full px-2 py-0.5', RH_STATUS_FUNCIONARIO_CORES[f.status])}>
                      {RH_STATUS_FUNCIONARIO_LABELS[f.status]}
                    </span>
                  </td>
                  <td className="px-3 py-1.5">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => abrir(f)}>
                          <Pencil className="h-3.5 w-3.5 mr-2" /> Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-red-600" onClick={() => handleExcluir(f.id, f.nome)}>
                          Desativar
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

      <FuncionarioModal aberto={modalAberto} onFechar={() => setModalAberto(false)} funcionario={editando} />
    </div>
  )
}
