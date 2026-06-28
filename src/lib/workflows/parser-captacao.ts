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
  // Campos adicionais usados pelo Workflow de Consulta Comercial (*simula)
  prazo_meses?: number | null           // prazo único em meses; null se múltiplos ou prazo_maximo=true
  produto?: string | null               // "SBPE", "MCMV", "Pró Cotista", "Poupança", "IPCA"
  fgts_valor?: number | null            // "FGTS 50 mil" → 50000
  relacionamento_bancario?: string | null  // "Uniclass", "Personnalité", "Van Gogh", "Select"
  tipo_amortizacao_raw?: string | null  // "SAC", "PRICE" — normalizado depois
  todos_bancos?: boolean                // true se usuário disse "todos os bancos" ou "todos"
  modo_calculo?: 'VALOR_MAXIMO_PELA_RENDA' | null // "valor máximo", "quanto aprova", etc.
  prazo_maximo?: boolean                // true se "prazo máximo" foi solicitado
  prazos_detectados?: number[] | null   // TODOS os prazos numéricos encontrados (em meses)
  percentual_entrada?: number | null    // ex: "entrada 20%" → 20 (complementa percentual_financiado)
  // Campos para operações de construção / terreno
  valor_terreno?: number | null         // "tenho um terreno de 300000" → 300000
  valor_obra?: number | null            // "obra 600000", "orçamento da obra 600k" → 600000
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
  "solicitar_simulacao": true_ou_false,
  "prazo_meses": numero_inteiro_ou_null,
  "produto": "SBPE|MCMV|Pró Cotista|Poupança|IPCA|null",
  "fgts_valor": numero_inteiro_ou_null,
  "relacionamento_bancario": "Uniclass|Personnalité|...|null",
  "tipo_amortizacao_raw": "SAC|PRICE|null",
  "todos_bancos": true_ou_false,
  "modo_calculo": "VALOR_MAXIMO_PELA_RENDA|null",
  "prazo_maximo": true_ou_false,
  "prazos_detectados": [array_de_prazos_em_meses_ou_null],
  "percentual_entrada": numero_inteiro_ou_null,
  "valor_terreno": numero_inteiro_ou_null,
  "valor_obra": numero_inteiro_ou_null
}

Regras de extração:

NOME: Nome completo do cliente. null se ausente.

CPF: Retorna exatamente como escrito (com ou sem pontuação). null se ausente.

TELEFONE: Número do CLIENTE (não do comercial). Retorna como escrito. null se ausente.

DATA_NASCIMENTO: Retorna exatamente como o usuário escreveu. null se ausente.
Aliases: nascimento, nasc, nasc., nasc:, DN, data nasc., data de nascimento, aniversário, idade.
Formatos aceitos: DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY, DD/MM/YY, DD-MM-YY, DD.MM.YY.
Exemplos: "nasc 21.01.93", "21/01/93", "21.01.1993", "21-01-93".
REGRA DATA SOLTA: se houver uma data no formato DD/MM/YY, DD/MM/YYYY, DD.MM.YY ou DD.MM.YYYY
  sem label explícito e nenhum outro dado naquela linha indicar outro tipo de informação,
  interpretar como data de nascimento.
  Exemplos de data solta: "21/01/93", "21.01.1993" numa linha sozinha → data_nascimento.
Se informar apenas idade (ex: "32 anos"), retornar como string "32 anos".

CIDADE_IMOVEL: Cidade do imóvel. null se ausente.

TIPO_IMOVEL: "novo" se imóvel novo/lançamento/planta. "usado" se imóvel usado/revendas. null se não mencionado.

VALOR_IMOVEL: Valor do imóvel. Converter para número inteiro (ex: "500 mil" → 500000, "1,2mi" → 1200000, "R$ 350.000" → 350000).
Aliases: valor do imóvel, imóvel X, imovel X, valor de compra e venda, valor da compra, avaliação, preço X, valor venda X, VGV, valor do bem.
REGRA VALOR SOLTO: se houver um único valor com "mil", "k" ou "m" (ex: "400 mil", "350k", "1,2m")
  sem label de entrada/renda/financiamento próximo, interpretar como valor_imovel.
  Exemplos: "400 mil" numa linha sozinha, "400mil", "400k" → valor_imovel = 400000.
null se ausente.

VALOR_ENTRADA: Valor de entrada/recursos próprios do cliente.
Aliases: entrada, sinal, recursos próprios, dinheiro que tem, tem X de entrada, tem X disponível, cliente tem X, dispõe de X, disponível X.
Converter para inteiro. null se ausente.
Nota: FGTS pode ser entrada — usar apenas se vier explicitamente como valor disponível (ex: "FGTS 50 mil" como sinal).

VALOR_FINANCIADO: Valor a financiar.
Aliases: financiado, financiamento, quer financiar X, valor a financiar, financia X, precisa financiar X, saldo a financiar X, valor do crédito X, crédito X.
Converter para inteiro. null se ausente.

PERCENTUAL_FINANCIADO: Percentual do imóvel que será financiado.
Aliases: "financiar 80%", "80% do imóvel", "financiar X por cento".
Percentual solto sem contexto de entrada (ex: só "80%") → interpretar como percentual financiado.
Retornar como número inteiro (ex: 80, não 0.80). null se ausente.

PERCENTUAL_ENTRADA: Percentual de entrada (down payment).
Aliases: "entrada 20%", "20% de entrada", "entrada de X%", "dar X% de entrada".
Retornar como número inteiro (ex: 20, não 0.20). null se ausente.
Nota: não preencher se o percentual já foi capturado em percentual_financiado.

RENDA_FORMAL: Renda mensal formal (CLT, pró-labore, aposentadoria). Converter para inteiro.
Aliases: renda, renda mensal, renda formal, salário, renda bruta, renda familiar, renda casal, renda do casal, renda total.
null se ausente. Se vier "renda X" genérico, colocar em renda_formal.

RENDA_INFORMAL: Renda informal/complementar mensal. Converter para inteiro.
Aliases: renda informal, renda extra, complemento de renda, renda variável, renda autônomo.
null se ausente.

BANCOS_RAW: Lista de bancos mencionados. Retornar os nomes como o usuário escreveu.
Exemplos: ["Caixa", "Itaú", "Bradesco"], ["BB"], ["Santander", "Inter"].
Array vazio [] se nenhum banco mencionado.

SOLICITAR_SIMULACAO: true se o texto contém pedido de simulação.
Detectar qualquer uma destas variações (com ou sem acento):
  simula, simular, simulação, simulacao,
  já simula, ja simula, simula já, simula ja,
  fazer simulação, fazer simulacao, faz simulação, faz simulacao,
  rodar simulação, rodar simulacao,
  quero simulação, quero simulacao,
  manda simulação, manda simulacao, manda simula,
  faz a simulação, faz a simulacao,
  pode simular, pode simula.
Sem dependência de acentos: "simulacao" = "simulação", "ja" = "já".
false se não há pedido de simulação.

PRAZO_MESES: Prazo ÚNICO em meses. Retornar apenas se EXATAMENTE UM prazo numérico foi mencionado E prazo_maximo=false.
Converter: "240 meses" → 240, "30 anos" → 360, "35 anos" → 420.
null se: nenhum prazo, prazo_maximo=true, ou múltiplos prazos detectados.

PRAZO_MAXIMO: true se o texto mencionar "prazo máximo", "prazo maximo", "prazo max"
(pode vir seguido de nome de banco: "prazo máximo caixa" → true, bancos_raw=["Caixa"]).
false por padrão.

PRAZOS_DETECTADOS: Array com TODOS os prazos numéricos encontrados no texto, convertidos para meses.
Exemplos: "120 240 360 meses" → [120, 240, 360]; "30 anos" → [360]; "120 e prazo máximo" → [120].
"prazo máximo" sozinho NÃO adiciona valor ao array (vai para prazo_maximo=true).
null (não array vazio) se nenhum prazo numérico for encontrado.
Atenção: se prazo_maximo=true E houver prazos numéricos, preencher AMBOS: prazo_maximo=true E prazos_detectados=[...].

MODO_CALCULO: "VALOR_MAXIMO_PELA_RENDA" se o texto pede cálculo do maior valor que a renda suporta financiar.
Detectar (com ou sem acento): "valor máximo", "valor maximo", "máximo financiamento", "maximo financiamento",
"quanto aprova", "quanto essa renda comporta", "capacidade máxima", "capacidade maxima",
"qual o máximo", "qual o valor máximo", "valor max", "quanto dá pra financiar", "quanto financia de máximo".
null se não mencionado.

PRODUTO: Produto/modalidade mencionado pelo usuário. Retornar exatamente como escrito ou null.
Detectar modalidades de aquisição: "SBPE", "MCMV", "Pró Cotista", "Pro Cotista", "Poupança", "IPCA",
  "financiamento", "aquisição", "aquisicao", "imóvel" (como produto).
Detectar produtos bloqueados (retornar o nome como veio): "CGI", "home equity", "Home Equity",
  "Construção", "construcao", "Consórcio", "consorcio", "Portabilidade".
null se não mencionado.

FGTS_VALOR: Valor do FGTS que o cliente tem disponível. Converter para inteiro.
Aliases: "FGTS 50 mil", "tem FGTS de 100k", "usará FGTS de 80000".
null se não informado o valor (mas pode haver menção genérica a FGTS sem valor).

RELACIONAMENTO_BANCARIO: Tipo de relacionamento bancário informado. Retornar como escrito.
Detectar: "Uniclass", "Personnalité", "Personalite", "Van Gogh", "Select", "Exclusive", "Relacionamento", "correntista".
null se não mencionado.

TIPO_AMORTIZACAO_RAW: Sistema de amortização mencionado. Retornar como escrito ou null.
Detectar PRICE (qualquer variação): "price", "PRICE", "Price", "tabela price", "tabela PRICE",
  "sistema price", "amortização price", "amortizacao price", "modalidade price".
Detectar SAC (qualquer variação): "sac", "SAC", "tabela sac", "tabela SAC", "sistema sac",
  "amortização sac", "amortizacao sac", "modalidade sac".
null se não mencionado.

TODOS_BANCOS: true se o usuário disser explicitamente "todos os bancos", "todos", "qualquer banco".
false se mencionar bancos específicos ou não mencionar bancos. false por padrão.

VALOR_TERRENO: Valor do terreno/lote em operações de construção.
Aliases: "terreno de X", "lote de X", "data de X", "gleba de X", "meu terreno vale X", "terreno avaliado em X".
Converter para inteiro. null se ausente.
Exemplos: "tenho um terreno de 300000" → 300000; "meu lote vale 200 mil" → 200000.
IMPORTANTE: em "tenho um terreno de 300000 e quero construir", o 300000 é valor_terreno, NÃO valor_imovel.

VALOR_OBRA: Orçamento estimado da obra/construção.
Aliases: "obra X", "obra de X", "orçamento X", "orçamento da obra X", "custo da obra X", "construção X", "construir X".
Converter para inteiro. null se ausente.
Exemplos: "obra 600000" → 600000; "orçamento da construção 400 mil" → 400000.
REGRA: quando valor_terreno e valor_obra forem extraídos, NÃO preencher valor_imovel com a soma — deixar null.

REGRAS DE CONSISTÊNCIA PRAZO:
- "prazo 360" → prazo_meses=360, prazos_detectados=[360], prazo_maximo=false
- "prazo máximo" → prazo_meses=null, prazos_detectados=null, prazo_maximo=true
- "prazo máximo caixa" → prazo_meses=null, prazos_detectados=null, prazo_maximo=true, bancos_raw=["Caixa"]
- "120 240 360 meses" → prazo_meses=null, prazos_detectados=[120,240,360], prazo_maximo=false
- "120 240 360 meses e prazo máximo" → prazo_meses=null, prazos_detectados=[120,240,360], prazo_maximo=true`

export async function parsearTextoCaptacao(texto: string): Promise<DadosCaptacaoRaw> {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
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
      prazo_meses:            typeof parsed.prazo_meses === 'number' ? parsed.prazo_meses : null,
      produto:                parsed.produto             ?? null,
      fgts_valor:             typeof parsed.fgts_valor === 'number' ? parsed.fgts_valor : null,
      relacionamento_bancario: parsed.relacionamento_bancario ?? null,
      tipo_amortizacao_raw:   parsed.tipo_amortizacao_raw ?? null,
      todos_bancos:           parsed.todos_bancos === true,
      modo_calculo:           parsed.modo_calculo === 'VALOR_MAXIMO_PELA_RENDA' ? 'VALOR_MAXIMO_PELA_RENDA' : null,
      prazo_maximo:           parsed.prazo_maximo === true,
      prazos_detectados:      Array.isArray(parsed.prazos_detectados) && parsed.prazos_detectados.length > 0
                                ? parsed.prazos_detectados.filter((p): p is number => typeof p === 'number')
                                : null,
      percentual_entrada:     typeof parsed.percentual_entrada === 'number' ? parsed.percentual_entrada : null,
      valor_terreno:          typeof parsed.valor_terreno === 'number' ? parsed.valor_terreno : null,
      valor_obra:             typeof parsed.valor_obra    === 'number' ? parsed.valor_obra    : null,
    }
  } catch (err) {
    console.error('[parser-captacao] Erro ao parsear texto:', err)
    return {}
  }
}
