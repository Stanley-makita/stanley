import { createClient } from '@supabase/supabase-js'
import { fmtData } from '@/lib/utils'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export interface PessoaContexto {
  pessoa_id: string
  nome: string
  leads_ativos: Array<{
    id: string
    fase_nome: string
    fase_cor: string
    produto: string | null
    created_at: string
  }>
}

export function normalizarCpf(cpf: string): string {
  return cpf.replace(/\D/g, '')
}

/**
 * Normaliza telefone para o formato canônico usado em toda a base: só
 * dígitos, com DDI 55 sempre presente (mesmo formato que o webhook do
 * WhatsApp já entrega). Sem isso, o mesmo número digitado de formas
 * diferentes (com/sem DDI, com máscara) vira duas Pessoas distintas.
 */
export function normalizarTelefone(telefone: string): string {
  const digits = telefone.replace(/\D/g, '')
  const temDDI = digits.startsWith('55') && digits.length >= 12
  return temDDI ? digits : `55${digits}`
}

/**
 * Busca pessoa pelo telefone normalizado.
 * Retorna null se ainda não existe no banco.
 */
export async function buscarPessoaPorTelefone(
  empresa_id: string,
  telefone: string
): Promise<string | null> {
  const { data } = await supabase
    .from('pessoa_telefones')
    .select('pessoa_id, pessoas!inner(deleted_at)')
    .eq('empresa_id', empresa_id)
    .eq('telefone', normalizarTelefone(telefone))
    .eq('ativo', true)
    .is('pessoas.deleted_at', null)
    .maybeSingle()

  return data?.pessoa_id ?? null
}

/**
 * Busca pessoa pelo CPF normalizado (apenas dígitos).
 * Retorna null se ainda não existe no banco.
 */
export async function buscarPessoaPorCpf(
  empresa_id: string,
  cpf: string
): Promise<string | null> {
  const cpfNorm = normalizarCpf(cpf)
  if (cpfNorm.length !== 11) return null

  const { data } = await supabase
    .from('pessoas')
    .select('id')
    .eq('empresa_id', empresa_id)
    .eq('cpf', cpfNorm)
    .is('deleted_at', null)
    .maybeSingle()

  return data?.id ?? null
}

/**
 * Busca pessoa existente pelo CPF (prioritário) ou telefone, ou cria uma nova.
 *
 * Hierarquia:
 *   1. CPF → encontrou: adiciona telefone se novo, retorna pessoa
 *   2. Telefone → encontrou: atualiza CPF se ausente, retorna pessoa
 *   3. Nenhum → cria Pessoa nova com CPF e telefone
 *
 * status_identidade:
 *   - 'provisoria'  → nome é placeholder ("Cliente") — não validado por humano
 *   - 'confirmada'  → nome real coletado pelo bot ou informado manualmente
 */
export async function buscarOuCriarPessoa(
  empresa_id: string,
  telefoneBruto: string,
  nome: string,
  cpf?: string
): Promise<string> {
  const telefone = normalizarTelefone(telefoneBruto)
  const cpfNorm = cpf ? normalizarCpf(cpf) : null
  const cpfValido = cpfNorm?.length === 11 ? cpfNorm : null

  // 1. Busca por CPF primeiro (chave forte)
  if (cpfValido) {
    const pessoaIdByCpf = await buscarPessoaPorCpf(empresa_id, cpfValido)
    if (pessoaIdByCpf) {
      // Registra o novo telefone para esta pessoa se ainda não existe
      const { data: telefoneExistente } = await supabase
        .from('pessoa_telefones')
        .select('id')
        .eq('pessoa_id', pessoaIdByCpf)
        .eq('telefone', telefone)
        .maybeSingle()

      if (!telefoneExistente) {
        await supabase.from('pessoa_telefones').insert({
          pessoa_id: pessoaIdByCpf,
          empresa_id,
          telefone,
          principal: false,
          whatsapp: true,
          ativo: true,
        })
      }
      return pessoaIdByCpf
    }
  }

  // 2. Busca por telefone
  const pessoaIdByPhone = await buscarPessoaPorTelefone(empresa_id, telefone)
  if (pessoaIdByPhone) {
    // Aproveita para gravar o CPF se a pessoa ainda não tinha
    if (cpfValido) {
      await supabase
        .from('pessoas')
        .update({ cpf: cpfValido })
        .eq('id', pessoaIdByPhone)
        .is('cpf', null)
    }
    return pessoaIdByPhone
  }

  // 3. Cria nova pessoa
  const nomePlaceholder = !nome || nome.toLowerCase() === 'cliente' || nome.toLowerCase() === 'desconhecido'
  const statusIdentidade = nomePlaceholder ? 'provisoria' : 'confirmada'

  const { data: pessoa, error } = await supabase
    .from('pessoas')
    .insert({
      empresa_id,
      nome: nomePlaceholder ? 'Novo contato' : nome,
      status_identidade: statusIdentidade,
      ...(cpfValido ? { cpf: cpfValido } : {}),
    })
    .select('id')
    .single()

  if (error || !pessoa) {
    throw new Error(`Erro ao criar pessoa: ${error?.message}`)
  }

  const { error: telError } = await supabase.from('pessoa_telefones').insert({
    pessoa_id: pessoa.id,
    empresa_id,
    telefone,
    principal: true,
    whatsapp: true,
    ativo: true,
  })

  // Condição de corrida: várias mensagens (ex: vários documentos seguidos após
  // *inicio) podem chegar em paralelo e todas passarem pelo "não existe ainda"
  // antes de qualquer uma commitar. Só a primeira grava o telefone (constraint
  // única); as demais ficam com Pessoa órfã sem telefone. Se o insert falhar por
  // violação de unicidade, descarta a pessoa recém-criada (ainda vazia, sem
  // vínculos) e reaproveita a pessoa vencedora da corrida.
  if (telError) {
    if (telError.code === '23505') {
      await supabase.from('pessoas').delete().eq('id', pessoa.id)
      const pessoaIdVencedora = await buscarPessoaPorTelefone(empresa_id, telefone)
      if (pessoaIdVencedora) return pessoaIdVencedora
    } else {
      console.error('[pessoa] Erro ao gravar telefone da pessoa:', telError.message)
    }
  }

  return pessoa.id
}

/**
 * Atualiza status_identidade para 'confirmada' quando o bot coletou o nome real.
 * Chamado após resultado.criarLead para atualizar o registro provisório.
 */
export async function confirmarIdentidadePessoa(
  pessoa_id: string,
  nome: string
): Promise<void> {
  await supabase
    .from('pessoas')
    .update({ nome, status_identidade: 'confirmada' })
    .eq('id', pessoa_id)
    .eq('status_identidade', 'provisoria') // só atualiza se ainda era provisória
}

/**
 * Carrega contexto completo da pessoa para enviar ao bot.
 * Inclui nome e leads ativos com fase atual.
 */
export async function carregarContextoPessoa(
  empresa_id: string,
  telefone: string
): Promise<PessoaContexto | null> {
  const pessoa_id = await buscarPessoaPorTelefone(empresa_id, telefone)
  if (!pessoa_id) return null

  const { data: pessoa } = await supabase
    .from('pessoas')
    .select('id, nome')
    .eq('id', pessoa_id)
    .single()

  if (!pessoa) return null

  const { data: leads } = await supabase
    .from('leads')
    .select('id, observacoes, created_at, fase:fases!fase_id(nome, cor)')
    .eq('empresa_id', empresa_id)
    .eq('pessoa_id', pessoa_id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(5)

  const leads_ativos = (leads ?? []).map((l) => {
    const fase = Array.isArray(l.fase) ? l.fase[0] : l.fase
    return {
      id: l.id,
      fase_nome: (fase as { nome: string; cor: string } | null)?.nome ?? 'Sem fase',
      fase_cor: (fase as { nome: string; cor: string } | null)?.cor ?? '#888',
      produto: null as string | null,
      created_at: l.created_at,
    }
  })

  return { pessoa_id, nome: pessoa.nome, leads_ativos }
}

/**
 * Formata o contexto da pessoa como texto para o system prompt do bot.
 */
export function formatarContextoParaBot(ctx: PessoaContexto): string {
  const linhas = [
    `CLIENTE EXISTENTE: ${ctx.nome}`,
    `ID Pessoa: ${ctx.pessoa_id}`,
  ]

  if (ctx.leads_ativos.length > 0) {
    linhas.push(`Leads ativos (${ctx.leads_ativos.length}):`)
    ctx.leads_ativos.forEach((l, i) => {
      linhas.push(`  ${i + 1}. Fase: ${l.fase_nome} — criado em ${fmtData(l.created_at)}`)
    })
    linhas.push('Este cliente já está sendo atendido. Não colete dados que já temos. Informe em qual fase está o processo.')
  } else {
    linhas.push('Este cliente já entrou em contato antes mas não tem leads ativos. Trate como retorno.')
  }

  return linhas.join('\n')
}
