'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Eye, EyeOff, KeyRound } from 'lucide-react'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet'
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { useCriarUsuario, useAtualizarUsuario, useResetSenha } from '../../_hooks/useUsuarios'
import {
  PERFIS_ATIVOS, PERFIL_LABELS, FUNCOES, FUNCAO_LABELS,
} from '@/types/configuracoes'
import type { Usuario, UsuarioPerfil } from '@/types/configuracoes'

const schemaCriar = z.object({
  nome:   z.string().min(2, 'Informe o nome completo'),
  email:  z.string().email('E-mail inválido'),
  senha:  z.string().min(6, 'Senha deve ter ao menos 6 caracteres'),
  perfil: z.string().min(1, 'Selecione um perfil') as z.ZodType<UsuarioPerfil>,
  funcao: z.string().min(1, 'Selecione a função'),
  ativo:  z.boolean(),
})

const schemaEditar = z.object({
  nome:               z.string().min(2, 'Informe o nome completo'),
  perfil:             z.string().min(1, 'Selecione um perfil') as z.ZodType<UsuarioPerfil>,
  funcao:             z.string().min(1, 'Selecione a função'),
  ativo:              z.boolean(),
  telefone_whatsapp:  z.string().optional(),
})

type FormCriar  = z.infer<typeof schemaCriar>
type FormEditar = z.infer<typeof schemaEditar>

interface Props {
  aberto: boolean
  onFechar: () => void
  usuario?: Usuario | null
}

export function UsuarioFormDrawer({ aberto, onFechar, usuario }: Props) {
  const modoEdicao = !!usuario

  const criarUsuario    = useCriarUsuario()
  const atualizarUsuario = useAtualizarUsuario()
  const resetSenha      = useResetSenha()

  const [mostrarSenha, setMostrarSenha]   = useState(false)
  const [modalReset, setModalReset]       = useState(false)
  const [novaSenha, setNovaSenha]         = useState('')
  const [mostrarNovaSenha, setMostrarNovaSenha] = useState(false)

  const form = useForm<FormCriar>({
    resolver: zodResolver(modoEdicao ? schemaEditar : schemaCriar) as never,
    defaultValues: {
      nome:   '',
      email:  '',
      senha:  '',
      perfil: 'comercial' as UsuarioPerfil,
      funcao: 'comercial',
      ativo:  true,
    },
  })

  useEffect(() => {
    if (aberto) {
      if (usuario) {
        form.reset({
          nome:              usuario.nome,
          perfil:            PERFIS_ATIVOS.includes(usuario.perfil) ? usuario.perfil : 'comercial' as UsuarioPerfil,
          funcao:            usuario.funcao ?? 'comercial',
          ativo:             usuario.ativo,
          telefone_whatsapp: (usuario as unknown as { telefone_whatsapp?: string }).telefone_whatsapp ?? '',
        } as unknown as FormCriar)
      } else {
        form.reset({
          nome:   '',
          email:  '',
          senha:  '',
          perfil: 'comercial' as UsuarioPerfil,
          funcao: 'comercial',
          ativo:  true,
        })
      }
      setMostrarSenha(false)
    }
  }, [aberto]) // eslint-disable-line react-hooks/exhaustive-deps

  async function onSubmit(data: FormCriar) {
    try {
      if (modoEdicao) {
        await atualizarUsuario.mutateAsync({
          id:               usuario!.id,
          nome:             data.nome,
          perfil:           data.perfil,
          funcao:           data.funcao,
          ativo:            data.ativo,
          telefone_whatsapp: (data as unknown as { telefone_whatsapp?: string }).telefone_whatsapp?.trim() || null,
        })
        toast.success('Usuário atualizado')
      } else {
        await criarUsuario.mutateAsync({
          nome:   data.nome,
          email:  data.email,
          senha:  data.senha,
          perfil: data.perfil,
          funcao: data.funcao,
          ativo:  data.ativo,
        })
        toast.success('Usuário criado com sucesso')
      }
      onFechar()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro inesperado')
    }
  }

  async function confirmarResetSenha() {
    try {
      await resetSenha.mutateAsync({ id: usuario!.id, novaSenha })
      toast.success('Senha redefinida com sucesso')
      setModalReset(false)
      setNovaSenha('')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao redefinir senha')
    }
  }

  const isPending = criarUsuario.isPending || atualizarUsuario.isPending

  return (
    <>
      <Sheet open={aberto} onOpenChange={onFechar}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="text-[#253B29]">
              {modoEdicao ? 'Editar usuário' : 'Novo usuário'}
            </SheetTitle>
          </SheetHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="mt-6 space-y-4">
              <FormField control={form.control} name="nome" render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome completo</FormLabel>
                  <FormControl><Input placeholder="Maria da Silva" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              {!modoEdicao && (
                <>
                  <FormField control={form.control} name="email" render={({ field }) => (
                    <FormItem>
                      <FormLabel>E-mail</FormLabel>
                      <FormControl><Input type="email" placeholder="usuario@empresa.com" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="senha" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Senha provisória</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            type={mostrarSenha ? 'text' : 'password'}
                            placeholder="Mínimo 6 caracteres"
                            {...field}
                          />
                          <button
                            type="button"
                            onClick={() => setMostrarSenha((v) => !v)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                            tabIndex={-1}
                          >
                            {mostrarSenha ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </>
              )}

              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="perfil" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Perfil de acesso</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {PERFIS_ATIVOS.map((p) => (
                          <SelectItem key={p} value={p}>{PERFIL_LABELS[p]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="funcao" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Função</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {FUNCOES.map((f) => (
                          <SelectItem key={f} value={f}>{FUNCAO_LABELS[f]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              {modoEdicao && (
                <FormField
                  control={form.control}
                  name={'telefone_whatsapp' as 'nome'}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>WhatsApp pessoal <span className="text-gray-400 font-normal text-xs">(para comandos *Fonti)</span></FormLabel>
                      <FormControl>
                        <Input
                          placeholder="5544999990000 (com DDI)"
                          {...field}
                          value={(field.value as string) ?? ''}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField control={form.control} name="ativo" render={({ field }) => (
                <FormItem>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={field.value}
                      onClick={() => field.onChange(!field.value)}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                        field.value ? 'bg-[#253B29]' : 'bg-gray-200'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition-transform ${
                          field.value ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </button>
                    <FormLabel className="cursor-pointer" onClick={() => field.onChange(!field.value)}>
                      {field.value ? 'Usuário ativo' : 'Usuário inativo'}
                    </FormLabel>
                  </div>
                </FormItem>
              )} />

              <div className="flex justify-between items-center pt-4">
                {modoEdicao ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-gray-600"
                    onClick={() => setModalReset(true)}
                  >
                    <KeyRound className="h-4 w-4" />
                    Redefinir senha
                  </Button>
                ) : (
                  <span />
                )}
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={onFechar}>
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    className="bg-[#253B29] hover:bg-[#1a2b1e] text-white"
                    disabled={isPending}
                  >
                    {isPending ? 'Salvando...' : modoEdicao ? 'Salvar' : 'Criar usuário'}
                  </Button>
                </div>
              </div>
            </form>
          </Form>
        </SheetContent>
      </Sheet>

      <Dialog open={modalReset} onOpenChange={setModalReset}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Redefinir senha</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            Digite a nova senha para <strong>{usuario?.nome}</strong>. O usuário deverá usá-la no próximo acesso.
          </p>
          <div className="relative">
            <Input
              type={mostrarNovaSenha ? 'text' : 'password'}
              placeholder="Nova senha (mín. 6 caracteres)"
              value={novaSenha}
              onChange={(e) => setNovaSenha(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setMostrarNovaSenha((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              tabIndex={-1}
            >
              {mostrarNovaSenha ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setModalReset(false); setNovaSenha('') }}>
              Cancelar
            </Button>
            <Button
              onClick={confirmarResetSenha}
              disabled={novaSenha.length < 6 || resetSenha.isPending}
              className="bg-[#253B29] hover:bg-[#1a2b1e] text-white"
            >
              {resetSenha.isPending ? 'Salvando...' : 'Confirmar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
