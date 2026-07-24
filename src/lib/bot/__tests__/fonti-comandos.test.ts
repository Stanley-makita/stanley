/**
 * `*cria cliente` chamado direto (sem vir de um lead resolvido por `*simula`) não passava
 * `telefone_operador` para `executarWorkflowCaptacao` — isso desativava silenciosamente a
 * criação de `simula_pendente` (workflow-captacao.ts só salva/limpa pendência quando
 * `ctx.telefone_operador` é truthy). Resultado: se faltasse um dado durante `*cria cliente`,
 * o Fonti pedia o dado faltante mas nunca gravava a pendência — a resposta seguinte do
 * operador não seria roteada de volta para completar a simulação.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const executarWorkflowCaptacaoMock = vi.hoisted(() => vi.fn().mockResolvedValue('ok'))

vi.mock('@/lib/workflows/workflow-captacao', () => ({
  executarWorkflowCaptacao: executarWorkflowCaptacaoMock,
}))

// fonti-comandos.ts importa @/lib/pessoa, que cria um client Supabase real a partir de
// env vars no topo do módulo — mockado aqui só para permitir o import em teste, não é
// usado por este cenário (*cria cliente direto não passa por buscarOuCriarPessoa).
vi.mock('@/lib/pessoa', () => ({
  buscarOuCriarPessoa: vi.fn(),
}))

const TELEFONE_OPERADOR = '5544999999999'

function criarSupabaseMock(): SupabaseClient {
  const usuarios = [{ id: 'u1', nome: 'Operador Teste', telefone: TELEFONE_OPERADOR, telefone_whatsapp: null }]
  return {
    from: (table: string) => {
      if (table !== 'usuarios') throw new Error(`tabela inesperada no mock: ${table}`)
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              is: () => Promise.resolve({ data: usuarios, error: null }),
            }),
          }),
        }),
      }
    },
  } as unknown as SupabaseClient
}

beforeEach(() => {
  executarWorkflowCaptacaoMock.mockClear()
})

describe('processarComandoFonti — *cria cliente direto', () => {
  it('passa telefone_operador para executarWorkflowCaptacao (necessário para simula_pendente)', async () => {
    const { processarComandoFonti } = await import('../fonti-comandos')

    await processarComandoFonti('*cria cliente João Silva, imóvel 300 mil, nascimento 10/05/1990', {
      empresa_id: 'empresa-1',
      telefone_remetente: TELEFONE_OPERADOR,
      supabase: criarSupabaseMock(),
      arquivos: [],
    })

    expect(executarWorkflowCaptacaoMock).toHaveBeenCalledTimes(1)
    const [, ctxPassado] = executarWorkflowCaptacaoMock.mock.calls[0]
    expect(ctxPassado.telefone_operador).toBe(TELEFONE_OPERADOR)
  })
})

function criarSupabaseMockComOperador(telefoneOperador: string): SupabaseClient {
  const usuarios = [{ id: 'u1', nome: 'Operador Teste', perfil: 'comercial', telefone: telefoneOperador, telefone_whatsapp: null }]
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            is: () => Promise.resolve({ data: usuarios, error: null }),
          }),
        }),
      }),
    }),
  } as unknown as SupabaseClient
}

describe('verificarUsuarioInterno', () => {
  it('não confunde cliente de outro DDD com o mesmo final de 8 dígitos de um operador', async () => {
    const { verificarUsuarioInterno } = await import('../fonti-comandos')
    // Operador: DDD 44, local "912345678" — mesmo final de 8 dígitos ("12345678")
    // de um cliente de DDD 11 completamente diferente.
    const supabase = criarSupabaseMockComOperador('5544912345678')
    const resultado = await verificarUsuarioInterno(supabase, 'empresa-1', '5511912345678')
    expect(resultado).toBeNull()
  })

  it('reconhece o operador mesmo com a variação do dígito "9" do celular', async () => {
    const { verificarUsuarioInterno } = await import('../fonti-comandos')
    // Operador cadastrado sem o "9" extra; mensagem chega com o "9" (mesmo DDD).
    const supabase = criarSupabaseMockComOperador('554412345678')
    const resultado = await verificarUsuarioInterno(supabase, 'empresa-1', '5544912345678')
    expect(resultado?.id).toBe('u1')
  })
})
