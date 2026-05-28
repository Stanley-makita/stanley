'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { TabelaAuxiliar, type ColunaAuxiliar } from '@/components/configuracoes/TabelaAuxiliar'
import {
  useTodosRegistrosImoveis,
  useCriarRegistroImoveis,
  useAtualizarRegistroImoveis,
  useExcluirRegistroImoveis,
} from '@/hooks/configuracoes/useRegistrosImoveis'
import type { RegistroImoveis } from '@/types/imoveis'

const UFS = [
  'AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT',
  'PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO',
]

const colunas: ColunaAuxiliar<RegistroImoveis>[] = [
  { key: 'nome', label: 'Nome' },
  { key: 'cidade', label: 'Cidade', render: (v) => v ? String(v) : '—' },
  { key: 'uf', label: 'UF', render: (v) => v ? String(v) : '—' },
  { key: 'telefone', label: 'Telefone', render: (v) => v ? String(v) : '—' },
  {
    key: 'ativo',
    label: 'Status',
    render: (v) => (
      <Badge variant="outline" className={v ? 'border-green-200 bg-green-50 text-green-700' : 'border-gray-200 bg-gray-50 text-gray-500'}>
        {v ? 'Ativo' : 'Inativo'}
      </Badge>
    ),
  },
]

interface FormRegistroProps {
  inicial?: RegistroImoveis
  onSalvar: (dados: Omit<RegistroImoveis, 'id' | 'empresa_id' | 'created_at' | 'updated_at' | 'deleted_at'>) => void
  onCancelar: () => void
  isPending: boolean
}

function FormRegistroImoveis({ inicial, onSalvar, onCancelar, isPending }: FormRegistroProps) {
  const [nome, setNome] = useState(inicial?.nome ?? '')
  const [cidade, setCidade] = useState(inicial?.cidade ?? '')
  const [uf, setUf] = useState(inicial?.uf ?? '')
  const [telefone, setTelefone] = useState(inicial?.telefone ?? '')
  const [observacao, setObservacao] = useState(inicial?.observacao ?? '')
  const [ativo, setAtivo] = useState(inicial?.ativo ?? true)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nome.trim()) return
    onSalvar({
      nome: nome.trim(),
      cidade: cidade.trim() || null,
      uf: uf || null,
      telefone: telefone.trim() || null,
      observacao: observacao.trim() || null,
      ativo,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pt-2">
      <div className="space-y-1.5">
        <Label htmlFor="nome">Nome <span className="text-red-500">*</span></Label>
        <Input
          id="nome"
          placeholder="Ex: 1º RI Maringá"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          autoFocus
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="cidade">Cidade</Label>
          <Input
            id="cidade"
            placeholder="Ex: Maringá"
            value={cidade}
            onChange={(e) => setCidade(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="uf">UF</Label>
          <Select value={uf} onValueChange={setUf}>
            <SelectTrigger id="uf">
              <SelectValue placeholder="UF" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">—</SelectItem>
              {UFS.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="telefone">Telefone</Label>
        <Input
          id="telefone"
          placeholder="(44) 3262-0000"
          value={telefone}
          onChange={(e) => setTelefone(e.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="observacao">Observação</Label>
        <Textarea
          id="observacao"
          placeholder="Informações adicionais..."
          value={observacao}
          onChange={(e) => setObservacao(e.target.value)}
          rows={2}
          className="resize-none"
        />
      </div>

      {inicial && (
        <div className="flex items-center gap-2">
          <Switch id="ativo" checked={ativo} onCheckedChange={setAtivo} />
          <Label htmlFor="ativo" className="cursor-pointer">Ativo</Label>
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancelar}>Cancelar</Button>
        <Button
          type="submit"
          disabled={!nome.trim() || isPending}
          className="bg-[#253B29] hover:bg-[#1a2b1e] text-white"
        >
          {isPending ? 'Salvando...' : 'Salvar'}
        </Button>
      </div>
    </form>
  )
}

export function RegistrosImoveisLista() {
  const { data: registros = [], isLoading } = useTodosRegistrosImoveis()
  const criar = useCriarRegistroImoveis()
  const atualizar = useAtualizarRegistroImoveis()
  const excluir = useExcluirRegistroImoveis()

  return (
    <TabelaAuxiliar<RegistroImoveis>
      titulo="Registro de Imóveis"
      dados={registros}
      isLoading={isLoading}
      colunas={colunas}
      rotuloBotaoNovo="Novo Registro"
      emptyMessage="Nenhum registro de imóveis cadastrado. Ex: 1º RI Maringá, 2º RI Maringá..."
      renderFormModal={({ inicial, onSalvar, onCancelar, isPending }) => (
        <FormRegistroImoveis
          inicial={inicial}
          onSalvar={onSalvar}
          onCancelar={onCancelar}
          isPending={isPending}
        />
      )}
      onCriar={(dados) => criar.mutate(dados as any)}
      onEditar={(id, dados) => atualizar.mutate({ id, ...dados } as any)}
      onExcluir={(id) => excluir.mutate(id)}
      isPendingCriar={criar.isPending}
      isPendingEditar={atualizar.isPending}
      isPendingExcluir={excluir.isPending}
    />
  )
}
