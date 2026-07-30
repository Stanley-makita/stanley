import { describe, it, expect } from 'vitest'
import {
  estadoParaBooleano, booleanoParaEstado, planejarPermissoesIndividuais,
} from '../permissoesIndividuaisHelpers'

describe('estadoParaBooleano / booleanoParaEstado', () => {
  it('herdar <-> undefined (ausência de linha em usuario_permissoes)', () => {
    expect(estadoParaBooleano('herdar')).toBeUndefined()
    expect(booleanoParaEstado(undefined)).toBe('herdar')
  })

  it('permitir <-> true', () => {
    expect(estadoParaBooleano('permitir')).toBe(true)
    expect(booleanoParaEstado(true)).toBe('permitir')
  })

  it('bloquear <-> false', () => {
    expect(estadoParaBooleano('bloquear')).toBe(false)
    expect(booleanoParaEstado(false)).toBe('bloquear')
  })
})

describe('planejarPermissoesIndividuais', () => {
  it('"herdar" sem override prévio: nenhuma escrita (nada a fazer)', () => {
    const plano = planejarPermissoesIndividuais(
      { 'leads.ver_todas': 'herdar' },
      new Map(),
    )
    expect(plano.upserts).toEqual([])
    expect(plano.deletes).toEqual([])
  })

  it('"herdar" com override prévio: gera delete (volta a herdar do perfil)', () => {
    const plano = planejarPermissoesIndividuais(
      { 'leads.ver_todas': 'herdar' },
      new Map([['leads.ver_todas', true]]),
    )
    expect(plano.deletes).toEqual(['leads.ver_todas'])
    expect(plano.upserts).toEqual([])
  })

  it('"permitir" sem override prévio: gera upsert permitido=true', () => {
    const plano = planejarPermissoesIndividuais(
      { 'leads.redistribuir': 'permitir' },
      new Map(),
    )
    expect(plano.upserts).toEqual([{ acao: 'leads.redistribuir', permitido: true }])
  })

  it('"bloquear" sem override prévio: gera upsert permitido=false', () => {
    const plano = planejarPermissoesIndividuais(
      { 'leads.redistribuir': 'bloquear' },
      new Map(),
    )
    expect(plano.upserts).toEqual([{ acao: 'leads.redistribuir', permitido: false }])
  })

  it('valor selecionado já bate com o override existente: nenhuma escrita', () => {
    const plano = planejarPermissoesIndividuais(
      { 'leads.ver_todas': 'permitir' },
      new Map([['leads.ver_todas', true]]),
    )
    expect(plano.upserts).toEqual([])
    expect(plano.deletes).toEqual([])
  })

  it('troca de permitir pra bloquear (override já existia): gera upsert, não delete', () => {
    const plano = planejarPermissoesIndividuais(
      { 'leads.ver_todas': 'bloquear' },
      new Map([['leads.ver_todas', true]]),
    )
    expect(plano.upserts).toEqual([{ acao: 'leads.ver_todas', permitido: false }])
    expect(plano.deletes).toEqual([])
  })

  it('resolve múltiplas ações independentemente no mesmo plano', () => {
    const plano = planejarPermissoesIndividuais(
      { 'leads.ver_todas': 'permitir', 'leads.redistribuir': 'herdar' },
      new Map([['leads.redistribuir', false]]),
    )
    expect(plano.upserts).toEqual([{ acao: 'leads.ver_todas', permitido: true }])
    expect(plano.deletes).toEqual(['leads.redistribuir'])
  })
})
