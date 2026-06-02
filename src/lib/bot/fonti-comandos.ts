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
  telefone_remetente: string
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

// ── Busca de entidade para *fonti salva ───────────────────────────────────────

interface EntidadeEncontrada {
  tipo: 'pessoa' | 'processo'
  id: string
  label: string
  pessoa_id?: string
}

async function buscarEntidade(
  supabase: SupabaseClient,
  empresa_id: string,
  referencia: string,
): Promise<EntidadeEncontrada | null> {
  const ref = referencia.trim()

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

  if (pessoas?.length === 1) {
    return { tipo: 'pessoa', id: pessoas[0].id, label: pessoas[0].nome }
  }
  if (pessoas && pessoas.length > 1) {
    // Retorna o mais exato (nome começa com a referência)
    const exato = pessoas.find((p) => p.nome.toLowerCase().startsWith(ref.toLowerCase()))
    const escolhido = exato ?? pessoas[0]
    return { tipo: 'pessoa', id: escolhido.id, label: escolhido.nome }
  }

  return null
}

// ── Extração de dados do lead via Claude ──────────────────────────────────────

interface DadosLead {
  nome: string | null
  produto: string | null
  valor: number | null
  renda: number | null
}

async function extrairDadosLead(instrucao: string): Promise<DadosLead> {
  // Tenta extração rápida sem chamar a API
  const produtoRapido = extrairProduto(instrucao)
  const numerosEncontrados = instrucao.match(/R?\$?\s*[\d.,]+\s*(?:mil|k|m)?/gi) ?? []

  // Usa Claude apenas se o texto for complexo o suficiente
  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      system: `Extraia dados de lead imobiliário do texto. Responda SOMENTE com JSON válido, sem markdown, sem explicação:
{"nome": "...", "produto": "Financiamento Imobiliário|CGI|Consórcio|Contrato|null", "valor": número_ou_null, "renda": número_ou_null}
Produto null se não mencionado. Valor e renda como número inteiro (sem R$). Se não mencionado, null.`,
      messages: [{ role: 'user', content: instrucao }],
    })

    const bloco = response.content[0]
    if (bloco?.type === 'text') {
      const dados = JSON.parse(bloco.text.trim()) as DadosLead
      return {
        nome:    dados.nome    ?? null,
        produto: dados.produto ?? produtoRapido,
        valor:   typeof dados.valor === 'number' ? dados.valor : null,
        renda:   typeof dados.renda === 'number' ? dados.renda : null,
      }
    }
  } catch (err) {
    console.error('[fonti] Erro ao extrair dados via Claude:', err)
  }

  // Fallback: extração manual básica
  const valor = numerosEncontrados.length > 0 ? extrairNumero(numerosEncontrados[0]!) : null
  const renda = numerosEncontrados.length > 1 ? extrairNumero(numerosEncontrados[1]!) : null
  // Nome: primeira sequência de palavras capitalizadas
  const nomeMatch = instrucao.match(/[A-ZÁÉÍÓÚÀÃÕÂÊÔÇ][a-záéíóúàãõâêôç]+(?:\s+[A-ZÁÉÍÓÚÀÃÕÂÊÔÇ][a-záéíóúàãõâêôç]+)+/)
  return {
    nome: nomeMatch?.[0] ?? null,
    produto: produtoRapido,
    valor,
    renda,
  }
}

// ── Mensagem de ajuda ─────────────────────────────────────────────────────────

const MSG_AJUDA = `*Fonti — Comandos internos*

*fonti salva [nome ou #proc-id]*
  + arquivo anexado
  → Salva documento no processo ou pessoa

*fonti novo lead [descrição livre]*
  + documentos (opcional)
  → Cria Pessoa + Lead a partir do texto

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
  const usuario = await verificarUsuarioInterno(supabase, empresa_id, telefone_remetente)
  if (!usuario) {
    console.log('[fonti] Número não é usuário interno, ignorando prefixo *fonti:', telefone_remetente)
    return null
  }

  // Extrai o subcomando: "*fonti salva ...", "*fonti novo lead ...", "*fonti ajuda"
  const corpo = textoCompleto.replace(/^\*fonti\s*/i, '').trim()
  const corpoBaixo = corpo.toLowerCase()

  // ── *fonti ajuda ─────────────────────────────────────────────────────────
  if (!corpo || corpoBaixo === 'ajuda' || corpoBaixo === 'help') {
    return MSG_AJUDA
  }

  // ── *fonti salva [referencia] ────────────────────────────────────────────
  if (corpoBaixo.startsWith('salva ') || corpoBaixo === 'salva') {
    const referencia = corpo.replace(/^salva\s*/i, '').trim()

    if (!referencia) {
      return '❌ Informe o nome do cliente ou referência do processo.\nEx: *fonti salva João da Silva'
    }

    if (arquivos.length === 0) {
      // Sem arquivo: apenas confirma que encontrou a entidade
      const entidade = await buscarEntidade(supabase, empresa_id, referencia)
      if (!entidade) {
        return `❌ Não encontrei "${referencia}" no sistema. Verifique o nome ou referência.`
      }
      return `⚠️ Nenhum arquivo anexado. Encontrei: *${entidade.label}*\nEnvie um arquivo junto com o comando para salvar.`
    }

    const entidade = await buscarEntidade(supabase, empresa_id, referencia)
    if (!entidade) {
      return `❌ Não encontrei "${referencia}" no sistema. Verifique o nome ou referência.`
    }

    let salvos = 0
    for (const arq of arquivos) {
      const ok = await salvarArquivo(supabase, arq, empresa_id, {
        pessoa_id:   entidade.tipo === 'pessoa'   ? entidade.id : (entidade.pessoa_id ?? null),
        processo_id: entidade.tipo === 'processo' ? entidade.id : null,
      })
      if (ok) salvos++
    }

    if (salvos === 0) return `❌ Falha ao salvar arquivo(s) em *${entidade.label}*. Tente novamente.`
    return `✅ ${salvos} arquivo(s) salvo(s) em *${entidade.label}*`
  }

  // ── *fonti novo lead / cria / cria novo cliente / etc. ───────────────────
  const PADRAO_LEAD = /^(?:novo\s+lead|novo\s+cliente|cria(?:\s+novo)?(?:\s+(?:lead|cliente))?|lead)\s*/i
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
      // Usa telefone do remetente como telefone do lead? Não — remetente é funcionário.
      // Usa um telefone fictício baseado no timestamp para não colidir.
      // Na prática, o lead não tem telefone válido aqui (será complementado depois).
      const telefoneTemp = `0000${Date.now().toString().slice(-9)}`

      const pessoa_id = await buscarOuCriarPessoa(empresa_id, telefoneTemp, dados.nome)

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
          observacoes: `Criado via *fonti por ${usuario.nome}`,
        })
        .select('id')
        .single()

      if (leadErr || !novoLead) {
        console.error('[fonti] Erro ao criar lead:', leadErr)
        return '❌ Erro ao criar o lead. Tente novamente.'
      }

      // Salva arquivos vinculados ao lead
      let arquivosSalvos = 0
      for (const arq of arquivos) {
        const ok = await salvarArquivo(supabase, arq, empresa_id, {
          pessoa_id,
          lead_id: novoLead.id,
        })
        if (ok) arquivosSalvos++
      }

      const produto = dados.produto ? ` — ${dados.produto}` : ''
      const extras: string[] = []
      if (dados.valor) extras.push(`R$ ${dados.valor.toLocaleString('pt-BR')}`)
      if (dados.renda) extras.push(`renda R$ ${dados.renda.toLocaleString('pt-BR')}`)
      if (arquivosSalvos > 0) extras.push(`${arquivosSalvos} doc(s)`)

      return `✅ Lead criado: *${dados.nome}*${produto}${extras.length ? `\n${extras.join(' · ')}` : ''}`
    } catch (err) {
      console.error('[fonti] Erro inesperado ao criar lead:', err)
      return '❌ Erro inesperado. Tente novamente.'
    }
  }

  // Subcomando não reconhecido
  return `❓ Comando não reconhecido: "${corpo}"\n\nDigite *fonti ajuda* para ver os comandos disponíveis.`
}
