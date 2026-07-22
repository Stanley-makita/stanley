import { describe, it, expect } from 'vitest'
import { createHmac } from 'crypto'
import { verificarAssinaturaWebhook } from '../verificarAssinaturaWebhook'

function assinar(rawBody: string, secret: string): string {
  return 'sha256=' + createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')
}

describe('verificarAssinaturaWebhook', () => {
  const secret = 'segredo-de-teste-123'
  const rawBody = '{"event": {"name":"close"},"document":{"key":"abc"}}'

  it('válido quando o hash confere', () => {
    const header = assinar(rawBody, secret)
    expect(verificarAssinaturaWebhook(rawBody, header, secret)).toEqual({ valido: true })
  })

  it('inválido quando o header está ausente', () => {
    expect(verificarAssinaturaWebhook(rawBody, null, secret)).toEqual({
      valido: false,
      motivo: 'header_ausente',
    })
  })

  it('inválido quando o header não começa com sha256=', () => {
    expect(verificarAssinaturaWebhook(rawBody, 'md5=abcdef', secret)).toEqual({
      valido: false,
      motivo: 'formato_invalido',
    })
  })

  it('inválido quando o hash tem tamanho errado (não comparável com segurança)', () => {
    expect(verificarAssinaturaWebhook(rawBody, 'sha256=deadbeef', secret)).toEqual({
      valido: false,
      motivo: 'formato_invalido',
    })
  })

  it('inválido quando o hash não confere (segredo errado)', () => {
    const header = assinar(rawBody, 'outro-segredo')
    expect(verificarAssinaturaWebhook(rawBody, header, secret)).toEqual({
      valido: false,
      motivo: 'hash_nao_confere',
    })
  })

  it('inválido quando o corpo foi alterado após a assinatura', () => {
    const header = assinar(rawBody, secret)
    const corpoAlterado = rawBody.replace('close', 'cancel')
    expect(verificarAssinaturaWebhook(corpoAlterado, header, secret)).toEqual({
      valido: false,
      motivo: 'hash_nao_confere',
    })
  })

  it('inválido quando o corpo é reformatado (mesmo conteúdo lógico, bytes diferentes)', () => {
    const header = assinar(rawBody, secret)
    const corpoReformatado = JSON.stringify(JSON.parse(rawBody))
    // Mesmo que o JSON seja "igual", bytes diferentes (espaçamento) quebram o hash —
    // documentado pela própria ClickSign como "não formate o JSON antes do cálculo".
    expect(verificarAssinaturaWebhook(corpoReformatado, header, secret)).toEqual({
      valido: false,
      motivo: 'hash_nao_confere',
    })
  })
})
