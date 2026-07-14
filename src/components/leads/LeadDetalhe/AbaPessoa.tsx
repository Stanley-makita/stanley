'use client'

import { useState, useEffect } from 'react'
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
import { type Lead } from '@/types/leads'

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
  rg: string; profissao: string; estado_civil: string; sexo: string
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
  nome: '', email: '', cpf: '', data_nascimento: '', rg: '', profissao: '',
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

interface Props {
  lead: Lead
}

export function AbaPessoa({ lead }: Props) {
  const pessoaId = lead.pessoa_id
  const { usuario } = useAuth()
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
        .select(`id, nome, cpf, email, data_nascimento,
          rg, profissao, estado_civil, sexo, renda_formal, renda_informal, nacionalidade,
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

  useEffect(() => {
    if (!pessoa) return
    const p = pessoa as any
    const tels = p.pessoa_telefones ?? []
    const telAtivos = tels.filter((t: any) => t.ativo)
    const telPrincipal = telAtivos.find((t: any) => t.principal) ?? telAtivos[0]
    setForm({
      telefone:                 telPrincipal?.telefone ?? '',
      nome:                     pessoa.nome ?? '',
      email:                    pessoa.email ?? '',
      cpf:                      formatarCpf(pessoa.cpf ?? ''),
      data_nascimento:          pessoa.data_nascimento ?? '',
      rg:                       pessoa.rg ?? '',
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
    })
  }, [pessoa])

  const eCasado = form.estado_civil === 'casado' || form.estado_civil === 'uniao_estavel'

  const salvar = useMutation({
    mutationFn: async () => {
      if (!pessoaId || !usuario) return

      const payload = {
        nome:                     form.nome.trim() || undefined,
        email:                    form.email.trim() || null,
        cpf:                      normalizarCpf(form.cpf) ?? null,
        data_nascimento:          form.data_nascimento || null,
        rg:                       form.rg.trim() || null,
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
        conjuge_nome:             eCasado ? (form.conjuge_nome.trim() || null) : null,
        conjuge_cpf:              eCasado ? (normalizarCpf(form.conjuge_cpf) ?? null) : null,
        conjuge_data_nascimento:  eCasado ? (form.conjuge_data_nascimento || null) : null,
        conjuge_telefone:         eCasado ? (form.conjuge_telefone.trim() || null) : null,
        conjuge_profissao:        eCasado ? (form.conjuge_profissao.trim() || null) : null,
        conjuge_renda_formal:     eCasado && form.conjuge_renda_formal ? Number(form.conjuge_renda_formal) : null,
        conjuge_renda_informal:   eCasado && form.conjuge_renda_informal ? Number(form.conjuge_renda_informal) : null,
        regime_casamento:         eCasado ? (form.regime_casamento || null) : null,
        data_casamento:           eCasado ? (form.data_casamento || null) : null,
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
        await supabase.from('processo_compradores').update({ telefone: telefoneVal }).eq('pessoa_id', pessoaId).eq('empresa_id', usuario.empresa_id)
        await supabase.from('leads').update({ telefone: telefoneVal }).eq('pessoa_id', pessoaId).eq('empresa_id', usuario.empresa_id)
      }

      // 1. Atualizar pessoas (CPF separado para não bloquear em UNIQUE)
      const payloadSemCpf = { ...payload } as Record<string, unknown>
      delete payloadSemCpf['cpf']
      delete payloadSemCpf['conjuge_cpf']

      const { error } = await supabase.from('pessoas').update(payloadSemCpf).eq('id', pessoaId)
      if (error) throw error

      if (payload.cpf) {
        const { error: errCpf } = await supabase.from('pessoas').update({ cpf: payload.cpf }).eq('id', pessoaId)
        if (errCpf) console.warn('[aba-pessoa] CPF não salvo (conflito):', errCpf.message)
      }
      if (payload.conjuge_cpf) {
        const { error: errCpfC } = await supabase.from('pessoas').update({ conjuge_cpf: payload.conjuge_cpf }).eq('id', pessoaId)
        if (errCpfC) console.warn('[aba-pessoa] CPF cônjuge não salvo (conflito):', errCpfC.message)
      }

      // 2. Propagar para leads
      await supabase.from('leads').update({
        nome:                    payload.nome,
        email:                   payload.email,
        cpf:                     payload.cpf,
        data_nascimento:         payload.data_nascimento,
        rg:                      payload.rg,
        profissao:               payload.profissao,
        estado_civil:            payload.estado_civil,
        renda_formal:            payload.renda_formal,
        renda_informal:          payload.renda_informal,
        conjuge_nome:            payload.conjuge_nome,
        conjuge_cpf:             payload.conjuge_cpf,
        conjuge_data_nascimento: payload.conjuge_data_nascimento,
        regime_casamento:        payload.regime_casamento,
      }).eq('pessoa_id', pessoaId).eq('empresa_id', usuario.empresa_id)

      // 3. Propagar para compradores
      await supabase.from('processo_compradores').update({
        nome:  payload.nome,
        cpf:   payload.cpf,
        email: payload.email,
      }).eq('pessoa_id', pessoaId).eq('empresa_id', usuario.empresa_id)

      // 4. Propagar para vendedores
      await supabase.from('processo_vendedores').update({
        nome:         payload.nome,
        cpf:          payload.cpf,
        email:        payload.email,
        estado_civil: payload.estado_civil,
        conjuge_nome: payload.conjuge_nome,
        conjuge_cpf:  payload.conjuge_cpf,
      }).eq('pessoa_id', pessoaId).eq('empresa_id', usuario.empresa_id)

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

  const conjugeVinculado = (() => {
    const cp = (pessoa as any)?.conjuge_pessoa
    return Array.isArray(cp) ? cp[0] : cp
  })()

  return (
    <div className="-mx-3 -my-4 bg-gray-50 px-3 py-4 pb-8 sm:-mx-5 sm:px-5">

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
          <L>RG</L>
          <Input value={form.rg} onChange={e => f({ rg: e.target.value })} placeholder="00.000.000-0" />
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
            <p className="text-xs font-semibold text-fonti-primary">Cônjuge / Companheiro(a)</p>
            {conjugeVinculado && (
              <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg">
                <Check className="h-3.5 w-3.5 text-green-600 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-green-800">{conjugeVinculado.nome}</p>
                  {conjugeVinculado.cpf && <p className="text-xs text-green-600">{conjugeVinculado.cpf}</p>}
                </div>
                <span className="text-xs text-green-600 font-medium shrink-0">Cadastrado</span>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <L>Nome completo</L>
                <Input value={form.conjuge_nome} onChange={e => f({ conjuge_nome: e.target.value })} />
              </div>
              <div>
                <L>CPF</L>
                <Input value={form.conjuge_cpf} onChange={e => f({ conjuge_cpf: formatarCpf(e.target.value) })} placeholder="000.000.000-00" />
              </div>
              <div>
                <L>Nascimento</L>
                <Input type="date" value={form.conjuge_data_nascimento} onChange={e => f({ conjuge_data_nascimento: e.target.value })} />
              </div>
              <div>
                <L>Telefone</L>
                <Input value={form.conjuge_telefone} onChange={e => f({ conjuge_telefone: e.target.value })} />
              </div>
              <div>
                <L>Profissão</L>
                <Input value={form.conjuge_profissao} onChange={e => f({ conjuge_profissao: e.target.value })} />
              </div>
              <div>
                <L>Renda Formal (R$)</L>
                <InputMoeda value={form.conjuge_renda_formal} onChange={v => f({ conjuge_renda_formal: v })} />
              </div>
              <div>
                <L>Renda Informal (R$)</L>
                <InputMoeda value={form.conjuge_renda_informal} onChange={v => f({ conjuge_renda_informal: v })} />
              </div>
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
            </div>
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
