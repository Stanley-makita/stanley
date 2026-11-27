'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ChevronDown, ChevronRight, History } from 'lucide-react'
import { usePessoaAlteracoes } from '@/hooks/pessoas/usePessoaAlteracoes'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import {
  ORIGEM_LABELS, eRegistroAntigo, formatarValorAlteracao, resumoCampos, rotuloCampo,
} from '@/lib/pessoas/alteracoesExibicao'
import { type PessoaAlteracao } from '@/types/pessoas'
import { cn } from '@/lib/utils'

function dataHora(iso: string) {
  return format(new Date(iso), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
}

function ItemAlteracao({ a }: { a: PessoaAlteracao }) {
  const antigo = eRegistroAntigo(a)
  const [aberto, setAberto] = useState(false)
  const autor = a.usuario?.nome ?? 'Sistema'

  return (
    <li className="border-b last:border-b-0">
      <button
        type="button"
        onClick={() => !antigo && setAberto(v => !v)}
        className={cn('w-full flex items-start gap-2 px-1 py-3 text-left text-sm', !antigo && 'hover:bg-gray-50')}
        disabled={antigo}
      >
        {antigo
          ? <span className="w-4 shrink-0" />
          : aberto
            ? <ChevronDown className="h-4 w-4 mt-0.5 shrink-0 text-gray-400" />
            : <ChevronRight className="h-4 w-4 mt-0.5 shrink-0 text-gray-400" />}
        <span className="min-w-0">
          <span className="font-medium text-gray-800">{autor}</span>{' '}
          {antigo ? (
            <span className="text-gray-500">salvou o cadastro</span>
          ) : (
            <>alterou <span className="text-gray-700">{resumoCampos(a)}</span></>
          )}
          <span className="block text-xs text-gray-400">
            {dataHora(a.alterado_em)} · {ORIGEM_LABELS[a.origem] ?? a.origem}
          </span>
          {antigo && (
            <span className="block text-xs text-amber-600 mt-0.5">
              Registro antigo — o sistema ainda não guardava quais campos mudaram.
            </span>
          )}
        </span>
      </button>
      {aberto && !antigo && (
        <table className="w-full text-xs mb-3 ml-6">
          <thead>
            <tr className="text-gray-400 text-left">
              <th className="font-normal pb-1 pr-3">Campo</th>
              <th className="font-normal pb-1 pr-3">Antes</th>
              <th className="font-normal pb-1">Depois</th>
            </tr>
          </thead>
          <tbody>
            {a.campos_alterados.map(c => (
              <tr key={c} className="align-top">
                <td className="py-0.5 pr-3 text-gray-600">{rotuloCampo(c)}</td>
                <td className="py-0.5 pr-3 text-gray-400 line-through break-all">
                  {formatarValorAlteracao(c, a.valores_anteriores?.[c])}
                </td>
                <td className="py-0.5 text-gray-800 break-all">
                  {formatarValorAlteracao(c, a.valores_novos?.[c])}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </li>
  )
}

/**
 * Histórico de alterações da Pessoa: card de uma linha com a última alteração; clicar abre
 * a lista completa, com antes → depois de cada campo. Registros antigos (sem valor anterior)
 * aparecem com aviso, sem a lista de campos — ela era o formulário inteiro, não o que mudou.
 */
export function HistoricoAlteracoesPessoa({ pessoaId, perfil, usuarioId }: {
  pessoaId: string
  perfil?: string
  usuarioId?: string
}) {
  const { data: alteracoes = [], isLoading } = usePessoaAlteracoes(pessoaId)
  const [aberto, setAberto] = useState(false)

  const podeVerTudo = perfil === 'admin' || perfil === 'gerente' || perfil === 'gestor'
  const visiveis = podeVerTudo ? alteracoes : alteracoes.filter(a => a.usuario_id === usuarioId)

  if (isLoading || visiveis.length === 0) return null
  const ultima = visiveis[0]
  const antigo = eRegistroAntigo(ultima)

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="w-full bg-white rounded-xl border px-5 py-3 flex items-center gap-3 text-left text-sm hover:bg-gray-50 transition-colors"
      >
        <History className="h-4 w-4 text-gray-400 shrink-0" />
        <span className="min-w-0 flex-1 truncate">
          <span className="text-gray-500">Última alteração: </span>
          <span className="font-medium text-gray-800">{ultima.usuario?.nome ?? 'Sistema'}</span>{' '}
          {antigo ? 'salvou o cadastro' : <>alterou {resumoCampos(ultima)}</>}
          <span className="text-gray-400"> — {dataHora(ultima.alterado_em)}</span>
        </span>
        <span className="shrink-0 text-xs font-medium text-fonti-primary">
          Ver histórico ({visiveis.length})
        </span>
      </button>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="w-[calc(100vw-1rem)] sm:max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Histórico de alterações</DialogTitle>
            <DialogDescription>
              Clique numa alteração para ver o valor antes e depois.
            </DialogDescription>
          </DialogHeader>
          <ul className="overflow-y-auto -mx-1 px-1">
            {visiveis.map(a => <ItemAlteracao key={a.id} a={a} />)}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  )
}
