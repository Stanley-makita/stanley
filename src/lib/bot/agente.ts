import Anthropic from '@anthropic-ai/sdk'
import type { TransicaoEstado } from './state-machine'
import type { BotConfig } from './bot-config'
import { BOT_CONFIG_DEFAULTS } from './bot-config'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export interface MensagemHistorico {
  role: 'user' | 'assistant'
  content: string
}

export interface ResultadoAgente {
  resposta: string
}

const EXEMPLOS_FORMATO: Record<string, string> = {
  produto:         '"Financiamento Imobiliário", "CGI" ou "Consórcio"',
  nome:            '"João da Silva"',
  cpf:             '"123.456.789-00" ou somente os números',
  data_nascimento: '"15/03/1985"',
  valor:           '"R$ 300.000", "300 mil" ou "300k"',
  renda:           '"R$ 5.000", "5 mil" ou "5k"',
}

function buildFontiBasePrompt(config: BotConfig): string {
  const produtos = config.produtos_ativos.join(' / ')
  const foraHorario = config.mensagem_fora_horario
    ?? 'Atenda normalmente. Ao final informe: "Nosso time entra em contato no próximo dia útil. Se quiser, deixa sua dúvida que já anoto aqui." NÃO prometa retorno imediato.'

  return `Você é a ${config.nome_agente}, assistente virtual da Fontinhas Assessoria.

IDENTIDADE:
- Nome: ${config.nome_agente}
- Gênero: feminino
- Empresa: Fontinhas Assessoria — especializada em financiamento imobiliário, CGI, consórcio e contratos
- Tom: próximo, acolhedor, sem formalidade excessiva, sem tecniquês. Como uma atendente experiente que conhece bem o cliente e fala a língua dele.
- Evitar: termos técnicos sem explicação, respostas longas demais, emojis em excesso (máximo 1 por mensagem)

PRODUTOS DISPONÍVEIS: ${produtos}

FLUXO DE ATENDIMENTO:

1. SAUDAÇÃO
   Cumprimente de forma natural pelo horário do dia.

2. SE JÁ FOR CLIENTE COM PROCESSO ATIVO (contexto indica leads ativos):
   - Cumprimente pelo nome
   - Informe a fase atual: "Seu processo está na fase de Análise de Crédito no Bradesco"
   - Pergunte se tem dúvida sobre o processo ou quer falar com o time
   - Se quiser falar com humano: avise que vai acionar o responsável

3. SE JÁ FOR CLIENTE SEM PROCESSO ATIVO (contexto indica cliente sem leads ativos):
   - Cumprimente pelo nome, diga que é bom tê-lo de volta
   - Pergunte em que pode ajudar — apresente os produtos disponíveis
   - Se for dúvida técnica (FGTS, regras, normas): consulte a base de conhecimento antes de responder
   - Se for simulação: colete os dados e informe que um assessor entrará em contato

4. SE FOR CLIENTE NOVO (número não cadastrado):
   - Saudação simpática, apresente a Fontinhas em uma frase
   - Pergunte qual produto tem interesse: ${produtos}
   - Colete obrigatoriamente: nome completo, CPF, data de nascimento, valor pretendido, renda mensal
   - Explique que o CPF é para personalizar o atendimento e evitar cadastros duplicados
   - Confirme os dados antes de registrar
   - Informe que um assessor entrará em contato

5. FORA DO HORÁRIO COMERCIAL:
   ${foraHorario}

REGRAS GERAIS:
- Nunca invente informações sobre processos, prazos ou aprovações
- Se não souber responder: "Vou acionar o time para te dar uma resposta certinha"
- Máximo 3 mensagens sem resposta do cliente: encerre com gentileza e notifique internamente
- Nunca mencione concorrentes
- Se o cliente estiver nervoso ou reclamando: acolha, não contra-argumente, acione humano${config.mensagem_sazonal ? `\n\nATENÇÃO ESPECIAL:\n${config.mensagem_sazonal}` : ''}`
}

function buildSystemPrompt(
  transicao: TransicaoEstado,
  extraidoComSucesso: boolean,
  mensagemCliente: string,
  config: BotConfig,
  contextoCliente?: string,
): string {
  const d = transicao.novosDados

  const coletado: string[] = []
  if (d.produto)          coletado.push(`produto: ${d.produto}`)
  if (d.nome)             coletado.push(`nome: ${d.nome}`)
  if (d.cpf)              coletado.push(`CPF: ${d.cpf}`)
  if (d.data_nascimento)  coletado.push(`nascimento: ${d.data_nascimento}`)
  if (d.valor_imovel)     coletado.push(`valor: R$ ${d.valor_imovel.toLocaleString('pt-BR')}`)
  if (d.renda_mensal)     coletado.push(`renda: R$ ${d.renda_mensal.toLocaleString('pt-BR')}`)

  let instrucao: string

  if (transicao.criarLead || transicao.novoEstado === 'CONCLUIDO') {
    instrucao = `Lead registrado com sucesso. Informe ao cliente que um assessor da Fontinhas entrará em contato em breve. Telefone: (44) 3262-1685. Seja calorosa e breve.`

  } else if (transicao.novoEstado === 'CONFIRMANDO') {
    instrucao = `Apresente o resumo dos dados coletados (${coletado.join(', ')}) e pergunte se está tudo correto. Aguarde confirmação.`

  } else {
    // COLETANDO_DADOS
    const campo = d.aguardando ?? 'produto'
    const exemplo = EXEMPLOS_FORMATO[campo] ?? ''
    const jaColetadoStr = coletado.length > 0
      ? ` Dados JA COLETADOS - NAO pergunte sobre eles: ${coletado.join(', ')}.`
      : ''

    if (!extraidoComSucesso) {
      instrucao = `O cliente respondeu "${mensagemCliente}" mas o sistema nao reconheceu um valor valido para o campo "${campo}". Peca novamente de forma amigavel com exemplo de formato (ex: ${exemplo}).${jaColetadoStr} NAO questione outros campos.`
    } else {
      const perguntaMap: Record<string, string> = {
        produto:         `Pergunte qual produto o cliente tem interesse: ${config.produtos_ativos.join(', ')}.`,
        nome:            `Pergunte o nome completo do cliente.`,
        cpf:             `Explique que o CPF é para personalizar o atendimento e evitar cadastros duplicados. Peça o CPF de forma amigável. Exemplo: ${exemplo}.`,
        data_nascimento: `Peça a data de nascimento do cliente. Exemplo: ${exemplo}.`,
        valor:           `Pergunte o valor do imóvel ou crédito que está buscando. Exemplo: ${exemplo}.`,
        renda:           `Pergunte a renda mensal (pode incluir renda informal). Exemplo: ${exemplo}.`,
      }
      instrucao = `${perguntaMap[campo] ?? 'Continue a qualificação.'}${jaColetadoStr}`
    }
  }

  const contextoStr = contextoCliente
    ? `\n\n---\nCONTEXTO DO CLIENTE:\n${contextoCliente}\nSe ja constar dados deste cliente (produto, nome, renda), NAO solicite novamente.\n---`
    : ''

  return `${buildFontiBasePrompt(config)}${contextoStr}

=== CONTROLE DE ESTADO (siga a risca) ===
Estado: ${transicao.novoEstado}
Instrucao obrigatoria: ${instrucao}
REGRA ABSOLUTA: Siga somente a instrucao acima. Nao use o historico para decidir o fluxo. Nao use ferramentas.
=========================================`
}

export async function processarMensagem(
  mensagemCliente: string,
  historico: MensagemHistorico[],
  telefoneCliente: string | undefined,
  contextoCliente: string | undefined,
  transicao: TransicaoEstado,
  extraidoComSucesso: boolean,
  config: BotConfig = BOT_CONFIG_DEFAULTS,
): Promise<ResultadoAgente> {
  const messages: Anthropic.MessageParam[] = [
    ...historico.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user' as const, content: mensagemCliente },
  ]

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    system: buildSystemPrompt(transicao, extraidoComSucesso, mensagemCliente, config, contextoCliente),
    messages,
  })

  const bloco = response.content[0]
  const resposta = bloco?.type === 'text'
    ? bloco.text
    : `Olá! Como posso ajudá-lo hoje?`

  return { resposta }
}

export async function gerarSaudacaoReativacao(
  historico: MensagemHistorico[],
  nomeCliente: string,
  mensagemCliente: string,
  config: BotConfig = BOT_CONFIG_DEFAULTS,
): Promise<string> {
  const systemReativacao = `Você é a ${config.nome_agente}, assistente virtual da Fontinhas Assessoria (crédito imobiliário, consórcios e CGI em Maringá).
A atendente humana estava em conversa com ${nomeCliente}, mas agora está fora do horário de atendimento.
Você está reassumindo a conversa automaticamente.

Gere UMA mensagem de saudação que:
1. Cumprimente o cliente pelo nome
2. Explique que está fora do horário de atendimento humano
3. Diga que pode ajudar com dúvidas, status ou informações gerais
4. Seja calorosa e trate como cliente já conhecido

Responda apenas com a mensagem de saudação.`

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      system: systemReativacao,
      messages: [
        ...historico.slice(-6).map((m) => ({ role: m.role, content: m.content })),
        { role: 'user' as const, content: mensagemCliente },
      ],
    })
    const bloco = response.content[0]
    return bloco.type === 'text'
      ? bloco.text
      : `Olá, ${nomeCliente}! Estamos fora do horário de atendimento, mas posso te ajudar. Em que posso ser útil?`
  } catch {
    return `Olá, ${nomeCliente}! Estamos fora do horário de atendimento (seg-sex, 08h-18h), mas posso te ajudar por aqui. Em que posso ser útil?`
  }
}
