/**
 * Validação de integração ponta a ponta com os casos REAIS que motivaram a sprint de
 * correção (5 commits do motor + 4 commits do diagnóstico do ecossistema). Diferente dos
 * testes unitários existentes (que constroem InputFinanciamento/DadosCaptacaoNormalizados
 * já prontos à mão), este arquivo mocka SÓ a chamada ao Anthropic (parser LLM — não há
 * como testar contra a API real localmente) e exercita o resto do pipeline de verdade:
 * normalizador → motor de simulação → engine → PDF servidor → texto do WhatsApp.
 *
 * Isso cobre exatamente o tipo de lacuna identificado no diagnóstico do ecossistema
 * (nenhum teste ia do texto bruto até o resultado final) e reproduz os pedidos reais do
 * usuário que geraram os bugs corrigidos nos 9 commits recentes.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Texto real (mesmo teor do pedido do usuário que motivou a sprint) — usado como chave do
// mock do parser E como argumento passado ao normalizador. Importante: classificarIntenca-
// oOperacao roda sobre este texto BRUTO (não sobre o JSON mockado abaixo), então o teste só
// é válido se o texto de entrada for português real, não um identificador arbitrário.
const TEXTO_CASO_REAL =
  '1.200.000,00 casa usada Maringá, Entrada 350.000 (100 mil FGTS mais 250 mil terreno), ' +
  'prazo máximo, Itaú, Santander, Bradesco, Caixa sac e price'

// ── Mock do parser LLM (Anthropic) — respostas fixas por texto de entrada ───────────────
const RESPOSTAS_PARSER: Record<string, unknown> = {
  // Caso real 1: "1.2M casa usada Maringá, entrada com FGTS+terreno, prazo máximo,
  // Itaú/Santander/Bradesco em SAC + Caixa em SAC e PRICE" — sem renda, sem nascimento.
  [TEXTO_CASO_REAL]: {
    valor_imovel: 1_200_000,
    valor_entrada: 350_000,
    fgts_valor: 100_000,
    tipo_imovel: 'usado',
    cidade_imovel: 'Maringá',
    data_nascimento: null,
    prazo_maximo: true,
    bancos_raw: ['Itaú', 'Santander', 'Bradesco', 'Caixa'],
    amortizacao_por_banco_raw: [
      { banco: 'Itaú', amortizacao: 'SAC' },
      { banco: 'Santander', amortizacao: 'SAC' },
      { banco: 'Bradesco', amortizacao: 'SAC' },
      { banco: 'Caixa', amortizacao: 'SAC' },
      { banco: 'Caixa', amortizacao: 'PRICE' },
    ],
    solicitar_simulacao: true,
  },
  // Reprocessamento de texto vazio — é exatamente o que _resimular (fonti-comandos.ts)
  // faz ao chamar executarWorkflowConsulta('', ctxWorkflow) depois de "sim" confirmar um
  // valor ambíguo. O parser real, chamado com string vazia, não extrai nada.
  '': {},
}

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class AnthropicMock {
      messages = {
        create: async (params: { messages: Array<{ content: string }> }) => {
          const texto = params.messages[0].content
          const raw = RESPOSTAS_PARSER[texto] ?? {}
          return { content: [{ type: 'text', text: JSON.stringify(raw) }] }
        },
      }
    },
  }
})

// ── Mock de jsPDF — grava todo texto desenhado (mesma técnica de gerarPDFBuffer.test.ts) ─
const registrados = vi.hoisted(() => ({ textos: [] as string[] }))
vi.mock('jspdf', async (importOriginal) => {
  const actual = await importOriginal<typeof import('jspdf')>()
  class JsPDFComRegistro extends actual.jsPDF {
    constructor(...args: ConstructorParameters<typeof actual.jsPDF>) {
      super(...args)
      const textoOriginal = this.text.bind(this)
      this.text = ((...args: Parameters<typeof textoOriginal>) => {
        const txt = args[0]
        if (typeof txt === 'string') registrados.textos.push(txt)
        else if (Array.isArray(txt)) registrados.textos.push(...txt.filter((t): t is string => typeof t === 'string'))
        return textoOriginal(...args)
      }) as typeof textoOriginal
    }
  }
  return { ...actual, jsPDF: JsPDFComRegistro }
})

beforeEach(() => {
  registrados.textos = []
})

// ── Mock mínimo de Supabase — genérico e encadeável, cobre os padrões usados pelos
// workflows (select/eq/is → thenable; insert/select/single → Promise; update/eq → thenable)
function criarSupabaseMock(): any {
  const chain: any = {
    eq: () => chain,
    is: () => chain,
    order: () => chain,
    limit: () => chain,
    select: () => chain,
    insert: () => chain,
    update: () => chain,
    upsert: () => chain,
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    single: () => Promise.resolve({ data: { id: 'sim-1' }, error: null }),
    then: (resolve: (v: { data: unknown[]; error: null }) => void) => resolve({ data: [], error: null }),
  }
  return { from: () => chain }
}

describe('Validação de integração — casos reais da sprint', () => {
  it('1. terreno na composição da entrada + amortização por banco + renda/idade não informadas (fluxo completo)', async () => {
    const { normalizarPedidoSimulacao } = await import('../normalizador-captacao')
    const { executarSimulacao, montarRespostaSimulacao } = await import('../motor-simulacao')
    const { gerarPDFFinanciamentoBuffer } = await import('@/lib/simuladorFinanciamento/gerarPDFBuffer')
    const { calcularAnalise } = await import('@/lib/simuladorFinanciamento/engine')

    const dados = await normalizarPedidoSimulacao(TEXTO_CASO_REAL)

    // ── Normalizador: modalidade, amortização por banco, idade/renda não informadas ──
    expect(dados.tipo_operacao).toBe('aquisicao') // não deve virar lote_urbanizado
    expect(dados.amortizacao_por_banco.itau).toBe('SAC')
    expect(dados.amortizacao_por_banco.santander).toBe('SAC')
    expect(dados.amortizacao_por_banco.bradesco).toBe('SAC')
    expect(dados.renda_formal).toBeNull()
    expect(dados.renda_informal).toBeNull()
    expect(dados.data_nascimento).toBeNull()
    expect(dados.prazo_maximo).toBe(true)

    // ── Motor: validação não deve exigir nascimento (exceção de prazo_maximo) ──
    const { validarParaSimulacao } = await import('../motor-simulacao')
    const validacao = validarParaSimulacao(dados)
    expect(validacao.camposFaltantes).not.toContain('Data de nascimento')

    const resultado = await executarSimulacao(dados, {})
    expect(resultado.input?.idadeEstimada).toBe(true)
    expect(resultado.input?.rendaInformada).toBe(false)
    expect(resultado.input?.amortizacaoPorBanco?.itau).toBe('SAC')

    // ── Engine: Itaú/Santander/Bradesco não podem ser bloqueados por "não oferece PRICE" ──
    const bancos = resultado.bancosResult ?? []
    for (const id of ['itau', 'santander', 'bradesco'] as const) {
      const r = bancos.find((b) => b.bancoId === id)
      expect(r).toBeDefined()
      expect(r?.tipoAmortizacao).toBe('SAC')
      expect(r?.motivoInelegivel).not.toBe('Não oferece financiamento na modalidade PRICE')
    }
    // Caixa continua tentando os dois cenários (SAC e PRICE) — neste caso real, o
    // financiado (850k/1.2M = 70,8% LTV) excede o teto normativo de 70% do PRICE da
    // Caixa, então só o SAC fica elegível (comportamento correto, não é bug: PRICE
    // inelegível é omitido por completo, ver `gerarCenariosComparativos`).
    const amortizacoesCaixa = new Set(bancos.filter((b) => b.bancoId === 'caixa').map((b) => b.tipoAmortizacao))
    expect(amortizacoesCaixa.has('SAC')).toBe(true)

    // ── calcularAnalise: sem Infinity%/maxFinanciavel=0 enganoso ──
    const analise = calcularAnalise(resultado.input!, bancos)
    expect(analise.comprometimentoRenda).toBeNull()
    expect(analise.maxFinanciavel).toBeNull()
    expect(analise.fatores.some((f) => f.descricao.includes('Renda insuficiente'))).toBe(false)

    // ── PDF servidor: idade estimada, renda não informada, sem "Infinity" ──
    await gerarPDFFinanciamentoBuffer({
      input: resultado.input!, bancos, analise, dataSimulacao: new Date().toISOString(),
    })
    expect(registrados.textos.some((t) => t.includes('Idade estimada'))).toBe(true)
    expect(registrados.textos).toContain('Não informada')
    expect(registrados.textos.some((t) => t.includes('Infinity'))).toBe(false)
    expect(registrados.textos.some((t) => t.includes('Itaú'))).toBe(true)
    expect(registrados.textos.some((t) => t.includes('Santander'))).toBe(true)
    expect(registrados.textos.some((t) => t.includes('Bradesco'))).toBe(true)

    // ── Texto do WhatsApp: sem Infinity, com disclaimers corretos ──
    const texto = montarRespostaSimulacao(resultado, { nomeDisplay: 'Cliente Teste' })
    expect(texto).not.toContain('Infinity')
    expect(texto).toContain('Renda: não informada')
    expect(texto).toContain('idade compatível para financiar no prazo máximo')
    expect(texto).toMatch(/Itaú.*SAC/)
    expect(texto).toMatch(/Santander.*SAC/)
    expect(texto).toMatch(/Bradesco.*SAC/)
  })

  it('2. reprocessamento de texto vazio (confirmação "sim") não deve perder prazo_maximo já capturado', async () => {
    const { normalizarPedidoSimulacao } = await import('../normalizador-captacao')
    const { executarWorkflowConsulta } = await import('../workflow-consulta')

    const dados1 = await normalizarPedidoSimulacao(TEXTO_CASO_REAL)
    expect(dados1.prazo_maximo).toBe(true) // pré-condição

    // Reproduz exatamente o caminho de _resimular (fonti-comandos.ts) ao responder "sim"
    // a uma pendência de confirmação: executarWorkflowConsulta('', { dados_pre_normalizados }).
    const resposta = await executarWorkflowConsulta('', {
      empresa_id: 'empresa-1',
      usuario_id: 'u1',
      usuario_nome: 'Operador Teste',
      supabase: criarSupabaseMock(),
      dados_pre_normalizados: dados1,
      vem_de_pendente: true,
    })

    expect(resposta).not.toContain('Data de nascimento')
    expect(resposta).not.toContain('Consulta incompleta')
  })
})
