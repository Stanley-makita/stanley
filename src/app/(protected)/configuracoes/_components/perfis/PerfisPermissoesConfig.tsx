'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel, SelectSeparator,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import { RotateCcw, Save, ShieldCheck, Lock, ShieldAlert, Plus, Pencil, PowerOff } from 'lucide-react'
import { useAuth } from '@/hooks/auth/useAuth'
import { PERFIS_ATIVOS, PERFIL_LABELS } from '@/types/configuracoes'
import { type Acao, type UsuarioPerfil } from '@/types/auth'
import { MODULOS, type ModuloDef, type AcaoModuloDef } from '@/lib/auth/modulos'
import { construirMapaOverrides, resolverPermissao } from '@/hooks/auth/permissaoResolver'
import {
  useOverridesEmpresa, useSalvarPlano, useRestaurarPadrao,
} from '../../_hooks/usePerfilPermissoesAdmin'
import { aplicarToggle, planejarSalvamento, planejarSalvamentoCustomizado } from '../../_hooks/permissoesMatrizHelpers'
import {
  usePerfisCustomizados, useCriarPerfilCustomizado, useRenomearPerfilCustomizado,
  useDesativarPerfilCustomizado, useOverridesPerfilCustomizado, useSalvarPlanoCustomizado,
} from '../../_hooks/usePerfisCustomizados'

const PERFIS_EDITAVEIS = PERFIS_ATIVOS.filter((p) => p !== 'admin')

/** Seleção do dropdown: um dos 7 perfis fixos, ou o id de um perfil customizado. */
type SelecaoPerfil = { tipo: 'fixo'; perfil: UsuarioPerfil } | { tipo: 'customizado'; id: string }

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
  const [selecao, setSelecao] = useState<SelecaoPerfil>({ tipo: 'fixo', perfil: PERFIS_EDITAVEIS[0] })
  const [pendentes, setPendentes] = useState<Partial<Record<Acao, boolean>>>({})
  const [confirmandoRestaurar, setConfirmandoRestaurar] = useState(false)
  const [confirmandoDesativar, setConfirmandoDesativar] = useState(false)
  const [dialogCriar, setDialogCriar] = useState(false)
  const [dialogRenomear, setDialogRenomear] = useState(false)
  const [nomeNovoPerfil, setNomeNovoPerfil] = useState('')

  const { data: rows = [], isLoading, error: erroCarregarOverrides } = useOverridesEmpresa()
  const salvar = useSalvarPlano()
  const restaurar = useRestaurarPadrao()

  const { data: perfisCustomizados = [] } = usePerfisCustomizados()
  const perfisCustomizadosAtivos = perfisCustomizados.filter((p) => p.ativo)
  const criarPerfil = useCriarPerfilCustomizado()
  const renomearPerfil = useRenomearPerfilCustomizado()
  const desativarPerfil = useDesativarPerfilCustomizado()
  const salvarCustomizado = useSalvarPlanoCustomizado()

  const perfilCustomizadoIdSelecionado = selecao.tipo === 'customizado' ? selecao.id : null
  const perfilCustomizadoSelecionado = perfisCustomizados.find((p) => p.id === perfilCustomizadoIdSelecionado) ?? null
  const { data: rowsCustomizado = [] } = useOverridesPerfilCustomizado(perfilCustomizadoIdSelecionado)

  // Se a tabela perfil_permissoes ainda não existir (migration não aplicada), a busca
  // falha — Sidebar/RouteGuard continuam funcionando normalmente (caem no padrão do
  // código), mas esta tela precisa avisar em vez de parecer que está tudo normal e só
  // falhar de forma confusa quando o admin tentar salvar.
  const configuracaoIndisponivel = !!erroCarregarOverrides

  const isAdminSelecionado = selecao.tipo === 'fixo' && selecao.perfil === 'admin'
  const overridesMap = useMemo(() => construirMapaOverrides(rows), [rows])
  const overridesCustomizadoMap = useMemo(
    () => construirMapaOverrides(rowsCustomizado.map((r) => ({ perfil: `customizado:${perfilCustomizadoIdSelecionado}`, acao: r.acao, permitido: r.permitido }))),
    [rowsCustomizado, perfilCustomizadoIdSelecionado],
  )
  const acoesComLinhaNoBanco = useMemo(() => new Set(rowsCustomizado.map((r) => r.acao)), [rowsCustomizado])

  function valorEfetivo(acao: Acao): boolean {
    if (isAdminSelecionado) return true
    if (acao in pendentes) return pendentes[acao]!
    if (selecao.tipo === 'customizado') {
      return resolverPermissao('customizado', acao, overridesCustomizadoMap, undefined, selecao.id)
    }
    return resolverPermissao(selecao.perfil, acao, overridesMap)
  }

  function confirmarTrocaSeNecessario(): boolean {
    if (Object.keys(pendentes).length === 0) return true
    return window.confirm('Você tem alterações não salvas. Trocar de perfil descarta essas alterações. Continuar?')
  }

  function trocarPerfilFixo(perfil: UsuarioPerfil) {
    if (!confirmarTrocaSeNecessario()) return
    setSelecao({ tipo: 'fixo', perfil })
    setPendentes({})
  }

  function trocarPerfilCustomizado(id: string) {
    if (!confirmarTrocaSeNecessario()) return
    setSelecao({ tipo: 'customizado', id })
    setPendentes({})
  }

  function onSelectChange(valor: string) {
    const customizado = perfisCustomizados.find((p) => p.id === valor)
    if (customizado) {
      trocarPerfilCustomizado(customizado.id)
    } else {
      trocarPerfilFixo(valor as UsuarioPerfil)
    }
  }

  function toggle(modulo: ModuloDef, acaoDef: AcaoModuloDef) {
    if (isAdminSelecionado) return
    setPendentes((prev) => aplicarToggle(modulo, acaoDef, valorEfetivo, prev))
  }

  async function handleSalvar() {
    try {
      if (selecao.tipo === 'customizado') {
        const plano = planejarSalvamentoCustomizado(pendentes, acoesComLinhaNoBanco)
        await salvarCustomizado.mutateAsync({ perfilCustomizadoId: selecao.id, upserts: plano.upserts, deletes: plano.deletes })
        setPendentes({})
        toast.success(`Permissões de ${perfilCustomizadoSelecionado?.nome} salvas.`)
      } else {
        const plano = planejarSalvamento(pendentes, selecao.perfil, overridesMap)
        await salvar.mutateAsync({ perfil: selecao.perfil, upserts: plano.upserts, deletes: plano.deletes })
        setPendentes({})
        toast.success(`Permissões de ${PERFIL_LABELS[selecao.perfil]} salvas.`)
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao salvar permissões.')
    }
  }

  async function handleRestaurar() {
    if (selecao.tipo !== 'fixo') return
    try {
      await restaurar.mutateAsync(selecao.perfil)
      setPendentes({})
      setConfirmandoRestaurar(false)
      toast.success(`Permissões de ${PERFIL_LABELS[selecao.perfil]} restauradas para o padrão.`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao restaurar padrão.')
    }
  }

  async function handleCriarPerfil() {
    const nome = nomeNovoPerfil.trim()
    if (!nome) return
    try {
      const novo = await criarPerfil.mutateAsync(nome)
      setDialogCriar(false)
      setNomeNovoPerfil('')
      setSelecao({ tipo: 'customizado', id: novo.id })
      setPendentes({})
      toast.success(`Perfil "${nome}" criado.`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao criar perfil.')
    }
  }

  async function handleRenomearPerfil() {
    if (selecao.tipo !== 'customizado') return
    const nome = nomeNovoPerfil.trim()
    if (!nome) return
    try {
      await renomearPerfil.mutateAsync({ id: selecao.id, nome })
      setDialogRenomear(false)
      setNomeNovoPerfil('')
      toast.success('Perfil renomeado.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao renomear perfil.')
    }
  }

  async function handleDesativarPerfil() {
    if (selecao.tipo !== 'customizado') return
    try {
      await desativarPerfil.mutateAsync(selecao.id)
      setConfirmandoDesativar(false)
      setSelecao({ tipo: 'fixo', perfil: PERFIS_EDITAVEIS[0] })
      setPendentes({})
      toast.success('Perfil desativado.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao desativar perfil.')
    }
  }

  const haAlteracoes = Object.keys(pendentes).length > 0
  const valorSelectAtual = selecao.tipo === 'fixo' ? selecao.perfil : selecao.id

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <label className="text-sm text-gray-600 shrink-0">Perfil</label>
        <Select value={valorSelectAtual} onValueChange={onSelectChange}>
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {PERFIS_ATIVOS.map((p) => (
                <SelectItem key={p} value={p}>{PERFIL_LABELS[p]}</SelectItem>
              ))}
            </SelectGroup>
            {perfisCustomizadosAtivos.length > 0 && (
              <>
                <SelectSeparator />
                <SelectGroup>
                  <SelectLabel>Perfis customizados</SelectLabel>
                  {perfisCustomizadosAtivos.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                  ))}
                </SelectGroup>
              </>
            )}
          </SelectContent>
        </Select>

        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { setNomeNovoPerfil(''); setDialogCriar(true) }}>
          <Plus className="h-3.5 w-3.5" />
          Criar novo perfil
        </Button>

        {selecao.tipo === 'customizado' && (
          <>
            <Button
              size="sm" variant="outline" className="gap-1.5"
              onClick={() => { setNomeNovoPerfil(perfilCustomizadoSelecionado?.nome ?? ''); setDialogRenomear(true) }}
            >
              <Pencil className="h-3.5 w-3.5" />
              Renomear
            </Button>
            <Button
              size="sm" variant="outline" className="gap-1.5 text-red-600 hover:text-red-700"
              onClick={() => setConfirmandoDesativar(true)}
            >
              <PowerOff className="h-3.5 w-3.5" />
              Desativar
            </Button>
          </>
        )}

        <div className="ml-auto flex items-center gap-2">
          {selecao.tipo === 'fixo' && !isAdminSelecionado && (
            <Button
              variant="outline" size="sm"
              onClick={() => setConfirmandoRestaurar(true)}
              disabled={restaurar.isPending || configuracaoIndisponivel}
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
              Restaurar padrão
            </Button>
          )}
          {!isAdminSelecionado && (
            <Button
              size="sm"
              onClick={handleSalvar}
              disabled={!haAlteracoes || salvar.isPending || salvarCustomizado.isPending || configuracaoIndisponivel}
            >
              <Save className="h-3.5 w-3.5 mr-1.5" />
              Salvar alterações
            </Button>
          )}
        </div>
      </div>

      {configuracaoIndisponivel && (
        <p className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
          A configuração de Perfis de Acesso ainda não está disponível nesta empresa (a migration da tabela de permissões
          ainda não foi aplicada). O sistema continua funcionando normalmente com as permissões padrão — assim que a
          migration for aplicada, esta tela passa a permitir personalizar por perfil.
        </p>
      )}

      {isAdminSelecionado && !configuracaoIndisponivel && (
        <p className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
          Admin sempre possui acesso total — não é editável nesta tela.
        </p>
      )}

      {selecao.tipo === 'customizado' && !isAdminSelecionado && !configuracaoIndisponivel && (
        <p className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
          Perfil customizado — nasce sem nenhum acesso. Marque abaixo o que este perfil deve ver/fazer.
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

      <Dialog open={dialogCriar} onOpenChange={setDialogCriar}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Criar novo perfil de acesso</DialogTitle>
            <DialogDescription>O perfil nasce sem nenhum acesso — você marca manualmente o que ele pode fazer, logo em seguida.</DialogDescription>
          </DialogHeader>
          <Input placeholder="Ex: Externo" value={nomeNovoPerfil} onChange={(e) => setNomeNovoPerfil(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogCriar(false)}>Cancelar</Button>
            <Button onClick={handleCriarPerfil} disabled={!nomeNovoPerfil.trim() || criarPerfil.isPending}>Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogRenomear} onOpenChange={setDialogRenomear}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Renomear perfil</DialogTitle>
          </DialogHeader>
          <Input placeholder="Nome do perfil" value={nomeNovoPerfil} onChange={(e) => setNomeNovoPerfil(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogRenomear(false)}>Cancelar</Button>
            <Button onClick={handleRenomearPerfil} disabled={!nomeNovoPerfil.trim() || renomearPerfil.isPending}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmandoDesativar} onOpenChange={setConfirmandoDesativar}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Desativar perfil "{perfilCustomizadoSelecionado?.nome}"?</DialogTitle>
            <DialogDescription>
              Usuários já vinculados a este perfil continuam funcionando normalmente. O perfil só some da lista para novos cadastros/convites.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmandoDesativar(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDesativarPerfil} disabled={desativarPerfil.isPending}>Desativar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmandoRestaurar} onOpenChange={setConfirmandoRestaurar}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Restaurar padrão de {selecao.tipo === 'fixo' ? PERFIL_LABELS[selecao.perfil] : ''}</DialogTitle>
            <DialogDescription>
              Isso apaga todas as personalizações feitas para este perfil nesta empresa — volta a usar a matriz padrão
              do sistema. Outros perfis e outras empresas não são afetados. Esta ação não pode ser desfeita.
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
