/**
 * Parser de Captação — responsabilidade única: texto livre → JSON estruturado.
 *
 * O Parser NÃO calcula, NÃO valida e NÃO deriva campos.
 * Ele apenas interpreta a linguagem natural do comercial e extrai os valores
 * exatamente como foram informados.
 *
 * Cálculos derivados (entrada/financiado/percentual) são responsabilidade do Normalizador.
 * Validação de dados mínimos é responsabilidade do Validation Engine.
 */

import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export interface DadosCaptacaoRaw {
  nome?: string | null
  cpf?: string | null
  telefone?: string | null
  data_nascimento?: string | null       // qualquer formato que o usuário enviou
  cidade_imovel?: string | null
  tipo_imovel?: string | null           // "novo", "usado" ou o que o usuário escreveu
  valor_imovel?: number | null
  valor_entrada?: number | null
  valor_financiado?: number | null
  percentual_financiado?: number | null // ex: 80 (significa 80%), não 0.80
  renda_formal?: number | null
  renda_informal?: number | null
  bancos_raw?: string[]                 // nomes como o usuário escreveu
  solicitar_simulacao?: boolean
}

const SYSTEM_PROMPT = `Você é um parser de dados imobiliários. Sua única tarefa é extrair informações do texto e retornar um JSON estruturado.

Você NÃO calcula nada. Se o usuário informou valor do imóvel e percentual financiado, você retorna ambos sem calcular o financiado.
Você NÃO valida dados. Retorna exatamente o que foi informado.
Você NÃO toma decisões.

Retorne SOMENTE o JSON abaixo, sem markdown, sem explicação:

{
  "nome": "nome completo ou null",
  "cpf": "exatamente como escrito ou null",
  "telefone": "exatamente como escrito ou null",
  "data_nascimento": "exatamente como escrito ou null",
  "cidade_imovel": "cidade ou null",
  "tipo_imovel": "novo|usado|null",
  "valor_imovel": numero_inteiro_ou_null,
  "valor_entrada": numero_inteiro_ou_null,
  "valor_financiado": numero_inteiro_ou_null,
  "percentual_financiado": numero_inteiro_ou_null,
  "renda_formal": numero_inteiro_ou_null,
  "renda_informal": numero_inteiro_ou_null,
  "bancos_raw": ["banco1", "banco2"],
  "solicitar_simulacao": true_ou_false
}

Regras de extração:

NOME: Nome completo do cliente. null se ausente.

CPF: Retorna exatamente como escrito (com ou sem pontuação). null se ausente.

TELEFONE: Número do CLIENTE (não do comercial). Retorna como escrito. null se ausente.

DATA_NASCIMENTO: Retorna como o usuário escreveu (ex: "25/10/1978", "10-05-1990"). null se ausente.
Aliases: nascimento, nasc., DN, data nasc., data de nascimento, aniversário, idade (se informar somente a idade, retornar a idade em anos como string ex: "45 anos").

CIDADE_IMOVEL: Cidade do imóvel. null se ausente.

TIPO_IMOVEL: "novo" se imóvel novo/lançamento/planta. "usado" se imóvel usado/revendas. null se não mencionado.

VALOR_IMOVEL: Valor do imóvel. Converter para número inteiro (ex: "500 mil" → 500000, "1,2mi" → 1200000, "R$ 350.000" → 350000).
Aliases: valor do imóvel, imóvel, valor de compra e venda, valor da compra, avaliação.
null se ausente.

VALOR_ENTRADA: Valor de entrada/recursos próprios/FGTS disponível.
Aliases: entrada, recursos próprios, FGTS, dinheiro que tem, tem X de entrada.
Converter para inteiro. null se ausente.

VALOR_FINANCIADO: Valor a financiar.
Aliases: financiado, financiamento, quer financiar X, valor a financiar, financia X.
Converter para inteiro. null se ausente.

PERCENTUAL_FINANCIADO: Percentual do imóvel que será financiado.
Aliases: "financiar 80%", "80% do imóvel", "financiar X por cento".
Retornar como número inteiro (ex: 80, não 0.80). null se ausente.

RENDA_FORMAL: Renda mensal formal (CLT, pró-labore). Converter para inteiro.
Aliases: renda, renda mensal, renda formal, salário, renda bruta, renda familiar.
null se ausente.

RENDA_INFORMAL: Renda informal/complementar. Converter para inteiro.
Aliases: renda informal, renda extra, complemento de renda.
null se ausente.
Nota: se o usuário informar "renda 30000" sem especificar se é formal/informal, colocar em renda_formal.

BANCOS_RAW: Lista de bancos mencionados. Retornar os nomes como o usuário escreveu.
Exemplos: ["Caixa", "Itaú", "Bradesco"], ["BB"], ["Santander", "Inter"].
Array vazio [] se nenhum banco mencionado.

SOLICITAR_SIMULACAO: true se o texto contém pedido de simulação.
Detectar: simula, simular, simulação, simulacao, já simula, fazer simulação, fazer simulacao, rodar simulação, rodar simulacao.
Sem dependência de acentos: "simulacao" = "simulação".
false se não há pedido de simulação.`

export async function parsearTextoCaptacao(texto: string): Promise<DadosCaptacaoRaw> {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: texto }],
    })

    const bloco = response.content[0]
    if (bloco?.type !== 'text') return {}

    const jsonText = bloco.text.trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')

    const parsed = JSON.parse(jsonText) as DadosCaptacaoRaw

    return {
      nome:                   parsed.nome             ?? null,
      cpf:                    parsed.cpf              ?? null,
      telefone:               parsed.telefone         ?? null,
      data_nascimento:        parsed.data_nascimento  ?? null,
      cidade_imovel:          parsed.cidade_imovel    ?? null,
      tipo_imovel:            parsed.tipo_imovel      ?? null,
      valor_imovel:           typeof parsed.valor_imovel    === 'number' ? parsed.valor_imovel    : null,
      valor_entrada:          typeof parsed.valor_entrada   === 'number' ? parsed.valor_entrada   : null,
      valor_financiado:       typeof parsed.valor_financiado === 'number' ? parsed.valor_financiado : null,
      percentual_financiado:  typeof parsed.percentual_financiado === 'number' ? parsed.percentual_financiado : null,
      renda_formal:           typeof parsed.renda_formal   === 'number' ? parsed.renda_formal   : null,
      renda_informal:         typeof parsed.renda_informal === 'number' ? parsed.renda_informal : null,
      bancos_raw:             Array.isArray(parsed.bancos_raw) ? parsed.bancos_raw : [],
      solicitar_simulacao:    parsed.solicitar_simulacao === true,
    }
  } catch (err) {
    console.error('[parser-captacao] Erro ao parsear texto:', err)
    return {}
  }
}
