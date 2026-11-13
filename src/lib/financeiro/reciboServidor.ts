import { NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase/admin'
import { clienteDoUsuario, type ContextoRota } from '@/lib/documentos/vinculosServidor'
import { titularDaProposta } from '@/lib/participantes/consultas'
import type { DadosRecibo, EmpresaRecibo } from './recibo'

const TIMEOUT_QUERY = 10_000

export interface ReciboCarregado {
  dados: DadosRecibo
  /** Proponente principal — padrão do recibo quando o lançamento não tem nome/CPF próprios. */
  titular: { nome: string; cpf: string | null } | null
  telefoneTitular: string | null
  reciboNome: string | null
  reciboCpf: string | null
}

async function telefoneDaPessoa(pessoaId: string): Promise<string | null> {
  const { data } = await supabase
    .from('pessoa_telefones')
    .select('telefone, principal, whatsapp')
    .eq('pessoa_id', pessoaId)
    .eq('ativo', true)
    .order('principal', { ascending: false })
    .order('whatsapp', { ascending: false })
    .limit(1)
    .abortSignal(AbortSignal.timeout(TIMEOUT_QUERY))
    .maybeSingle()
  return (data as { telefone: string } | null)?.telefone ?? null
}

/** Logo trocada em Dados da Empresa → data URL. undefined = usa a logo oficial embutida. */
async function logoDocumentos(url: string | null): Promise<string | undefined> {
  if (!url) return undefined
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
    const tipo = res.headers.get('content-type') ?? ''
    if (!res.ok || !/image\/(png|jpe?g)/.test(tipo)) return undefined
    return `data:${tipo};base64,${Buffer.from(await res.arrayBuffer()).toString('base64')}`
  } catch {
    return undefined
  }
}

/**
 * Lê o lançamento com o JWT do usuário (a RLS decide se ele enxerga o negócio) e monta
 * tudo que o recibo precisa. Devolve a resposta de erro pronta quando não dá.
 */
export async function carregarRecibo(
  ctx: ContextoRota, processoId: string, lancamentoId: string,
): Promise<ReciboCarregado | NextResponse> {
  const { data: lanc, error } = await clienteDoUsuario(ctx.token)
    .from('processo_financeiro')
    .select('id, processo_id, empresa_id, valor, descricao, situacao, pago_em, recibo_numero, recibo_nome, recibo_cpf')
    .eq('id', lancamentoId)
    .eq('processo_id', processoId)
    .abortSignal(AbortSignal.timeout(TIMEOUT_QUERY))
    .maybeSingle()
  if (error) return NextResponse.json({ error: 'Erro ao buscar o lançamento.' }, { status: 500 })
  if (!lanc) return NextResponse.json({ error: 'Lançamento não encontrado.' }, { status: 404 })
  if (lanc.situacao !== 'recebido' || lanc.recibo_numero == null) {
    return NextResponse.json({ error: 'Só lançamentos com situação "Recebido" têm recibo.' }, { status: 409 })
  }

  const [{ data: processo }, { data: empresa }, titular] = await Promise.all([
    supabase.from('processos').select('numero_processo').eq('id', processoId)
      .abortSignal(AbortSignal.timeout(TIMEOUT_QUERY)).maybeSingle(),
    supabase.from('empresas')
      .select('nome, razao_social, cnpj, telefone, email, logo_documentos_url, endereco_rua, endereco_numero, endereco_complemento, endereco_bairro, endereco_cidade, endereco_uf, endereco_cep')
      .eq('id', lanc.empresa_id)
      .abortSignal(AbortSignal.timeout(TIMEOUT_QUERY)).maybeSingle(),
    titularDaProposta(supabase, { tipo: 'processo', id: processoId }, { timeoutMs: TIMEOUT_QUERY }).catch(() => null),
  ])
  if (!empresa) return NextResponse.json({ error: 'Empresa não encontrada.' }, { status: 500 })

  const [telefoneTitular, logo] = await Promise.all([
    titular ? telefoneDaPessoa(titular.pessoa_id) : Promise.resolve(null),
    logoDocumentos((empresa as { logo_documentos_url: string | null }).logo_documentos_url),
  ])

  const reciboNome = (lanc.recibo_nome as string | null)?.trim() || null
  const reciboCpf = (lanc.recibo_cpf as string | null)?.trim() || null

  return {
    titular: titular ? { nome: titular.nome, cpf: titular.cpf } : null,
    telefoneTitular,
    reciboNome,
    reciboCpf,
    dados: {
      numero: lanc.recibo_numero as number,
      valor: Number(lanc.valor),
      descricao: lanc.descricao as string,
      recebidoEm: new Date((lanc.pago_em as string | null) ?? Date.now()),
      // Nome próprio do recibo vence; o CPF acompanha o nome (outro pagador sem CPF não
      // pode herdar o CPF do titular).
      pagadorNome: reciboNome ?? titular?.nome ?? '—',
      pagadorCpf: reciboNome ? reciboCpf : (reciboCpf ?? titular?.cpf ?? null),
      processoNumero: (processo as { numero_processo: string | null } | null)?.numero_processo ?? null,
      empresa: empresa as unknown as EmpresaRecibo,
      logoDataUrl: logo,
    },
  }
}
