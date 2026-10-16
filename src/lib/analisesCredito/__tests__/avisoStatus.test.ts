import { describe, it, expect } from 'vitest'
import { decidirAviso, montarMensagemAviso, statusAnaliseValido } from '../avisoStatus'

const base = {
  statusPedido: 'aprovado' as const,
  statusAtual: 'aprovado' as const,
  ultimoAvisado: 'em_analise' as const,
  comercialId: 'comercial-1',
  atorId: 'operacional-1',
}

describe('decidirAviso', () => {
  it('avisa quando o status final é novo e quem mudou não é o comercial', () => {
    expect(decidirAviso(base)).toEqual({ acao: 'avisar' })
  })

  it('avisa "Em análise" na criação (ainda nada avisado)', () => {
    expect(decidirAviso({ ...base, statusPedido: 'em_analise', statusAtual: 'em_analise', ultimoAvisado: null }))
      .toEqual({ acao: 'avisar' })
  })

  it('não avisa se o status mudou de novo durante a espera', () => {
    expect(decidirAviso({ ...base, statusAtual: 'pendente' }))
      .toEqual({ acao: 'ignorar', motivo: 'status_mudou_de_novo' })
  })

  it('não avisa se voltou ao último status avisado', () => {
    expect(decidirAviso({ ...base, statusPedido: 'em_analise', statusAtual: 'em_analise', ultimoAvisado: 'em_analise' }))
      .toEqual({ acao: 'ignorar', motivo: 'ja_avisado' })
  })

  it('não avisa sem comercial vinculado', () => {
    expect(decidirAviso({ ...base, comercialId: null }))
      .toEqual({ acao: 'ignorar', motivo: 'sem_comercial' })
  })

  it('só marca como avisado quando quem mudou é o próprio comercial do cliente', () => {
    expect(decidirAviso({ ...base, atorId: 'comercial-1' })).toEqual({ acao: 'marcar_sem_enviar' })
  })
})

describe('montarMensagemAviso', () => {
  it('traz cliente, banco, status e quem atualizou', () => {
    const msg = montarMensagemAviso({ clienteNome: 'FRANCISCO ALVES DA SILVA', bancoNome: 'Santander', status: 'recusado', alteradoPor: 'Ana' })
    expect(msg).toContain('*FRANCISCO ALVES DA SILVA — Santander*')
    expect(msg).toContain('*Recusado*')
    expect(msg).toContain('Atualizado por Ana.')
  })

  it('sem banco não deixa travessão sobrando', () => {
    const msg = montarMensagemAviso({ clienteNome: 'JOÃO', bancoNome: null, status: 'aprovado', alteradoPor: null })
    expect(msg).toContain('*JOÃO*')
    expect(msg).not.toContain('Atualizado por')
  })
})

describe('statusAnaliseValido', () => {
  it('aceita só os 4 status', () => {
    expect(statusAnaliseValido('pendente')).toBe(true)
    expect(statusAnaliseValido('cancelado')).toBe(false)
    expect(statusAnaliseValido(undefined)).toBe(false)
  })
})
