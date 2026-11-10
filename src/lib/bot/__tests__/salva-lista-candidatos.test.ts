/**
 * Caso real 09/11/2026: `*salva Jaqueline` listou 3 "JAQUELINE CORDEIRO..." sem diferença nenhuma; a cliente de
 * verdade (CPF + lead) era a 3ª e o comercial escolheu a 1ª — um cadastro duplicado solto — e os documentos
 * ficaram fora do lead. A lista agora põe quem tem lead primeiro e mostra CPF (final) e lead de cada um.
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/pessoa', () => ({ buscarOuCriarPessoa: vi.fn() }))
vi.mock('@/lib/workflows/workflow-captacao', () => ({ executarWorkflowCaptacao: vi.fn() }))

const candidatos = [
  { id: 'dup1', nome: 'JAQUELINE CORDEIRO RIBEIRO DE MACENA' },
  { id: 'dup2', nome: 'JAQUELINE CORDEIRO R. DE MACENA' },
  { id: 'real', nome: 'JAQUELINE CORDEIRO RIBEIRO DE MACENA' },
]
const info = new Map([
  ['dup1', { cpf: null, temLead: false, faseLead: null }],
  ['dup2', { cpf: null, temLead: false, faseLead: null }],
  ['real', { cpf: '06808744963', temLead: true, faseLead: 'Documentação' }],
])

describe('ordenarCandidatosSalva', () => {
  it('cliente com lead e CPF vem primeiro, com o detalhe; duplicados soltos depois, na ordem original', async () => {
    const { ordenarCandidatosSalva } = await import('../fonti-comandos')
    const r = ordenarCandidatosSalva(candidatos, info, 'Jaqueline')
    expect(r.map(c => c.id)).toEqual(['real', 'dup1', 'dup2'])
    expect(r[0].detalhe).toBe('CPF final 449-63 · Lead: Documentação')
    expect(r[1].detalhe).toBe('sem CPF · sem lead')
  })

  it('nome exato continua vencendo (caso "*salva joao" com uma pessoa chamada só "Joao")', async () => {
    const { ordenarCandidatosSalva } = await import('../fonti-comandos')
    const r = ordenarCandidatosSalva(
      [{ id: 'a', nome: 'Joao Silva' }, { id: 'b', nome: 'Joao' }],
      new Map([['a', { cpf: '06808744963', temLead: true, faseLead: null }], ['b', { cpf: null, temLead: false, faseLead: null }]]),
      'joao',
    )
    expect(r.map(c => c.id)).toEqual(['b', 'a'])
  })

  it('sem informação (consulta falhou) mantém a ordem e não inventa detalhe', async () => {
    const { ordenarCandidatosSalva } = await import('../fonti-comandos')
    const r = ordenarCandidatosSalva(candidatos, new Map(), 'Jaqueline')
    expect(r).toEqual(candidatos)
  })
})

describe('formatarListaCandidatosSalva', () => {
  it('mostra o detalhe embaixo do nome e avisa sobre cadastro sem CPF e sem lead', async () => {
    const { ordenarCandidatosSalva, formatarListaCandidatosSalva } = await import('../fonti-comandos')
    const texto = formatarListaCandidatosSalva(ordenarCandidatosSalva(candidatos, info, 'Jaqueline'), 'Jaqueline')
    expect(texto).toContain('1. JAQUELINE CORDEIRO RIBEIRO DE MACENA\n   _CPF final 449-63 · Lead: Documentação_')
    expect(texto).toContain('costuma ser cadastro duplicado')
    expect(texto).toContain('*fonti salva 1')
  })

  it('sem candidato solto, sem aviso', async () => {
    const { formatarListaCandidatosSalva } = await import('../fonti-comandos')
    const texto = formatarListaCandidatosSalva([
      { id: 'a', nome: 'Ana Souza', detalhe: 'CPF final 449-63 · Lead' },
      { id: 'b', nome: 'Ana Lima', detalhe: 'CPF final 111-11 · sem lead' },
    ], 'ana')
    expect(texto).not.toContain('duplicado')
  })
})
