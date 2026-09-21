/**
 * `*fonti processo` respondia "não tem processos aptos" para todo cliente (achado real,
 * 2026-09-21) por dois erros de consulta que o PostgREST rejeita por inteiro:
 *  1. o filtro de status bloqueados incluía 'concluido'/'arquivado', que não existem no enum
 *     `status_processo` (em_analise, aprovado, pendente, reprovado, cancelado);
 *  2. o select pedia a coluna `banco`, que não existe em `processos` (só `banco_id`).
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/pessoa', () => ({ buscarOuCriarPessoa: vi.fn() }))
vi.mock('@/lib/workflows/workflow-captacao', () => ({ executarWorkflowCaptacao: vi.fn() }))

const ENUM_STATUS_PROCESSO = ['em_analise', 'aprovado', 'pendente', 'reprovado', 'cancelado']

describe('consulta de processos aptos do bot', () => {
  it('só bloqueia status que existem no enum do banco', async () => {
    const { STATUS_BLOQUEADOS_PROCESSO } = await import('../fonti-comandos')
    for (const st of STATUS_BLOQUEADOS_PROCESSO) expect(ENUM_STATUS_PROCESSO).toContain(st)
    expect(STATUS_BLOQUEADOS_PROCESSO).toEqual(expect.arrayContaining(['reprovado', 'cancelado']))
  })

  it('não pede a coluna inexistente `banco` e busca o nome pela relação', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const fonte = readFileSync(resolve(__dirname, '../fonti-comandos.ts'), 'utf8')
    expect(fonte).not.toMatch(/\.select\('id, numero_processo, banco, valor_imovel'\)/)
    expect(fonte).toContain('bancos!banco_id(nome)')
  })
})
