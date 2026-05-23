import type {
  EntradaSimulador,
  LinhaResultado,
  ResultadoSimulador,
  SimuladorItbiConfig,
  SimuladorCustasConfig,
} from '@/types/simulador'

function arredondar(v: number): number {
  return Math.round(v * 100) / 100
}

function normCity(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
}

function isCaixa(banco: string): boolean {
  return banco.toLowerCase().includes('caixa')
}

// ── ITBI ─────────────────────────────────────────────────────────────────────

function calcItbiSemDesconto(e: EntradaSimulador, cfg?: SimuladorItbiConfig): number {
  const cidade = normCity(e.cidade)
  const isTC = e.modalidade === 'terreno_construcao'

  if (cidade === 'curitiba') {
    return arredondar(e.valorCV * 0.027)
  }

  const aliquota = cfg?.aliquota ?? 0.02
  const base = isTC ? e.valorTerreno : e.valorCV
  return arredondar(base * aliquota)
}

function calcItbiComDesconto(e: EntradaSimulador): number {
  const cidade = normCity(e.cidade)
  const isTC = e.modalidade === 'terreno_construcao'

  if (cidade === 'curitiba') {
    return arredondar(e.valorCV * 0.027)
  }

  // Grupo Maringá (inclui Marialva, Paiçandu, Mandaguaçu)
  const grupoMaringa = ['maringa', 'marialva', 'paicandu', 'mandaguacu']
  const isMaringaGrupo = grupoMaringa.includes(cidade)
  const isMaringaEspecifica = cidade === 'maringa'

  if (isMaringaGrupo) {
    // Exceção exclusiva de Maringá
    if (
      isMaringaEspecifica &&
      e.primeiraAquisicao === 'sim' &&
      e.valorCV >= 300000 &&
      !isTC
    ) {
      return arredondar(e.valorCV * 0.02)
    }

    if (isTC) {
      return arredondar(e.valorTerreno * 0.005 + e.valorTerreno * 0.015)
    }
    return arredondar(e.valorFinanciado * 0.005 + e.valorCV * 0.015)
  }

  if (cidade === 'sarandi') {
    if (isTC) {
      return arredondar(e.valorTerreno * 0.005 + e.valorTerreno * 0.02)
    }
    return arredondar(e.valorFinanciado * 0.005 + e.valorCV * 0.02)
  }

  return arredondar(e.valorCV * 0.02)
}

// ── FunRejus ──────────────────────────────────────────────────────────────────

function calcFunRejus(e: EntradaSimulador): number {
  if (e.isentoFunRejus === 'sim') return 0
  return arredondar(e.valorCV * 0.002)
}

// ── Reciprocidade ─────────────────────────────────────────────────────────────

function calcReciprocidade(
  e: EntradaSimulador,
  tarifa: number,
): { valor: number; visivel: boolean } {
  if (!isCaixa(e.banco)) {
    return { valor: 0, visivel: false }
  }

  const modaisFinanciamento: typeof e.modalidade[] = [
    'aquisicao_pronto',
    'terreno_construcao',
    'construcao_proprio',
  ]

  // R3: PMCMV + modalidade financiamento + C&V ≤ 500k + tarifa > 3600
  if (
    e.produto === 'PMCMV' &&
    modaisFinanciamento.includes(e.modalidade) &&
    e.valorCV <= 500000 &&
    tarifa > 3600
  ) {
    return { valor: 1000, visivel: true }
  }

  // R4: Pro_Cotista + modalidade financiamento + C&V ≤ 500k + tarifa > 3600
  if (
    e.produto === 'Pro_Cotista' &&
    modaisFinanciamento.includes(e.modalidade) &&
    e.valorCV <= 500000 &&
    tarifa > 3600
  ) {
    return { valor: 1000, visivel: true }
  }

  // R5: Pro_Cotista + C&V > 500k
  if (e.produto === 'Pro_Cotista' && e.valorCV > 500000) {
    return { valor: arredondar(e.valorFinanciado * 0.02), visivel: true }
  }

  // R6: SBPE (tipo Residencial ou Comercial sempre se aplica)
  if (e.produto === 'SBPE') {
    return { valor: arredondar(e.valorFinanciado * 0.02), visivel: true }
  }

  // R7: Caixa default
  return { valor: arredondar(e.valorFinanciado * 0.02), visivel: true }
}

// ── IOF visibilidade ──────────────────────────────────────────────────────────

export function calcIofVisivel(e: Pick<EntradaSimulador, 'tipoImovel' | 'modalidade' | 'banco'>): boolean {
  if (e.tipoImovel === 'Comercial') return true
  if (e.modalidade === 'cgi') return true
  if (e.modalidade === 'aquisicao_terreno') {
    // Exceção: Residencial + AquisTerreno + Caixa → oculto
    if (e.tipoImovel === 'Residencial' && isCaixa(e.banco)) return false
    return true
  }
  return false
}

// ── Descrições para o PDF ─────────────────────────────────────────────────────

const DESC: Record<string, string> = {
  itbi: 'Imposto de Transmissão de Bens Imóveis - Emitido pela prefeitura do município de acordo com o percentual da Alíquota Estipulada sobre o Valor do compra e Venda ou da Avaliação do Imóvel.',
  funrejus: 'Fundo de Reequipamento do Poder Judiciário. Uma taxa de 0,2% cobrada sobre o valor da transação declarada na escritura ou da avaliação.',
  tarifa: 'Valor que consta na tabela de tarifas das Instituições referente aos custos com análise jurídica, emissão de contrato e custos operacionais.',
  registro: 'Custa obrigatória para Registrar na Matrícula do imóvel alterações de propriedade ou dados relevantes.',
  certidoes: 'Envolve a solicitação e análise de certidões relevantes das partes envolvidas no financiamento para garantir transparência, segurança e reduzir riscos futuros.',
  servRegistro: 'Gestão e conferência de todo o processo pós-assinatura do contrato, do envio ao cartório até o registro final, acelerando a liberação. (Registros, Requerimentos, análise de Certidões...)',
  engenharia: 'Serviço de análise de um profissional contratado pelo banco para avaliar o bem que será dado como garantia no financiamento.',
  reciprocidade: 'Valor estimado é negociado entre você cliente e com o gerente da Caixa Econômica Federal na data da entrevista ou da assinatura. Podendo haver a oferta de produtos e estreitamento do relacionamento.',
  contrato: 'Elaboração de Contrato de Compra e Venda entre as partes.',
  iof: 'IOF sobre o valor financiado.',
}

// ── Main calculation ──────────────────────────────────────────────────────────

export function calcularCustas(
  entrada: EntradaSimulador,
  itbiConfig: SimuladorItbiConfig | undefined,
  custasConfig: SimuladorCustasConfig | undefined,
): ResultadoSimulador {
  const bancoEhCaixa = isCaixa(entrada.banco)
  const tarifa = custasConfig?.tarifaAvaliacao ?? 0

  const itbiSem = calcItbiSemDesconto(entrada, itbiConfig)
  const itbiCom = calcItbiComDesconto(entrada)
  const funrejus = calcFunRejus(entrada)
  const recipr = calcReciprocidade(entrada, tarifa)
  const registroSem = 2100
  const registroCom = entrada.valorCV > 0 ? 1100 : 0

  const linhas: LinhaResultado[] = [
    {
      id: 'itbi',
      label: 'ITBI',
      semDesconto: itbiSem,
      comDesconto: itbiCom,
      visivel: true,
      descricaoPDF: DESC.itbi,
    },
    {
      id: 'funrejus',
      label: 'FunRejus',
      semDesconto: funrejus,
      comDesconto: funrejus,
      visivel: true,
      descricaoPDF: DESC.funrejus,
    },
    {
      id: 'tarifa',
      label: 'Tarifa Banco',
      semDesconto: tarifa,
      comDesconto: tarifa,
      visivel: tarifa > 0,
      descricaoPDF: DESC.tarifa,
    },
    {
      id: 'registro',
      label: 'Registro',
      semDesconto: registroSem,
      comDesconto: registroCom,
      visivel: true,
      descricaoPDF: DESC.registro,
    },
    {
      id: 'certidoes',
      label: 'Certidões',
      semDesconto: entrada.valorCertidoes,
      comDesconto: entrada.valorCertidoes,
      visivel: entrada.valorCertidoes > 0,
      descricaoPDF: DESC.certidoes,
    },
    {
      id: 'servRegistro',
      label: 'Serv. Registro',
      semDesconto: entrada.servicoRegistro,
      comDesconto: entrada.servicoRegistro,
      visivel: entrada.servicoRegistro > 0,
      descricaoPDF: DESC.servRegistro,
    },
    {
      id: 'engenharia',
      label: 'Eng. Caixa',
      semDesconto: bancoEhCaixa ? 750 : 0,
      comDesconto: bancoEhCaixa ? 750 : 0,
      visivel: bancoEhCaixa,
      descricaoPDF: DESC.engenharia,
    },
    {
      id: 'reciprocidade',
      label: 'Reciprocidade',
      semDesconto: recipr.valor,
      comDesconto: recipr.valor,
      visivel: true, // sempre exibido (R$0 quando não se aplica)
      descricaoPDF: DESC.reciprocidade,
    },
    {
      id: 'contrato',
      label: 'Contrato Particular',
      semDesconto: entrada.contratoParticular,
      comDesconto: entrada.contratoParticular,
      visivel: entrada.contratoParticular > 0,
      descricaoPDF: DESC.contrato,
    },
    {
      id: 'iof',
      label: 'IOF',
      semDesconto: entrada.iof,
      comDesconto: entrada.iof,
      visivel: entrada.iofVisivel,
      descricaoPDF: DESC.iof,
    },
  ]

  const visiveis = linhas.filter((l) => l.visivel)
  const totalSem = arredondar(visiveis.reduce((s, l) => s + l.semDesconto, 0))
  const totalCom = arredondar(visiveis.reduce((s, l) => s + l.comDesconto, 0))
  const pctSem = entrada.valorCV > 0 ? arredondar((totalSem / entrada.valorCV) * 100 * 10) / 10 : 0
  const pctCom = entrada.valorCV > 0 ? arredondar((totalCom / entrada.valorCV) * 100 * 10) / 10 : 0

  return {
    entrada,
    linhas,
    totalSemDesconto: totalSem,
    totalComDesconto: totalCom,
    percentualSemDesconto: pctSem,
    percentualComDesconto: pctCom,
  }
}
