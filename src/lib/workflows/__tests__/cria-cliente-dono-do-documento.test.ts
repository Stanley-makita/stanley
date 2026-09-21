/**
 * Regressão (2026-09-21): `*cria cliente` vinculava os documentos da conversa ao lead mas nunca
 * trocava `documentos.pessoa_id` para a Pessoa do cliente — o documento ficava no dono provisório
 * (ou na pessoa do próprio operador). O dono tem que ser SEMPRE a pessoa do cliente.
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = {
      create: async () => ({ content: [{ type: 'text', text: JSON.stringify({ nome: 'Enoque Francisco', cpf: null }) }] }),
    }
  },
}))

vi.mock('@/lib/pessoa', () => ({
  buscarPessoaPorCpf: vi.fn().mockResolvedValue(null),
  buscarPessoaPorTelefone: vi.fn().mockResolvedValue(null),
  buscarOuCriarPessoa: vi.fn().mockResolvedValue('pessoa-cliente'),
  confirmarIdentidadePessoa: vi.fn(),
}))

type Chamada = { tabela: string; op: string; args: unknown[] }

function criarSupabase(chamadas: Chamada[]) {
  const recente = new Date().toISOString()
  const makeChain = (tabela: string, dados: unknown[], single: unknown = null): any => {
    const chain: any = {}
    for (const m of ['eq', 'is', 'in', 'gte', 'not', 'order', 'limit', 'select', 'ilike']) {
      chain[m] = (...args: unknown[]) => { chamadas.push({ tabela, op: m, args }); return chain }
    }
    for (const m of ['insert', 'update', 'upsert', 'delete']) {
      chain[m] = (...args: unknown[]) => { chamadas.push({ tabela, op: m, args }); return chain }
    }
    chain.maybeSingle = () => Promise.resolve({ data: single, error: null })
    chain.single = () => Promise.resolve({ data: single ?? { id: 'lead-1' }, error: null })
    chain.then = (res: (v: unknown) => unknown) => res({ data: dados, error: null })
    return chain
  }
  return {
    from: (tabela: string) => {
      if (tabela === 'fases') return makeChain(tabela, [], { id: 'fase-1' })
      if (tabela === 'leads') return makeChain(tabela, [], { id: 'lead-1' })
      if (tabela === 'conversas') return makeChain(tabela, [], { pessoa_id: 'pessoa-operador' })
      if (tabela === 'documentos') {
        return makeChain(tabela, [{ id: 'doc-1', nome_original: 'holerite.pdf', recebido_em: recente }])
      }
      return makeChain(tabela, [])
    },
  }
}

describe('*cria cliente — dono do documento', () => {
  it('troca documentos.pessoa_id para a pessoa do cliente ao vincular ao lead', async () => {
    const { executarWorkflowCaptacao } = await import('../workflow-captacao')
    const chamadas: Chamada[] = []

    await executarWorkflowCaptacao('Enoque Francisco', {
      empresa_id: 'e1', usuario_id: 'u1', usuario_nome: 'Bruno', usuario_perfil: 'comercial',
      supabase: criarSupabase(chamadas) as never,
      telefone_remetente: '5544997180119', telefone_operador: '5544997180119',
      arquivos: [],
    } as never)

    const vinculoLead = chamadas.find((c) => c.tabela === 'documento_vinculos' && c.op === 'insert')
    expect(vinculoLead).toBeDefined()

    const trocaDono = chamadas.find(
      (c) => c.tabela === 'documentos' && c.op === 'update'
        && (c.args[0] as { pessoa_id?: string })?.pessoa_id === 'pessoa-cliente',
    )
    expect(trocaDono).toBeDefined()
  })
})
