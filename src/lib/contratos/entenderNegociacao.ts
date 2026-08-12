/**
 * Etapa "Compreensão da Negociação" do Construtor de Contratos.
 *
 * Consolida tipo de contrato + descrição livre + dados já extraídos por OCR
 * dos documentos anexados (ver src/lib/documentos/ocr.ts) num resumo
 * estruturado, junto com um checklist ("Painel de Inteligência") do que foi
 * entendido vs o que falta. NUNCA decide sozinho — o usuário sempre revisa e
 * confirma este resumo antes de qualquer minuta ser construída (mesma
 * filosofia de useOcrSugestoes: IA propõe, operador confirma).
 */

import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export interface DocumentoOcrResumo {
  nome_arquivo: string
  tipo_documento: string | null
  /** Pasta em que o documento foi anexado no Construtor de Contratos
   * (comprador/vendedor/imovel/terceiros/certidoes) — é o sinal
   * estrutural de A QUEM o documento pertence; ver instrução no
   * SYSTEM_PROMPT sobre nunca inferir isso pelo conteúdo. */
  pasta: string | null
  dados: Record<string, unknown> | null
}

export interface PessoaResumo {
  nome: string | null
  cpf: string | null
  rg: string | null
  orgao_emissor_rg: string | null
  cnh: string | null
  estado_civil: string | null
  regime_casamento: string | null
  profissao: string | null
  nacionalidade: string | null
  data_nascimento: string | null
  endereco: string | null
}

export interface ImovelResumo {
  descricao: string | null
  endereco: string | null
  matricula: string | null
  cartorio: string | null
  area: string | null
  cadastro_prefeitura: string | null
  cidade: string | null
  uf: string | null
}

export interface ChecklistItem {
  texto: string
  status: 'ok' | 'atencao'
}

export interface TestemunhaResumo {
  nome: string | null
  cpf: string | null
  rg: string | null
  profissao: string | null
  endereco: string | null
  email: string | null
}

export interface CorretorResumo {
  nome: string | null
  cpf: string | null
  creci: string | null
  email: string | null
  telefone: string | null
}

export interface ComissaoResumo {
  valor: number | null
  percentual: number | null
  /** "comprador" ou "vendedor" — de quem é a responsabilidade de pagar. */
  responsavel: 'comprador' | 'vendedor' | null
  /** Frase pronta pra encaixar depois de "devida" (ex: "na assinatura do
   * contrato de financiamento") — não uma data isolada. */
  momento_pagamento: string | null
}

export interface CertidaoResumo {
  tipo: string | null
  numero: string | null
  orgao_emissor: string | null
  data_emissao: string | null
  validade: string | null
}

export interface ResumoNegociacao {
  compradores: PessoaResumo[]
  vendedores: PessoaResumo[]
  imovel: ImovelResumo
  valor: number | null
  entrada: number | null
  saldo: string | null
  /** Valor efetivamente obtido via crédito bancário — NUNCA presuma que é
   * "valor - entrada": pode haver parcelas intermediárias pagas com
   * recursos próprios do comprador (ver banco_financiador e
   * observacoes_adicionais). Só preencha quando esse valor específico for
   * informado ou calculável com segurança. */
  valor_financiado: number | null
  banco_financiador: string | null
  /** Mantido por compatibilidade — prefira condicao_posse pra qualquer
   * condição que não seja um número simples de dias. */
  prazo_posse_dias: number | null
  /** Condição de fato pra transmissão da posse, em texto livre, pronta pra
   * encaixar depois de "ficará imitido(a) na posse do imóvel em" (ex: "30
   * dias após a assinatura da escritura" ou "no dia da assinatura do
   * contrato de financiamento, condicionado ao pagamento integral do sinal
   * e dos recursos próprios"). Use isso sempre que a condição informada não
   * for um número simples de dias — NUNCA force uma condição composta
   * (múltiplos eventos) dentro de prazo_posse_dias. */
  condicao_posse: string | null
  multa_percentual: number | null
  cidade: string | null
  observacoes_adicionais: string | null
  painel_inteligencia: ChecklistItem[]
  /** Testemunhas do instrumento — normalmente vêm da descrição livre, não
   * de documento. Só inclua quem foi explicitamente indicado como
   * testemunha (não confunda com corretor, procurador etc.). */
  testemunhas: TestemunhaResumo[]
  corretor: CorretorResumo | null
  /** Só preencha se houver corretor identificado — comissão sem corretor
   * não faz sentido. */
  comissao: ComissaoResumo | null
  /** Certidões apresentadas, uma por item — extraia de documentos da pasta
   * "certidoes" (ver campo "pasta" em documentos_ocr) ou da descrição
   * livre quando ela relacionar certidões nominalmente. Não invente número
   * ou data que não constem na fonte. */
  certidoes: CertidaoResumo[]
}

const SYSTEM_PROMPT = `Você é um assistente jurídico que ajuda a compreender negociações imobiliárias antes de um contrato ser redigido.

Você recebe: o tipo de contrato, o valor_servico_fontinhas, uma descrição livre da negociação escrita por um atendente, e os dados já extraídos (via OCR) dos documentos anexados (compradores, vendedores, imóvel).

IMPORTANTE sobre valor_servico_fontinhas: é o valor cobrado pela Fontinhas (a assessoria) pelo SERVIÇO de intermediação/assessoria deste contrato — NUNCA é o valor do imóvel ou da negociação entre comprador e vendedor. Ignore-o completamente ao montar o campo "valor" do resumo (que é o valor da negociação/imóvel) e NUNCA o compare com valores descritos no texto livre ou extraídos dos documentos — não são a mesma grandeza e não devem gerar item de "atencao" no painel_inteligencia.

Sua única tarefa é CONSOLIDAR essas informações num resumo estruturado. Você NÃO inventa dados que não foram informados nem extraídos — se um campo não aparece em nenhuma fonte, retorne null. Você NÃO redige cláusulas nem texto de contrato aqui.

IMPORTANTE sobre a pasta de cada documento (campo "pasta" em cada item de documentos_ocr): é o sinal DEFINITIVO de a quem o documento pertence — "comprador", "vendedor", "imovel", "terceiros" ou "certidoes". Trate os documentos de cada pasta de forma ISOLADA, nunca misturando dados entre elas:
- Documentos da pasta "comprador" (RG, CPF, CNH, comprovante de endereço) descrevem SOMENTE o(s) comprador(es) — o endereço encontrado ali é o endereço ATUAL de residência do comprador.
- Documentos da pasta "vendedor" descrevem SOMENTE o(s) vendedor(es) — o endereço ali é o endereço ATUAL de residência do vendedor.
- Documentos da pasta "imovel" (matrícula, IPTU, etc.) descrevem o IMÓVEL, não uma pessoa. O endereço que aparece na matrícula é o endereço DO IMÓVEL (campo "imovel.endereco") — NUNCA copie esse endereço para o campo "endereco" de um comprador ou vendedor, mesmo que o nome do proprietário na matrícula bata com o nome do vendedor. Uma pessoa pode ser proprietária de um imóvel e residir em outro endereço/cidade/estado — o endereço pessoal dela só vem de documento anexado nas pastas "comprador"/"vendedor" (comprovante de endereço), nunca da matrícula.
- Para os dados do imóvel, combine informações de TODOS os documentos da pasta "imovel": se a matrícula não tiver o número de cadastro imobiliário/inscrição municipal (comum em matrículas antigas), procure esse dado em outros documentos da mesma pasta (ex: IPTU) e preencha "cadastro_prefeitura" a partir dali. Sempre que o número de cadastro imobiliário aparecer em QUALQUER documento da pasta "imovel", ele deve constar no resumo — é um dado obrigatório de qualificação do imóvel. Preencha também "descricao" com uma frase curta do tipo/composição do imóvel (ex: "lote de terras nº 04 (parte) da quadra nº 083 do Jardim Alvorada" ou "apartamento nº 208, 3º pavimento, com vaga de garagem"), extraída da matrícula ou de outro documento da pasta — sem esse dado a cláusula de objeto do contrato fica incompleta.
- A matrícula e a escritura, além de descreverem o imóvel, costumam trazer embutida a QUALIFICAÇÃO CIVIL de quem comprou/vendeu naquela transação anterior (nome, RG, CPF, profissão, estado civil, CNH) — pode aproveitar esses dados de qualificação (profissão, RG, CNH etc.) para a pessoa correspondente SE ela for de fato o comprador ou vendedor desta negociação atual, EXCETO o endereço: o endereço "residente e domiciliado" que aparece dentro da matrícula reflete a situação de quando aquele registro foi lavrado (a pessoa pode ter se mudado depois) — o endereço atual da pessoa continua vindo exclusivamente do comprovante de endereço na pasta "comprador"/"vendedor".
- Documentos da pasta "terceiros" são de pessoas que não são comprador nem vendedor (procurador, herdeiro, cônjuge não incluído como parte etc.) — não os misture com compradores/vendedores; mencione dados relevantes deles em "observacoes_adicionais" se a descrição livre indicar que são partes do negócio.
- Documentos da pasta "certidoes" comprovam a regularidade das partes/imóvel — extraia cada uma como um item da lista "certidoes" (tipo, número, órgão emissor, data de emissão, validade), não como texto solto em "observacoes_adicionais". Uma certidão sem número/órgão identificável ainda vale um item (com os campos que faltarem em null) — não descarte a menção só porque falta um dado.

Testemunhas, corretor e comissão normalmente vêm da DESCRIÇÃO LIVRE (o atendente digitou), não de documento — mas se algum documento também trouxer esses dados, prefira o dado mais completo. Regras:
- "testemunhas": só inclua quem foi explicitamente indicado como testemunha do instrumento — não confunda com corretor, procurador ou parte do negócio.
- "corretor"/"comissao": só preencha "comissao" se houver "corretor" identificado. "comissao.responsavel" é "comprador" ou "vendedor" (quem paga) — se a descrição não disser, deixe null, não presuma. "comissao.momento_pagamento" deve ser uma frase pronta pra encaixar depois de "devida" (ex: "na assinatura do contrato de financiamento"), não uma data solta.
- "condicao_posse": use SEMPRE que a condição informada for composta (mais de um evento, ex: "no dia da assinatura do financiamento, condicionado ao pagamento do sinal e dos recursos próprios") — nesse caso deixe "prazo_posse_dias" null. Só preencha "prazo_posse_dias" quando a condição for literalmente um número de dias corridos após a assinatura, sem outras condições.

Preencha o MÁXIMO de subcampos de cada pessoa/imóvel que estiverem disponíveis no OCR da pasta correspondente (nome, cpf, rg, órgão emissor do RG, cnh, estado civil, regime de bens, profissão, nacionalidade, data de nascimento) — não deixe um campo null se o dado está literalmente presente no OCR de um documento daquela pasta ou na descrição livre.

IMPORTANTE sobre valores de pagamento: "entrada" é só o sinal pago no ato. "valor_financiado" é EXCLUSIVAMENTE o valor obtido via crédito/financiamento bancário — nunca calcule como "valor - entrada", pois pode haver parcelas intermediárias pagas com recursos próprios do comprador antes do financiamento. Se a descrição livre detalhar 3 ou mais parcelas (ex: sinal + recursos próprios + financiamento), preencha "valor_financiado" apenas com a parcela realmente financiada e descreva TODAS as demais parcelas (inclusive as que não são "entrada" nem "valor_financiado") em "observacoes_adicionais", de forma clara e numerada, pois elas serão inseridas como texto complementar na cláusula de preço. Preencha "banco_financiador" com o nome da instituição financeira mencionada (ex: "Caixa Econômica Federal"), mesmo que só conste na descrição livre e não em documento.

Além do resumo, monte um "painel_inteligencia": uma lista curta de itens de checklist, cada um com "texto" e "status" ("ok" se o dado foi encontrado/está completo, "atencao" se falta algo importante — ex: falta documento de uma parte, CPF ausente, imóvel sem matrícula, imóvel sem cadastro na prefeitura em nenhum documento anexado). Seja específico no texto (ex: "Falta documento do vendedor", não "Falta informação").

Marque "atencao" também quando houver DIVERGÊNCIA entre o que os documentos (OCR) mostram e o que a descrição livre diz — ex: valor do documento diferente do valor descrito, nome diferente, endereço diferente — e quando um dado parecer de BAIXA CONFIANÇA (extraído de forma ambígua ou incompleta do OCR). Nesses casos, descreva a divergência/incerteza específica no texto do item (ex: "Valor no documento (R$ 430.000) diverge do valor descrito (R$ 450.000)").

Retorne SOMENTE o JSON abaixo, sem markdown, sem explicação:

{
  "compradores": [{"nome": "...", "cpf": "...", "rg": "...", "orgao_emissor_rg": "...", "cnh": "..._ou_null", "estado_civil": "...", "regime_casamento": "..._ou_null", "profissao": "...", "nacionalidade": "...", "data_nascimento": "...", "endereco": "..."}],
  "vendedores": [{"nome": "...", "cpf": "...", "rg": "...", "orgao_emissor_rg": "...", "cnh": "..._ou_null", "estado_civil": "...", "regime_casamento": "..._ou_null", "profissao": "...", "nacionalidade": "...", "data_nascimento": "...", "endereco": "..."}],
  "imovel": {"descricao": "..._ou_null", "endereco": "...", "matricula": "...", "cartorio": "..._ou_null", "area": "..._ou_null", "cadastro_prefeitura": "..._ou_null", "cidade": "...", "uf": "..."},
  "valor": numero_ou_null,
  "entrada": numero_ou_null,
  "saldo": "financiado|a_vista|texto_livre_ou_null",
  "valor_financiado": numero_ou_null,
  "banco_financiador": "..._ou_null",
  "prazo_posse_dias": numero_ou_null,
  "condicao_posse": "..._ou_null",
  "multa_percentual": numero_ou_null,
  "cidade": "..._ou_null",
  "observacoes_adicionais": "..._ou_null",
  "painel_inteligencia": [{"texto": "...", "status": "ok|atencao"}],
  "testemunhas": [{"nome": "...", "cpf": "..._ou_null", "rg": "..._ou_null", "profissao": "..._ou_null", "endereco": "..._ou_null", "email": "..._ou_null"}],
  "corretor": {"nome": "...", "cpf": "..._ou_null", "creci": "..._ou_null", "email": "..._ou_null", "telefone": "..._ou_null"} ,
  "comissao": {"valor": numero_ou_null, "percentual": numero_ou_null, "responsavel": "comprador|vendedor|null", "momento_pagamento": "..._ou_null"},
  "certidoes": [{"tipo": "...", "numero": "..._ou_null", "orgao_emissor": "..._ou_null", "data_emissao": "..._ou_null", "validade": "..._ou_null"}]
}

"testemunhas", "certidoes" sem nenhum item identificado: use array vazio []. "corretor"/"comissao" sem corretor identificado: use null (não um objeto com subcampos null).

Campos de pessoa (compradores/vendedores) sem nenhum dado disponível: use null nos subcampos, mas ainda assim gere um item de painel_inteligencia com status "atencao" avisando que falta o documento dessa parte, se a descrição mencionar a parte mas não houver documento correspondente. Da mesma forma, se "saldo" indicar financiamento mas "valor_financiado" não puder ser determinado com segurança, gere um item de painel_inteligencia com status "atencao" pedindo confirmação do valor financiado.`

export async function entenderNegociacao(input: {
  tipoContrato: string | null
  valorContrato: number | null
  descricao: string
  documentos: DocumentoOcrResumo[]
}): Promise<ResumoNegociacao> {
  const contexto = JSON.stringify({
    tipo_contrato: input.tipoContrato,
    valor_servico_fontinhas: input.valorContrato,
    descricao: input.descricao,
    documentos_ocr: input.documentos,
  }, null, 2)

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 8000,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: contexto }],
  })

  // Sonnet 5 roda thinking adaptativo por padrão — o(s) primeiro(s) bloco(s)
  // costumam ser 'thinking', não 'text' (mesmo motivo do .find() em ocr.ts).
  // A resposta em texto pode vir dividida em mais de um bloco 'text' — junta
  // todos, em vez de pegar só o primeiro, para não cortar o JSON no meio.
  const blocosTexto = response.content.filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
  if (blocosTexto.length === 0) throw new Error('Resposta inesperada da IA.')
  if (response.stop_reason === 'max_tokens') {
    console.error('[entenderNegociacao] resposta cortada por max_tokens')
    throw new Error('A IA não conseguiu concluir a análise (resposta muito longa). Tente novamente.')
  }

  const bruto = blocosTexto.map((b) => b.text).join('').trim()
  const semFences = bruto
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')

  try {
    return JSON.parse(semFences) as ResumoNegociacao
  } catch {
    // Fallback: às vezes a IA acrescenta um comentário antes/depois do JSON —
    // tenta isolar só o trecho entre a primeira { e a última }.
    const inicio = semFences.indexOf('{')
    const fim = semFences.lastIndexOf('}')
    if (inicio === -1 || fim === -1) {
      console.error('[entenderNegociacao] resposta sem JSON reconhecível:', bruto)
      throw new Error('A IA não devolveu um resumo em formato reconhecível.')
    }
    try {
      return JSON.parse(semFences.slice(inicio, fim + 1)) as ResumoNegociacao
    } catch {
      console.error('[entenderNegociacao] falha ao parsear JSON da IA:', bruto)
      throw new Error('A IA não devolveu um resumo em formato reconhecível.')
    }
  }
}
