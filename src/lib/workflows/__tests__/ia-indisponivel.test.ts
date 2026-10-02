/**
 * Regressão (2026-10-02): créditos da Anthropic esgotados → o parser engolia o erro e devolvia {},
 * e o *cria cliente respondia "Não consegui identificar o nome do cliente" para textos corretos.
 * Agora falha na chamada à IA vira IaIndisponivelError e o bot diz isso claramente.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { create } = vi.hoisted(() => ({ create: vi.fn() }))
vi.mock('@anthropic-ai/sdk', () => ({
  default: class { messages = { create } },
}))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: {} }))

import { parsearTextoCaptacao } from '../parser-captacao'
import { ehIaIndisponivel, MSG_IA_INDISPONIVEL } from '../iaIndisponivel'
import { executarWorkflowCaptacao } from '../workflow-captacao'
import { executarWorkflowConsulta } from '../workflow-consulta'

const erroCredito = () => Object.assign(new Error('400 Your credit balance is too low to access the Anthropic API.'), { status: 400 })
const ctx = { empresa_id: 'e', usuario_id: 'u', usuario_nome: 'Bruno', usuario_perfil: 'comercial', supabase: {} } as never

beforeEach(() => { create.mockClear() })

describe('parser com a IA fora', () => {
  it('falha na chamada → IaIndisponivelError', async () => {
    create.mockImplementation(async () => { throw erroCredito() })
    const err = await parsearTextoCaptacao('*cria cliente Fulano').catch(e => e)
    expect(err).toMatchObject({ name: 'IaIndisponivelError' })
    expect(ehIaIndisponivel(err)).toBe(true)
  })

  it('resposta ilegível continua devolvendo {} (não é indisponibilidade)', async () => {
    create.mockResolvedValue({ content: [{ type: 'text', text: 'isto não é json' }] })
    await expect(parsearTextoCaptacao('texto')).resolves.toEqual({})
  })
})

describe('bot responde a mensagem clara', () => {
  it('*cria cliente', async () => {
    create.mockImplementation(async () => { throw erroCredito() })
    const r = await executarWorkflowCaptacao('Márcio de Mello Fontinhas CPF 066.344.629-52 renda 12.525,98', ctx)
    expect(r).toBe(MSG_IA_INDISPONIVEL)
    expect(r).not.toMatch(/nome do cliente/)
  })

  it('*simula', async () => {
    create.mockImplementation(async () => { throw erroCredito() })
    await expect(executarWorkflowConsulta('imóvel 300 mil renda 10 mil', ctx)).resolves.toBe(MSG_IA_INDISPONIVEL)
  })
})
