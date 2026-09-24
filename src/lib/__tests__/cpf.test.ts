import { describe, it, expect } from 'vitest'
import { cpfValido, normalizarCpfValido } from '../cpf'

describe('cpfValido', () => {
  it('aceita CPF válido, com ou sem máscara', () => {
    expect(cpfValido('03667781962')).toBe(true)
    expect(cpfValido('036.677.819-62')).toBe(true)
  })

  it('recusa celular com DDD (11 dígitos) — caso real do *cria cliente', () => {
    expect(cpfValido('44984558945')).toBe(false)
  })

  it('recusa dígito verificador errado, sequência repetida e tamanho errado', () => {
    expect(cpfValido('03667781961')).toBe(false)
    expect(cpfValido('11111111111')).toBe(false)
    expect(cpfValido('0366778196')).toBe(false)
    expect(cpfValido('')).toBe(false)
    expect(cpfValido(null)).toBe(false)
  })
})

describe('normalizarCpfValido', () => {
  it('devolve só dígitos quando válido, null quando não', () => {
    expect(normalizarCpfValido('036.677.819-62')).toBe('03667781962')
    expect(normalizarCpfValido('44984558945')).toBeNull()
  })
})

describe('extrairCpfBrutoDoTexto (fallback do *cria cliente)', () => {
  it('não pega o telefone solto como CPF — mensagem real de 2026-09-24', async () => {
    const { extrairCpfBrutoDoTexto } = await import('@/lib/workflows/normalizador-captacao')
    const msg = '*cria cliente Luciana Fontinhas\n44984558945\nimovel 400000\nfinanciando 200000\ndata de nascimento 20/05/2000\nrenda 15000\nja simula'
    expect(extrairCpfBrutoDoTexto(msg)).toBeNull()
  })

  it('pula o telefone e acha o CPF válido que vem depois', async () => {
    const { extrairCpfBrutoDoTexto } = await import('@/lib/workflows/normalizador-captacao')
    expect(extrairCpfBrutoDoTexto('tel 44984558945 cpf 036.677.819-62')).toBe('03667781962')
  })
})
