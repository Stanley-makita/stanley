'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import { RotateCcw, Save, ShieldCheck, Lock, ShieldAlert } from 'lucide-react'
import { useAuth } from '@/hooks/auth/useAuth'
import { PERFIS_ATIVOS, PERFIL_LABELS } from '@/types/configuracoes'
import { type Acao, type UsuarioPerfil } from '@/types/auth'
import { MODULOS, type ModuloDef, type AcaoModuloDef } from '@/lib/auth/modulos'
import { construirMapaOverrides, resolverPermissao } from '@/hooks/auth/permissaoResolver'
import {
  useOverridesEmpresa, useSalvarOverrides, useRestaurarPadrao, type OverrideParaSalvar,
} from '../../_hooks/usePerfilPermissoesAdmin'
import { aplicarToggle } from '../../_hooks/permissoesMatrizHelpers'

const PERFIS_EDITAVEIS = PERFIS_ATIVOS.filter((p) => p !== 'admin')

export function PerfisPermissoesConfig() {
  const { usuario } = useAuth()

  // Subseção exclusiva de Admin — checagem fixa, não reaproveita usuarios.convidar
  // nem cria uma ação nova. Gestor continua acessando o resto de Configurações
  // normalmente (matriz já concede configuracoes.ver a ele); só esta tela é bloqueada.
  if (usuario?.perfil !== 'admin') {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
        <ShieldAlert className="h-8 w-8 text-gray-300" />
        <p className="text-sm text-gray-500">Esta seção é exclusiva para o perfil Administrador.</p>
      </div>
    )
  }

  return <PerfisPermissoesConfigInner />
}

function PerfisPermissoesConfigInner() {
  const [perfilSelecionado, setPerfilSelecionado] = useState<UsuarioPerfil>(PERFIS_EDITAVEIS[0])
  const [pendentes, setPendentes] = useState<Partial<Record<Acao, boolean>>>({})
  const [confirmandoRestaurar, setConfirmandoRestaurar] = useState(false)

  const { data: rows = [], isLoading } = useOverridesEmpresa()
  const salvar = useSalvarOverrides()
  const restaurar = useRestaurarPadrao()

  const isAdminSelecionado = perfilSelecionado === 'admin'
  const overridesMap = useMemo(() => construirMapaOverrides(rows), [rows])

  function valorEfetivo(acao: Acao): boolean {
    if (isAdminSelecionado) return true
    if (acao in pendentes) return pendentes[acao]!
    return resolverPermissao(perfilSelecionado, acao, overridesMap)
  }

  function trocarPerfil(perfil: UsuarioPerfil) {
    if (Object.keys(pendentes).length > 0) {
      const confirma = window.confirm('Você tem alterações não salvas. Trocar de perfil descarta essas alterações. Continuar?')
      if (!confirma) return
    }
    setPerfilSelecionado(perfil)
    setPendentes({})
  }

  function toggle(modulo: ModuloDef, acaoDef: AcaoModuloDef) {
    if (isAdminSelecionado) return
    setPendentes((prev) => aplicarToggle(modulo, acaoDef, valorEfetivo, prev))
  }

  async function handleSalvar() {
    const overrides: OverrideParaSalvar[] = Object.entries(pendentes).map(([acao, permitido]) => ({
      perfil: perfilSelecionado,
      acao: acao as Acao,
      permitido: permitido!,
    }))
    try {
      await salvar.mutateAsync(overrides)
      setPendentes({})
      toast.success(`Permissões de ${PERFIL_LABELS[perfilSelecionado]} salvas.`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao salvar permissões.')
    }
  }

  async function handleRestaurar() {
    try {
      await restaurar.mutateAsync(perfilSelecionado)
      setPendentes({})
      setConfirmandoRestaurar(false)
      toast.success(`Permissões de ${PERFIL_LABELS[perfilSelecionado]} restauradas para o padrão.`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao restaurar padrão.')
    }
  }

  const haAlteracoes = Object.keys(pendentes).length > 0

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <label className="text-sm text-gray-600 shrink-0">Perfil</label>
        <Select value={perfilSelecionado} onValueChange={(v) => trocarPerfil(v as UsuarioPerfil)}>
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERFIS_ATIVOS.map((p) => (
              <SelectItem key={p} value={p}>{PERFIL_LABELS[p]}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="ml-auto flex items-center gap-2">
          {!isAdminSelecionado && (
            <Button
              variant="outline" size="sm"
              onClick={() => setConfirmandoRestaurar(true)}
              disabled={restaurar.isPending}
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
              Restaurar padrão
            </Button>
          )}
          {!isAdminSelecionado && (
            <Button
              size="sm"
              onClick={handleSalvar}
              disabled={!haAlteracoes || salvar.isPending}
            >
              <Save className="h-3.5 w-3.5 mr-1.5" />
              Salvar alterações
            </Button>
          )}
        </div>
      </div>

      {isAdminSelecionado && (
        <p className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
          Admin sempre possui acesso total — não é editável nesta tela.
        </p>
      )}

      {isLoading ? (
        <p className="text-sm text-gray-400">Carregando...</p>
      ) : (
        <div className="rounded-xl border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs text-gray-500">
                <th className="px-4 py-2 font-medium">Módulo</th>
                <th className="px-4 py-2 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {MODULOS.map((modulo) => (
                <tr key={modulo.key}>
                  <td className="px-4 py-3 align-top text-gray-700 font-medium whitespace-nowrap">
                    {modulo.label}
                    {modulo.travado && (
                      <span className="ml-1.5 inline-flex items-center gap-1 text-[10px] text-gray-400 font-normal">
                        <Lock className="h-3 w-3" /> sempre visível
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-x-5 gap-y-2">
                      {modulo.acoes.map((acaoDef) => {
                        const bloqueado = modulo.travado || isAdminSelecionado || acaoDef.configuravel === false
                        const marcado = modulo.travado ? true : valorEfetivo(acaoDef.acao)
                        return (
                          <label
                            key={acaoDef.acao}
                            title={acaoDef.motivoBloqueio}
                            className={`flex items-center gap-1.5 text-xs ${bloqueado ? 'text-gray-400' : 'text-gray-700 cursor-pointer'}`}
                          >
                            <Checkbox
                              checked={marcado}
                              disabled={bloqueado}
                              onCheckedChange={() => toggle(modulo, acaoDef)}
                            />
                            {acaoDef.label}
                            {acaoDef.configuravel === false && (
                              <Lock className="h-3 w-3 text-gray-300" />
                            )}
                          </label>
                        )
                      })}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={confirmandoRestaurar} onOpenChange={setConfirmandoRestaurar}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Restaurar padrão de {PERFIL_LABELS[perfilSelecionado]}</DialogTitle>
            <DialogDescription>
              Isso apaga todas as personalizações feitas para o perfil {PERFIL_LABELS[perfilSelecionado]} nesta empresa —
              volta a usar a matriz padrão do sistema. Outros perfis e outras empresas não são afetados. Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmandoRestaurar(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleRestaurar} disabled={restaurar.isPending}>
              Restaurar padrão
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
