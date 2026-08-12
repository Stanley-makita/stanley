import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { Processo, ProcessoComprador, ProcessoVendedor } from '@/types/processos'

export interface ContratoAssessoriaOpcoes {
  numero_contrato_assessoria: string
  check_financiamento: boolean
  check_itbi: boolean
  check_registro: boolean
  check_juridico: boolean
  valor_servicos: number | null
}

function fmtMoeda(v: number | null | undefined): string {
  if (!v) return '[A PREENCHER]'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

function val(v: string | null | undefined): string {
  return v?.trim() || '[A PREENCHER]'
}

function check(marcado: boolean): string {
  return marcado ? '☑' : '☐'
}

const UNIDADES = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove',
  'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove']
const DEZENAS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa']
const CENTENAS = ['', 'cem', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos',
  'seiscentos', 'setecentos', 'oitocentos', 'novecentos']

function centenasExtenso(n: number): string {
  if (n === 0) return ''
  if (n === 100) return 'cem'
  const c = Math.floor(n / 100)
  const resto = n % 100
  const dezena = resto < 20 ? UNIDADES[resto] : DEZENAS[Math.floor(resto / 10)] + (resto % 10 !== 0 ? ' e ' + UNIDADES[resto % 10] : '')
  // Sem centena (ex: 80 → "oitenta") — sem isso, virava " e oitenta" (achado
  // ao escrever teste pro percentual novo; mesmo bug já aparecia em produção
  // como "R$ 80.000,00 ( e oitenta mil reais)").
  if (c === 0) return dezena
  // "cento" (não "cem") quando há resto — "cento e cinquenta", não "cem e
  // cinquenta". "cem" sozinho só se aplica ao número exato 100, já tratado
  // acima.
  const centena = c === 1 && resto !== 0 ? 'cento' : CENTENAS[c]
  if (resto === 0) return centena
  return centena + ' e ' + dezena
}

function milharExtenso(n: number): string {
  if (n === 0) return ''
  if (n === 1) return 'mil'
  return centenasExtenso(n) + ' mil'
}

function inteiroExtenso(n: number): string {
  if (n === 0) return 'zero'
  const milhar = Math.floor(n / 1000)
  const resto = n % 1000
  const partes: string[] = []
  if (milhar > 0) partes.push(milharExtenso(milhar))
  if (resto > 0) partes.push(centenasExtenso(resto))
  return partes.join(' e ')
}

export function valorPorExtenso(valor: number): string {
  if (!valor || valor <= 0) return '[A PREENCHER]'
  const reais = Math.floor(valor)
  const centavos = Math.round((valor - reais) * 100)
  const parteReais = inteiroExtenso(reais) + (reais === 1 ? ' real' : ' reais')
  if (centavos === 0) return parteReais
  const parteCentavos = inteiroExtenso(centavos) + (centavos === 1 ? ' centavo' : ' centavos')
  return parteReais + ' e ' + parteCentavos
}

function buildEndereco(p: { endereco_rua?: string | null; endereco_numero?: string | null; endereco_bairro?: string | null; endereco_cidade?: string | null; endereco_uf?: string | null; endereco_cep?: string | null } | null | undefined): string {
  if (!p) return '[A PREENCHER]'
  const partes = [
    p.endereco_rua,
    p.endereco_numero ? `nº ${p.endereco_numero}` : null,
    p.endereco_bairro,
    p.endereco_cidade && p.endereco_uf ? `${p.endereco_cidade}/${p.endereco_uf}` : (p.endereco_cidade ?? null),
    p.endereco_cep ? `CEP ${p.endereco_cep}` : null,
  ].filter(Boolean)
  return partes.length > 0 ? partes.join(', ') : '[A PREENCHER]'
}

/**
 * Qualificação civil de UMA pessoa (comprador ou vendedor) no formato usado
 * nas cláusulas de qualificação das partes — extraído do que antes era
 * texto fixo pra só o primeiro comprador/vendedor (ver qualificacaoParagrafo
 * e assinaturasBloco logo abaixo, que juntam N pessoas usando esta função).
 */
function formatarQualificacao(d: {
  nome: string
  cpf: string | null
  email: string | null
  rg?: string | null
  cnh?: string | null
  profissao?: string | null
  nacionalidade?: string | null
  estadoCivil?: string | null
  endereco: string
  conjugeNome?: string | null
}): string {
  const nacionalidade = d.nacionalidade?.trim() || 'brasileiro(a)'
  const conjuge = d.conjugeNome ? `, cônjuge ${d.conjugeNome}` : ''
  return `${val(d.nome)}, ${nacionalidade}, ${val(d.estadoCivil)}${conjuge}, ${val(d.profissao)}, portador(a) da CNH nº ${val(d.cnh)}, RG nº ${val(d.rg)}, CPF nº ${val(d.cpf)}, residente e domiciliado(a) em ${d.endereco}, e-mail: ${val(d.email)}`
}

function dadosComprador(c: ProcessoComprador) {
  const p = c.pessoa
  return {
    nome: c.nome, cpf: c.cpf, email: c.email,
    rg: p?.rg, cnh: p?.registro_cnh, profissao: p?.profissao,
    nacionalidade: p?.nacionalidade, estadoCivil: p?.estado_civil,
    endereco: buildEndereco(p), conjugeNome: p?.conjuge_nome,
  }
}

function dadosVendedor(v: ProcessoVendedor) {
  const p = v.pessoa
  return {
    nome: v.nome, cpf: v.cpf, email: v.email,
    rg: p?.rg, cnh: p?.registro_cnh, profissao: p?.profissao,
    nacionalidade: p?.nacionalidade, estadoCivil: v.estado_civil ?? p?.estado_civil,
    endereco: buildEndereco(p), conjugeNome: v.conjuge_nome ?? p?.conjuge_nome,
  }
}

/**
 * Parágrafo de qualificação cobrindo N pessoas (não só a primeira) — cada
 * uma com sua qualificação civil completa, unidas por "; e " sob o mesmo
 * papel contratual (ex: dois compromissários compradores em união estável).
 */
function qualificacaoParagrafo(pessoas: string[], papel: string): string {
  if (pessoas.length === 0) return `<p><strong>${papel}:</strong> [A PREENCHER].</p>`
  return `<p><strong>${papel}:</strong> ${pessoas.join('; e ')}.</p>`
}

/** Um bloco de assinatura por pessoa (não só a primeira). */
function assinaturasBloco(pessoas: { nome: string; cpf: string | null }[], papel: string): string {
  if (pessoas.length === 0) {
    return `<p>________________________________________<br/>\n<strong>[A PREENCHER]</strong><br/>\nCPF: [A PREENCHER]<br/>\n${papel}</p>`
  }
  return pessoas
    .map((p) => `<p>________________________________________<br/>\n<strong>${val(p.nome)}</strong><br/>\nCPF: ${val(p.cpf)}<br/>\n${papel}</p>`)
    .join('\n\n<br/>\n\n')
}

/** "10" → "10% (dez por cento)"; percentuais não-inteiros só saem numéricos
 * (sem por extenso) — caso raro, não vale a complexidade de extenso fracionário. */
export function percentualTexto(n: number): string {
  if (!Number.isInteger(n)) return `${n.toFixed(2).replace('.', ',')}%`
  return `${n}% (${inteiroExtenso(n)} por cento)`
}

export interface ExtrasResumoNegociacao {
  imovelDescricao?: string | null
  imovelMatricula?: string | null
  imovelCartorio?: string | null
  imovelArea?: string | null
  imovelCadastroPrefeitura?: string | null
  imovelEndereco?: string | null
  bancoFinanciador?: string | null
  dataPosse?: string | null
  /** true quando dataPosse veio de condicao_posse (texto livre já
   * autossuficiente) — nesse caso o "mediante ..." padrão de
   * condicao_posse_evento fica vazio pra não duplicar/contradizer. */
  condicaoPosseComposta?: boolean
  valorMultaTotal?: string | null
  multaPercentualTexto?: string | null
  cidade?: string | null
  observacoesPagamento?: string | null
  listaCertidoes?: string | null
  corretorNome?: string | null
  corretorCpf?: string | null
  corretorCreci?: string | null
  valorComissao?: string | null
  valorComissaoExtenso?: string | null
  corretagemResponsavel?: string | null
  corretagemMomentoPagamento?: string | null
  testemunha1Nome?: string | null
  testemunha1Cpf?: string | null
  testemunha2Nome?: string | null
  testemunha2Cpf?: string | null
}

export function substituirVariaveis(
  html: string,
  processo: Processo,
  compradores: ProcessoComprador[],
  vendedores: ProcessoVendedor[],
  opcoes?: ContratoAssessoriaOpcoes,
  extras?: ExtrasResumoNegociacao,
): string {
  const comprador = compradores[0]
  const vendedor = vendedores[0]
  const cp = comprador?.pessoa  // dados detalhados do comprador (pessoas)
  const vp = vendedor?.pessoa   // dados detalhados do vendedor (pessoas)

  const hoje = new Date()

  // Cônjuge do vendedor: prefere dado da tabela processo_vendedores, fallback para pessoas
  const vendedorConjugeNome = vendedor?.conjuge_nome ?? vp?.conjuge_nome
  // Cônjuge do comprador: vem de pessoas (comprador não tem coluna conjuge_nome)
  const compradorConjugeNome = cp?.conjuge_nome

  const variaveis: Record<string, string> = {
    // Data e localização
    data_extenso: format(hoje, "dd 'de' MMMM 'de' yyyy", { locale: ptBR }),
    cidade_comarca: 'Maringá/PR',
    cidade: 'Maringá',

    // Qualificação e assinatura cobrindo TODOS os compradores/vendedores
    // (não só o primeiro) — ver formatarQualificacao/qualificacaoParagrafo/
    // assinaturasBloco acima. Usado por templates que suportam múltiplas
    // partes do mesmo papel (ex: casal em união estável comprando junto).
    compradores_qualificacao: qualificacaoParagrafo(
      compradores.map((c) => formatarQualificacao(dadosComprador(c))),
      'COMPROMISSÁRIO(A) COMPRADOR(A)',
    ),
    vendedores_qualificacao: qualificacaoParagrafo(
      vendedores.map((v) => formatarQualificacao(dadosVendedor(v))),
      'COMPROMITENTE VENDEDOR(A)',
    ),
    compradores_assinaturas: assinaturasBloco(
      compradores.map((c) => ({ nome: c.nome, cpf: c.cpf })),
      'COMPROMISSÁRIO(A) COMPRADOR(A)',
    ),
    vendedores_assinaturas: assinaturasBloco(
      vendedores.map((v) => ({ nome: v.nome, cpf: v.cpf })),
      'COMPROMITENTE VENDEDOR(A)',
    ),

    // Multa percentual (cláusula de sanção penal) — 10% é o padrão até hoje
    // usado nos contratos da Fontinhas; só muda quando a negociação
    // especificar outro percentual (ver extras.multaPercentualTexto abaixo).
    multa_percentual_texto: '10% (dez por cento)',

    // Certidões e testemunhas — ainda sem fonte de dados estruturada (isso é
    // a Fase 1 do diagnóstico do Construtor de Contratos: falta um campo
    // dedicado no Resumo da Negociação pra certidões e testemunhas). Por ora
    // ficam como variáveis reais (antes "lista_certidoes" nem existia, e o
    // bloco de testemunhas era texto fixo no template, impossível de
    // preencher mesmo quando o dado é informado).
    lista_certidoes: '[A PREENCHER]',
    testemunha1_nome: '[A PREENCHER]',
    testemunha1_cpf: '[A PREENCHER]',
    testemunha2_nome: '[A PREENCHER]',
    testemunha2_cpf: '[A PREENCHER]',

    // Comprador
    comprador_nome: val(comprador?.nome),
    comprador_cpf: val(comprador?.cpf),
    comprador_email: val(comprador?.email),
    comprador_telefone: val(comprador?.telefone),
    comprador_rg: val(cp?.rg),
    comprador_nacionalidade: cp?.nacionalidade?.trim() || 'brasileiro(a)',
    comprador_estado_civil: val(cp?.estado_civil),
    comprador_profissao: val(cp?.profissao),
    comprador_cnh: val(cp?.registro_cnh),
    comprador_endereco: buildEndereco(cp),
    comprador_conjuge: compradorConjugeNome ? `, cônjuge ${compradorConjugeNome}` : '',

    // Vendedor
    vendedor_nome: val(vendedor?.nome),
    vendedor_cpf: val(vendedor?.cpf),
    vendedor_email: val(vendedor?.email),
    vendedor_estado_civil: val(vendedor?.estado_civil ?? vp?.estado_civil),
    vendedor_banco: val(vendedor?.banco),
    vendedor_agencia: val(vendedor?.agencia),
    vendedor_conta: val(vendedor?.conta),
    vendedor_rg: val(vp?.rg),
    vendedor_nacionalidade: vp?.nacionalidade?.trim() || 'brasileiro(a)',
    vendedor_profissao: val(vp?.profissao),
    vendedor_cnh: val(vp?.registro_cnh),
    vendedor_endereco: buildEndereco(vp),
    vendedor_conjuge: vendedorConjugeNome ? `, cônjuge ${vendedorConjugeNome}` : '',

    // Locador/Locatário — mesmos dados do vendedor/comprador para locação
    locador_nome: val(vendedor?.nome),
    locador_cpf: val(vendedor?.cpf),
    locador_rg: val(vp?.rg),
    locador_cnh: val(vp?.registro_cnh),
    locador_profissao: val(vp?.profissao),
    locador_endereco: buildEndereco(vp),
    locador_conjuge: vendedorConjugeNome ? `, cônjuge ${vendedorConjugeNome}` : '',

    locatario_nome: val(comprador?.nome),
    locatario_cpf: val(comprador?.cpf),
    locatario_rg: val(cp?.rg),
    locatario_profissao: val(cp?.profissao),
    locatario_endereco: buildEndereco(cp),
    locatario_conjuge: compradorConjugeNome ? `, cônjuge ${compradorConjugeNome}` : '',

    // Contratante (prestação de serviços) — usa comprador
    contratante_nome: val(comprador?.nome),
    contratante_cpf: val(comprador?.cpf),
    contratante_nacionalidade: val(cp?.nacionalidade),
    contratante_estado_civil: val(cp?.estado_civil),
    contratante_profissao: val(cp?.profissao),
    contratante_cnh: val(cp?.registro_cnh),
    contratante_endereco: buildEndereco(cp),

    // Fiador — não há tabela de fiadores no sistema ainda
    fiador_nome: '[A PREENCHER]',
    fiador_cpf: '[A PREENCHER]',
    fiador_rg: '[A PREENCHER]',
    fiador_profissao: '[A PREENCHER]',
    fiador_endereco: '[A PREENCHER]',
    fiador_conjuge: '',

    // Imóvel — apenas nome e valor disponíveis
    imovel_descricao_completa: val(processo.nome_imovel),
    imovel_matricula: '[A PREENCHER]',
    imovel_cartorio: '[A PREENCHER]',
    imovel_endereco: '[A PREENCHER]',
    imovel_area: '[A PREENCHER]',
    imovel_cadastro_prefeitura: '[A PREENCHER]',

    // Valores financeiros
    valor_total: fmtMoeda(processo.valor_imovel),
    valor_total_extenso: processo.valor_imovel ? valorPorExtenso(processo.valor_imovel) : '[A PREENCHER]',
    valor_entrada: fmtMoeda(processo.valor_entrada),
    valor_entrada_extenso: processo.valor_entrada ? valorPorExtenso(processo.valor_entrada) : '[A PREENCHER]',
    valor_financiado: fmtMoeda(processo.valor_financiado),
    valor_financiado_extenso: processo.valor_financiado ? valorPorExtenso(processo.valor_financiado) : '[A PREENCHER]',
    banco_financiador: val(processo.banco?.nome),

    // Dados bancários do vendedor
    conta_banco: val(vendedor?.banco),
    agencia: val(vendedor?.agencia),
    titular_conta: val(vendedor?.nome),

    // Corretor — nome/CRECI por padrão vêm do cadastro do Negócio; CPF e
    // comissão só existem se vierem do Resumo da Negociação (extras abaixo),
    // já que não há campo pra isso no cadastro do processo.
    corretor_nome: val(processo.corretor_nome),
    corretor_creci: val(processo.corretor_creci),
    corretor_cpf: '[A PREENCHER]',
    valor_comissao: '[A PREENCHER]',
    valor_comissao_extenso: '[A PREENCHER]',
    corretagem_responsavel: 'do(a) COMPROMITENTE VENDEDOR(A)',
    corretagem_momento_pagamento: '',

    // Posse — condicao_posse_evento é o "mediante ..." que fecha a frase de
    // posse; o padrão (escritura + quitação integral) só faz sentido quando
    // data_posse é um prazo em dias. Quando a negociação já traz uma
    // condição composta (extras.dataPosse vindo de condicao_posse), essa
    // condição já é auto-suficiente e o "mediante" padrão viraria
    // redundante/contraditório — nesse caso fica vazio (ver override abaixo).
    data_posse: '[A PREENCHER]',
    condicao_posse_evento: ', mediante a assinatura da escritura pública de venda e compra e quitação integral do preço',

    // Locação
    valor_aluguel: '[A PREENCHER]',
    valor_aluguel_extenso: '[A PREENCHER]',
    prazo_locacao_meses: '[A PREENCHER]',
    data_inicio_contrato: '[A PREENCHER]',
    data_fim_contrato: '[A PREENCHER]',
    data_inicio: '[A PREENCHER]',
    data_fim: '[A PREENCHER]',
    dia_vencimento: '[A PREENCHER]',
    finalidade_locacao: '[A PREENCHER]',
    banco_locador: val(vendedor?.banco),
    agencia_locador: val(vendedor?.agencia),
    conta_locador: val(vendedor?.conta),
    email_locador: val(vendedor?.email),
    email_locatario: val(comprador?.email),
    email_fiador: '[A PREENCHER]',
    foro_comarca: 'Maringá/PR',

    // Distrato
    valor_multa_total: '[A PREENCHER]',
    valor_multa_extenso: '[A PREENCHER]',
    valor_aluguel_proporcional: '[A PREENCHER]',
    periodo_proporcional: '[A PREENCHER]',
    percentual_administradora: '[A PREENCHER]',
    valor_quota_administradora: '[A PREENCHER]',
    valor_saldo_proprietario: '[A PREENCHER]',
    conta_administradora: '[A PREENCHER]',
    agencia_administradora: '[A PREENCHER]',
    banco_administradora: '[A PREENCHER]',
    pix_administradora: '[A PREENCHER]',
    data_pagamento_proprietario: '[A PREENCHER]',
    administradora_nome: '[A PREENCHER]',
    administradora_cnpj: '[A PREENCHER]',
    administradora_responsavel: '[A PREENCHER]',
    administradora_cpf: '[A PREENCHER]',
    administradora_endereco: '[A PREENCHER]',

    // Prestação de serviços (template antigo — mantido por compatibilidade)
    numero_contrato: processo.numero_processo || '[A PREENCHER]',
    banco_instituicao: val(processo.banco?.nome),
    servicos_contratados: '<li>[A PREENCHER — liste os serviços contratados]</li>',
    valor_honorarios: '[A PREENCHER]',
    valor_honorarios_extenso: '[A PREENCHER]',
    momento_pagamento: '[A PREENCHER]',

    // Prestação de serviços de assessoria (novo template)
    numero_contrato_assessoria: opcoes?.numero_contrato_assessoria ?? '[A PREENCHER]',
    check_financiamento: check(opcoes?.check_financiamento ?? false),
    check_itbi: check(opcoes?.check_itbi ?? false),
    check_registro: check(opcoes?.check_registro ?? false),
    check_juridico: check(opcoes?.check_juridico ?? false),
    valor_total_servicos: fmtMoeda(opcoes?.valor_servicos ?? null),
    valor_total_servicos_extenso: opcoes?.valor_servicos
      ? valorPorExtenso(opcoes.valor_servicos)
      : '[A PREENCHER]',
    plataforma_assinatura: '[A PREENCHER]',
    cidade_foro: 'Maringá/PR',

    // Texto complementar da cláusula de preço (ex: parcelas intermediárias
    // pagas com recursos próprios, além de entrada e financiamento) — vazio
    // por padrão pra não aparecer como "[A PREENCHER]" quando não há nada a
    // acrescentar; só populado via override abaixo.
    clausula_pagamento_observacoes: '',
  }

  // Overrides do Resumo Estruturado da Negociação (etapa "Compreensão da
  // Negociação" do Construtor de Contratos) — campos que a IA já entendeu e o
  // usuário já confirmou, então têm prioridade sobre os defaults acima.
  if (extras?.imovelDescricao) variaveis.imovel_descricao_completa = extras.imovelDescricao
  if (extras?.imovelMatricula) variaveis.imovel_matricula = extras.imovelMatricula
  if (extras?.imovelCartorio) variaveis.imovel_cartorio = extras.imovelCartorio
  if (extras?.imovelArea) variaveis.imovel_area = extras.imovelArea
  if (extras?.imovelCadastroPrefeitura) variaveis.imovel_cadastro_prefeitura = extras.imovelCadastroPrefeitura
  if (extras?.imovelEndereco) variaveis.imovel_endereco = extras.imovelEndereco
  if (extras?.bancoFinanciador) variaveis.banco_financiador = extras.bancoFinanciador
  if (extras?.dataPosse) variaveis.data_posse = extras.dataPosse
  if (extras?.condicaoPosseComposta) variaveis.condicao_posse_evento = ''
  if (extras?.valorMultaTotal) variaveis.valor_multa_total = extras.valorMultaTotal
  if (extras?.multaPercentualTexto) variaveis.multa_percentual_texto = extras.multaPercentualTexto
  if (extras?.listaCertidoes) variaveis.lista_certidoes = extras.listaCertidoes
  if (extras?.corretorNome) variaveis.corretor_nome = extras.corretorNome
  if (extras?.corretorCpf) variaveis.corretor_cpf = extras.corretorCpf
  if (extras?.corretorCreci) variaveis.corretor_creci = extras.corretorCreci
  if (extras?.valorComissao) variaveis.valor_comissao = extras.valorComissao
  if (extras?.valorComissaoExtenso) variaveis.valor_comissao_extenso = extras.valorComissaoExtenso
  if (extras?.corretagemResponsavel) variaveis.corretagem_responsavel = extras.corretagemResponsavel
  if (extras?.corretagemMomentoPagamento) variaveis.corretagem_momento_pagamento = extras.corretagemMomentoPagamento
  if (extras?.testemunha1Nome) variaveis.testemunha1_nome = extras.testemunha1Nome
  if (extras?.testemunha1Cpf) variaveis.testemunha1_cpf = extras.testemunha1Cpf
  if (extras?.testemunha2Nome) variaveis.testemunha2_nome = extras.testemunha2Nome
  if (extras?.testemunha2Cpf) variaveis.testemunha2_cpf = extras.testemunha2Cpf
  if (extras?.observacoesPagamento) {
    variaveis.clausula_pagamento_observacoes = `<p><strong>Parágrafo Único:</strong> ${extras.observacoesPagamento}</p>`
  }
  if (extras?.cidade) {
    variaveis.cidade = extras.cidade
    variaveis.cidade_comarca = `${extras.cidade}/PR`
    variaveis.foro_comarca = `${extras.cidade}/PR`
    variaveis.cidade_foro = `${extras.cidade}/PR`
  }

  return html.replace(/\{\{(\w+)\}\}/g, (_, chave) => variaveis[chave] ?? `[A PREENCHER]`)
}
