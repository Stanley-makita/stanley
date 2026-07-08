/**
 * *cria cliente com dado faltante (nascimento) e complemento numa mensagem posterior —
 * valida de ponta a ponta a correção do Commit 3 (telefone_operador habilitando
 * simula_pendente) através do próprio executarWorkflowCaptacao, não só da checagem de
 * "o parâmetro chegou" feita em fonti-comandos.test.ts.
 *
 * Mocka: parser LLM (Anthropic), Pessoa/Lead/Documentos (via @/lib/pessoa e um Supabase
 * genérico encadeável), e captura a chamada real a salvarSimulaPendente para simular a
 * mensagem de complemento como se fosse a resposta do operador completando a pendência.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const TEXTO_INICIAL = 'João Pedro Silva, CPF 123.456.789-00, imóvel 400 mil, entrada 150 mil, renda 12 mil, quero simular Caixa'
const TEXTO_COMPLEMENTO = 'nascimento 10/05/1990'

const RESPOSTAS_PARSER: Record<string, unknown> = {
  [TEXTO_INICIAL]: {
    nome: 'João Pedro Silva',
    cpf: '123.456.789-00',
    valor_imovel: 400_000,
    valor_entrada: 150_000,
    renda_formal: 12_000,
    bancos_raw: ['Caixa'],
    solicitar_simulacao: true,
    data_nascimento: null,
  },
  [TEXTO_COMPLEMENTO]: {
    data_nascimento: '10/05/1990',
  },
}

vi.mock('@anthropic-ai/sdk', () => ({
  default: class AnthropicMock {
    messages = {
      create: async (params: { messages: Array<{ content: string }> }) => {
        const texto = params.messages[0].content
        const raw = RESPOSTAS_PARSER[texto] ?? {}
        return { content: [{ type: 'text', text: JSON.stringify(raw) }] }
      },
    }
  },
}))

vi.mock('@/lib/pessoa', () => ({
  buscarPessoaPorCpf: vi.fn().mockResolvedValue(null),
  buscarPessoaPorTelefone: vi.fn().mockResolvedValue(null),
  buscarOuCriarPessoa: vi.fn().mockResolvedValue('pessoa-1'),
}))

const salvarSimulaPendenteMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
vi.mock('../simula-pendente', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../simula-pendente')>()
  return { ...actual, salvarSimulaPendente: salvarSimulaPendenteMock }
})

// Supabase genérico e encadeável — cada método devolve a própria chain (thenable por
// padrão); 'fases' e 'leads' têm overrides pontuais para permitir a criação do Lead.
function makeChain(overrides: Partial<Record<string, unknown>> = {}): any {
  const chain: any = {
    eq: () => chain, is: () => chain, in: () => chain, gte: () => chain, not: () => chain,
    order: () => chain, limit: () => chain, select: () => chain,
    insert: () => chain, update: () => chain, upsert: () => chain, delete: () => chain,
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    single: () => Promise.resolve({ data: { id: 'generic-1' }, error: null }),
    then: (resolve: (v: { data: unknown[]; error: null }) => void) => resolve({ data: [], error: null }),
    ...overrides,
  }
  return chain
}

function criarSupabaseMockCaptacao(): any {
  const generic = makeChain()
  const fasesChain = makeChain({ maybeSingle: () => Promise.resolve({ data: { id: 'fase-1' }, error: null }) })
  const leadsChain = makeChain({ single: () => Promise.resolve({ data: { id: 'lead-1' }, error: null }) })

  return {
    from: (table: string) => {
      if (table === 'fases') return fasesChain
      if (table === 'leads') return leadsChain
      return generic
    },
  }
}

beforeEach(() => {
  salvarSimulaPendenteMock.mockClear()
})

describe('*cria cliente — dado faltante + complemento posterior', () => {
  it('pede a data de nascimento faltante e salva a pendência (telefone_operador presente)', async () => {
    const { executarWorkflowCaptacao } = await import('../workflow-captacao')

    const resposta = await executarWorkflowCaptacao(TEXTO_INICIAL, {
      empresa_id: 'empresa-1',
      usuario_id: 'u1',
      usuario_nome: 'Operador Teste',
      supabase: criarSupabaseMockCaptacao(),
      telefone_operador: 'op-1',
      telefone_remetente: 'op-1',
    })

    expect(resposta).toContain('Faltam os seguintes dados')
    expect(resposta).toContain('Data de nascimento')
    expect(salvarSimulaPendenteMock).toHaveBeenCalledTimes(1)
  })

  it('completa a simulação quando o nascimento chega numa mensagem posterior (merge de pendência)', async () => {
    const { executarWorkflowCaptacao } = await import('../workflow-captacao')
    const { mergeCapturados } = await import('../simula-pendente')
    const { normalizarPedidoSimulacao } = await import('../normalizador-captacao')

    // Reproduz o dadosCapturados que teria sido salvo na pendência do teste anterior.
    const dados1 = await normalizarPedidoSimulacao(TEXTO_INICIAL)
    expect(dados1.data_nascimento).toBeNull() // pré-condição

    const resposta = await executarWorkflowCaptacao(TEXTO_COMPLEMENTO, {
      empresa_id: 'empresa-1',
      usuario_id: 'u1',
      usuario_nome: 'Operador Teste',
      supabase: criarSupabaseMockCaptacao(),
      telefone_operador: 'op-1',
      telefone_remetente: 'op-1',
      vem_de_pendente: true,
      dados_pre_normalizados: dados1,
      lead_id_existente: 'lead-1',
      pessoa_id_existente: 'pessoa-1',
    })

    expect(resposta).not.toContain('Faltam os seguintes dados')
    expect(resposta).toContain('Motor de Crédito executado')
    expect(resposta).toContain('Caixa')

    // mergeCapturados isolado: confirma que a data de nascimento realmente se combina
    // com os dados já capturados (nome, imóvel, etc. do dados1).
    const complemento = await normalizarPedidoSimulacao(TEXTO_COMPLEMENTO)
    const mesclado = mergeCapturados(dados1, complemento)
    expect(mesclado.data_nascimento).toBe('1990-05-10')
    expect(mesclado.valor_imovel).toBe(400_000)
  })
})
