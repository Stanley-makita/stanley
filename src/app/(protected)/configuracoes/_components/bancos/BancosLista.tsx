'use client'

import { useState } from 'react'
import { useBancos, useCriarBanco, useExcluirBanco } from '../../_hooks/useBancos'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Trash2, Building2, X, Check } from 'lucide-react'

export function BancosLista() {
  const { data: bancos = [], isLoading, error } = useBancos()
  const criar = useCriarBanco()
  const excluir = useExcluirBanco()

  const [exibirForm, setExibirForm] = useState(false)
  const [nome, setNome] = useState('')

  async function salvar() {
    if (!nome.trim()) return
    await criar.mutateAsync({ nome: nome.trim(), ativo: true } as Parameters<typeof criar.mutateAsync>[0])
    setNome('')
    setExibirForm(false)
  }

  if (isLoading) {
    return <div className="space-y-2">{[...Array(4)].map((_, i) => (
      <div key={i} className="h-12 rounded-lg bg-gray-100 animate-pulse" />
    ))}</div>
  }

  if (error) {
    return <p className="text-red-600 text-sm">Não foi possível carregar os bancos.</p>
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-500">{bancos.length} bancos cadastrados</p>
        <Button
          size="sm"
          className="bg-[#253B29] hover:bg-[#C2AA6A] hover:text-[#253B29] text-white"
          onClick={() => setExibirForm(!exibirForm)}
        >
          <Plus className="w-4 h-4 mr-1" /> Novo banco
        </Button>
      </div>

      {exibirForm && (
        <div className="border border-[#C2AA6A] rounded-xl p-4 bg-[#E7E0C4]/20 space-y-3">
          <p className="text-xs font-semibold text-[#253B29]">Novo banco</p>
          <div className="flex gap-2">
            <Input
              placeholder="Ex: Caixa Econômica Federal"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="h-8 text-sm"
              onKeyDown={(e) => e.key === 'Enter' && salvar()}
            />
            <Button variant="ghost" size="sm" className="h-8 gap-1" onClick={() => { setExibirForm(false); setNome('') }}>
              <X className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              className="bg-[#253B29] hover:bg-[#1a2b1e] text-white h-8 gap-1"
              onClick={salvar}
              disabled={!nome.trim() || criar.isPending}
            >
              <Check className="h-3.5 w-3.5" /> Salvar
            </Button>
          </div>
        </div>
      )}

      {bancos.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <Building2 className="h-8 w-8 mx-auto mb-2 text-gray-300" />
          <p className="text-sm">Nenhum banco cadastrado ainda.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {bancos.map((banco: { id: string; nome: string }) => (
            <div
              key={banco.id}
              className="flex items-center justify-between p-3 bg-white border border-gray-100 rounded-lg shadow-sm hover:shadow-md transition-shadow group"
            >
              <div className="flex items-center gap-3">
                <Building2 className="h-4 w-4 text-[#C2AA6A] shrink-0" />
                <span className="text-sm font-medium text-gray-900">{banco.nome}</span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => excluir.mutate(banco.id)}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
