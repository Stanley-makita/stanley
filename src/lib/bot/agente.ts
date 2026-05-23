import Anthropic from '@anthropic-ai/sdk'
import type { TransicaoEstado } from './state-machine'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export interface MensagemHistorico {
  role: 'user' | 'assistant'
  content: string
}

export interface ResultadoAgente {
  resposta: string
}

const SYSTEM_PROMPT_BASE = `Você é o assistente virtual da Fontinhas Assessoria, especializada em crédito imobiliário, consórcios e crédito com garantia de imóvel (CGI) em Maringá e região.

Seu objetivo é qualificar clientes de forma natural e amigável.

PRODUTOS:
- Financiamento Imobiliário: cliente quer COMPRAR um imóvel que ainda não possui.
- CGI (Crédito com Garantia de Imóvel): cliente JA POSSUI imóvel e quer usá-lo como garantia para obter crédito.
- Consórcio: investimento parcelado para adquirir imóvel no futuro, sem juros.
- Contrato: elaboração de contrato jurídico imobiliário.

Diretrizes gerais:
- Português brasileiro, tom simpático e objetivo
- Não invente taxas ou condições — diga que um assessor entrará em contato
- Máximo 2 perguntas por mensagem`

const EXEMPLOS_FORMATO: Record<string, string> = {
  produto: '"financiamento", "consorcio" ou "CGI"',
  nome:    '"João da Silva"',
  valor:   '"R$ 300.000", "300 mil" ou "300k"',
  renda:   '"R$ 5.000", "5 mil" ou "5k"',
}

function buildSystemPrompt(
  transicao: TransicaoEstado,
  extraidoComSucesso: boolean,
  mensagemCliente: string,
  contextoCliente?: string,
): string {
  const d = transicao.novosDados

  const coletado: string[] = []
  if (d.produto)      coletado.push(`produto: ${d.produto}`)
  if (d.nome)         coletado.push(`nome: ${d.nome}`)
  if (d.valor_imovel) coletado.push(`valor: R$ ${d.valor_imovel.toLocaleString('pt-BR')}`)
  if (d.renda_mensal) coletado.push(`renda: R$ ${d.renda_mensal.toLocaleString('pt-BR')}`)

  let instrucao: string

  if (transicao.criarLead || transicao.novoEstado === 'CONCLUIDO') {
    instrucao = `Lead registrado com sucesso. Informe ao cliente que um assessor da Fontinhas entrará em contato em breve. Telefone: (44) 3262-1685. Seja caloroso e breve.`

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
      instrucao = `O cliente respondeu "${mensagemCliente}" mas o sistema nao reconheceu um valor valido para o campo "${campo}". Peca novamente de forma amigavel com exemplo de formato (ex: ${exemplo}).${jaColetadoStr} NAO questione outros campos. NAO interprete a resposta como sendo outro campo.`
    } else {
      const perguntaMap: Record<string, string> = {
        produto: `Pergunte qual produto o cliente tem interesse: financiamento imobiliário (compra de imóvel), consórcio ou CGI (crédito com garantia de imóvel próprio).`,
        nome:    `Pergunte o nome completo do cliente.`,
        valor:   `Pergunte o valor do imóvel ou crédito que está buscando. Exemplo: ${exemplo}.`,
        renda:   `Pergunte a renda mensal (pode incluir renda informal). Exemplo: ${exemplo}.`,
      }
      instrucao = `${perguntaMap[campo] ?? 'Continue a qualificação.'}${jaColetadoStr}`
    }
  }

  const contextoStr = contextoCliente
    ? `\n\n---\nCONTEXTO DO CLIENTE:\n${contextoCliente}\nSe ja constar dados deste cliente (produto, nome, renda), NAO solicite novamente.\n---`
    : ''

  return `${SYSTEM_PROMPT_BASE}${contextoStr}

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
): Promise<ResultadoAgente> {
  const messages: Anthropic.MessageParam[] = [
    ...historico.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user' as const, content: mensagemCliente },
  ]

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    system: buildSystemPrompt(transicao, extraidoComSucesso, mensagemCliente, contextoCliente),
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
): Promise<string> {
  const systemReativacao = `Você é o assistente virtual da Fontinhas Assessoria (crédito imobiliário, consórcios e CGI em Maringá).
O atendente humano estava em conversa com ${nomeCliente}, mas agora está fora do horário de atendimento (segunda a sexta, 08h às 18h).
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
