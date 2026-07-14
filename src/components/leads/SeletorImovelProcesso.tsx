'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Search, Building2 } from 'lucide-react'
import { BuscarImovelModal } from '@/components/imoveis/BuscarImovelModal'
import { ImovelFormDrawer } from '@/components/imoveis/ImovelFormDrawer'
import type { Imovel } from '@/types/imoveis'
import { TIPO_IMOVEL_LABELS } from '@/types/imoveis'

export interface ImovelSelecionado {
  imovel_id: string | null
  imovel_matricula: string | null
  imovel_tipo: string | null
  imovel_categoria: string | null
  imovel_area_construida: number | null
  imovel_area_terreno: number | null
  imovel_rua: string | null
  imovel_numero: string | null
  imovel_complemento: string | null
  imovel_bairro: string | null
  imovel_cidade: string | null
  imovel_uf: string | null
  imovel_registro_id: string | null
  nome_imovel: string
}

interface Props {
  valor: ImovelSelecionado | null
  onChange: (v: ImovelSelecionado | null) => void
}

/** Versão enxuta do BlocoImovel (src/components/imoveis/BlocoImovel.tsx) pra
 * usar ANTES do processo existir — sem edição inline nem histórico de
 * avaliações (dependem de um processo.imovel_id já salvo). Mesmo
 * mapeamento de campos, só que guarda em estado local em vez de fazer
 * update direto num processo. */
export function SeletorImovelProcesso({ valor, onChange }: Props) {
  const [buscarAberto, setBuscarAberto] = useState(false)
  const [cadastrarAberto, setCadastrarAberto] = useState(false)

  function handleSelecionar(imovel: Imovel) {
    onChange({
      imovel_id: imovel.id,
      imovel_matricula: imovel.matricula,
      imovel_tipo: imovel.tipo,
      imovel_categoria: imovel.categoria,
      imovel_area_construida: imovel.area_construida,
      imovel_area_terreno: imovel.area_terreno,
      imovel_rua: imovel.rua,
      imovel_numero: imovel.numero,
      imovel_complemento: imovel.apto_unidade,
      imovel_bairro: imovel.bairro,
      imovel_cidade: imovel.cidade,
      imovel_uf: imovel.uf,
      imovel_registro_id: imovel.registro_imoveis_id,
      nome_imovel: [imovel.rua, imovel.numero, imovel.bairro, imovel.cidade].filter(Boolean).join(', '),
    })
    setBuscarAberto(false)
  }

  function desvincular() {
    onChange(null)
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-gray-700">Imóvel</p>
        <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setBuscarAberto(true)}>
          <Search className="h-3 w-3" /> Buscar imóvel
        </Button>
      </div>

      {!valor ? (
        <div className="text-center py-4 text-gray-400 border border-dashed border-gray-200 rounded-lg">
          <Building2 className="h-5 w-5 mx-auto mb-1 text-gray-300" />
          <p className="text-xs">Nenhum imóvel vinculado</p>
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-1.5">
          {valor.nome_imovel && <p className="text-sm text-gray-700 font-medium">{valor.nome_imovel}</p>}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-500">
            {valor.imovel_matricula && <span>Matrícula: <strong>{valor.imovel_matricula}</strong></span>}
            {valor.imovel_tipo && (
              <span>Tipo: <strong>{TIPO_IMOVEL_LABELS[valor.imovel_tipo as keyof typeof TIPO_IMOVEL_LABELS] ?? valor.imovel_tipo}</strong></span>
            )}
            {valor.imovel_cidade && <span>Cidade: <strong>{valor.imovel_cidade}{valor.imovel_uf ? `/${valor.imovel_uf}` : ''}</strong></span>}
          </div>
          <button onClick={desvincular} className="text-[10px] text-gray-400 hover:text-red-500 transition-colors">
            Desvincular imóvel
          </button>
        </div>
      )}

      <BuscarImovelModal
        aberto={buscarAberto}
        onFechar={() => setBuscarAberto(false)}
        onSelecionar={handleSelecionar}
        onCadastrarNovo={() => { setBuscarAberto(false); setCadastrarAberto(true) }}
      />

      <ImovelFormDrawer
        aberto={cadastrarAberto}
        onFechar={() => setCadastrarAberto(false)}
        onSucesso={handleSelecionar}
      />
    </div>
  )
}
