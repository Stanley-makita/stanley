'use client'

import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { InputMoeda } from '@/components/ui/input-moeda'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Check, Loader2 } from 'lucide-react'
import { DocumentosIdentidadeSection } from '@/components/pessoas/DocumentosIdentidadeSection'
import { useDefinirConjuge } from '@/hooks/participantes/useMutacoesParticipantes'
import { avisarCpfDeOutroCadastro, confirmarTelefoneDaEquipe } from '@/lib/participantes/telefoneDaEquipe'

// ── helpers ──────────────────────────────────────────────────────────────────

function formatarCpf(valor: string): string {
  const d = valor.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 3) return d
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
}

function normalizarCpf(valor: string): string | null {
  const d = valor.replace(/\D/g, '')
  return d.length === 11 ? d : d.length === 0 ? null : d
}

// `<input type="date">` nativo dispara onChange a cada dígito digitado — se o usuário
// edita o segmento do ano dígito a dígito (em vez de colar/usar o seletor), um onChange
// intermediário chega com o valor ainda incompleto (ex.: "0001-11-25" depois de digitar
// só o primeiro "1" do ano 1999). Sem essa checagem esse valor implausível é salvo do
// jeito que está. Descarta (equivale a campo vazio) datas com ano fora de uma faixa
// plausível de nascimento/documento — nunca bloqueia o salvamento do resto do form.
function normalizarDataPlausivel(valor: string): string | null {
  if (!valor) return null
  const ano = Number(valor.slice(0, 4))
  const anoAtual = new Date().getFullYear()
  if (!Number.isFinite(ano) || ano < 1900 || ano > anoAtual + 1) return null
  return valor
}

const ESTADOS_CIVIS = [
  { value: 'solteiro',      label: 'Solteiro(a)' },
  { value: 'casado',        label: 'Casado(a)' },
  { value: 'uniao_estavel', label: 'União Estável' },
  { value: 'divorciado',    label: 'Divorciado(a)' },
  { value: 'viuvo',         label: 'Viúvo(a)' },
]

const REGIMES = [
  { value: 'comunhao_parcial',   label: 'Comunhão Parcial de Bens' },
  { value: 'comunhao_total',     label: 'Comunhão Total de Bens' },
  { value: 'separacao_total',    label: 'Separação Total de Bens' },
  { value: 'participacao_final', label: 'Participação Final nos Aquestos' },
]

// ── tipos ─────────────────────────────────────────────────────────────────────

type FormState = {
  telefone: string
  nome: string; email: string; cpf: string; data_nascimento: string
  profissao: string; estado_civil: string; sexo: string
  renda_formal: string; renda_informal: string; nacionalidade: string
  orgao_emissor: string; data_emissao: string
  cidade_nascimento: string; estado_nascimento: string
  filiacao_mae: string; filiacao_pai: string
  registro_cnh: string; validade_cnh: string; primeira_habilitacao_cnh: string
  endereco_rua: string; endereco_numero: string; endereco_bairro: string
  endereco_cidade: string; endereco_uf: string; endereco_cep: string
  conjuge_nome: string; conjuge_cpf: string; conjuge_data_nascimento: string
  conjuge_telefone: string; conjuge_profissao: string
  conjuge_renda_formal: string; conjuge_renda_informal: string
  regime_casamento: string; data_casamento: string
  empresa_nome: string; empresa_cnpj: string
  municipio_trabalho: string; uf_trabalho: string
  conta_bancaria_banco: string; conta_bancaria_agencia: string
  conta_bancaria_numero: string; conta_bancaria_digito: string
}

const VAZIO: FormState = {
  telefone: '',
  nome: '', email: '', cpf: '', data_nascimento: '', profissao: '',
  estado_civil: '', sexo: '', renda_formal: '', renda_informal: '', nacionalidade: '',
  orgao_emissor: '', data_emissao: '', cidade_nascimento: '', estado_nascimento: '',
  filiacao_mae: '', filiacao_pai: '',
  registro_cnh: '', validade_cnh: '', primeira_habilitacao_cnh: '',
  endereco_rua: '', endereco_numero: '', endereco_bairro: '', endereco_cidade: '',
  endereco_uf: '', endereco_cep: '',
  conjuge_nome: '', conjuge_cpf: '', conjuge_data_nascimento: '',
  conjuge_telefone: '', conjuge_profissao: '',
  conjuge_renda_formal: '', conjuge_renda_informal: '',
  regime_casamento: '', data_casamento: '',
  empresa_nome: '', empresa_cnpj: '', municipio_trabalho: '', uf_trabalho: '',
  conta_bancaria_banco: '', conta_bancaria_agencia: '',
  conta_bancaria_numero: '', conta_bancaria_digito: '',
}

// ── sub-componentes de layout ─────────────────────────────────────────────────

function L({ children }: { children: React.ReactNode }) {
  return <label className="text-xs font-medium text-gray-500 mb-1 block">{children}</label>
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold text-fonti-primary mb-3">{titulo}</p>
      {children}
    </div>
  )
}

// ── componente principal ──────────────────────────────────────────────────────

export interface OpcaoConjuge { pessoaId: string; nome: string }

interface FormularioPessoaProps {
  pessoaId: string
  /** Participantes da proposta (primeiras opções do "Casado(a) com"). */
  participantesDaProposta: OpcaoConjuge[]
  /** Escolheu cônjuge de fora da proposta: o contêiner pergunta se inclui. */
  onConjugeForaDaProposta?: (conjuge: OpcaoConjuge) => void
  /** Pedido de "Buscar pessoa…" no Casado(a) com — o contêiner abre a busca e devolve a escolhida. */
  onBuscarConjuge?: (escolher: (p: OpcaoConjuge) => void) => void
  /** Avisa o contêiner quando há edição não salva (para confirmar antes de trocar de sub-aba). */
  onSujoChange?: (sujo: boolean) => void
}

/**
 * Formulário completo de UMA Pessoa (V2: uma instância por sub-aba de participante, `key={pessoaId}`).
 * Casamento pelo "Casado(a) com" (POST /api/pessoas/[id]/conjuge); campos soltos de cônjuge só
 * aparecem para dado legado (sem cônjuge cadastrado).
 */
export function FormularioPessoa({ pessoaId, participantesDaProposta, onConjugeForaDaProposta, onBuscarConjuge, onSujoChange }: FormularioPessoaProps) {
  const { usuario } = useAuth()
  const definirConjuge = useDefinirConjuge()
  const qc = useQueryClient()
  const [form, setForm] = useState<FormState>(VAZIO)
  const f = (patch: Partial<FormState>) => setForm(s => ({ ...s, ...patch }))

  const { data: pessoa, isLoading } = useQuery({
    queryKey: ['pessoa-completa', pessoaId],
    enabled: !!pessoaId,
    refetchOnMount: 'always',
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pessoas')
        .select(`id, updated_at, nome, cpf, email, data_nascimento,
          profissao, estado_civil, sexo, renda_formal, renda_informal, nacionalidade,
          orgao_emissor, data_emissao, cidade_nascimento, estado_nascimento, filiacao_mae, filiacao_pai,
          registro_cnh, validade_cnh, primeira_habilitacao_cnh,
          endereco_rua, endereco_numero, endereco_bairro, endereco_cidade, endereco_uf, endereco_cep,
          conjuge_nome, conjuge_cpf, conjuge_data_nascimento, conjuge_telefone, conjuge_profissao,
          conjuge_renda_formal, conjuge_renda_informal, regime_casamento, data_casamento,
          empresa_nome, empresa_cnpj, municipio_trabalho, uf_trabalho,
          conta_bancaria_banco, conta_bancaria_agencia, conta_bancaria_numero, conta_bancaria_digito,
          conjuge_pessoa_id,
          conjuge_pessoa:pessoas!conjuge_pessoa_id(id, nome, cpf),
          pessoa_telefones(id, telefone, principal, whatsapp, ativo)`)
        .eq('id', pessoaId!)
        .single()
      if (error) throw error
      return data
    },
  })

  // Reseta o form só quando a Pessoa carregada MUDA de verdade (troca de pessoa_id) —
  // nunca por um refetch em segundo plano da MESMA pessoa. A query roda com
  // staleTime: 0 + refetchOnWindowFocus: true (padrão do projeto) + refetchOnMount:
  // 'always', então qualquer volta de foco na aba troca a referência de `pessoa`. Sem
  // esse guard, o efeito reseta TODO o form pros valores do servidor no meio da edição,
  // apagando o que o usuário tinha digitado nos campos que ainda não tinham sido
  // salvos — mesmo padrão já documentado e corrigido em EditarProcessoDrawer.tsx e
  // LeadEditarModal.tsx (achado real, 2026-09-22: usuária editava vários campos, um
  // refetch em 2º plano revertia todos menos o último mexido, "Salvar" gravava a
  // mistura de campo novo + demais campos revertidos pro valor antigo do banco).
  //
  // A chave inclui `updated_at` (trigger pessoas_set_updated_at): refetch com o MESMO
  // dado não reseta, mas uma gravação real vinda de fora do form — "Confirmar dados"
  // do OCR, *fonti atualiza — reseta na hora. Só com o id, os campos confirmados no
  // OCR só apareciam depois de F5 (achado real, 2026-09-24).
  const pessoaCarregadaChaveRef = useRef<string | null>(null)
  // Form como veio do servidor na última carga — base para "há edição não salva".
  const [formCarregado, setFormCarregado] = useState<FormState>(VAZIO)
  const sujo = JSON.stringify(form) !== JSON.stringify(formCarregado)
  useEffect(() => { onSujoChange?.(sujo) }, [sujo, onSujoChange])

  useEffect(() => {
    if (!pessoa) return
    const chave = `${pessoa.id}|${(pessoa as { updated_at?: string }).updated_at ?? ''}`
    if (pessoaCarregadaChaveRef.current === chave) return
    pessoaCarregadaChaveRef.current = chave
    const p = pessoa as any
    const tels = p.pessoa_telefones ?? []
    const telAtivos = tels.filter((t: any) => t.ativo)
    const telPrincipal = telAtivos.find((t: any) => t.principal) ?? telAtivos[0]
    const carregado: FormState = {
      telefone:                 telPrincipal?.telefone ?? '',
      nome:                     pessoa.nome ?? '',
      email:                    pessoa.email ?? '',
      cpf:                      formatarCpf(pessoa.cpf ?? ''),
      data_nascimento:          pessoa.data_nascimento ?? '',
      profissao:                pessoa.profissao ?? '',
      estado_civil:             pessoa.estado_civil ?? '',
      sexo:                     p.sexo ?? '',
      orgao_emissor:            p.orgao_emissor ?? '',
      data_emissao:             p.data_emissao ?? '',
      cidade_nascimento:        p.cidade_nascimento ?? '',
      estado_nascimento:        p.estado_nascimento ?? '',
      filiacao_mae:             p.filiacao_mae ?? '',
      filiacao_pai:             p.filiacao_pai ?? '',
      registro_cnh:             p.registro_cnh ?? '',
      validade_cnh:             p.validade_cnh ?? '',
      primeira_habilitacao_cnh: p.primeira_habilitacao_cnh ?? '',
      renda_formal:             pessoa.renda_formal != null ? String(pessoa.renda_formal) : '',
      renda_informal:           pessoa.renda_informal != null ? String(pessoa.renda_informal) : '',
      nacionalidade:            p.nacionalidade ?? '',
      endereco_rua:             pessoa.endereco_rua ?? '',
      endereco_numero:          pessoa.endereco_numero ?? '',
      endereco_bairro:          pessoa.endereco_bairro ?? '',
      endereco_cidade:          pessoa.endereco_cidade ?? '',
      endereco_uf:              pessoa.endereco_uf ?? '',
      endereco_cep:             pessoa.endereco_cep ?? '',
      conjuge_nome:             pessoa.conjuge_nome ?? '',
      conjuge_cpf:              formatarCpf(pessoa.conjuge_cpf ?? ''),
      conjuge_data_nascimento:  pessoa.conjuge_data_nascimento ?? '',
      conjuge_telefone:         p.conjuge_telefone ?? '',
      conjuge_profissao:        p.conjuge_profissao ?? '',
      conjuge_renda_formal:     pessoa.conjuge_renda_formal != null ? String(pessoa.conjuge_renda_formal) : '',
      conjuge_renda_informal:   p.conjuge_renda_informal != null ? String(p.conjuge_renda_informal) : '',
      regime_casamento:         pessoa.regime_casamento ?? '',
      data_casamento:           p.data_casamento ?? '',
      empresa_nome:             p.empresa_nome ?? '',
      empresa_cnpj:             p.empresa_cnpj ?? '',
      municipio_trabalho:       p.municipio_trabalho ?? '',
      uf_trabalho:              p.uf_trabalho ?? '',
      conta_bancaria_banco:     p.conta_bancaria_banco ?? '',
      conta_bancaria_agencia:   p.conta_bancaria_agencia ?? '',
      conta_bancaria_numero:    p.conta_bancaria_numero ?? '',
      conta_bancaria_digito:    p.conta_bancaria_digito ?? '',
    }
    setForm(carregado)
    setFormCarregado(carregado)
  }, [pessoa])

  const conjugePessoaId: string | null = (pessoa as { conjuge_pessoa_id?: string | null } | undefined)?.conjuge_pessoa_id ?? null

  const eCasado = form.estado_civil === 'casado' || form.estado_civil === 'uniao_estavel'

  const salvar = useMutation({
    mutationFn: async () => {
      if (!pessoaId || !usuario) return

      const payload = {
        nome:                     form.nome.trim() || undefined,
        email:                    form.email.trim() || null,
        cpf:                      normalizarCpf(form.cpf) ?? null,
        data_nascimento:          normalizarDataPlausivel(form.data_nascimento),
        profissao:                form.profissao.trim() || null,
        estado_civil:             form.estado_civil || null,
        sexo:                     form.sexo || null,
        orgao_emissor:            form.orgao_emissor.trim() || null,
        data_emissao:             form.data_emissao || null,
        cidade_nascimento:        form.cidade_nascimento.trim() || null,
        estado_nascimento:        form.estado_nascimento.trim().toUpperCase().slice(0, 2) || null,
        filiacao_mae:             form.filiacao_mae.trim() || null,
        filiacao_pai:             form.filiacao_pai.trim() || null,
        registro_cnh:             form.registro_cnh.trim() || null,
        validade_cnh:             form.validade_cnh || null,
        primeira_habilitacao_cnh: form.primeira_habilitacao_cnh || null,
        renda_formal:             form.renda_formal ? Number(form.renda_formal) : null,
        renda_informal:           form.renda_informal ? Number(form.renda_informal) : null,
        nacionalidade:            form.nacionalidade.trim() || null,
        endereco_rua:             form.endereco_rua.trim() || null,
        endereco_numero:          form.endereco_numero.trim() || null,
        endereco_bairro:          form.endereco_bairro.trim() || null,
        endereco_cidade:          form.endereco_cidade.trim() || null,
        endereco_uf:              form.endereco_uf.trim() || null,
        endereco_cep:             form.endereco_cep.trim() || null,
        empresa_nome:             form.empresa_nome.trim() || null,
        empresa_cnpj:             form.empresa_cnpj.trim() || null,
        municipio_trabalho:       form.municipio_trabalho.trim() || null,
        uf_trabalho:              form.uf_trabalho.trim() || null,
        conta_bancaria_banco:     form.conta_bancaria_banco.trim() || null,
        conta_bancaria_agencia:   form.conta_bancaria_agencia.trim() || null,
        conta_bancaria_numero:    form.conta_bancaria_numero.trim() || null,
        conta_bancaria_digito:    form.conta_bancaria_digito.trim() || null,
      }

      // 0. Telefone principal
      const telefoneVal = form.telefone.trim()
      {
        const telsAtuais = ((pessoa as unknown as { pessoa_telefones?: Array<{ telefone: string; principal: boolean; ativo: boolean }> } | undefined)?.pessoa_telefones ?? []).filter(t => t.ativo)
        const anterior = (telsAtuais.find(t => t.principal) ?? telsAtuais[0])?.telefone
        if (usuario?.empresa_id && !(await confirmarTelefoneDaEquipe(usuario.empresa_id, telefoneVal, anterior))) {
          throw new Error('Salvamento cancelado: confira o telefone.')
        }
      }
      if (telefoneVal) {
        const p = pessoa as any
        const tels = p?.pessoa_telefones ?? []
        const telAtivos = tels.filter((t: any) => t.ativo)
        const telPrincipal = telAtivos.find((t: any) => t.principal) ?? telAtivos[0]
        if (telPrincipal) {
          if (telPrincipal.telefone !== telefoneVal) {
            await supabase.from('pessoa_telefones').update({ telefone: telefoneVal }).eq('id', telPrincipal.id)
          }
        } else {
          await supabase.from('pessoa_telefones').insert({
            pessoa_id: pessoaId, empresa_id: usuario.empresa_id,
            telefone: telefoneVal, principal: true, whatsapp: true, ativo: true,
          })
        }
        await supabase.from('leads').update({ telefone: telefoneVal }).eq('pessoa_id', pessoaId).eq('empresa_id', usuario.empresa_id)
      }

      // 1. Atualizar pessoas (CPF do TITULAR separado para não bloquear em UNIQUE).
      // conjuge_cpf NÃO tem UNIQUE e vai no mesmo UPDATE de conjuge_nome/estado_civil: se fosse
      // separado, a sync (fn_pv2_pessoas) criaria a Pessoa do cônjuge sem CPF no 1º UPDATE.
      const payloadSemCpf = { ...payload } as Record<string, unknown>
      delete payloadSemCpf['cpf']

      const { error } = await supabase.from('pessoas').update(payloadSemCpf).eq('id', pessoaId)
      if (error) throw error

      // CPF de outro cadastro (UNIQUE): avisa com o nome do dono e NÃO copia o CPF para o lead.
      let cpfSalvo: string | null | undefined = payload.cpf
      if (payload.cpf) {
        const { error: errCpf } = await supabase.from('pessoas').update({ cpf: payload.cpf }).eq('id', pessoaId)
        if (errCpf) {
          console.warn('[aba-pessoa] CPF não salvo (conflito):', errCpf.message)
          cpfSalvo = undefined
          await avisarCpfDeOutroCadastro(payload.cpf, pessoaId)
        }
      }

      // 2. Propagar para leads
      await supabase.from('leads').update({
        nome:                    payload.nome,
        email:                   payload.email,
        cpf:                     cpfSalvo,
        data_nascimento:         payload.data_nascimento,
        profissao:               payload.profissao,
        estado_civil:            payload.estado_civil,
        renda_formal:            payload.renda_formal,
        renda_informal:          payload.renda_informal,
      }).eq('pessoa_id', pessoaId).eq('empresa_id', usuario.empresa_id)

      // V2: casamento é do casal — regime/data/estado civil alterados aqui valem para os dois
      // lados (rota de casamento); estado civil deixando de ser casado desfaz o vínculo.
      if (conjugePessoaId) {
        const mudouCasamento = form.regime_casamento !== formCarregado.regime_casamento
          || form.data_casamento !== formCarregado.data_casamento
          || form.estado_civil !== formCarregado.estado_civil
        if (!eCasado) {
          await definirConjuge.mutateAsync({ pessoaId, conjugeId: null, estadoCivil: 'casado', regime: null, data: null })
        } else if (mudouCasamento) {
          await definirConjuge.mutateAsync({
            pessoaId, conjugeId: conjugePessoaId, estadoCivil: form.estado_civil,
            regime: form.regime_casamento || null, data: normalizarDataPlausivel(form.data_casamento),
          })
        }
      }

      // 5. Auditoria
      await supabase.from('pessoas_alteracoes').insert({
        pessoa_id:          pessoaId,
        empresa_id:         usuario.empresa_id,
        usuario_id:         usuario.id,
        campos_alterados:   Object.keys(payload),
        valores_anteriores: {},
        valores_novos:      payload as Record<string, unknown>,
        origem:             'leads',
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pessoa', pessoaId] })
      qc.invalidateQueries({ queryKey: ['pessoa-completa', pessoaId] })
      qc.invalidateQueries({ queryKey: ['pessoas', pessoaId, 'alteracoes'] })
      qc.invalidateQueries({ queryKey: ['leads'] })
      toast.success('Dados da pessoa salvos.', {
        className: 'border-l-4 border-l-fonti-accent bg-fonti-accent-hover text-fonti-primary',
      })
    },
    onError: () => toast.error('Erro ao salvar dados.'),
  })

  const conjugeAtual = (() => {
    const cp = (pessoa as { conjuge_pessoa?: { id: string; nome: string } | { id: string; nome: string }[] | null } | undefined)?.conjuge_pessoa
    return (Array.isArray(cp) ? cp[0] : cp) ?? null
  })()
  const opcoesConjuge: Array<OpcaoConjuge & { naProposta: boolean }> = [
    ...participantesDaProposta.filter(o => o.pessoaId !== pessoaId).map(o => ({ ...o, naProposta: true })),
    ...(conjugeAtual && !participantesDaProposta.some(o => o.pessoaId === conjugeAtual.id)
      ? [{ pessoaId: conjugeAtual.id, nome: conjugeAtual.nome, naProposta: false }] : []),
  ]

  async function vincularConjuge(op: OpcaoConjuge | null) {
    const base = {
      pessoaId, conjugeId: op?.pessoaId ?? null, estadoCivil: form.estado_civil,
      regime: form.regime_casamento || null, data: normalizarDataPlausivel(form.data_casamento),
    }
    try {
      let r = await definirConjuge.mutateAsync(base)
      if ('precisaConfirmar' in r) {
        const ok = window.confirm(`${r.precisaConfirmar.join(' e ')} já tem outro casamento registrado. Encerrar esse casamento e registrar este?`)
        if (!ok) return
        r = await definirConjuge.mutateAsync({ ...base, confirmarEncerrar: true })
      }
      toast.success(op ? `Casamento com ${op.nome} registrado.` : 'Casamento desfeito.')
      if (op && !participantesDaProposta.some(o => o.pessoaId === op.pessoaId)) onConjugeForaDaProposta?.(op)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível salvar o casamento.')
    }
  }

  async function escolherConjuge(valor: string) {
    if (sujo) { toast.info('Salve as alterações desta pessoa antes de mudar o cônjuge.'); return }
    if (valor === '__buscar') { onBuscarConjuge?.(p => { void vincularConjuge(p) }); return }
    if (valor === '__nova') {
      const nome = window.prompt('Nome completo do cônjuge')?.trim()
      if (!nome || !usuario?.empresa_id) return
      const { data: nova, error } = await supabase.from('pessoas')
        .insert({ empresa_id: usuario.empresa_id, nome, tipo: 'cliente' }).select('id').single()
      if (error || !nova) { toast.error('Não foi possível criar a pessoa.'); return }
      await vincularConjuge({ pessoaId: nova.id as string, nome })
      return
    }
    if (!valor) {
      if (conjugeAtual && window.confirm(`Desfazer o casamento com ${conjugeAtual.nome}?`)) await vincularConjuge(null)
      return
    }
    const op = opcoesConjuge.find(o => o.pessoaId === valor)
    if (op) await vincularConjuge(op)
  }

  if (!pessoaId) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-gray-400">
        Este lead ainda não possui pessoa vinculada.
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="h-5 w-5 animate-spin text-fonti-primary" />
      </div>
    )
  }

  return (
    <div>

      {/* ── Dados básicos ─────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
          <L>Nome completo</L>
          <Input value={form.nome} onChange={e => f({ nome: e.target.value })} />
        </div>
        <div>
          <L>CPF</L>
          <Input value={form.cpf} onChange={e => f({ cpf: formatarCpf(e.target.value) })} placeholder="000.000.000-00" />
        </div>
        <div>
          <L>Data de Nascimento</L>
          <Input type="date" value={form.data_nascimento} onChange={e => f({ data_nascimento: e.target.value })} />
        </div>
        <div>
          <L>E-mail</L>
          <Input value={form.email} onChange={e => f({ email: e.target.value })} placeholder="email@exemplo.com" />
        </div>
        <div>
          <L>Telefone principal</L>
          <Input value={form.telefone} onChange={e => f({ telefone: e.target.value })} placeholder="5544999990000" />
        </div>
        <div>
          <L>Profissão</L>
          <Input value={form.profissao} onChange={e => f({ profissao: e.target.value })} placeholder="Ex: Advogado" />
        </div>
        <div>
          <L>Nacionalidade</L>
          <Input value={form.nacionalidade} onChange={e => f({ nacionalidade: e.target.value })} placeholder="Brasileiro(a)" />
        </div>
        <div>
          <L>Sexo</L>
          <select
            className="w-full h-10 text-sm border rounded-md px-3 focus:outline-none focus:ring-2 focus:ring-fonti-primary/30"
            value={form.sexo}
            onChange={e => f({ sexo: e.target.value })}
          >
            <option value="">Selecionar...</option>
            <option value="M">Masculino</option>
            <option value="F">Feminino</option>
          </select>
        </div>
        <div>
          <L>Cidade de nascimento</L>
          <Input value={form.cidade_nascimento} onChange={e => f({ cidade_nascimento: e.target.value })} placeholder="Ex: Maringá" />
        </div>
        <div>
          <L>UF de nascimento</L>
          <Input value={form.estado_nascimento} onChange={e => f({ estado_nascimento: e.target.value.toUpperCase().slice(0, 2) })} placeholder="PR" maxLength={2} />
        </div>
        <div>
          <L>Nome da mãe</L>
          <Input value={form.filiacao_mae} onChange={e => f({ filiacao_mae: e.target.value })} />
        </div>
        <div>
          <L>Nome do pai</L>
          <Input value={form.filiacao_pai} onChange={e => f({ filiacao_pai: e.target.value })} />
        </div>
      </div>
      </div>

      {/* ── Documentos ───────────────────────────────────────────────────── */}
      <Secao titulo="Documentos">
        {pessoaId && usuario?.empresa_id && (
          <DocumentosIdentidadeSection pessoaId={pessoaId} empresaId={usuario.empresa_id} />
        )}
      </Secao>

      {/* ── Renda (compat temporária — migra futuramente para Crédito) ─── */}
      <Secao titulo="Renda">
        <p className="text-xs text-gray-400 mb-3">
          Campos de renda ficam aqui temporariamente para compatibilidade. Futuramente serão consolidados na aba Crédito.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <L>Renda Formal (R$)</L>
            <InputMoeda value={form.renda_formal} onChange={v => f({ renda_formal: v })} />
          </div>
          <div>
            <L>Renda Informal (R$)</L>
            <InputMoeda value={form.renda_informal} onChange={v => f({ renda_informal: v })} />
          </div>
        </div>
      </Secao>

      {/* ── Estado Civil ─────────────────────────────────────────────────── */}
      <Secao titulo="Estado Civil">
        <div className="flex flex-wrap gap-2 mb-3">
          {ESTADOS_CIVIS.map(ec => (
            <button
              key={ec.value}
              type="button"
              onClick={() => f({ estado_civil: form.estado_civil === ec.value ? '' : ec.value })}
              className={cn(
                'text-xs px-3 py-1.5 rounded-lg border transition-all',
                form.estado_civil === ec.value
                  ? 'border-fonti-primary bg-fonti-primary text-white font-medium'
                  : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
              )}
            >
              {ec.label}
            </button>
          ))}
        </div>

        {eCasado && (
          <div className="p-3 bg-fonti-accent-hover/20 border border-fonti-accent/40 rounded-xl space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <L>Casado(a) com</L>
                <select
                  aria-label="Casado(a) com"
                  className="w-full h-10 text-sm border rounded-md px-3 focus:outline-none focus:ring-2 focus:ring-fonti-primary/30 bg-white"
                  value={conjugePessoaId ?? ''}
                  disabled={definirConjuge.isPending}
                  onChange={e => { void escolherConjuge(e.target.value) }}
                >
                  <option value="">{conjugePessoaId ? 'Desfazer o casamento' : 'Selecionar…'}</option>
                  {opcoesConjuge.length > 0 && (
                    <optgroup label="Participantes desta proposta">
                      {opcoesConjuge.filter(o => o.naProposta).map(o => <option key={o.pessoaId} value={o.pessoaId}>{o.nome}</option>)}
                    </optgroup>
                  )}
                  {opcoesConjuge.some(o => !o.naProposta) && (
                    <optgroup label="Fora da proposta">
                      {opcoesConjuge.filter(o => !o.naProposta).map(o => <option key={o.pessoaId} value={o.pessoaId}>{o.nome}</option>)}
                    </optgroup>
                  )}
                  <option value="__buscar">Buscar pessoa cadastrada…</option>
                  <option value="__nova">Nova pessoa…</option>
                </select>
                <p className="mt-1 text-xs text-gray-500">Data e regime são do casal: valem também no cadastro do cônjuge.</p>
              </div>
              {conjugePessoaId ? (<>
              <div>
                <L>Data do Casamento/União</L>
                <Input type="date" value={form.data_casamento} onChange={e => f({ data_casamento: e.target.value })} />
              </div>
              <div>
                <L>Regime de Bens</L>
                <select
                  className="w-full h-10 text-sm border rounded-md px-3 focus:outline-none focus:ring-2 focus:ring-fonti-primary/30"
                  value={form.regime_casamento}
                  onChange={e => f({ regime_casamento: e.target.value })}
                >
                  <option value="">Selecionar...</option>
                  {REGIMES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              </>) : (
                <p className="sm:col-span-2 text-xs text-gray-500">Escolha o cônjuge para registrar a data e o regime do casamento.</p>
              )}
            </div>
            {!conjugePessoaId && form.conjuge_nome.trim() && (
              <p className="text-xs text-amber-800">
                Cônjuge informado sem cadastro próprio: <strong>{form.conjuge_nome}</strong>
                {form.conjuge_cpf ? ` (CPF ${form.conjuge_cpf})` : ''}. Escolha ou crie a pessoa acima.
              </p>
            )}
          </div>
        )}
      </Secao>

      {/* ── Endereço ─────────────────────────────────────────────────────── */}
      <Secao titulo="Endereço">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <L>CEP</L>
            <Input value={form.endereco_cep} onChange={e => f({ endereco_cep: e.target.value })} placeholder="00000-000" />
          </div>
          <div>
            <L>Número</L>
            <Input value={form.endereco_numero} onChange={e => f({ endereco_numero: e.target.value })} placeholder="123" />
          </div>
          <div className="sm:col-span-2">
            <L>Rua / Logradouro</L>
            <Input value={form.endereco_rua} onChange={e => f({ endereco_rua: e.target.value })} placeholder="Rua das Flores" />
          </div>
          <div>
            <L>Bairro</L>
            <Input value={form.endereco_bairro} onChange={e => f({ endereco_bairro: e.target.value })} placeholder="Centro" />
          </div>
          <div>
            <L>UF</L>
            <Input value={form.endereco_uf} onChange={e => f({ endereco_uf: e.target.value.toUpperCase().slice(0, 2) })} placeholder="PR" maxLength={2} />
          </div>
          <div className="sm:col-span-2">
            <L>Cidade</L>
            <Input value={form.endereco_cidade} onChange={e => f({ endereco_cidade: e.target.value })} placeholder="Maringá" />
          </div>
        </div>
      </Secao>

      {/* ── Trabalho (FGTS) ──────────────────────────────────────────────── */}
      <Secao titulo="Trabalho (para FGTS)">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <L>Nome da Empresa</L>
            <Input value={form.empresa_nome} onChange={e => f({ empresa_nome: e.target.value })} placeholder="Razão Social" />
          </div>
          <div>
            <L>CNPJ</L>
            <Input value={form.empresa_cnpj} onChange={e => f({ empresa_cnpj: e.target.value })} placeholder="00.000.000/0001-00" />
          </div>
          <div>
            <L>Município de Trabalho</L>
            <Input value={form.municipio_trabalho} onChange={e => f({ municipio_trabalho: e.target.value })} placeholder="Maringá" />
          </div>
          <div>
            <L>UF de Trabalho</L>
            <Input value={form.uf_trabalho} onChange={e => f({ uf_trabalho: e.target.value.toUpperCase().slice(0, 2) })} placeholder="PR" maxLength={2} />
          </div>
        </div>
      </Secao>

      {/* ── Conta Bancária ───────────────────────────────────────────────── */}
      <Secao titulo="Conta Bancária (débito das parcelas)">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <L>Banco</L>
            <Input value={form.conta_bancaria_banco} onChange={e => f({ conta_bancaria_banco: e.target.value })} placeholder="Ex: Bradesco" />
          </div>
          <div>
            <L>Agência</L>
            <Input value={form.conta_bancaria_agencia} onChange={e => f({ conta_bancaria_agencia: e.target.value })} placeholder="0000-0" />
          </div>
          <div>
            <L>Conta</L>
            <Input value={form.conta_bancaria_numero} onChange={e => f({ conta_bancaria_numero: e.target.value })} placeholder="00000-0" />
          </div>
          <div>
            <L>Dígito</L>
            <Input value={form.conta_bancaria_digito} onChange={e => f({ conta_bancaria_digito: e.target.value })} placeholder="0" maxLength={2} />
          </div>
        </div>
      </Secao>

      {/* ── Botão Salvar ─────────────────────────────────────────────────── */}
      <div className="flex justify-end pt-4 mt-4 border-t">
        <Button
          size="sm"
          className="bg-fonti-primary hover:bg-fonti-primary-hover text-white"
          onClick={() => salvar.mutate()}
          disabled={salvar.isPending}
        >
          {salvar.isPending
            ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Salvando...</>
            : <><Check className="h-3.5 w-3.5 mr-1.5" />Salvar Dados da Pessoa</>
          }
        </Button>
      </div>
    </div>
  )
}
