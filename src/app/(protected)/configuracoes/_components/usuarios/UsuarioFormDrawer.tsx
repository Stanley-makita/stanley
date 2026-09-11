'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Eye, EyeOff, KeyRound, Copy, Check } from 'lucide-react'
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel, SelectSeparator,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { useCriarUsuario, useAtualizarUsuario, useResetSenha, type VinculoRhPayload } from '../../_hooks/useUsuarios'
import { usePerfisCustomizados } from '../../_hooks/usePerfisCustomizados'
import { useCargos } from '@/hooks/rh/useCargos'
import { useFuncionariosDisponiveis } from '@/hooks/rh/useFuncionarios'
import { useRegrasComissao } from '@/hooks/rh/useComissoes'
import { RH_TIPO_CONTRATO_LABELS } from '@/types/rh'
import type { RhTipoContrato } from '@/types/rh'
import { PERFIS_ATIVOS, PERFIL_LABELS } from '@/types/configuracoes'
import type { Usuario, UsuarioPerfil, UsuarioTipo } from '@/types/configuracoes'

const NENHUM = '__nenhum__'
import { useUsuarioPermissoes, useSalvarPermissoesIndividuais } from '../../_hooks/useUsuarioPermissoesAdmin'
import {
  booleanoParaEstado, planejarPermissoesIndividuais, type EstadoPermissaoIndividual,
} from '../../_hooks/permissoesIndividuaisHelpers'
import { construirMapaOverridesUsuario } from '@/hooks/auth/permissaoResolver'
import type { Acao } from '@/types/auth'

const OPCOES_PERMISSAO_INDIVIDUAL: { value: EstadoPermissaoIndividual; label: string }[] = [
  { value: 'herdar',   label: 'Usar padrão do perfil' },
  { value: 'permitir', label: 'Permitir' },
  { value: 'bloquear', label: 'Bloquear' },
]

const PERMISSOES_INDIVIDUAIS_CONFIGURAVEIS: { acao: Acao; label: string }[] = [
  { acao: 'leads.ver_todas',    label: 'Ver todos os leads' },
  { acao: 'leads.redistribuir', label: 'Redistribuir leads' },
]

const schemaCriar = z.object({
  nome:     z.string().min(2, 'Informe o nome completo'),
  email:    z.string().email('E-mail inválido'),
  senha:    z.string().min(6, 'Senha deve ter ao menos 6 caracteres'),
  perfil:   z.string().min(1, 'Selecione um perfil') as z.ZodType<UsuarioPerfil>,
  tipo_usuario: z.enum(['interno', 'externo']),
  cargo_id: z.string().optional(),
  ativo:    z.boolean(),
})

const estadoPermissaoSchema = z.enum(['herdar', 'permitir', 'bloquear'])

const schemaEditar = z.object({
  nome:               z.string().min(2, 'Informe o nome completo'),
  email:              z.string().email('E-mail inválido'),
  perfil:             z.string().min(1, 'Selecione um perfil') as z.ZodType<UsuarioPerfil>,
  tipo_usuario:       z.enum(['interno', 'externo']),
  cargo_id:           z.string().optional(),
  ativo:              z.boolean(),
  telefone_whatsapp:  z.string().optional(),
  perm_leads_ver_todas:    estadoPermissaoSchema,
  perm_leads_redistribuir: estadoPermissaoSchema,
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
  const { data: cargos = [] } = useCargos()
  const { data: perfisCustomizados = [] } = usePerfisCustomizados()
  const perfisCustomizadosAtivos = perfisCustomizados.filter((p) => p.ativo)
  const { data: permissoesIndividuais = [] } = useUsuarioPermissoes(usuario?.id)
  const salvarPermissoesIndividuais = useSalvarPermissoesIndividuais()
  const { data: funcionariosDisponiveis = [] } = useFuncionariosDisponiveis(usuario?.funcionario_id)
  const { data: regrasComissao = [] } = useRegrasComissao()
  const regrasComissaoAtivas = regrasComissao.filter((r) => r.ativa)

  // Vínculo com RH — estado local (não faz parte do schema zod, já que só
  // é relevante condicionalmente conforme o perfil selecionado).
  const [vinculoModo, setVinculoModo] = useState<'existente' | 'novo'>('existente')
  const [funcionarioExistenteId, setFuncionarioExistenteId] = useState<string>(NENHUM)
  const [novoTipoContrato, setNovoTipoContrato] = useState<RhTipoContrato>('clt')
  const [novoDataAdmissao, setNovoDataAdmissao] = useState<string>('')
  const [novoRegraComissaoId, setNovoRegraComissaoId] = useState<string>(NENHUM)

  const [mostrarSenha, setMostrarSenha]   = useState(false)
  const [modalReset, setModalReset]       = useState(false)
  const [novaSenha, setNovaSenha]         = useState('')
  const [mostrarNovaSenha, setMostrarNovaSenha] = useState(false)
  const [tokenCopiado, setTokenCopiado] = useState(false)

  function copiarTokenTelefonia() {
    const token = usuario?.token_telefonia
    if (!token) return
    navigator.clipboard.writeText(token)
    setTokenCopiado(true)
    setTimeout(() => setTokenCopiado(false), 2000)
  }

  const form = useForm<FormCriar>({
    resolver: zodResolver(modoEdicao ? schemaEditar : schemaCriar) as never,
    defaultValues: {
      nome:     '',
      email:    '',
      senha:    '',
      perfil:   'comercial' as UsuarioPerfil,
      tipo_usuario: 'interno' as UsuarioTipo,
      cargo_id: '',
      ativo:    true,
    },
  })

  useEffect(() => {
    if (aberto) {
      if (usuario) {
        form.reset({
          nome:              usuario.nome,
          email:             usuario.email,
          perfil: usuario.perfil === 'customizado'
            ? (usuario.perfil_customizado_id ?? 'comercial')
            : (PERFIS_ATIVOS.includes(usuario.perfil) ? usuario.perfil : 'comercial' as UsuarioPerfil),
          tipo_usuario:      usuario.tipo_usuario ?? 'interno',
          cargo_id:          usuario.cargo_id ?? '',
          ativo:             usuario.ativo,
          telefone_whatsapp: usuario.telefone_whatsapp ?? '',
          perm_leads_ver_todas:    'herdar',
          perm_leads_redistribuir: 'herdar',
        } as unknown as FormCriar)
      } else {
        form.reset({
          nome:     '',
          email:    '',
          senha:    '',
          perfil:   'comercial' as UsuarioPerfil,
          tipo_usuario: 'interno' as UsuarioTipo,
          cargo_id: '',
          ativo:    true,
        })
      }
      setMostrarSenha(false)

      // Vínculo com RH: em edição, pré-seleciona o funcionário já vinculado
      // (se houver); em criação, começa em branco.
      if (usuario?.funcionario_id) {
        setVinculoModo('existente')
        setFuncionarioExistenteId(usuario.funcionario_id)
      } else {
        setVinculoModo('existente')
        setFuncionarioExistenteId(NENHUM)
      }
      setNovoTipoContrato('clt')
      setNovoDataAdmissao('')
      setNovoRegraComissaoId(NENHUM)
    }
  }, [aberto]) // eslint-disable-line react-hooks/exhaustive-deps

  // Os 3 estados de "Permissões individuais" dependem de uma query à parte
  // (useUsuarioPermissoes) que pode ainda não ter chegado quando o reset
  // acima roda — atualiza os 2 campos separadamente assim que os dados
  // chegam, sem interferir no reset dos demais campos do formulário.
  useEffect(() => {
    if (!aberto || !modoEdicao) return
    const overridesUsuario = construirMapaOverridesUsuario(permissoesIndividuais)
    form.setValue(
      'perm_leads_ver_todas' as 'perfil',
      booleanoParaEstado(overridesUsuario.get('leads.ver_todas')) as unknown as UsuarioPerfil,
    )
    form.setValue(
      'perm_leads_redistribuir' as 'perfil',
      booleanoParaEstado(overridesUsuario.get('leads.redistribuir')) as unknown as UsuarioPerfil,
    )
  }, [aberto, modoEdicao, permissoesIndividuais]) // eslint-disable-line react-hooks/exhaustive-deps

  async function onSubmit(data: FormCriar) {
    const cargoSelecionado = cargos.find((c) => c.id === data.cargo_id)
    const funcao = cargoSelecionado?.nome ?? null
    const perfilCustomizadoEscolhido = perfisCustomizados.find((p) => p.id === data.perfil)
    const perfilFinal: UsuarioPerfil = perfilCustomizadoEscolhido ? 'customizado' : data.perfil
    const perfilCustomizadoIdFinal = perfilCustomizadoEscolhido ? perfilCustomizadoEscolhido.id : null

    let vinculoRh: VinculoRhPayload | null | undefined
    if (precisaComissao) {
      if (vinculoModo === 'novo') {
        if (!novoDataAdmissao) {
          toast.error('Informe a data de admissão do novo funcionário')
          return
        }
        vinculoRh = {
          modo: 'novo',
          funcionario: {
            tipo_contrato: novoTipoContrato,
            data_admissao: novoDataAdmissao,
            regra_comissao_id: novoRegraComissaoId === NENHUM ? null : novoRegraComissaoId,
          },
        }
      } else if (funcionarioExistenteId !== NENHUM) {
        vinculoRh = { modo: 'existente', funcionario_id: funcionarioExistenteId }
      } else if (modoEdicao && usuario?.funcionario_id) {
        // Campo foi limpo explicitamente — desvincula.
        vinculoRh = null
      }
    }

    try {
      if (modoEdicao) {
        await atualizarUsuario.mutateAsync({
          id:               usuario!.id,
          nome:             data.nome,
          email:            data.email,
          perfil:           perfilFinal,
          perfil_customizado_id: perfilCustomizadoIdFinal,
          tipo_usuario:     data.tipo_usuario,
          funcao,
          cargo_id:         data.cargo_id || null,
          ativo:            data.ativo,
          telefone_whatsapp: (data as unknown as { telefone_whatsapp?: string }).telefone_whatsapp?.trim() || null,
          vinculo_rh:       vinculoRh,
        })

        const dataEditar = data as unknown as FormEditar
        const overridesExistentes = construirMapaOverridesUsuario(permissoesIndividuais)
        const plano = planejarPermissoesIndividuais(
          {
            'leads.ver_todas':    dataEditar.perm_leads_ver_todas,
            'leads.redistribuir': dataEditar.perm_leads_redistribuir,
          },
          overridesExistentes,
        )
        if (plano.upserts.length > 0 || plano.deletes.length > 0) {
          await salvarPermissoesIndividuais.mutateAsync({
            usuarioId: usuario!.id,
            upserts:   plano.upserts,
            deletes:   plano.deletes,
          })
        }

        toast.success('Usuário atualizado')
      } else {
        await criarUsuario.mutateAsync({
          nome:     data.nome,
          email:    data.email,
          senha:    data.senha,
          perfil:   perfilFinal,
          perfil_customizado_id: perfilCustomizadoIdFinal,
          tipo_usuario: data.tipo_usuario,
          funcao,
          cargo_id: data.cargo_id || null,
          ativo:    data.ativo,
          vinculo_rh: vinculoRh ?? undefined,
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
  const tipoUsuarioAtual = form.watch('tipo_usuario')
  // O dropdown de Comercial/Operacional/Jurídico em Negócios (useMembrosAtivos)
  // aceita QUALQUER usuário interno ativo, sem filtrar por perfil — então o
  // vínculo com RH não pode depender do perfil (ex.: alguém com perfil
  // "Assistente" pode estar de fato atuando como comercial num processo).
  // O único corte real que já existe no sistema é tipo_usuario: externo nunca
  // aparece como opção de responsável, interno sempre pode.
  const precisaComissao = tipoUsuarioAtual === 'interno'

  return (
    <>
      <Dialog open={aberto} onOpenChange={onFechar}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-fonti-primary">
              {modoEdicao ? 'Editar usuário' : 'Novo usuário'}
            </DialogTitle>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="mt-2 space-y-4">
              <FormField control={form.control} name="nome" render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome completo</FormLabel>
                  <FormControl><Input placeholder="Maria da Silva" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="email" render={({ field }) => (
                <FormItem>
                  <FormLabel>E-mail</FormLabel>
                  <FormControl><Input type="email" placeholder="usuario@empresa.com" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              {!modoEdicao && (
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
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name={'cargo_id' as 'perfil'} render={({ field }) => (
                  <FormItem>
                    <FormLabel>Função <span className="text-gray-400 font-normal text-xs">(cargo do RH)</span></FormLabel>
                    <Select onValueChange={field.onChange} value={field.value as string}>
                      <FormControl>
                        <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {cargos.map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {cargos.length === 0 && (
                      <p className="text-xs text-gray-400">Nenhum cargo cadastrado em RH &gt; Cargos ainda.</p>
                    )}
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

              <FormField control={form.control} name="tipo_usuario" render={({ field }) => (
                <FormItem>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={field.value === 'externo'}
                      onClick={() => field.onChange(field.value === 'externo' ? 'interno' : 'externo')}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                        field.value === 'externo' ? 'bg-amber-500' : 'bg-fonti-primary'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition-transform ${
                          field.value === 'externo' ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </button>
                    <FormLabel className="cursor-pointer" onClick={() => field.onChange(field.value === 'externo' ? 'interno' : 'externo')}>
                      {field.value === 'externo' ? 'Usuário externo' : 'Usuário interno'}
                    </FormLabel>
                  </div>
                  <p className="text-xs text-gray-400">
                    Externo não aparece como opção de responsável/co-responsável em Leads e Processos — só como destinatário ao compartilhar documentos.
                  </p>
                </FormItem>
              )} />

              {precisaComissao && (
                <div className="rounded-lg border border-gray-200 p-3 space-y-3">
                  <p className="text-xs font-medium text-gray-500">
                    Vínculo com RH
                    <span className="block font-normal text-gray-400 mt-0.5">
                      Perfis comercial/operacional/jurídico entram no motor de comissão do RH — vincule a um funcionário existente ou crie um novo.
                    </span>
                  </p>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setVinculoModo('existente')}
                      className={`flex-1 rounded-lg border py-1.5 text-xs font-medium transition-colors ${
                        vinculoModo === 'existente'
                          ? 'border-fonti-primary bg-fonti-primary text-white'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      Vincular funcionário existente
                    </button>
                    <button
                      type="button"
                      onClick={() => setVinculoModo('novo')}
                      className={`flex-1 rounded-lg border py-1.5 text-xs font-medium transition-colors ${
                        vinculoModo === 'novo'
                          ? 'border-fonti-primary bg-fonti-primary text-white'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      Criar novo funcionário
                    </button>
                  </div>

                  {vinculoModo === 'existente' ? (
                    <div className="space-y-1.5">
                      <label className="text-xs text-gray-500">Funcionário</label>
                      <Select value={funcionarioExistenteId} onValueChange={setFuncionarioExistenteId}>
                        <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione um funcionário" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NENHUM}>— Nenhum —</SelectItem>
                          {funcionariosDisponiveis.map((f) => (
                            <SelectItem key={f.id} value={f.id}>{f.nome}{f.cargo?.nome ? ` — ${f.cargo.nome}` : ''}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <label className="text-xs text-gray-500">Tipo de contrato</label>
                        <Select value={novoTipoContrato} onValueChange={(v) => setNovoTipoContrato(v as RhTipoContrato)}>
                          <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {(Object.keys(RH_TIPO_CONTRATO_LABELS) as RhTipoContrato[]).map((tc) => (
                              <SelectItem key={tc} value={tc}>{RH_TIPO_CONTRATO_LABELS[tc]}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-gray-400">PJ = comercial externo (autônomo/pessoa jurídica).</p>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs text-gray-500">Data de admissão</label>
                        <Input
                          type="date"
                          value={novoDataAdmissao}
                          onChange={(e) => setNovoDataAdmissao(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs text-gray-500">Regra de comissão (opcional)</label>
                        <Select value={novoRegraComissaoId} onValueChange={setNovoRegraComissaoId}>
                          <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NENHUM}>Sem override — usa a regra do cargo</SelectItem>
                            {regrasComissaoAtivas.map((r) => (
                              <SelectItem key={r.id} value={r.id}>{r.nome}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {modoEdicao && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium leading-none">
                    Token de telefonia <span className="text-gray-400 font-normal text-xs">(pra identificação de chamada no MicroSIP)</span>
                  </label>
                  <div className="flex gap-2">
                    <Input
                      readOnly
                      value={usuario?.token_telefonia ?? ''}
                      className="font-mono text-xs"
                    />
                    <Button type="button" variant="outline" size="icon" className="shrink-0" onClick={copiarTokenTelefonia} title="Copiar token">
                      {tokenCopiado ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                    </Button>
                  </div>
                  <p className="text-xs text-gray-400">
                    Configure no <code>microsip.ini</code> deste usuário: <code>cmdIncomingCall=curl "SEU_DOMINIO/api/telefonia/chamada-recebida?token={usuario?.token_telefonia ?? '...'}&numero=%s"</code>
                  </p>
                </div>
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
                        field.value ? 'bg-fonti-primary' : 'bg-gray-200'
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

              {modoEdicao && (
                <div className="rounded-lg border border-gray-200 p-3 space-y-3">
                  <p className="text-xs font-medium text-gray-500">
                    Permissões individuais
                    <span className="block font-normal text-gray-400 mt-0.5">
                      Exceção só para esta pessoa — prevalece sobre o perfil dela.
                    </span>
                  </p>
                  {PERMISSOES_INDIVIDUAIS_CONFIGURAVEIS.map(({ acao, label }) => {
                    const nomeCampo = (
                      acao === 'leads.ver_todas' ? 'perm_leads_ver_todas' : 'perm_leads_redistribuir'
                    ) as 'perfil'
                    return (
                      <FormField key={acao} control={form.control} name={nomeCampo} render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs font-normal text-gray-600">{label}</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {OPCOES_PERMISSAO_INDIVIDUAL.map((o) => (
                                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )} />
                    )
                  })}
                </div>
              )}

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
                    className="bg-fonti-primary hover:bg-fonti-primary-hover text-white"
                    disabled={isPending}
                  >
                    {isPending ? 'Salvando...' : modoEdicao ? 'Salvar' : 'Criar usuário'}
                  </Button>
                </div>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

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
              className="bg-fonti-primary hover:bg-fonti-primary-hover text-white"
            >
              {resetSenha.isPending ? 'Salvando...' : 'Confirmar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
