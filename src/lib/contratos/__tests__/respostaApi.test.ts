import { describe, it, expect } from 'vitest'
import { lerRespostaContrato } from '../respostaApi'

describe('erros de geração mostrados ao operador', () => {
  it('504 em texto não vaza SyntaxError de JSON', async () => {
    await expect(lerRespostaContrato(new Response('An error occurred with your deployment', { status: 504 }), 'entender a negociação')).rejects.toThrow('tempo de espera')
  })
  it('500 em HTML não aparece como HTML nem como token inesperado', async () => {
    await expect(lerRespostaContrato(new Response('<html>erro interno</html>', { status: 500 }), 'redigir')).rejects.toThrow('HTTP 500')
  })
  it('preserva o diagnóstico de validação retornado pela rota', async () => {
    await expect(lerRespostaContrato(Response.json({ error: 'Cláusula de financiamento ausente.' }, { status: 422 }), 'redigir')).rejects.toThrow('Cláusula de financiamento ausente')
  })
  it('distingue sessão expirada de falta de acesso', async () => {
    await expect(lerRespostaContrato(new Response('', { status: 401 }), 'gerar')).rejects.toThrow('sessão expirou')
    await expect(lerRespostaContrato(new Response('', { status: 403 }), 'gerar')).rejects.toThrow('não tem acesso')
  })
  it('aceita JSON válido e rejeita sucesso com resposta vazia', async () => {
    await expect(lerRespostaContrato(Response.json({ html: '<p>Contrato</p>' }), 'redigir')).resolves.toEqual({ html: '<p>Contrato</p>' })
    await expect(lerRespostaContrato(new Response(''), 'redigir')).rejects.toThrow('resposta inválida')
  })
})
