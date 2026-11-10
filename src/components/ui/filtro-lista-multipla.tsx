'use client'

import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { cn, normalizarTexto } from '@/lib/utils'
import { normalizarSelecao } from '@/lib/filtroMultiplo'

// Conteúdo do dropdown de filtro de coluna (estilo Excel): pesquisa, "Selecionar
// tudo", um checkbox por valor e OK/Cancelar. Só aplica no OK — Cancelar (ou
// clicar fora) descarta o que foi marcado. Sem filtro ativo, tudo aparece marcado.
export function FiltroListaMultipla({
  opcoes, selecionados, onAplicar, onCancelar,
}: {
  opcoes: string[]
  selecionados: string[]
  onAplicar: (valores: string[]) => void
  onCancelar: () => void
}) {
  const [marcados, setMarcados] = useState<string[]>(() => selecionados.length > 0 ? selecionados : opcoes)
  const [pesquisa, setPesquisa] = useState('')

  const visiveis = useMemo(() => {
    const termo = normalizarTexto(pesquisa)
    return termo ? opcoes.filter(o => normalizarTexto(o).includes(termo)) : opcoes
  }, [opcoes, pesquisa])

  const todosVisiveisMarcados = visiveis.length > 0 && visiveis.every(v => marcados.includes(v))

  function alternarTodos() {
    setMarcados(prev => todosVisiveisMarcados
      ? prev.filter(m => !visiveis.includes(m))
      : Array.from(new Set([...prev, ...visiveis])))
  }

  function alternar(valor: string) {
    setMarcados(prev => prev.includes(valor) ? prev.filter(m => m !== valor) : [...prev, valor])
  }

  function aplicar() {
    onAplicar(normalizarSelecao(marcados.filter(m => opcoes.includes(m)), opcoes))
  }

  return (
    <div className="w-60">
      <div className="p-2 border-b border-gray-100">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <input
            autoFocus
            placeholder="Pesquisar"
            className="w-full h-7 pl-7 pr-2 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-fonti-primary"
            value={pesquisa}
            onChange={(e) => setPesquisa(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && marcados.length > 0) aplicar()
              if (e.key === 'Escape') onCancelar()
            }}
          />
        </div>
      </div>

      <div className="max-h-56 overflow-y-auto py-1">
        {visiveis.length === 0 ? (
          <p className="px-3 py-2 text-xs text-gray-400">Sem opções</p>
        ) : (
          <>
            <LinhaOpcao
              rotulo={pesquisa ? '(Selecionar resultados)' : '(Selecionar tudo)'}
              marcado={todosVisiveisMarcados}
              onAlternar={alternarTodos}
              destaque
            />
            {visiveis.map(val => (
              <LinhaOpcao key={val} rotulo={val || '—'} marcado={marcados.includes(val)} onAlternar={() => alternar(val)} />
            ))}
          </>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 p-2 border-t border-gray-100">
        <button
          onClick={onCancelar}
          className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
        >
          Cancelar
        </button>
        <button
          onClick={aplicar}
          disabled={marcados.length === 0}
          title={marcados.length === 0 ? 'Marque pelo menos uma opção' : undefined}
          className="text-xs px-3 py-1 rounded-lg bg-fonti-primary text-white hover:bg-fonti-primary-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          OK
        </button>
      </div>
    </div>
  )
}

function LinhaOpcao({ rotulo, marcado, onAlternar, destaque = false }: {
  rotulo: string
  marcado: boolean
  onAlternar: () => void
  destaque?: boolean
}) {
  return (
    <label className={cn(
      'flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer hover:bg-fonti-primary/5 transition-colors',
      destaque ? 'text-gray-500 font-medium' : 'text-gray-700',
    )}>
      <Checkbox
        checked={marcado}
        onCheckedChange={onAlternar}
        className="h-3.5 w-3.5 border-gray-300 data-[state=checked]:bg-fonti-primary data-[state=checked]:border-fonti-primary data-[state=checked]:text-white"
      />
      <span className="truncate">{rotulo}</span>
    </label>
  )
}
