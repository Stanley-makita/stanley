/**
 * Comandos internos *fonti — uso exclusivo de funcionários da Fontinhas via WhatsApp.
 * O webhook chama processarComandoFonti() antes do fluxo normal de atendimento.
 * Retorna null se o remetente não for usuário interno (fluxo normal prossegue).
 */

import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import { extrairProduto, extrairNumero } from './state-machine'
import type { WorkflowPendente } from '@/lib/workflows/simula-pendente'
import { PERGUNTA_TIPO_CONSTRUCAO } from '@/lib/workflows/normalizador-captacao'
import { buscarOuCriarPessoa } from '@/lib/pessoa'

// Mesma pergunta usada pelo normalizador, mas com prefixo de re-ask
const PERGUNTA_TIPO_CONSTRUCAO_REASK = PERGUNTA_TIPO_CONSTRUCAO

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export interface FontiArquivo {
  fileUrl: string
  fileName: string | null
  mimeType: string | null
}

export interface FontiContexto {
  empresa_id: string
  telefone_remetente: string   // phone do comercial (para autenticar)
  telefone_cliente?: string    // phone do cliente da conversa (cenário fromMe)
  atendente_id_override?: string  // fromMe via instância confiável — pula verificação de phone
  supabase: SupabaseClient
  arquivos: FontiArquivo[]
  // Contexto para o Workflow de Captação enviar PDF via WhatsApp
  instancia_token?: string     // token Uazapi da instância ativa
  telefone_destino?: string    // telefone destino para envio de respostas com mídia
}

interface UsuarioInterno {
  id: string
  nome: string
}

// ── Verificação de usuário interno ────────────────────────────────────────────

// Normaliza para os últimos 8 dígitos (número local brasileiro sem DDD/DDI).
// Trata a variação do dígito 9 de celular: 5544984558946 ≡ 554484558946 ≡ 84558946
function telLocal(digits: string): string {
  return digits.replace(/\D/g, '').slice(-8)
}

export async function verificarUsuarioInterno(
  supabase: SupabaseClient,
  empresa_id: string,
  telefoneWA: string,
): Promise<UsuarioInterno | null> {
  // Tenta buscar com telefone_whatsapp; se a coluna não existir (migration pendente),
  // faz fallback sem ela
  let usuarios: Array<{ id: string; nome: string; telefone: string | null; telefone_whatsapp?: string | null }> | null = null

  const { data: comWA, error: erroWA } = await supabase
    .from('usuarios')
    .select('id, nome, telefone, telefone_whatsapp')
    .eq('empresa_id', empresa_id)
    .eq('ativo', true)
    .is('deleted_at', null)

  if (!erroWA) {
    usuarios = comWA
  } else {
    // Fallback: migration 067 provavelmente não foi rodada ainda
    console.warn('[fonti] telefone_whatsapp indisponível, usando fallback só com telefone:', erroWA.message)
    const { data: semWA } = await supabase
      .from('usuarios')
      .select('id, nome, telefone')
      .eq('empresa_id', empresa_id)
      .eq('ativo', true)
      .is('deleted_at', null)
    usuarios = semWA
  }

  if (!usuarios?.length) return null

  const waLocal = telLocal(telefoneWA)
  if (waLocal.length < 6) return null  // número inválido

  for (const u of usuarios) {
    const phones = [u.telefone_whatsapp, u.telefone].filter(Boolean) as string[]
    for (const phone of phones) {
      if (telLocal(phone) === waLocal) {
        return { id: u.id, nome: u.nome }
      }
    }
  }

  // Loga os números cadastrados para facilitar diagnóstico
  const resumo = usuarios.map(u => `${u.nome}: wa=${u.telefone_whatsapp ?? 'null'} tel=${u.telefone ?? 'null'}`).join(' | ')
  console.warn('[fonti] verificarUsuarioInterno: nenhum match para', telefoneWA, '(local:', waLocal, ') | cadastrados:', resumo)
  return null
}

// ── Upload de arquivo para Storage e registro na tabela ───────────────────────

// Modelo definitivo: grava direto em `documentos` (dominio=acervo_documental) +
// `documento_vinculos` (lead/processo, quando houver). pessoa_id é obrigatório —
// se a entidade não trouxer uma (ex: processo sem comprador com pessoa resolvida),
// resolve/cria uma Pessoa provisória pelo telefone da conversa, mesma regra do webhook.
async function salvarArquivo(
  supabase: SupabaseClient,
  arquivo: FontiArquivo,
  empresa_id: string,
  entidade: {
    pessoa_id?: string | null
    lead_id?: string | null
    processo_id?: string | null
  },
  telefoneFallback: string,
): Promise<boolean> {
  try {
    const { fileUrl, fileName, mimeType } = arquivo
    const ext = fileName?.split('.').pop()
      ?? (mimeType?.split('/')[1] ?? 'bin').replace('jpeg', 'jpg')
    const storagePath = `${empresa_id}/fonti/${crypto.randomUUID()}.${ext}`
    const nomeOriginal = fileName ?? `arquivo.${ext}`

    const fileRes = await fetch(fileUrl, { signal: AbortSignal.timeout(20000) })
    if (!fileRes.ok) throw new Error(`Download falhou: ${fileRes.status}`)

    const fileBuffer = await fileRes.arrayBuffer()
    const { error: uploadError } = await supabase.storage
      .from('documentos-clientes')
      .upload(storagePath, fileBuffer, {
        contentType: mimeType ?? 'application/octet-stream',
        upsert: false,
      })
    if (uploadError) throw uploadError

    const pessoaId = entidade.pessoa_id ?? await buscarOuCriarPessoa(empresa_id, telefoneFallback, 'Cliente')

    const { data: docInserido, error: dbError } = await supabase.from('documentos').insert({
      empresa_id,
      dominio: 'acervo_documental',
      pessoa_id: pessoaId,
      nome_original: nomeOriginal,
      mime_type: mimeType ?? null,
      tamanho_bytes: fileBuffer.byteLength,
      storage_bucket: 'documentos-clientes',
      storage_path: storagePath,
      origem: 'whatsapp',
    }).select('id').single()
    if (dbError) throw dbError

    const vinculos: Array<{ empresa_id: string; documento_id: string; entidade_tipo: string; entidade_id: string }> = []
    if (entidade.lead_id) vinculos.push({ empresa_id, documento_id: docInserido!.id, entidade_tipo: 'lead', entidade_id: entidade.lead_id })
    if (entidade.processo_id) vinculos.push({ empresa_id, documento_id: docInserido!.id, entidade_tipo: 'processo', entidade_id: entidade.processo_id })
    if (vinculos.length > 0) {
      await supabase.from('documento_vinculos').insert(vinculos)
    }
    return true
  } catch (err) {
    console.error('[fonti] Erro ao salvar arquivo:', err)
    return false
  }
}

// ── Vincula todos os docs não linkados da conversa do cliente ────────────────

async function vincularDocumentosConversa(
  supabase: SupabaseClient,
  empresa_id: string,
  pessoa_id: string,
  lead_id: string | null,
): Promise<number> {
  // 1. Telefone principal da pessoa
  const { data: telefoneRow } = await supabase
    .from('pessoa_telefones')
    .select('telefone')
    .eq('pessoa_id', pessoa_id)
    .eq('ativo', true)
    .limit(1)
    .maybeSingle()

  if (!telefoneRow?.telefone) return 0

  return (await vincularDocumentosRecentesPorTelefone(supabase, empresa_id, telefoneRow.telefone, pessoa_id, lead_id, 90 * 24 * 60)).count
}

// Vincula docs não linkados de uma conversa identificada por telefone.
// marcaAt: se fornecida, usada como início da janela (via *fonti inicio). Senão: now() - janela_minutos.
// processo_id: se fornecido, filtra docs sem processo vinculado e seta processo_id (modo processo).
// Retorna { count, ids } para que o caller possa disparar OCR nos docs vinculados.
// Modelo definitivo: pessoa_id já vem sempre preenchido no documento desde a criação
// (webhook/salvarArquivo resolvem via buscarOuCriarPessoa) — não existe mais o estado
// "documento sem dono" que essa função precisava backfillar. O que resta fazer aqui é
// só criar o vínculo com lead/processo para os documentos recentes dessa pessoa que
// ainda não têm esse vínculo.
async function vincularDocumentosRecentesPorTelefone(
  supabase: SupabaseClient,
  empresa_id: string,
  telefoneConversa: string,
  pessoa_id: string | null,
  lead_id: string | null,
  janela_minutos = 15,
  marcaAt?: Date,
  processo_id?: string,
): Promise<{ count: number; ids: string[] }> {
  // pessoa_id pode não ter sido resolvido pelo chamador (ex: processo sem comprador
  // com pessoa vinculada) — cai pra pessoa já associada à conversa (webhook garante
  // que toda conversa tem pessoa_id assim que a primeira mídia/mensagem chega).
  const { data: conversa } = await supabase
    .from('conversas')
    .select('pessoa_id')
    .eq('empresa_id', empresa_id)
    .eq('canal', 'whatsapp')
    .eq('contato_telefone', telefoneConversa)
    .limit(1)
    .maybeSingle()

  const pessoaIdEfetiva = pessoa_id ?? conversa?.pessoa_id ?? null
  if (!pessoaIdEfetiva) return { count: 0, ids: [] }

  const entidadeTipo: 'lead' | 'processo' = processo_id ? 'processo' : 'lead'
  const entidadeId = processo_id ?? lead_id
  if (!entidadeId) return { count: 0, ids: [] }

  const limite = marcaAt ?? (() => {
    const d = new Date()
    d.setMinutes(d.getMinutes() - janela_minutos)
    return d
  })()

  const { data: docsCandidatos } = await supabase
    .from('documentos')
    .select('id')
    .eq('empresa_id', empresa_id)
    .eq('dominio', 'acervo_documental')
    .eq('pessoa_id', pessoaIdEfetiva)
    .is('deleted_at', null)
    .gte('recebido_em', limite.toISOString())

  if (!docsCandidatos?.length) return { count: 0, ids: [] }

  const idsCandidatos = docsCandidatos.map((d) => d.id)
  const { data: vinculosExistentes } = await supabase
    .from('documento_vinculos')
    .select('documento_id')
    .eq('entidade_tipo', entidadeTipo)
    .in('documento_id', idsCandidatos)
  const idsComVinculo = new Set((vinculosExistentes ?? []).map((v) => v.documento_id))
  const idsParaVincular = idsCandidatos.filter((id) => !idsComVinculo.has(id))

  if (idsParaVincular.length === 0) return { count: 0, ids: [] }

  const { error } = await supabase
    .from('documento_vinculos')
    .insert(idsParaVincular.map((documento_id) => ({
      empresa_id, documento_id, entidade_tipo: entidadeTipo, entidade_id: entidadeId,
    })))

  if (error) {
    console.error('[fonti] Erro ao vincular documentos:', error)
    return { count: 0, ids: [] }
  }

  return { count: idsParaVincular.length, ids: idsParaVincular }
}

// ── Marca de sessão *fonti inicio ─────────────────────────────────────────────

async function obterMarcaInicio(
  supabase: SupabaseClient,
  empresa_id: string,
  telefoneConversa: string,
): Promise<Date | null> {
  const { data } = await supabase
    .from('fonti_marcas')
    .select('iniciado_at')
    .eq('empresa_id', empresa_id)
    .eq('telefone_conversa', telefoneConversa)
    .maybeSingle()
  return data?.iniciado_at ? new Date(data.iniciado_at) : null
}

async function limparMarca(
  supabase: SupabaseClient,
  empresa_id: string,
  telefoneConversa: string,
): Promise<void> {
  await supabase.from('fonti_marcas')
    .delete()
    .eq('empresa_id', empresa_id)
    .eq('telefone_conversa', telefoneConversa)
}

// Retorna a sessão completa (incluindo processo_id se definido via *fonti processo)
async function obterSessaoCompleta(
  supabase: SupabaseClient,
  empresa_id: string,
  telefoneConversa: string,
): Promise<{ iniciado_at: string; processo_id: string | null; pessoa_id: string | null; candidatos_pendentes: { id: string; nome: string }[] | null } | null> {
  const { data } = await supabase
    .from('fonti_marcas')
    .select('iniciado_at, processo_id, pessoa_id, candidatos_pendentes')
    .eq('empresa_id', empresa_id)
    .eq('telefone_conversa', telefoneConversa)
    .maybeSingle()
  return data ?? null
}

// Grava sessão de processo em fonti_marcas
async function gravarSessaoProcesso(
  supabase: SupabaseClient,
  empresa_id: string,
  telefoneConversa: string,
  processo_id: string,
  pessoa_id: string | null,
): Promise<void> {
  await supabase.from('fonti_marcas').upsert(
    { empresa_id, telefone_conversa: telefoneConversa, iniciado_at: new Date().toISOString(), processo_id, pessoa_id },
    { onConflict: 'empresa_id,telefone_conversa' },
  )
}

// ── Helpers para *fonti processo ─────────────────────────────────────────────

// IMPORTANTE: usar blocklist (não allowlist) — novos status operacionais devem aceitar docs automaticamente.
// Processo pode receber documentos até sua conclusão, incluindo fases pós-emissão:
// assinatura, registro, exigências cartorárias/bancárias, FGTS complementar, ITBI, docs do vendedor.
const STATUS_BLOQUEADOS_PROCESSO = ['concluido', 'cancelado', 'reprovado', 'arquivado']

async function buscarProcessoPorNumero(
  supabase: SupabaseClient,
  empresa_id: string,
  numeroProcesso: string,
) {
  // .not('in') exclui NULLs no PostgreSQL — processos novos sem status definido seriam ignorados.
  // Usar .or() para aceitar NULL explicitamente.
  const { data } = await supabase
    .from('processos')
    .select('id, numero_processo, banco, valor_imovel')
    .eq('empresa_id', empresa_id)
    .eq('numero_processo', numeroProcesso)
    .is('deleted_at', null)
    .or(`status_processo.is.null,status_processo.not.in.(${STATUS_BLOQUEADOS_PROCESSO.join(',')})`)
    .maybeSingle()
  return data ?? null
}

async function buscarProcessosAtivos(
  supabase: SupabaseClient,
  empresa_id: string,
  pessoa_id: string,
) {
  const { data: compradorRows } = await supabase
    .from('processo_compradores')
    .select('processo_id')
    .eq('empresa_id', empresa_id)
    .eq('pessoa_id', pessoa_id)

  if (!compradorRows?.length) return []

  const processoIds = compradorRows.map((r) => r.processo_id)

  const { data: processos } = await supabase
    .from('processos')
    .select('id, numero_processo, banco, valor_imovel')
    .in('id', processoIds)
    .is('deleted_at', null)
    .or(`status_processo.is.null,status_processo.not.in.(${STATUS_BLOQUEADOS_PROCESSO.join(',')})`)
    .order('created_at', { ascending: false })

  return processos ?? []
}

async function buscarCompradorPrincipalProcesso(
  supabase: SupabaseClient,
  empresa_id: string,
  processo_id: string,
) {
  const { data } = await supabase
    .from('processo_compradores')
    .select('pessoa_id, nome')
    .eq('empresa_id', empresa_id)
    .eq('processo_id', processo_id)
    .eq('principal', true)
    .maybeSingle()
  return data ?? null
}

function fmtValorProcesso(v: number | null): string {
  if (!v) return 'valor não informado'
  return `R$ ${v.toLocaleString('pt-BR')}`
}

// Vincula docs recentes da conversa a um processo (fluxo rápido ou por sessão).
// processoRef pode ser: "003", "#proc-003", ou UUID completo (quando vem de sessao.processo_id).
async function salvarParaProcesso(
  supabase: SupabaseClient,
  empresa_id: string,
  processoRef: string,
  telefoneConversa: string,
  arquivos: FontiArquivo[],
  marcaAt?: Date | null,
): Promise<string> {
  type ProcessoRow = { id: string; numero_processo: string; banco: string | null; valor_imovel: number | null }
  let processo: ProcessoRow | null = null

  // UUID completo → busca direta por ID (usado quando vem de sessao.processo_id)
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(processoRef)) {
    const { data } = await supabase
      .from('processos')
      .select('id, numero_processo, banco, valor_imovel')
      .eq('id', processoRef)
      .eq('empresa_id', empresa_id)
      .is('deleted_at', null)
      .or(`status_processo.is.null,status_processo.not.in.(${STATUS_BLOQUEADOS_PROCESSO.join(',')})`)
      .maybeSingle()
    processo = data ?? null
  } else {
    // Número curto: 003, 3, proc-003, #proc-003
    const numMatch = processoRef.match(/^#?(?:proc-)?0*(\d+)$/)
    if (!numMatch) return `❌ Referência de processo inválida: "${processoRef}"\nEx: *fonti salva processo 003`
    const numeroProcesso = `#proc-${numMatch[1].padStart(3, '0')}`
    processo = await buscarProcessoPorNumero(supabase, empresa_id, numeroProcesso)
  }

  if (!processo) return `❌ Processo não encontrado ou já encerrado.`

  const comprador = await buscarCompradorPrincipalProcesso(supabase, empresa_id, processo.id)
  const pessoa_id = comprador?.pessoa_id ?? null

  const { count: vinculados } = await vincularDocumentosRecentesPorTelefone(
    supabase, empresa_id, telefoneConversa,
    pessoa_id, null, 15, marcaAt ?? undefined, processo.id,
  )

  let salvos = 0
  for (const arq of arquivos) {
    const ok = await salvarArquivo(supabase, arq, empresa_id, { pessoa_id, processo_id: processo.id }, telefoneConversa)
    if (ok) salvos++
  }

  await limparMarca(supabase, empresa_id, telefoneConversa)

  const total = vinculados + salvos
  if (total === 0) {
    const numExibir = processo.numero_processo.replace('#proc-', '')
    return `⚠️ Nenhum documento recente encontrado para ${processo.numero_processo}.\nUse *fonti processo ${numExibir} para iniciar sessão, envie os arquivos e depois *fonti salva.`
  }

  const partes: string[] = []
  if (vinculados > 0) partes.push(`${vinculados} da conversa`)
  if (salvos > 0) partes.push(`${salvos} novo${salvos > 1 ? 's' : ''}`)
  return `✅ ${total} documento(s) vinculado(s) ao processo ${processo.numero_processo} — ${processo.banco || 'banco não informado'} (${partes.join(' + ')})`
}

// ── Busca de entidade para *fonti salva ───────────────────────────────────────

interface EntidadeEncontrada {
  tipo: 'pessoa' | 'processo'
  id: string
  label: string
  pessoa_id?: string
  lead_id?: string
}

interface EntidadeAmbigua {
  tipo: 'ambiguo'
  candidatos: { id: string; nome: string }[]
}

async function buscarEntidade(
  supabase: SupabaseClient,
  empresa_id: string,
  referencia: string,
  telefoneCliente?: string,  // busca direta por phone (cenário fromMe)
): Promise<EntidadeEncontrada | EntidadeAmbigua | null> {
  const ref = referencia.trim()

  // Cenário fromMe: sem referência de nome, usa o telefone do cliente diretamente
  if (!ref && telefoneCliente) {
    const { data: pt } = await supabase
      .from('pessoa_telefones')
      .select('pessoa_id, pessoas(id, nome)')
      .eq('empresa_id', empresa_id)
      .eq('telefone', telefoneCliente)
      .eq('ativo', true)
      .limit(1)
      .maybeSingle()

    const pessoa = pt ? (Array.isArray(pt.pessoas) ? pt.pessoas[0] : pt.pessoas) as { id: string; nome: string } | null : null
    if (pessoa) {
      const { data: lead } = await supabase
        .from('leads').select('id').eq('empresa_id', empresa_id).eq('pessoa_id', pessoa.id)
        .is('deleted_at', null).order('created_at', { ascending: false }).limit(1).maybeSingle()
      return { tipo: 'pessoa', id: pessoa.id, label: pessoa.nome, lead_id: lead?.id ?? undefined }
    }
    return null
  }

  // Referência de processo: #proc-xxx ou #xxx (hex/uuid-prefix)
  const procMatch = ref.match(/^#(?:proc-)?([a-f0-9-]{4,36})/i)
  if (procMatch) {
    const codigo = procMatch[1]
    const { data: proc } = await supabase
      .from('processos')
      .select('id, nome_imovel, pessoa_id')
      .eq('empresa_id', empresa_id)
      .or(`id.ilike.${codigo}%`)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle()

    if (proc) {
      return {
        tipo: 'processo',
        id: proc.id,
        label: proc.nome_imovel ?? `Processo ${proc.id.slice(0, 8)}`,
        pessoa_id: proc.pessoa_id ?? undefined,
      }
    }
  }

  // Busca por nome de pessoa (ilike)
  const { data: pessoas } = await supabase
    .from('pessoas')
    .select('id, nome')
    .eq('empresa_id', empresa_id)
    .ilike('nome', `%${ref}%`)
    .limit(3)

  if (pessoas && pessoas.length >= 1) {
    // Ambiguidade: múltiplos clientes com o mesmo nome parcial
    if (pessoas.length > 1) {
      return { tipo: 'ambiguo', candidatos: pessoas }
    }

    const escolhido = pessoas[0]

    // Busca o lead mais recente da pessoa para incluir lead_id no documento
    const { data: leadDaPessoa } = await supabase
      .from('leads')
      .select('id')
      .eq('empresa_id', empresa_id)
      .eq('pessoa_id', escolhido.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    return {
      tipo: 'pessoa',
      id: escolhido.id,
      label: escolhido.nome,
      lead_id: leadDaPessoa?.id ?? undefined,
    }
  }

  return null
}

// ── Extração de dados do lead via Claude ──────────────────────────────────────

interface DadosLead {
  nome: string | null
  produto: string | null
  valor_imovel: number | null
  valor_financiamento: number | null
  renda: number | null
  cpf: string | null
  data_nascimento: string | null
  estado_civil: 'solteiro' | 'casado' | 'uniao_estavel' | 'divorciado' | 'viuvo' | null
  valor_entrada: number | null
  telefone: string | null  // apenas dígitos, com DDD
}

const ESTADOS_CIVIS_VALIDOS = ['solteiro', 'casado', 'uniao_estavel', 'divorciado', 'viuvo'] as const
type EstadoCivil = typeof ESTADOS_CIVIS_VALIDOS[number]

async function extrairDadosLead(instrucao: string): Promise<DadosLead> {
  const produtoRapido = extrairProduto(instrucao)
  const numerosEncontrados = instrucao.match(/R?\$?\s*[\d.,]+\s*(?:mil|k|m)?/gi) ?? []

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      system: `Extraia dados de lead imobiliário do texto. Responda SOMENTE com JSON válido, sem markdown, sem explicação:
{"nome":"...","produto":"Financiamento Imobiliário|CGI|Consórcio|Contrato|null","valor_imovel":número_ou_null,"valor_financiamento":número_ou_null,"renda":número_ou_null,"cpf":"11digitos_ou_null","data_nascimento":"YYYY-MM-DD_ou_null","estado_civil":"solteiro|casado|uniao_estavel|divorciado|viuvo|null","valor_entrada":número_ou_null,"telefone":"dígitos_com_DDD_ou_null"}
Regras:
- valor_imovel: valor do imóvel/compra e venda. Se o comercial mencionar apenas "valor X" sem especificar se é imóvel ou financiamento, colocar em valor_imovel. Se ficar claro que é "financiando X" ou "valor a financiar X", colocar em valor_financiamento.
- valor_financiamento: valor que o cliente quer financiar (quando explicitamente mencionado como financiamento)
- renda e valores: número inteiro sem R$ (ex: "750 mil" → 750000, "35 mi" → 35000, "35k" → 35000)
- valor_entrada: valor de entrada/FGTS/recursos próprios mencionado (ex: "200 mil de entrada" → 200000)
- cpf: apenas dígitos, sem pontos/traços (ex: "012.625.478-45" → "01262547845"). null se ausente.
- data_nascimento: converter qualquer formato para YYYY-MM-DD. null se ausente.
- estado_civil: "casado/a" → "casado", "solteiro/a" → "solteiro", "união estável" → "uniao_estavel", "divorciado/a" → "divorciado", "viúvo/a" → "viuvo". null se não mencionado.
- telefone: número de celular/telefone do CLIENTE (não do corretor). Remover espaços, traços, parênteses. Manter DDD. Ex: "44 984557766" → "44984557766". null se ausente.
- Se não mencionado, use null.`,
      messages: [{ role: 'user', content: instrucao }],
    })

    const bloco = response.content[0]
    if (bloco?.type === 'text') {
      const jsonText = bloco.text.trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/, '')
      const d = JSON.parse(jsonText) as DadosLead
      return {
        nome:                d.nome    ?? null,
        produto:             d.produto ?? produtoRapido,
        valor_imovel:        typeof d.valor_imovel === 'number' ? d.valor_imovel : null,
        valor_financiamento: typeof d.valor_financiamento === 'number' ? d.valor_financiamento : null,
        renda:               typeof d.renda === 'number' ? d.renda : null,
        cpf:                 typeof d.cpf === 'string' && /^\d{11}$/.test(d.cpf) ? d.cpf : null,
        data_nascimento:     typeof d.data_nascimento === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.data_nascimento) ? d.data_nascimento : null,
        estado_civil:        ESTADOS_CIVIS_VALIDOS.includes(d.estado_civil as EstadoCivil) ? d.estado_civil as EstadoCivil : null,
        valor_entrada:       typeof d.valor_entrada === 'number' ? d.valor_entrada : null,
        telefone:            typeof d.telefone === 'string' && /^\d{10,11}$/.test(d.telefone.replace(/\D/g, '')) ? d.telefone.replace(/\D/g, '') : null,
      }
    }
  } catch (err) {
    console.error('[fonti] Erro ao extrair dados via Claude:', err)
  }

  // Fallback: extração manual básica
  const valor = numerosEncontrados.length > 0 ? extrairNumero(numerosEncontrados[0]!) : null
  const renda = numerosEncontrados.length > 1 ? extrairNumero(numerosEncontrados[1]!) : null
  const nomeMatch = instrucao.match(/[A-ZÁÉÍÓÚÀÃÕÂÊÔÇ][a-záéíóúàãõâêôç]+(?:\s+[A-ZÁÉÍÓÚÀÃÕÂÊÔÇ][a-záéíóúàãõâêôç]+)+/)
  return {
    nome: nomeMatch?.[0] ?? null,
    produto: produtoRapido,
    valor_imovel: valor,
    valor_financiamento: null,
    renda,
    cpf: null,
    data_nascimento: null,
    estado_civil: null,
    valor_entrada: null,
    telefone: null,
  }
}

// ── Mensagem de ajuda ─────────────────────────────────────────────────────────

const MSG_AJUDA = `*Fonti — Comandos*

*Pessoa / Lead*

*inicio*  _(ou *fonti inicio*)_
  → Marca início de sessão de docs para o próximo cliente.

*simula [dados do cliente]*  _(ou *simular*, *simulação*, *fonti simula*)_
  → Consulta rápida: Motor de Crédito + PDF sem criar Lead ou Pessoa
  Ex: *simula imóvel 500k, 80%, renda 12k, Itaú Caixa, 32 anos

*cria cliente* ou *criar cliente [descrição livre]*  _(ou *fonti cria ...*)_
  → Cria Pessoa + Lead e vincula documentos recentes

*atualiza* ou *atualizar [nome] [dados]*  _(ou *fonti atualiza ...*)_
  → Atualiza CPF, nascimento, renda, estado civil de um lead
     Também vincula docs recentes da conversa

*salva* ou *salvar [nome]*  _(ou *fonti salva ...*)_
  → Vincula docs recentes à pessoa/lead informado

*Processo*

*processo [nome ou número]*  _(ou *fonti processo ...*)_
  → Inicia sessão de docs para um processo específico
  Ex: *processo Luciana
  Ex: *processo 003

*salva*  _(após *processo)_
  → Vincula os docs ao processo da sessão

*fonti salva processo [número]*
  → Fluxo rápido: vincula direto sem abrir sessão prévia
  Ex: *fonti salva processo 003

*fonti ajuda*
  → Exibe esta lista

_Disponível apenas para usuários cadastrados._`

// ── Helper: busca lead aberto para contextualizar *simula ────────────────────

interface LeadContextoSimula {
  lead_id: string
  pessoa_id: string
  nome: string
  cpf: string | null
  data_nascimento: string | null
  valor_imovel: number | null
  valor_entrada: number | null
  renda_formal: number | null
  renda_informal: number | null
}

const STATUS_FINAIS = ['aprovado', 'reprovado', 'convertido_em_processo', 'concluido', 'cancelado']

async function buscarLeadAbertoParaSimula(
  supabase: SupabaseClient,
  empresa_id: string,
  cpf: string | null,
  telefone: string | null,
): Promise<LeadContextoSimula | null> {
  const limite24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  async function leadDaPessoa(pessoa_id: string): Promise<LeadContextoSimula | null> {
    const { data } = await supabase
      .from('leads')
      .select('id, nome, valor_imovel, entrada, renda_considerada')
      .eq('empresa_id', empresa_id)
      .eq('pessoa_id', pessoa_id)
      .is('deleted_at', null)
      .not('status_analise', 'in', `(${STATUS_FINAIS.join(',')})`)
      .gte('created_at', limite24h)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!data) return null

    const { data: pessoa } = await supabase
      .from('pessoas')
      .select('cpf, data_nascimento, renda_formal, renda_informal')
      .eq('id', pessoa_id)
      .maybeSingle()

    return {
      lead_id:         data.id,
      pessoa_id,
      nome:            data.nome,
      cpf:             pessoa?.cpf ?? null,
      data_nascimento: pessoa?.data_nascimento ?? null,
      valor_imovel:    data.valor_imovel ?? null,
      valor_entrada:   data.entrada ?? null,
      renda_formal:    pessoa?.renda_formal ?? null,
      renda_informal:  pessoa?.renda_informal ?? null,
    }
  }

  // 1. CPF (maior precisão)
  if (cpf && cpf.length === 11) {
    const { data: pessoa } = await supabase
      .from('pessoas')
      .select('id')
      .eq('empresa_id', empresa_id)
      .eq('cpf', cpf)
      .maybeSingle()
    if (pessoa?.id) {
      const lead = await leadDaPessoa(pessoa.id)
      if (lead) return lead
    }
  }

  // 2. Telefone (lead direto ou lead_telefones)
  if (telefone) {
    const telDigits = telefone.replace(/\D/g, '')
    const telAlt = telDigits.startsWith('55') && telDigits.length > 11
      ? telDigits.slice(2) : `55${telDigits}`
    const variantes = telAlt === telDigits ? [telDigits] : [telDigits, telAlt]

    const { data: lead } = await supabase
      .from('leads')
      .select('id, nome, pessoa_id, valor_imovel, entrada, renda_considerada')
      .eq('empresa_id', empresa_id)
      .in('telefone', variantes)
      .is('deleted_at', null)
      .not('status_analise', 'in', `(${STATUS_FINAIS.join(',')})`)
      .gte('created_at', limite24h)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (lead?.pessoa_id) {
      const ctx = await leadDaPessoa(lead.pessoa_id)
      if (ctx) return ctx
    }

    // Busca por lead_telefones
    const { data: telRow } = await supabase
      .from('lead_telefones')
      .select('lead_id')
      .eq('empresa_id', empresa_id)
      .in('telefone', variantes)
      .limit(1)
      .maybeSingle()

    if (telRow?.lead_id) {
      const { data: leadTel } = await supabase
        .from('leads')
        .select('id, nome, pessoa_id, valor_imovel, entrada')
        .eq('id', telRow.lead_id)
        .is('deleted_at', null)
        .not('status_analise', 'in', `(${STATUS_FINAIS.join(',')})`)
        .gte('created_at', limite24h)
        .maybeSingle()

      if (leadTel?.pessoa_id) {
        return await leadDaPessoa(leadTel.pessoa_id)
      }
    }
  }

  return null
}

// ── Roteador principal ────────────────────────────────────────────────────────

export async function processarComandoFonti(
  textoCompleto: string,
  ctx: FontiContexto,
): Promise<string | null> {
  const { empresa_id, telefone_remetente, supabase, arquivos } = ctx

  // Verifica se remetente é funcionário
  // fromMe via instância registrada: usa atendente_id diretamente (sem verificar phone)
  let usuario: UsuarioInterno | null = null
  if (ctx.atendente_id_override) {
    const { data: u } = await supabase
      .from('usuarios')
      .select('id, nome')
      .eq('id', ctx.atendente_id_override)
      .eq('empresa_id', empresa_id)
      .eq('ativo', true)
      .maybeSingle()
    usuario = u ? { id: u.id, nome: u.nome } : null
  } else {
    usuario = await verificarUsuarioInterno(supabase, empresa_id, telefone_remetente)
  }

  if (!usuario) {
    console.log('[fonti] Remetente não autorizado, ignorando *fonti. telefone:', telefone_remetente)
    return null
  }

  // Remove acentos dos primeiros 20 chars (autocorrect inclui *início, *Fontí, etc.)
  // Mantém o restante intacto para preservar nomes/dados com acento nos argumentos
  const _textoNorm = textoCompleto.slice(0, 20).normalize('NFD').replace(/[̀-ͯ]/g, '')
    + textoCompleto.slice(20)

  // Normaliza atalhos curtos para o padrão *fonti [subcomando]
  let _texto = _textoNorm
  if      (/^\*in[íi]cio\b/i.test(_texto))                        _texto = '*fonti inicio'
  else if (/^\*criar?\s+cliente\b/i.test(_texto))                  _texto = _texto.replace(/^\*criar?\s+cliente\b/i, '*fonti cria cliente')
  else if (/^\*salvar?\b/i.test(_texto))                           _texto = _texto.replace(/^\*salvar?\b/i, '*fonti salva')
  else if (/^\*atualizar?\b/i.test(_texto))                        _texto = _texto.replace(/^\*atualizar?\b/i, '*fonti atualiza')
  else if (/^\*processo\b/i.test(_texto))                          _texto = _texto.replace(/^\*processo\b/i, '*fonti processo')
  else if (/^\*simula(?:r|[cç][aã]o)?\b/i.test(_texto))           _texto = _texto.replace(/^\*simula(?:r|[cç][aã]o)?\b/i, '*fonti simula')

  // Extrai o subcomando: "*fonti salva ...", "*fonti novo lead ...", "*fonti ajuda"
  const corpo = _texto.replace(/^\*fonti\s*/i, '').trim()
  const corpoBaixo = corpo.toLowerCase()

  // ── *fonti ajuda ─────────────────────────────────────────────────────────
  if (!corpo || corpoBaixo === 'ajuda' || corpoBaixo === 'help') {
    return MSG_AJUDA
  }

  // ── *fonti inicio ────────────────────────────────────────────────────────
  if (corpoBaixo === 'inicio' || corpoBaixo === 'start') {
    const telefoneConversa = ctx.telefone_cliente ?? ctx.telefone_remetente
    await supabase.from('fonti_marcas').upsert(
      { empresa_id, telefone_conversa: telefoneConversa, iniciado_at: new Date().toISOString() },
      { onConflict: 'empresa_id,telefone_conversa' },
    )
    return '✅ Pronto! Envie os documentos do cliente agora.\nQuando terminar: *cria cliente [nome] [descrição]'
  }

  // ── *fonti salva [referencia] ────────────────────────────────────────────
  if (corpoBaixo.startsWith('salva ') || corpoBaixo === 'salva') {
    const referencia = corpo.replace(/^salva\s*/i, '').trim()
    const telefoneConversaSalva = ctx.telefone_cliente ?? ctx.telefone_remetente

    // Fluxo rápido: *fonti salva processo 003
    const processoShortMatch = referencia.match(/^processo\s+(.+)$/i)
    if (processoShortMatch) {
      return await salvarParaProcesso(supabase, empresa_id, processoShortMatch[1].trim(), telefoneConversaSalva, arquivos)
    }

    // Seleção numérica de ambiguidade pendente (ex: *fonti salva 1)
    let entidadeResolvidaPorNumero: EntidadeEncontrada | null = null
    if (/^\d+$/.test(referencia)) {
      const sessao = await obterSessaoCompleta(supabase, empresa_id, telefoneConversaSalva)
      const candidatos = sessao?.candidatos_pendentes
      const idx = parseInt(referencia, 10) - 1
      if (candidatos && candidatos[idx]) {
        const escolhido = candidatos[idx]
        await supabase.from('fonti_marcas').update({ candidatos_pendentes: null })
          .eq('empresa_id', empresa_id).eq('telefone_conversa', telefoneConversaSalva)
        const { data: lead } = await supabase.from('leads').select('id')
          .eq('empresa_id', empresa_id).eq('pessoa_id', escolhido.id)
          .is('deleted_at', null).order('created_at', { ascending: false }).limit(1).maybeSingle()
        entidadeResolvidaPorNumero = {
          tipo: 'pessoa', id: escolhido.id, label: escolhido.nome, lead_id: lead?.id ?? undefined,
        }
      } else {
        return '❌ Número inválido. Tente *fonti salva [nome] novamente.'
      }
    }

    // Sem referência: verifica sessão ativa
    if (!referencia) {
      const sessao = await obterSessaoCompleta(supabase, empresa_id, telefoneConversaSalva)

      // Modo processo — sessão tem processo_id definido
      if (sessao?.processo_id) {
        return await salvarParaProcesso(
          supabase, empresa_id,
          sessao.processo_id,   // passa o ID diretamente — buscarProcessoPorNumero aceita UUID
          telefoneConversaSalva, arquivos,
          sessao.iniciado_at ? new Date(sessao.iniciado_at) : null,
        )
      }

      // Sem sessão alguma e sem telefone do cliente — orienta o operador
      if (!sessao && !ctx.telefone_cliente) {
        return 'Nenhuma sessão ativa encontrada.\nUse:\n• *fonti inicio — para vincular documentos a lead/pessoa\n• *fonti processo [número] — para vincular documentos a um processo'
      }
    }

    // Fluxo lead/pessoa: busca entidade por nome ou #proc-id
    if (!referencia && !ctx.telefone_cliente) {
      return '❌ Informe o nome do cliente.\nEx: *fonti salva João da Silva'
    }

    const entidade = entidadeResolvidaPorNumero ?? await buscarEntidade(supabase, empresa_id, referencia, ctx.telefone_cliente)
    if (!entidade) {
      return `❌ Não encontrei "${referencia}" no sistema. Verifique o nome ou referência.`
    }
    if (entidade.tipo === 'ambiguo') {
      // Atualiza só candidatos_pendentes — preserva iniciado_at do *fonti inicio caso já exista
      const { data: linhasAtualizadas } = await supabase.from('fonti_marcas')
        .update({ candidatos_pendentes: entidade.candidatos })
        .eq('empresa_id', empresa_id)
        .eq('telefone_conversa', telefoneConversaSalva)
        .select('id')
      if (!linhasAtualizadas?.length) {
        await supabase.from('fonti_marcas').insert({
          empresa_id, telefone_conversa: telefoneConversaSalva,
          iniciado_at: new Date().toISOString(),
          candidatos_pendentes: entidade.candidatos,
        })
      }
      const linhas = entidade.candidatos.map((c, i) => `${i + 1}. ${c.nome}`).join('\n')
      return `⚠️ Encontrei ${entidade.candidatos.length} clientes com "${referencia}":\n\n${linhas}\n\nResponda com o número:\n*fonti salva 1`
    }

    const marcaAtSalva = await obterMarcaInicio(supabase, empresa_id, telefoneConversaSalva)

    let vinculados = 0
    if (entidade.tipo === 'pessoa') {
      const res = await vincularDocumentosRecentesPorTelefone(
        supabase, empresa_id, telefoneConversaSalva,
        entidade.id, entidade.lead_id ?? null,
        15, marcaAtSalva ?? undefined,
      )
      vinculados = res.count
      // Vincula também docs da conversa do próprio cliente (bot, 90 dias)
      vinculados += await vincularDocumentosConversa(supabase, empresa_id, entidade.id, entidade.lead_id ?? null)
    }

    if (marcaAtSalva) await limparMarca(supabase, empresa_id, telefoneConversaSalva)

    // Salva o arquivo novo enviado junto ao comando (se houver)
    let salvos = 0
    for (const arq of arquivos) {
      const ok = await salvarArquivo(supabase, arq, empresa_id, {
        pessoa_id:   entidade.tipo === 'pessoa'   ? entidade.id : (entidade.pessoa_id ?? null),
        lead_id:     entidade.lead_id ?? null,
        processo_id: entidade.tipo === 'processo' ? entidade.id : null,
      }, telefoneConversaSalva)
      if (ok) salvos++
    }

    const total = vinculados + salvos
    if (total === 0) {
      return `⚠️ Nenhum documento encontrado para *${entidade.label}*.\nEnvie os arquivos e use *fonti inicio antes para marcar o início da sessão.`
    }

    const partes: string[] = []
    if (vinculados > 0) partes.push(`${vinculados} da conversa`)
    if (salvos > 0) partes.push(`${salvos} novo${salvos > 1 ? 's' : ''}`)
    return `✅ ${total} documento(s) vinculado(s) a *${entidade.label}* (${partes.join(' + ')})`
  }

  // ── *fonti atualiza [nome] [dados] ──────────────────────────────────────
  const PADRAO_ATUALIZA = /^(?:atualiza|update|edita)\s*/i
  if (PADRAO_ATUALIZA.test(corpo)) {
    const resto = corpo.replace(PADRAO_ATUALIZA, '').trim()

    if (!resto) {
      return '❌ Informe o nome do cliente e os dados.\nEx: *fonti atualiza Ana Maria, cpf 12345678901 nascimento 10/05/1990'
    }

    const dados = await extrairDadosLead(resto)
    const nomeRef = dados.nome ?? resto.split(/[,\n]/)[0].trim()

    if (!nomeRef) {
      return '❌ Não consegui identificar o nome. Inclua o nome do cliente no início.\nEx: *fonti atualiza Ana Maria, cpf 123...'
    }

    const entidade = await buscarEntidade(supabase, empresa_id, nomeRef, ctx.telefone_cliente)
    if (!entidade) {
      return `❌ Não encontrei "${nomeRef}" no sistema. Verifique o nome.`
    }
    if (entidade.tipo === 'ambiguo') {
      const linhas = entidade.candidatos.map((c, i) => `${i + 1}. ${c.nome}`).join('\n')
      return `⚠️ Encontrei ${entidade.candidatos.length} clientes com "${nomeRef}":\n\n${linhas}\n\nUse o nome completo para selecionar:\n*fonti atualiza Fabio Fontinhas, cpf...`
    }
    if (entidade.tipo !== 'pessoa') {
      return `❌ Não encontrei "${nomeRef}" no sistema. Verifique o nome.`
    }

    const pessoaId = entidade.id
    const leadId   = entidade.lead_id ?? null

    // Atualiza pessoa — só campos presentes no texto (nunca sobrescreve com null)
    const camposPessoa: Record<string, unknown> = {}
    if (dados.cpf)             camposPessoa.cpf             = dados.cpf
    if (dados.data_nascimento) camposPessoa.data_nascimento = dados.data_nascimento
    if (dados.estado_civil)    camposPessoa.estado_civil    = dados.estado_civil
    if (dados.renda)           camposPessoa.renda_formal    = dados.renda
    // Nome: atualiza só se veio mais completo (correção de nome)
    if (dados.nome && dados.nome.trim().length > nomeRef.length) camposPessoa.nome = dados.nome.trim()
    if (Object.keys(camposPessoa).length > 0) {
      await supabase.from('pessoas').update(camposPessoa).eq('id', pessoaId)
    }

    // Atualiza lead
    if (leadId) {
      const camposLead: Record<string, unknown> = {}
      if (dados.produto)             camposLead.produto_interesse = dados.produto
      if (dados.valor_imovel)        camposLead.valor_imovel      = dados.valor_imovel
      if (dados.valor_financiamento) camposLead.valor_pretendido  = dados.valor_financiamento
      if (dados.renda)               camposLead.renda_formal      = dados.renda
      if (dados.nome && dados.nome.trim().length > nomeRef.length) camposLead.nome = dados.nome.trim()
      if (dados.valor_entrada) {
        const { data: leadAtual } = await supabase.from('leads').select('observacoes').eq('id', leadId).single()
        const obs = [leadAtual?.observacoes, `Entrada informada: R$ ${dados.valor_entrada.toLocaleString('pt-BR')}`]
          .filter(Boolean).join('\n')
        camposLead.observacoes = obs
      }
      if (Object.keys(camposLead).length > 0) {
        await supabase.from('leads').update(camposLead).eq('id', leadId)
      }
    }

    // Vincula docs da conversa apenas se houver *fonti inicio ativo
    const telefoneConversaAtualiza = ctx.telefone_cliente ?? ctx.telefone_remetente
    const marcaAtAtualiza = await obterMarcaInicio(supabase, empresa_id, telefoneConversaAtualiza)
    let docsAtualizaCount = 0
    let docsAtualizaIds: string[] = []
    if (marcaAtAtualiza) {
      const res = await vincularDocumentosRecentesPorTelefone(
        supabase, empresa_id, telefoneConversaAtualiza, pessoaId, leadId, 15, marcaAtAtualiza,
      )
      docsAtualizaCount = res.count
      docsAtualizaIds = res.ids
      await limparMarca(supabase, empresa_id, telefoneConversaAtualiza)
    }

    // Registra telefone novo se veio no texto
    if (dados.telefone && leadId) {
      await supabase.from('lead_telefones').upsert(
        { lead_id: leadId, empresa_id, telefone: dados.telefone, principal: false },
        { onConflict: 'lead_id,telefone' },
      )
    }

    // Dispara OCR nos docs recém-vinculados (sequencial, máx 10)
    if (docsAtualizaIds.length > 0) {
      const LIMITE_OCR_AUTO = 10
      const idsParaOcr = docsAtualizaIds.slice(0, LIMITE_OCR_AUTO)
      import('@/lib/documentos/ocr').then(({ processarOcrDocumento }) => {
        ;(async () => {
          for (const id of idsParaOcr) {
            await processarOcrDocumento(supabase, id, empresa_id).catch(console.error)
          }
        })()
      }).catch(console.error)
    }

    // Monta resposta
    const camposNomes: Record<string, string> = {
      cpf: 'CPF', data_nascimento: 'nascimento', estado_civil: 'estado civil',
      renda_formal: 'renda', nome: 'nome',
    }
    const atualizados = Object.keys(camposPessoa).map((k) => camposNomes[k] ?? k).join(', ')
    const linhas = [`✅ *${entidade.label}* atualizado`]
    if (atualizados) linhas.push(atualizados)
    if (docsAtualizaCount > 0) linhas.push(`${docsAtualizaCount} doc(s) vinculado(s)`)
    if (dados.telefone) linhas.push(`Tel ${dados.telefone}`)
    return linhas.join('\n')
  }

  // ── *fonti simula / *simula / *simular / *simulação ──────────────────────
  // Se existe um Lead aberto para o telefone/CPF da conversa, aproveita o contexto
  // e aciona o Workflow de Captação com forcar_simulacao=true.
  // Caso contrário, executa o Workflow de Consulta avulso (sem criar Lead).
  const PADRAO_SIMULA = /^simula(?:r|[cç][aã]o)?\s*/i
  if (PADRAO_SIMULA.test(corpo)) {
    const instrucao = corpo.replace(PADRAO_SIMULA, '').trim()

    // *simula novo → limpa sessão pendente e reinicia
    if (/^novo$/i.test(instrucao)) {
      const { limparSimulaPendente } = await import('@/lib/workflows/simula-pendente')
      await limparSimulaPendente(supabase, empresa_id, ctx.telefone_remetente)
      return '🔄 Sessão reiniciada. Envie os dados para a nova simulação.'
    }

    // Extrai CPF do texto (regex rápida, sem chamar parser completo)
    const cpfMatch = instrucao.match(/\b(\d{3}[\.\s]?\d{3}[\.\s]?\d{3}[\-\.\s]?\d{2})\b/)
    const cpfBruto = cpfMatch ? cpfMatch[1].replace(/\D/g, '') : null

    // Regra de vinculação: busca lead SOMENTE se CPF vier explicitamente no texto.
    // Nunca usar telefone como fallback — evita vincular simulação ao cliente errado.
    const leadCtx = cpfBruto
      ? await buscarLeadAbertoParaSimula(supabase, empresa_id, cpfBruto, null)
      : null

    if (leadCtx) {
      try {
        const { executarWorkflowCaptacao } = await import('@/lib/workflows/workflow-captacao')
        return await executarWorkflowCaptacao(instrucao, {
          empresa_id,
          usuario_id:         usuario.id,
          usuario_nome:       usuario.nome,
          supabase,
          instancia_token:    ctx.instancia_token,
          telefone_destino:   ctx.telefone_destino,
          telefone_remetente: ctx.telefone_remetente,
          telefone_operador:  ctx.telefone_remetente,
          telefone_cliente:   ctx.telefone_cliente,
          arquivos:           ctx.arquivos,
          lead_id_existente:  leadCtx.lead_id,
          pessoa_id_existente: leadCtx.pessoa_id,
          forcar_simulacao:   true,
          dados_base: {
            nome:             leadCtx.nome,
            cpf:              leadCtx.cpf,
            data_nascimento:  leadCtx.data_nascimento,
            valor_imovel:     leadCtx.valor_imovel,
            valor_entrada:    leadCtx.valor_entrada,
            renda_formal:     leadCtx.renda_formal,
            renda_informal:   leadCtx.renda_informal,
          },
        })
      } catch (err) {
        console.error('[fonti] Erro inesperado no Workflow de Captação via *simula:', err)
        return '❌ Erro inesperado ao processar a simulação. Tente novamente.'
      }
    }

    // Sem CPF explícito → simulação avulsa sem vinculação a cliente existente
    try {
      const { executarWorkflowConsulta } = await import('@/lib/workflows/workflow-consulta')
      return await executarWorkflowConsulta(instrucao, {
        empresa_id,
        usuario_id:         usuario.id,
        usuario_nome:       usuario.nome,
        supabase,
        instancia_token:    ctx.instancia_token,
        telefone_destino:   ctx.telefone_destino,
        telefone_remetente: ctx.telefone_remetente,
        telefone_operador:  ctx.telefone_remetente,
        tipo_vinculo:       cpfBruto ? undefined : 'AVULSA_SEM_CPF',
      })
    } catch (err) {
      console.error('[fonti] Erro inesperado no Workflow de Consulta:', err)
      return '❌ Erro inesperado ao processar a consulta. Tente novamente.'
    }
  }

  // ── *fonti cria cliente / novo cliente / criar cliente / etc. ────────────
  // Aciona o Workflow de Captação completo: Parser → Normalizador → Validation Engine
  // → Pessoa → Lead → Documentos → Motor de Crédito → Histórico → PDF → WhatsApp
  const PADRAO_LEAD = /^(?:novo\s+lead|novo\s+cliente|criar?\s+(?:novo\s+)?(?:lead|cliente)|cria(?:\s+novo)?|lead)\s*/i
  if (PADRAO_LEAD.test(corpo)) {
    const instrucao = corpo.replace(PADRAO_LEAD, '').trim()

    if (!instrucao) {
      return '❌ Descreva o cliente.\nEx: *cria cliente João Silva, renda 5k, imóvel 300k, já simula Caixa Itaú'
    }

    try {
      const { executarWorkflowCaptacao } = await import('@/lib/workflows/workflow-captacao')
      return await executarWorkflowCaptacao(instrucao, {
        empresa_id,
        usuario_id:        usuario.id,
        usuario_nome:      usuario.nome,
        supabase,
        telefone_cliente:  ctx.telefone_cliente,
        telefone_remetente: ctx.telefone_remetente,
        instancia_token:   ctx.instancia_token,
        telefone_destino:  ctx.telefone_destino,
        arquivos:          ctx.arquivos,
      })
    } catch (err) {
      console.error('[fonti] Erro inesperado no Workflow de Captação:', err)
      return '❌ Erro inesperado ao processar o cliente. Tente novamente.'
    }
  }

  // ── *fonti processo [nome ou número] ─────────────────────────────────────
  const PADRAO_PROCESSO = /^processo\s*/i
  if (PADRAO_PROCESSO.test(corpo)) {
    const ref = corpo.replace(PADRAO_PROCESSO, '').trim()
    const telefoneConversa = ctx.telefone_cliente ?? ctx.telefone_remetente

    if (!ref) {
      return '❌ Informe o nome do cliente ou número do processo.\nEx: *fonti processo Luciana\nEx: *fonti processo 003'
    }

    // Tenta como número de processo: 003, 3, proc-003, #proc-003
    const numMatch = ref.match(/^#?(?:proc-)?0*(\d+)$/)
    if (numMatch) {
      const numeroProcesso = `#proc-${numMatch[1].padStart(3, '0')}`
      const processo = await buscarProcessoPorNumero(supabase, empresa_id, numeroProcesso)
      if (!processo) return `❌ Processo ${numeroProcesso} não encontrado ou já encerrado.`

      const comprador = await buscarCompradorPrincipalProcesso(supabase, empresa_id, processo.id)
      await gravarSessaoProcesso(supabase, empresa_id, telefoneConversa, processo.id, comprador?.pessoa_id ?? null)

      const nomeComprador = comprador?.nome ? ` · ${comprador.nome}` : ''
      return `✅ Sessão ativa para ${processo.numero_processo} — ${processo.banco || 'banco não informado'}${nomeComprador}.\n\nEnvie os documentos agora.\n\nFinalize com: *fonti salva`
    }

    // Tenta como nome de pessoa
    const { data: pessoas } = await supabase
      .from('pessoas')
      .select('id, nome')
      .eq('empresa_id', empresa_id)
      .ilike('nome', `%${ref}%`)
      .limit(3)

    if (!pessoas?.length) return `❌ Não encontrei "${ref}" no sistema. Verifique o nome.`

    const escolhida = pessoas.length === 1
      ? pessoas[0]
      : (pessoas.find((p) => p.nome.toLowerCase().startsWith(ref.toLowerCase())) ?? pessoas[0])

    const processos = await buscarProcessosAtivos(supabase, empresa_id, escolhida.id)

    if (processos.length === 0) return `❌ ${escolhida.nome} não tem processos aptos para receber documentos.`

    // 1 processo — inicia sessão automaticamente (sem alternativa, confirmar seria só atrito)
    if (processos.length === 1) {
      const p = processos[0]
      await gravarSessaoProcesso(supabase, empresa_id, telefoneConversa, p.id, escolhida.id)
      return `✅ Encontrei 1 processo apto para ${escolhida.nome}:\n${p.numero_processo} — ${p.banco || '?'} — ${fmtValorProcesso(p.valor_imovel)}\n\nSessão iniciada. Envie os documentos agora.\n\nFinalize com: *fonti salva`
    }

    // 2+ processos — decisão deve ser humana e explícita
    const lista = processos
      .map((p) => `• ${p.numero_processo} — ${p.banco || '?'} — ${fmtValorProcesso(p.valor_imovel)}`)
      .join('\n')
    return `Encontrei ${processos.length} processos aptos para ${escolhida.nome}:\n${lista}\n\nPara qual deseja enviar os documentos?\nResponda com: *fonti processo [número]`
  }

  // Subcomando não reconhecido
  return `❓ Comando não reconhecido: "${corpo}"\n\nDigite *fonti ajuda* para ver os comandos disponíveis.`
}

// ── Resolução de workflow pendente ────────────────────────────────────────────

// ── Helpers de detecção contextual ────────────────────────────────────────────

function _normalizarTexto(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')   // remove acentos
    .replace(/[^\w\s]/g, '')  // remove pontuação
    .replace(/\s+/g, ' ')
    .trim()
}

const _POSITIVOS = new Set([
  'sim', 's', 'isso', 'isto', 'isso mesmo', 'correto', 'certo', 'positivo',
  'claro', 'acertou', 'ok', 'blz', 'beleza', 'pode seguir', 'pode continuar',
  'confere', 'crto', 'coreto', 'pstivo', 'iso', 'iso mesmo', 'assertou',
])

const _NEGATIVOS = new Set([
  'nao', 'n', 'negativo', 'errado', 'corrigir', 'corrige', 'tem erro',
  'voltar', 'volta', 'nao esta certo', 'nao esta certo',
])

function _ehPositivo(texto: string): boolean {
  const n = _normalizarTexto(texto)
  return _POSITIVOS.has(n) || /👍|✅/.test(texto)
}

function _ehNegativo(texto: string): boolean {
  return _NEGATIVOS.has(_normalizarTexto(texto))
}

/**
 * Mini-detector contextual para respostas à pergunta de tipo de construção (opção 1 ou 2).
 * Respostas curtas ("1", "junto", "próprio") não são resolvidas pelo classificador LLM.
 */
function _detectarTipoEsclarecimento(texto: string): 'construcao_terreno_proprio' | 'terreno_mais_construcao' | null {
  const t = _normalizarTexto(texto)

  // ── Resposta numérica ──────────────────────────────────────────────────────
  if (/^1\b/.test(t)) return 'construcao_terreno_proprio'
  if (/^2\b/.test(t)) return 'terreno_mais_construcao'

  // ── Opção 1: já tem o terreno ──────────────────────────────────────────────
  const PROPRIO = [
    'ja tenho terreno', 'ja tenho o terreno', 'tenho terreno', 'tenho o terreno',
    'terreno proprio', 'terreno propria', 'meu terreno', 'minha data',
    'meu lote', 'tenho lote', 'tenho uma data', 'tenho gleba', 'tenho greba',
  ]
  if (PROPRIO.some((k) => t.includes(k))) return 'construcao_terreno_proprio'

  // ── Opção 2: quer comprar o terreno + construir ───────────────────────────
  const TERRENO_MAIS_OBRA = [
    'terreno mais obra', 'terreno  obra', 'tereno mai obra', 'terreno e obra',
    'compra do terreno  obra', 'comprar terreno e construir', 'financiar terreno mais obra',
    'fianciar terreno mais obra', 'fianciar terreno obra', 'financiar terreno  obra',
    'financiar a compra do terreno junto com a obra', 'quero financiar terreno e obra',
    'junto com a obra', 'compra do terreno junto com a obra',
    'compra do terreno', 'comprar o terreno',
  ]
  if (TERRENO_MAIS_OBRA.some((k) => t.includes(k))) return 'terreno_mais_construcao'

  // ── Padrões gerais ─────────────────────────────────────────────────────────
  if (/\b(compra|comprar|junto|financiar)\b/.test(t)
    || /terreno.*(obra|construc)/.test(t)
    || /lote.*(obra|construc)/.test(t)) {
    return 'terreno_mais_construcao'
  }

  if (/\b(tenho|propri|possuo)\b/.test(t)) {
    return 'construcao_terreno_proprio'
  }

  return null
}

/** Extrai um valor numérico de uma string em formato BR/informal. */
function _parseValorBR(s: string): number | null {
  const t = s.trim().replace(/[Rr]\$\s*/g, '').replace(/\./g, '')
  const kMatch = t.match(/^(\d+(?:[.,]\d+)?)\s*k$/i)
  if (kMatch) return parseFloat(kMatch[1].replace(',', '.')) * 1000
  const milMatch = t.match(/^(\d+(?:[.,]\d+)?)\s*mil\b/i)
  if (milMatch) return parseFloat(milMatch[1].replace(',', '.')) * 1000
  const numMatch = t.match(/^(\d+)$/)
  if (numMatch) {
    const n = parseInt(t)
    return n < 10000 ? n * 1000 : n  // "300" → 300.000; "300000" → 300.000
  }
  return null
}

/**
 * Extrai um ou dois valores de construção de uma mensagem livre.
 * Aceita: "300\n400", "300k 400k", "1-300\n2-400", "300 mil obra 400 mil", etc.
 */
function _extrairValoresConstricao(
  texto: string,
): { terreno: number; obra: number } | { unico: number } | null {
  const t = texto.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const linhas = t.split(/[\n\r,;]+/).map((s) => s.trim()).filter(Boolean)
  const vals: number[] = []

  for (const linha of linhas) {
    const limpa = linha
      .replace(/^[12]\s*[-:]\s*/, '')
      .replace(/(terreno|obra|valor)\s*/gi, '')
      .trim()
    const v = _parseValorBR(limpa)
    if (v !== null && v > 0) vals.push(v)
  }

  // Fallback: duas palavras na mesma linha ("300k 400k")
  if (vals.length === 0) {
    for (const tok of t.trim().split(/\s+/)) {
      const v = _parseValorBR(tok)
      if (v !== null && v > 0) vals.push(v)
    }
  }

  if (vals.length === 0) return null
  if (vals.length === 1) return { unico: vals[0] }
  return { terreno: vals[0], obra: vals[1] }
}

/** Salva confirmação de construção (terreno + obra + total). */
async function _confirmarConstricao(
  dados: Partial<import('@/lib/workflows/normalizador-captacao').DadosCaptacaoNormalizados>,
  pendente: WorkflowPendente,
  supabase: SupabaseClient,
  empresa_id: string,
  telefoneOp: string,
): Promise<string> {
  const { salvarSimulaPendente } = await import('@/lib/workflows/simula-pendente')
  const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
  const terreno = dados.valor_terreno ?? 0
  const obra = dados.valor_obra ?? 0
  const total = terreno + obra
  dados.valor_imovel = total
  await salvarSimulaPendente(supabase, empresa_id, telefoneOp, {
    ...pendente,
    motivo: 'confirmacao',
    dadosCapturados: dados,
  })
  return [
    'Só para confirmar:',
    `• Terreno: ${moeda.format(terreno)}`,
    `• Obra: ${moeda.format(obra)}`,
    `• Valor total do empreendimento: ${moeda.format(total)}`,
    '',
    'Está correto?',
  ].join('\n')
}

/**
 * Processa uma mensagem sem '*' do operador que está respondendo a uma pergunta
 * feita pelo Fonti em um *simula anterior.
 *
 * REGRA: o parser LLM analisa a mensagem INTEIRA. O motivo da pendência
 * serve apenas para decidir qual pergunta fazer — nunca limita a extração.
 */
export async function processarRespostaPendente(
  texto: string,
  pendente: WorkflowPendente,
  ctx: FontiContexto,
  usuario: { id: string; nome: string },
): Promise<string | null> {
  const { empresa_id, supabase } = ctx
  const telefoneOp = ctx.telefone_remetente

  const { mergeCapturados, salvarSimulaPendente, limparSimulaPendente, buscarSimulaPendente } = await import('@/lib/workflows/simula-pendente')

  // ── Pendência de confirmação ─────────────────────────────────────────────────
  // Fonti mostrou o resumo e perguntou "Está tudo certo?".
  // NÃO rodar o parser LLM — "sim"/"isso"/"ok" não devem ser parseados como dados.
  if (pendente.motivo === 'confirmacao') {
    if (_ehPositivo(texto)) {
      await limparSimulaPendente(supabase, empresa_id, telefoneOp)
      return await _resimular(pendente.dadosCapturados, pendente, ctx, usuario)
    }
    if (_ehNegativo(texto)) {
      // Manter pendência ativa com motivo completar — operador vai corrigir
      await salvarSimulaPendente(supabase, empresa_id, telefoneOp, {
        ...pendente,
        motivo: 'completar_dados_simulacao',
      })
      return 'Qual informação deseja corrigir? Informe os dados corretos e eu refaço a simulação.'
    }
    return 'Não entendi. Responda *sim* para simular ou *não* para corrigir os dados.'
  }

  // ── Detectar abandono ────────────────────────────────────────────────────────
  const textoLower = texto.toLowerCase().trim()
  if (/^(obrigad|valeu|depois|mais tarde|manda para|encerra|cancela|desisti|esquece)/.test(textoLower)) {
    await limparSimulaPendente(supabase, empresa_id, telefoneOp)
    return 'Tudo bem! Se precisar, é só enviar *simula novamente com os dados.'
  }

  // ── Debounce para mensagens encaminhadas simultâneas ──────────────────────────
  // Quando o operador encaminha várias mensagens de uma vez, cada uma chega como
  // um webhook separado quase ao mesmo tempo. Acumulamos os textos e só o último
  // call (last-writer-wins) efetivamente processa — os demais retornam null (silêncio).
  const agora = new Date().toISOString()
  const pendenteAtual = await buscarSimulaPendente(supabase, empresa_id, telefoneOp) ?? pendente
  const textoAcumulado = [pendenteAtual.texto_acumulado, texto].filter(Boolean).join('\n')
  await salvarSimulaPendente(supabase, empresa_id, telefoneOp, {
    ...pendenteAtual,
    texto_acumulado: textoAcumulado,
    ultima_msg_em: agora,
  })
  await new Promise((r) => setTimeout(r, 1800))
  const pendenteRelido = await buscarSimulaPendente(supabase, empresa_id, telefoneOp)
  if (!pendenteRelido) return 'Sessão expirou. Envie *simula para reiniciar.'
  if (pendenteRelido.ultima_msg_em && pendenteRelido.ultima_msg_em !== agora) return null
  // ────────────────────────────────────────────────────────────────────────────────

  const { dadosCapturados } = pendenteRelido

  // ── Reprocessamento completo ─────────────────────────────────────────────────
  // O parser analisa todo o texto acumulado — nunca limitado pelo motivo da pendência.
  const textoParaParsear = pendenteRelido.texto_acumulado ?? texto
  const { normalizarPedidoSimulacao } = await import('@/lib/workflows/normalizador-captacao')
  const novosParsed = await normalizarPedidoSimulacao(textoParaParsear)
  const novosDados = mergeCapturados(dadosCapturados, novosParsed)

  // ── Resolver tipo de construção ───────────────────────────────────────────────
  // Quando o motivo é 'esclarecer_tipo_construcao', o mini-detector SEMPRE corre
  // (independente do que o parser retornou) porque a mensagem é uma resposta à
  // pergunta "1 ou 2?" — o parser LLM não tem contexto para interpretar "2" como tipo.
  const tipoJaResolvido = novosDados.tipo_operacao && novosDados.tipo_operacao !== 'aquisicao'
  if (pendente.motivo === 'esclarecer_tipo_construcao' && !tipoJaResolvido) {
    const tipoDetectado = _detectarTipoEsclarecimento(texto)
    if (tipoDetectado) {
      novosDados.tipo_operacao = tipoDetectado
      // tipo resolvido — continua para checagem de campos faltando
    } else {
      // Genuinamente ambíguo
      await salvarSimulaPendente(supabase, empresa_id, telefoneOp, {
        ...pendente,
        dadosCapturados: novosDados,
      })
      return PERGUNTA_TIPO_CONSTRUCAO_REASK
    }
  } else if (novosParsed.pedir_esclarecimento_operacao && !tipoJaResolvido) {
    // Parser achou construção ambígua numa mensagem que não veio de esclarecimento
    await salvarSimulaPendente(supabase, empresa_id, telefoneOp, {
      ...pendente,
      motivo: 'esclarecer_tipo_construcao',
      dadosCapturados: novosDados,
    })
    return PERGUNTA_TIPO_CONSTRUCAO_REASK
  }

  // ── Verificar campos faltando (em ordem de prioridade) ─────────────────────
  const ehConstrucao = novosDados.tipo_operacao === 'construcao_terreno_proprio'
    || novosDados.tipo_operacao === 'terreno_mais_construcao'
  const faltaValoresObra = ehConstrucao
    && (novosDados.valor_terreno == null || novosDados.valor_obra == null)
  const rendaTotal = (novosDados.renda_formal ?? 0) + (novosDados.renda_informal ?? 0)
  const faltaRenda = rendaTotal === 0
  const faltaNascimento = novosDados.data_nascimento == null
  const faltaImovel = novosDados.valor_imovel == null && !ehConstrucao

  if (faltaValoresObra) {
    const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
    const faltaAmbos    = novosDados.valor_terreno == null && novosDados.valor_obra == null
    const faltaSoObra   = novosDados.valor_terreno != null && novosDados.valor_obra == null
    const faltaSoTerreno = novosDados.valor_terreno == null && novosDados.valor_obra != null

    if (faltaAmbos) {
      // Não extrair valores da mensagem que serviu para escolher o tipo ("1"/"2").
      // Quando motivo era 'esclarecer_tipo_construcao', a mensagem foi consumida pelo
      // mini-detector acima — usá-la no extrator geraria valores absurdos (R$2.000).
      const ext = pendente.motivo !== 'esclarecer_tipo_construcao'
        ? _extrairValoresConstricao(texto)
        : null
      if (ext && 'terreno' in ext) {
        novosDados.valor_terreno = ext.terreno
        novosDados.valor_obra = ext.obra
        return await _confirmarConstricao(novosDados, pendente, supabase, empresa_id, telefoneOp)
      }
      if (ext && 'unico' in ext) {
        novosDados.valor_terreno = ext.unico  // tentativo — aguarda "1" ou "2"
        await salvarSimulaPendente(supabase, empresa_id, telefoneOp, {
          ...pendente, motivo: 'completar_dados_simulacao', dadosCapturados: novosDados,
        })
        return `Esse valor de ${moeda.format(ext.unico)} se refere a:\n1 - Terreno\n2 - Obra`
      }
      await salvarSimulaPendente(supabase, empresa_id, telefoneOp, {
        ...pendente, motivo: 'completar_dados_simulacao', dadosCapturados: novosDados,
      })
      return novosDados.tipo_operacao === 'terreno_mais_construcao'
        ? 'Para simular terreno + construção, preciso de dois valores:\n1. Qual o valor de compra do terreno?\n2. Quanto estima gastar na obra?'
        : 'Para simular construção em terreno próprio, qual o valor estimado da obra?\n(Pode informar o valor do terreno também, se quiser.)'
    }

    if (faltaSoObra) {
      const valorTerreno = novosDados.valor_terreno!
      const tN = _normalizarTexto(texto)
      // Resposta "1"/"2" ao "Esse valor é Terreno ou Obra?"
      if (/^[12]$/.test(tN) || tN === 'terreno' || tN === 'obra') {
        if (tN === '2' || tN === 'obra') {
          novosDados.valor_obra = valorTerreno
          novosDados.valor_terreno = null
          await salvarSimulaPendente(supabase, empresa_id, telefoneOp, {
            ...pendente, motivo: 'completar_dados_simulacao', dadosCapturados: novosDados,
          })
          return `Obra: ${moeda.format(valorTerreno)}.\nE o valor do terreno?`
        }
        // "1"/"terreno" — confirmou terreno, pede obra
        await salvarSimulaPendente(supabase, empresa_id, telefoneOp, {
          ...pendente, motivo: 'completar_dados_simulacao', dadosCapturados: novosDados,
        })
        return `Terreno: ${moeda.format(valorTerreno)}.\nE o valor estimado da obra?`
      }
      const ext = _extrairValoresConstricao(texto)
      if (ext) {
        const obraV = 'terreno' in ext ? ext.obra : ext.unico
        novosDados.valor_obra = obraV
        return await _confirmarConstricao(novosDados, pendente, supabase, empresa_id, telefoneOp)
      }
      await salvarSimulaPendente(supabase, empresa_id, telefoneOp, {
        ...pendente, motivo: 'completar_dados_simulacao', dadosCapturados: novosDados,
      })
      return `Qual o valor estimado da obra? (Terreno: ${moeda.format(valorTerreno)})`
    }

    if (faltaSoTerreno) {
      const ext = _extrairValoresConstricao(texto)
      if (ext) {
        const terrenoV = 'terreno' in ext ? ext.terreno : ext.unico
        novosDados.valor_terreno = terrenoV
        return await _confirmarConstricao(novosDados, pendente, supabase, empresa_id, telefoneOp)
      }
      await salvarSimulaPendente(supabase, empresa_id, telefoneOp, {
        ...pendente, motivo: 'completar_dados_simulacao', dadosCapturados: novosDados,
      })
      return `Qual o valor do terreno? (Obra: ${moeda.format(novosDados.valor_obra!)})`
    }
  }

  if (faltaImovel) {
    await salvarSimulaPendente(supabase, empresa_id, telefoneOp, {
      ...pendente,
      motivo: 'completar_dados_simulacao',
      dadosCapturados: novosDados,
    })
    return 'Qual o valor do imóvel que deseja financiar?'
  }

  if (faltaNascimento) {
    await salvarSimulaPendente(supabase, empresa_id, telefoneOp, {
      ...pendente,
      motivo: 'completar_dados_simulacao',
      dadosCapturados: novosDados,
    })
    return `Para completar a simulação, preciso da data de nascimento.\nEx: "nascimento 25/01/1981"`
  }

  // Construção: terreno e obra podem ter chegado em mensagens separadas — o merge não
  // recalcula o total sozinho, então recompomos antes de checar prontidão para simular.
  if (ehConstrucao && novosDados.valor_terreno && novosDados.valor_obra) {
    novosDados.valor_imovel = novosDados.valor_terreno + novosDados.valor_obra
  }

  // ── Dados suficientes para simular → executa automaticamente ────────────────────
  // O gatilho é a disponibilidade dos dados (mesmo critério do Motor de Simulação),
  // não uma confirmação adicional do operador nem o comando que originou a pendência.
  const { validarParaSimulacao } = await import('@/lib/workflows/motor-simulacao')
  if (validarParaSimulacao(novosDados).valido) {
    await limparSimulaPendente(supabase, empresa_id, telefoneOp)
    return await _resimular(novosDados, pendente, ctx, usuario)
  }

  // Defensivo: o Motor não considerou os dados suficientes por algum campo que os
  // checks acima não cobriram — mantém a pendência para o operador complementar.
  await salvarSimulaPendente(supabase, empresa_id, telefoneOp, {
    ...pendente,
    motivo: 'completar_dados_simulacao',
    dadosCapturados: novosDados,
  })
  return 'Preciso de mais alguns dados para concluir a simulação. Pode complementar?'
}

async function _resimular(
  dados: Partial<import('@/lib/workflows/normalizador-captacao').DadosCaptacaoNormalizados>,
  pendente: WorkflowPendente,
  ctx: FontiContexto,
  usuario: { id: string; nome: string },
): Promise<string> {
  // Regra de negócio: para construção, valor_imovel sempre = terreno + obra
  const dadosFinais = { ...dados }
  const ehConstrR = dadosFinais.tipo_operacao === 'construcao_terreno_proprio'
    || dadosFinais.tipo_operacao === 'terreno_mais_construcao'
  if (ehConstrR && dadosFinais.valor_terreno && dadosFinais.valor_obra) {
    dadosFinais.valor_imovel = dadosFinais.valor_terreno + dadosFinais.valor_obra
  }

  const ctxWorkflow = {
    empresa_id:         ctx.empresa_id,
    usuario_id:         usuario.id,
    usuario_nome:       usuario.nome,
    supabase:           ctx.supabase,
    instancia_token:    ctx.instancia_token,
    telefone_destino:   ctx.telefone_destino,
    telefone_remetente: ctx.telefone_remetente,
    telefone_operador:  ctx.telefone_remetente,
    arquivos:           ctx.arquivos,
    vem_de_pendente:    true,
    forcar_simulacao:   true,
    dados_pre_normalizados: dadosFinais,
    lead_id_existente:  pendente.leadIdExistente,
    pessoa_id_existente: pendente.pessoaIdExistente,
  }
  try {
    if (pendente.usouConsulta) {
      const { executarWorkflowConsulta } = await import('@/lib/workflows/workflow-consulta')
      return await executarWorkflowConsulta('', ctxWorkflow)
    } else {
      const { executarWorkflowCaptacao } = await import('@/lib/workflows/workflow-captacao')
      return await executarWorkflowCaptacao('', ctxWorkflow)
    }
  } catch (err) {
    console.error('[fonti] Erro ao re-simular de pendente:', err)
    return '❌ Erro ao processar a simulação. Tente novamente com *simula.'
  }
}
