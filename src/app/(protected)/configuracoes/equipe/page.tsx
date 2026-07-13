'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { type Usuario } from '@/types/auth'
import { ConviteFormDrawer } from '@/components/auth/ConviteFormDrawer'
import { UsuarioPerfilBadge } from '@/components/auth/UsuarioPerfilBadge'
import { useConvites, useCancelarConvite } from '@/hooks/auth/useConvites'
import { usePermissao } from '@/lib/auth/guards'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Trash2 } from 'lucide-react'

function useUsuariosEquipe() {
  return useQuery({
    queryKey: ['usuarios', 'equipe'],
    queryFn: async (): Promise<Usuario[]> => {
      const { data, error } = await supabase
        .from('usuarios')
        .select('*')
        .is('deleted_at', null)
        .order('nome')

      if (error) throw error
      return data
    },
    staleTime: 1000 * 60 * 5,
  })
}

function useAlternarAtivo() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await supabase
        .from('usuarios')
        .update({ ativo })
        .eq('id', id)

      if (error) throw error
    },
    onSuccess: (_, { ativo }) => {
      queryClient.invalidateQueries({ queryKey: ['usuarios', 'equipe'] })
      toast.success(ativo ? 'Usuário ativado.' : 'Usuário desativado.', {
        className: 'border-l-4 border-l-fonti-accent bg-fonti-accent-hover text-fonti-primary',
      })
    },
  })
}

// "Versão enxuta" do sistema de autorizações: um único toggle por usuário
// (não um checklist completo de permissões por perfil ainda) — controla quem
// recebe o escalonamento de "lead aprovado sem Processo há 10+ dias" (ver
// escalonarParaGestores em src/app/api/leads/followup/notificar/route.ts).
function useAlternarNotificarLeadsAprovados() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, valor }: { id: string; valor: boolean }) => {
      const { error } = await supabase
        .from('usuarios')
        .update({ notificar_leads_aprovados_pendentes: valor })
        .eq('id', id)

      if (error) throw error
    },
    onSuccess: (_, { valor }) => {
      queryClient.invalidateQueries({ queryKey: ['usuarios', 'equipe'] })
      toast.success(valor ? 'Notificação ativada.' : 'Notificação desativada.', {
        className: 'border-l-4 border-l-fonti-accent bg-fonti-accent-hover text-fonti-primary',
      })
    },
  })
}

export default function EquipePage() {
  const { pode } = usePermissao()
  const { data: usuarios, isLoading: loadingUsuarios } = useUsuariosEquipe()
  const { data: convites, isLoading: loadingConvites } = useConvites()
  const alternarAtivo = useAlternarAtivo()
  const alternarNotificarLeadsAprovados = useAlternarNotificarLeadsAprovados()
  const cancelarConvite = useCancelarConvite()
  const [tabAtiva, setTabAtiva] = useState('membros')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-fonti-primary">Equipe</h2>
          <p className="text-sm text-gray-500">Gerencie os membros e acessos da sua equipe</p>
        </div>
        {pode('usuarios.convidar') && <ConviteFormDrawer />}
      </div>

      <Tabs value={tabAtiva} onValueChange={setTabAtiva}>
        <TabsList className="bg-gray-100">
          <TabsTrigger
            value="membros"
            className="data-[state=active]:bg-fonti-primary data-[state=active]:text-white"
          >
            Membros ({usuarios?.length ?? 0})
          </TabsTrigger>
          <TabsTrigger
            value="convites"
            className="data-[state=active]:bg-fonti-primary data-[state=active]:text-white"
          >
            Convites pendentes ({convites?.length ?? 0})
          </TabsTrigger>
        </TabsList>

        {/* Tab: Membros */}
        <TabsContent value="membros">
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50">
                  <TableHead>Nome</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Perfil</TableHead>
                  <TableHead>Último acesso</TableHead>
                  {pode('usuarios.desativar') && <TableHead>Ativo</TableHead>}
                  {pode('usuarios.desativar') && <TableHead>Notificar leads pendentes</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingUsuarios ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-gray-400 py-8">
                      Carregando...
                    </TableCell>
                  </TableRow>
                ) : usuarios?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-gray-400 py-8">
                      Nenhum membro encontrado.
                    </TableCell>
                  </TableRow>
                ) : (
                  usuarios?.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium text-fonti-primary">{u.nome}</TableCell>
                      <TableCell className="text-gray-600">{u.email}</TableCell>
                      <TableCell>
                        <UsuarioPerfilBadge perfil={u.perfil} />
                      </TableCell>
                      <TableCell className="text-gray-500 text-sm">
                        {u.ultimo_acesso
                          ? formatDistanceToNow(new Date(u.ultimo_acesso), {
                              addSuffix: true,
                              locale: ptBR,
                            })
                          : 'Nunca acessou'}
                      </TableCell>
                      {pode('usuarios.desativar') && (
                        <TableCell>
                          <Switch
                            checked={u.ativo}
                            onCheckedChange={(v) => alternarAtivo.mutate({ id: u.id, ativo: v })}
                          />
                        </TableCell>
                      )}
                      {pode('usuarios.desativar') && (
                        <TableCell>
                          <Switch
                            checked={u.notificar_leads_aprovados_pendentes}
                            onCheckedChange={(v) => alternarNotificarLeadsAprovados.mutate({ id: u.id, valor: v })}
                          />
                        </TableCell>
                      )}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* Tab: Convites */}
        <TabsContent value="convites">
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50">
                  <TableHead>E-mail</TableHead>
                  <TableHead>Perfil</TableHead>
                  <TableHead>Expira em</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingConvites ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-gray-400 py-8">
                      Carregando...
                    </TableCell>
                  </TableRow>
                ) : convites?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-gray-400 py-8">
                      Nenhum convite pendente.
                    </TableCell>
                  </TableRow>
                ) : (
                  convites?.map((c) => {
                    const expirado = new Date(c.expira_em) < new Date()
                    return (
                      <TableRow key={c.id}>
                        <TableCell className="text-fonti-primary">{c.email}</TableCell>
                        <TableCell>
                          <UsuarioPerfilBadge perfil={c.perfil} />
                        </TableCell>
                        <TableCell>
                          {expirado ? (
                            <Badge variant="destructive" className="text-xs">Expirado</Badge>
                          ) : (
                            <span className="text-sm text-gray-500">
                              {formatDistanceToNow(new Date(c.expira_em), {
                                addSuffix: true,
                                locale: ptBR,
                              })}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-red-500 hover:text-red-600 hover:bg-red-50"
                            onClick={() => cancelarConvite.mutate(c.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}