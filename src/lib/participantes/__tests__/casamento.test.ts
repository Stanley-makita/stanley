import { describe, it, expect } from 'vitest'
import { planoCasamento } from '../casamento'

describe('planoCasamento', () => {
  it('liga os dois quando ninguém é casado', () => {
    expect(planoCasamento({ conjugeAtualDe: { a: null, m: null } }, 'a', 'm')).toEqual({ encerrar: [], ligar: ['a', 'm'] })
  })
  it('já casados entre si: nada a encerrar', () => {
    expect(planoCasamento({ conjugeAtualDe: { a: 'm', m: 'a' } }, 'a', 'm')).toEqual({ encerrar: [], ligar: ['a', 'm'] })
  })
  it('escolhido casado com outra pessoa: encerra esse casamento (os dois lados)', () => {
    expect(planoCasamento({ conjugeAtualDe: { a: null, m: 'x', x: 'm' } }, 'a', 'm')).toEqual({ encerrar: ['m', 'x'], ligar: ['a', 'm'] })
  })
  it('a pessoa já era casada com outra: encerra o antigo', () => {
    expect(planoCasamento({ conjugeAtualDe: { a: 'y', y: 'a', m: null } }, 'a', 'm')).toEqual({ encerrar: ['a', 'y'], ligar: ['a', 'm'] })
  })
  it('desvincular: zera os dois lados, não liga ninguém', () => {
    expect(planoCasamento({ conjugeAtualDe: { a: 'm', m: 'a' } }, 'a', null)).toEqual({ encerrar: ['a', 'm'], ligar: null })
  })
  it('nunca casa a pessoa com ela mesma', () => {
    expect(() => planoCasamento({ conjugeAtualDe: { a: null } }, 'a', 'a')).toThrow('mesma pessoa')
  })
})
