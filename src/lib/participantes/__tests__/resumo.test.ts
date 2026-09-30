import { describe, it, expect } from 'vitest'
import {
  compradoresDaProposta, vendedoresDaProposta, nomeTitular, comListasDeParticipantes, comoLeadVendedores,
  type ParticipacaoEmbed,
} from '../resumo'

const p = (id: string, nome: string, extra: Record<string, unknown> = {}) => ({ id, nome, cpf: null, deleted_at: null, ...extra })

const heitor:  ParticipacaoEmbed = { id: 'pa1', papel: 'titular',         ordem: 1, pessoa: p('h', 'Heitor', { cpf: '52998224725' }) }
const afranio: ParticipacaoEmbed = { id: 'pa2', papel: 'coparticipante',  ordem: 3, pessoa: [p('a', 'Afrânio')] }
const maria:   ParticipacaoEmbed = { id: 'pa3', papel: 'conjuge_anuente', ordem: 2, pessoa: p('m', 'Maria') }
const vend:    ParticipacaoEmbed = { id: 'pa4', papel: 'vendedor',        ordem: 1, pessoa: p('v', 'Vera') }
const cvend:   ParticipacaoEmbed = { id: 'pa5', papel: 'conjuge_vendedor', ordem: 2, pessoa: p('cv', 'Caio') }

describe('compradoresDaProposta', () => {
  it('titular primeiro, depois ordem; só papéis de compra; embed em array ou objeto', () => {
    const r = compradoresDaProposta([afranio, vend, maria, heitor])
    expect(r.map(c => c.nome)).toEqual(['Heitor', 'Maria', 'Afrânio'])
    expect(r[0]).toEqual({ id: 'pa1', pessoa_id: 'h', nome: 'Heitor', cpf: '52998224725', papel: 'titular', principal: true })
  })
  it('principal só para o titular (cônjuge anuente nunca é principal)', () => {
    const r = compradoresDaProposta([heitor, maria])
    expect(r.find(c => c.papel === 'conjuge_anuente')?.principal).toBe(false)
  })
  it('sem titular: devolve os demais compradores, nenhum principal', () => {
    const r = compradoresDaProposta([afranio, maria])
    expect(r.map(c => c.nome)).toEqual(['Maria', 'Afrânio'])
    expect(r.some(c => c.principal)).toBe(false)
  })
  it('ignora Pessoa excluída (soft delete) e embed nulo', () => {
    const excluida: ParticipacaoEmbed = { id: 'pa9', papel: 'titular', ordem: 1, pessoa: p('x', 'Excluída', { deleted_at: '2026-09-01' }) }
    const nula: ParticipacaoEmbed = { id: 'pa8', papel: 'coparticipante', ordem: 2, pessoa: null }
    expect(compradoresDaProposta([excluida, nula, afranio]).map(c => c.nome)).toEqual(['Afrânio'])
  })
  it('entrada vazia/nula', () => {
    expect(compradoresDaProposta(null)).toEqual([])
    expect(compradoresDaProposta(undefined)).toEqual([])
  })
})

describe('vendedoresDaProposta', () => {
  it('só papel vendedor (cônjuge do vendedor só assina, não é listado como vendedor)', () => {
    expect(vendedoresDaProposta([heitor, vend, cvend]).map(v => v.nome)).toEqual(['Vera'])
  })
})

describe('nomeTitular', () => {
  it('nome do titular; sem titular, o 1º comprador; sem ninguém, null', () => {
    expect(nomeTitular([maria, heitor])).toBe('Heitor')
    expect(nomeTitular([afranio])).toBe('Afrânio')
    expect(nomeTitular([vend])).toBeNull()
    expect(nomeTitular(null)).toBeNull()
  })
})

describe('comListasDeParticipantes', () => {
  it('troca participantes por compradores/vendedores e preserva o resto da linha', () => {
    const r = comListasDeParticipantes({ id: 'proc1', nome_imovel: 'Apto', participantes: [heitor, vend] })
    expect(r).toEqual({
      id: 'proc1', nome_imovel: 'Apto',
      compradores: [{ id: 'pa1', pessoa_id: 'h', nome: 'Heitor', cpf: '52998224725', papel: 'titular', principal: true }],
      vendedores: [{ id: 'pa4', pessoa_id: 'v', nome: 'Vera', cpf: null, papel: 'vendedor', principal: false }],
    })
    expect('participantes' in r).toBe(false)
  })
})

describe('comoLeadVendedores', () => {
  it('formato LeadVendedor (id, pessoa_id, pessoa{id,nome,cpf}); vazio quando não há vendedor', () => {
    expect(comoLeadVendedores([heitor, vend])).toEqual([{ id: 'pa4', pessoa_id: 'v', pessoa: { id: 'v', nome: 'Vera', cpf: null } }])
    expect(comoLeadVendedores([])).toEqual([])
  })
})
