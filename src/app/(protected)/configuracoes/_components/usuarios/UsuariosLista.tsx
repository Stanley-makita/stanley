'use client'

import { useState } from 'react'
import { Plus, Pencil, PowerOff, Power } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { useUsuarios, useAtualizarUsuario } from '../../_hooks/useUsuarios'
import { UsuarioFormDrawer } from './UsuarioFormDrawer'
import { PERFIL_LABELS, PERFIL_CORES, FUNCAO_LABELS } from '@/types/configuracoes'
import type { Usuario, UsuarioFuncao } from '@/types/configuracoes'
import { cn } from '@/lib/utils'

function Avatar({ nome }: { nome: string }) {
  return (
    <div className="w-8 h-8 rounded-full bg-[#253B29]/10 flex items-center justify-center shrink-0">
      <span className="text-[#253B29] font-semibold text-xs uppercase">{nome.charAt(0)}</span>
    </div>
  )
}

export function UsuariosLista() {
  const { data: usuarios, isLoading, error } = useUsuarios()
  const atualizar = useAtualizarUsuario()

  const [drawerAberto, setDrawerAberto] = useState(false)
  const [usuarioEditando, setUsuarioEditando] = useState<Usuario | null>(null)

  function abrirCriar() {
    setUsuarioEditando(null)
    setDrawerAberto(true)
  }

  function abrirEditar(u: Usuario) {
    setUsuarioEditando(u)
    setDrawerAberto(true)
  }

  async function toggleAtivo(u: Usuario) {
    try {
      await atualizar.mutateAsync({ id: u.id, ativo: !u.ativo })
      toast.success(u.ativo ? 'Usuário desativado' : 'Usuário ativado')
    } catch {
      toast.error('Não foi possível alterar o status')
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    )
  }

  if (error) {
    return <p className="text-red-600 text-sm">Não foi possível carregar os usuários. Tente novamente.</p>
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">
          {usuarios?.length ?? 0} usuário{usuarios?.length !== 1 ? 's' : ''} cadastrado{usuarios?.length !== 1 ? 's' : ''}
        </p>
        <Button
          size="sm"
          className="bg-[#253B29] hover:bg-[#1a2b1e] text-white gap-1.5"
          onClick={abrirCriar}
        >
          <Plus className="h-4 w-4" />
          Novo Usuário
        </Button>
      </div>

      {!usuarios?.length ? (
        <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
          <p className="text-sm text-gray-400">Nenhum usuário cadastrado ainda.</p>
          <Button size="sm" variant="outline" onClick={abrirCriar} className="gap-1.5">
            <Plus className="h-4 w-4" />
            Cadastrar primeiro usuário
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          {/* Cabeçalho */}
          <div className="grid grid-cols-[2fr_2fr_1fr_1fr_1fr_auto] gap-3 px-4 py-2.5 bg-gray-50 border-b text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
            <span>Nome</span>
            <span>E-mail</span>
            <span>Perfil</span>
            <span>Função</span>
            <span>Status</span>
            <span />
          </div>

          {/* Linhas */}
          {usuarios.map((u) => {
            const funcaoLabel = u.funcao
              ? (FUNCAO_LABELS[u.funcao as UsuarioFuncao] ?? u.funcao)
              : '—'
            return (
              <div
                key={u.id}
                className={cn(
                  'grid grid-cols-[2fr_2fr_1fr_1fr_1fr_auto] gap-3 px-4 py-3 items-center border-b last:border-0 hover:bg-gray-50/70 transition-colors',
                  !u.ativo && 'opacity-60'
                )}
              >
                {/* Nome + avatar */}
                <div className="flex items-center gap-2.5 min-w-0">
                  <Avatar nome={u.nome} />
                  <span className="text-sm font-medium text-gray-800 truncate">{u.nome}</span>
                </div>

                {/* E-mail */}
                <span className="text-sm text-gray-500 truncate">{u.email}</span>

                {/* Perfil */}
                <Badge className={cn('text-[11px] font-medium', PERFIL_CORES[u.perfil] ?? 'bg-gray-100 text-gray-600')}>
                  {PERFIL_LABELS[u.perfil] ?? u.perfil}
                </Badge>

                {/* Função */}
                <span className="text-sm text-gray-600">{funcaoLabel}</span>

                {/* Status */}
                <Badge className={cn(
                  'text-[11px] font-medium',
                  u.ativo ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                )}>
                  {u.ativo ? 'Ativo' : 'Inativo'}
                </Badge>

                {/* Ações */}
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-gray-400 hover:text-[#253B29]"
                    onClick={() => abrirEditar(u)}
                    title="Editar"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn(
                      'h-7 w-7 p-0',
                      u.ativo
                        ? 'text-gray-400 hover:text-red-500'
                        : 'text-gray-400 hover:text-green-600'
                    )}
                    onClick={() => toggleAtivo(u)}
                    disabled={atualizar.isPending}
                    title={u.ativo ? 'Desativar' : 'Ativar'}
                  >
                    {u.ativo
                      ? <PowerOff className="h-3.5 w-3.5" />
                      : <Power    className="h-3.5 w-3.5" />
                    }
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <UsuarioFormDrawer
        aberto={drawerAberto}
        onFechar={() => setDrawerAberto(false)}
        usuario={usuarioEditando}
      />
    </>
  )
}
