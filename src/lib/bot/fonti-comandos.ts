/**
 * Comandos internos *fonti — uso exclusivo de funcionários da Fontinhas via WhatsApp.
 * O webhook chama processarComandoFonti() antes do fluxo normal de atendimento.
 * Retorna null se o remetente não for usuário interno (fluxo normal prossegue).
 */

import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import { buscarOuCriarPessoa } from '@/lib/pessoa'
import { extrairProduto, extrairNumero } from './state-machine'

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
  return null
}

// ── Upload de arquivo para Storage e registro na tabela ───────────────────────

async function salvarArquivo(
  supabase: SupabaseClient,
  arquivo: FontiArquivo,
  empresa_id: string,
  entidade: {
    pessoa_id?: string | null
    lead_id?: string | null
    processo_id?: string | null
  },
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

    await supabase.from('documentos_clientes').insert({
      empresa_id,
      pessoa_id:   entidade.pessoa_id   ?? null,
      lead_id:     entidade.lead_id     ?? null,
      processo_id: entidade.processo_id ?? null,
      nome_original: nomeOriginal,
      mime_type:   mimeType ?? null,
      tamanho_bytes: fileBuffer.byteLength,
      storage_path:  storagePath,
      canal_origem:  'whatsapp',
    })
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
// Retorna { count, ids } para que o caller possa disparar OCR nos docs vinculados.
async function vincularDocumentosRecentesPorTelefone(
  supabase: SupabaseClient,
  empresa_id: string,
  telefoneConversa: string,
  pessoa_id: string,
  lead_id: string | null,
  janela_minutos = 15,
  marcaAt?: Date,
): Promise<{ count: number; ids: string[] }> {
  const { data: conversa } = await supabase
    .from('conversas')
    .select('id')
    .eq('empresa_id', empresa_id)
    .eq('canal', 'whatsapp')
    .eq('contato_telefone', telefoneConversa)
    .limit(1)
    .maybeSingle()

  if (!conversa?.id) return { count: 0, ids: [] }

  const limite = marcaAt ?? (() => {
    const d = new Date()
    d.setMinutes(d.getMinutes() - janela_minutos)
    return d
  })()

  const { data: docs } = await supabase
    .from('documentos_clientes')
    .select('id')
    .eq('empresa_id', empresa_id)
    .eq('conversa_id', conversa.id)
    .is('deleted_at', null)
    .is('lead_id', null)
    .gte('created_at', limite.toISOString())

  if (!docs?.length) return { count: 0, ids: [] }

  const updates: Record<string, string | null> = { pessoa_id }
  if (lead_id) updates.lead_id = lead_id

  const { error } = await supabase
    .from('documentos_clientes')
    .update(updates)
    .in('id', docs.map((d) => d.id))

  if (error) {
    console.error('[fonti] Erro ao vincular documentos:', error)
    return { count: 0, ids: [] }
  }

  return { count: docs.length, ids: docs.map((d) => d.id) }
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

// ── Busca de entidade para *fonti salva ───────────────────────────────────────

interface EntidadeEncontrada {
  tipo: 'pessoa' | 'processo'
  id: string
  label: string
  pessoa_id?: string
  lead_id?: string
}

async function buscarEntidade(
  supabase: SupabaseClient,
  empresa_id: string,
  referencia: string,
  telefoneCliente?: string,  // busca direta por phone (cenário fromMe)
): Promise<EntidadeEncontrada | null> {
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
    const escolhido = pessoas.length === 1
      ? pessoas[0]
      : (pessoas.find((p) => p.nome.toLowerCase().startsWith(ref.toLowerCase())) ?? pessoas[0])

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
  valor: number | null
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
{"nome":"...","produto":"Financiamento Imobiliário|CGI|Consórcio|Contrato|null","valor":número_ou_null,"renda":número_ou_null,"cpf":"11digitos_ou_null","data_nascimento":"YYYY-MM-DD_ou_null","estado_civil":"solteiro|casado|uniao_estavel|divorciado|viuvo|null","valor_entrada":número_ou_null,"telefone":"dígitos_com_DDD_ou_null"}
Regras:
- valor e renda: número inteiro sem R$ (ex: "750 mil" → 750000, "35 mi" → 35000, "35k" → 35000)
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
        nome:            d.nome    ?? null,
        produto:         d.produto ?? produtoRapido,
        valor:           typeof d.valor === 'number' ? d.valor : null,
        renda:           typeof d.renda === 'number' ? d.renda : null,
        cpf:             typeof d.cpf === 'string' && /^\d{11}$/.test(d.cpf) ? d.cpf : null,
        data_nascimento: typeof d.data_nascimento === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.data_nascimento) ? d.data_nascimento : null,
        estado_civil:    ESTADOS_CIVIS_VALIDOS.includes(d.estado_civil as EstadoCivil) ? d.estado_civil as EstadoCivil : null,
        valor_entrada:   typeof d.valor_entrada === 'number' ? d.valor_entrada : null,
        telefone:        typeof d.telefone === 'string' && /^\d{10,11}$/.test(d.telefone.replace(/\D/g, '')) ? d.telefone.replace(/\D/g, '') : null,
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
    valor,
    renda,
    cpf: null,
    data_nascimento: null,
    estado_civil: null,
    valor_entrada: null,
    telefone: null,
  }
}

// ── Mensagem de ajuda ─────────────────────────────────────────────────────────

const MSG_AJUDA = `*Fonti — Comandos internos*

*fonti inicio*
  → Marca o início de uma sessão de docs para o próximo cliente.
     Use antes de enviar os arquivos quando há múltiplos clientes em sequência.

*fonti criar lead [descrição livre]*
  + documentos enviados após *fonti inicio (ou últimos 15 min)
  → Cria Pessoa + Lead e vincula os documentos

*fonti atualiza [nome] [dados]*
  → Atualiza CPF, nascimento, renda, estado civil, telefone de um lead existente
     Também vincula docs recentes da conversa

*fonti salva [nome ou #proc-id]*
  + arquivo anexado
  → Salva documento no processo ou pessoa

*fonti ajuda*
  → Exibe esta lista

_Disponível apenas para usuários cadastrados._`

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

  // Extrai o subcomando: "*fonti salva ...", "*fonti novo lead ...", "*fonti ajuda"
  const corpo = textoCompleto.replace(/^\*fonti\s*/i, '').trim()
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
    return '✅ Pronto! Envie os documentos do cliente agora.\nQuando terminar: *fonti criar lead [nome] [descrição]'
  }

  // ── *fonti salva [referencia] ────────────────────────────────────────────
  if (corpoBaixo.startsWith('salva ') || corpoBaixo === 'salva') {
    const referencia = corpo.replace(/^salva\s*/i, '').trim()

    // Sem referência: usa o telefone do cliente da conversa (cenário fromMe)
    if (!referencia && !ctx.telefone_cliente) {
      return '❌ Informe o nome do cliente.\nEx: *fonti salva João da Silva'
    }

    const entidade = await buscarEntidade(supabase, empresa_id, referencia, ctx.telefone_cliente)
    if (!entidade) {
      return `❌ Não encontrei "${referencia}" no sistema. Verifique o nome ou referência.`
    }

    // Vincula docs da conversa atual (usando marca de sessão se existir)
    const telefoneConversaSalva = ctx.telefone_cliente ?? ctx.telefone_remetente
    const marcaAtSalva = await obterMarcaInicio(supabase, empresa_id, telefoneConversaSalva)

    let vinculados = 0
    let docsVinculadosIds: string[] = []
    if (entidade.tipo === 'pessoa') {
      const res = await vincularDocumentosRecentesPorTelefone(
        supabase, empresa_id, telefoneConversaSalva,
        entidade.id, entidade.lead_id ?? null,
        15, marcaAtSalva ?? undefined,
      )
      vinculados = res.count
      docsVinculadosIds = res.ids
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
      })
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
    if (!entidade || entidade.tipo !== 'pessoa') {
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
      if (dados.produto) camposLead.produto_interesse = dados.produto
      if (dados.valor)   camposLead.valor_pretendido  = dados.valor
      if (dados.renda)   camposLead.renda_formal      = dados.renda
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

    // Vincula docs recentes da conversa (usa marca de sessão se existir)
    const telefoneConversaAtualiza = ctx.telefone_cliente ?? ctx.telefone_remetente
    const marcaAtAtualiza = await obterMarcaInicio(supabase, empresa_id, telefoneConversaAtualiza)
    const { count: docsAtualizaCount, ids: docsAtualizaIds } = await vincularDocumentosRecentesPorTelefone(
      supabase, empresa_id, telefoneConversaAtualiza, pessoaId, leadId, 15, marcaAtAtualiza ?? undefined,
    )
    if (marcaAtAtualiza) await limparMarca(supabase, empresa_id, telefoneConversaAtualiza)

    // Registra telefone novo se veio no texto
    if (dados.telefone && leadId) {
      await supabase.from('lead_telefones').upsert(
        { lead_id: leadId, empresa_id, telefone: dados.telefone, principal: false },
        { onConflict: 'lead_id,telefone' },
      )
    }

    // Dispara OCR nos docs recém-vinculados
    if (docsAtualizaIds.length > 0) {
      import('@/lib/documentos/ocr').then(({ processarOcrDocumento }) => {
        for (const id of docsAtualizaIds) {
          processarOcrDocumento(supabase, id, empresa_id).catch(console.error)
        }
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

  // ── *fonti novo lead / cria / cria novo cliente / etc. ───────────────────
  const PADRAO_LEAD = /^(?:novo\s+lead|novo\s+cliente|criar?\s+(?:novo\s+)?(?:lead|cliente)|cria(?:\s+novo)?|lead)\s*/i
  if (PADRAO_LEAD.test(corpo)) {
    const instrucao = corpo.replace(PADRAO_LEAD, '').trim()

    if (!instrucao) {
      return '❌ Descreva o lead.\nEx: *fonti novo lead João Silva, financiamento, renda 5k, valor 300k'
    }

    const dados = await extrairDadosLead(instrucao)

    if (!dados.nome) {
      return `❌ Não consegui identificar o nome do cliente no texto:\n"${instrucao}"\n\nTente incluir o nome completo.`
    }

    // Cria Pessoa + Lead
    try {
      const telefoneTemp = dados.telefone ?? `0000${Date.now().toString().slice(-9)}`

      const pessoa_id = await buscarOuCriarPessoa(empresa_id, telefoneTemp, dados.nome)

      // Atualiza pessoa com campos extras extraídos do texto
      const camposPessoa: Record<string, unknown> = {}
      if (dados.cpf)             camposPessoa.cpf             = dados.cpf
      if (dados.data_nascimento) camposPessoa.data_nascimento = dados.data_nascimento
      if (dados.estado_civil)    camposPessoa.estado_civil    = dados.estado_civil
      if (dados.renda)           camposPessoa.renda_formal    = dados.renda
      if (Object.keys(camposPessoa).length > 0) {
        await supabase.from('pessoas').update(camposPessoa).eq('id', pessoa_id)
      }

      // Busca primeira fase
      const { data: primeiraFase } = await supabase
        .from('fases')
        .select('id')
        .eq('empresa_id', empresa_id)
        .eq('ativo', true)
        .order('ordem', { ascending: true })
        .limit(1)
        .maybeSingle()

      if (!primeiraFase) {
        return '❌ Empresa sem fases configuradas. Configure as fases em Configurações.'
      }

      const { data: novoLead, error: leadErr } = await supabase
        .from('leads')
        .insert({
          empresa_id,
          nome:             dados.nome,
          telefone:         telefoneTemp,
          fase_id:          primeiraFase.id,
          origem:           'whatsapp',
          ordem_kanban:     0,
          produto_interesse: dados.produto ?? null,
          valor_pretendido:  dados.valor   ?? null,
          renda_formal:      dados.renda   ?? null,
          pessoa_id,
          observacoes: [
            `Criado via *fonti por ${usuario.nome}`,
            dados.valor_entrada ? `Entrada informada: R$ ${dados.valor_entrada.toLocaleString('pt-BR')}` : null,
          ].filter(Boolean).join('\n'),
        })
        .select('id')
        .single()

      if (leadErr || !novoLead) {
        console.error('[fonti] Erro ao criar lead:', leadErr)
        return '❌ Erro ao criar o lead. Tente novamente.'
      }

      // Registra telefone real em lead_telefones (se não for o temp)
      if (dados.telefone) {
        await supabase.from('lead_telefones').upsert(
          { lead_id: novoLead.id, empresa_id, telefone: dados.telefone, principal: true },
          { onConflict: 'lead_id,telefone' },
        )
      }

      // Salva arquivo enviado junto ao próprio comando *fonti
      let arquivosSalvos = 0
      for (const arq of arquivos) {
        const ok = await salvarArquivo(supabase, arq, empresa_id, {
          pessoa_id,
          lead_id: novoLead.id,
        })
        if (ok) arquivosSalvos++
      }

      // Vincula docs da conversa: usa marca de sessão (*fonti inicio) se existir, senão janela de 15 min.
      const telefoneConversa = ctx.telefone_cliente ?? ctx.telefone_remetente
      const marcaAt = await obterMarcaInicio(supabase, empresa_id, telefoneConversa)
      const { count: docsConversa, ids: docsIds } = await vincularDocumentosRecentesPorTelefone(
        supabase, empresa_id, telefoneConversa, pessoa_id, novoLead.id,
        15, marcaAt ?? undefined,
      )
      if (marcaAt) await limparMarca(supabase, empresa_id, telefoneConversa)

      // Dispara OCR nos docs recém-vinculados (async, não bloqueia a resposta)
      if (docsIds.length > 0) {
        import('@/lib/documentos/ocr').then(({ processarOcrDocumento }) => {
          for (const id of docsIds) {
            processarOcrDocumento(supabase, id, empresa_id).catch(console.error)
          }
        }).catch(console.error)
      }

      const produto = dados.produto ? ` — ${dados.produto}` : ''
      const linha1: string[] = []
      if (dados.valor) linha1.push(`R$ ${dados.valor.toLocaleString('pt-BR')}`)
      if (dados.renda) linha1.push(`renda R$ ${dados.renda.toLocaleString('pt-BR')}`)
      if (dados.valor_entrada) linha1.push(`entrada R$ ${dados.valor_entrada.toLocaleString('pt-BR')}`)
      const totalDocs = arquivosSalvos + docsConversa
      if (totalDocs > 0) linha1.push(`${totalDocs} doc(s)`)

      const linha2: string[] = []
      if (dados.cpf) linha2.push('CPF ✓')
      if (dados.data_nascimento) {
        const [y, m, d] = dados.data_nascimento.split('-')
        linha2.push(`Nasc. ${d}/${m}/${y}`)
      }
      if (dados.estado_civil) {
        const labels: Record<string, string> = { solteiro: 'Solteiro', casado: 'Casado', uniao_estavel: 'União estável', divorciado: 'Divorciado', viuvo: 'Viúvo' }
        linha2.push(labels[dados.estado_civil] ?? dados.estado_civil)
      }
      if (dados.telefone) linha2.push(`Tel ${dados.telefone}`)

      const linhas = [`✅ Lead criado: *${dados.nome}*${produto}`]
      if (linha1.length) linhas.push(linha1.join(' · '))
      if (linha2.length) linhas.push(linha2.join(' · '))

      return linhas.join('\n')
    } catch (err) {
      console.error('[fonti] Erro inesperado ao criar lead:', err)
      return '❌ Erro inesperado. Tente novamente.'
    }
  }

  // Subcomando não reconhecido
  return `❓ Comando não reconhecido: "${corpo}"\n\nDigite *fonti ajuda* para ver os comandos disponíveis.`
}
