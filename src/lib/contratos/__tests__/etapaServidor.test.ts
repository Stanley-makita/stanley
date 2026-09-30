import { afterEach, describe, expect, it, vi } from 'vitest'
import { executarEtapaContrato } from '../etapaServidor'

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })
describe('prazo das etapas de contrato', () => {
  it('devolve JSON 504 antes do corte de 120 segundos da hospedagem', async () => {
    vi.useFakeTimers()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const pendente = executarEtapaContrato('entender a negociação', () => new Promise(() => {}))
    await vi.advanceTimersByTimeAsync(105000)
    const resposta = await pendente
    expect(resposta.status).toBe(504)
    expect((await resposta.json()).error).toContain('tempo de espera')
    expect(vi.getTimerCount()).toBe(0)
  })
  it('falha antes da chamada de IA também retorna JSON sem expor o erro interno', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const resposta = await executarEtapaContrato('entender', async () => { throw new Error('segredo do provedor') })
    expect(resposta.status).toBe(500)
    expect(await resposta.text()).not.toContain('segredo')
  })
})
