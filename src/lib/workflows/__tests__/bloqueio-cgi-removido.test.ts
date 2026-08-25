/**
 * Garante que CGI_HOME_EQUITY não está mais nas listas de produtos bloqueados do
 * *simula avulso (workflow-consulta.ts) nem do *cria cliente (workflow-captacao.ts) —
 * evita regressão da própria feature (alguém reintroduzir o bloqueio sem querer).
 *
 * Teste de texto-fonte (não de comportamento em runtime) porque montar um mock completo
 * de SupabaseClient + Uazapi só para isto adicionaria complexidade desproporcional ao
 * que se quer garantir aqui: a lista estática de produtos bloqueados.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

function lerBlocoBloqueio(arquivo: string, marcador: string): string {
  const conteudo = readFileSync(join(__dirname, '..', arquivo), 'utf-8')
  const inicio = conteudo.indexOf(marcador)
  expect(inicio, `marcador "${marcador}" não encontrado em ${arquivo}`).toBeGreaterThan(-1)
  return conteudo.slice(inicio, inicio + 400)
}

describe('CGI_HOME_EQUITY não está mais bloqueado', () => {
  it('workflow-consulta.ts (*simula avulso)', () => {
    const bloco = lerBlocoBloqueio('workflow-consulta.ts', 'const PRODUTOS_BLOQUEADOS:')
    expect(bloco).not.toContain('CGI_HOME_EQUITY')
    expect(bloco).toContain('CONSORCIO')
    expect(bloco).toContain('PORTABILIDADE')
  })

  it('workflow-captacao.ts (*cria cliente)', () => {
    const bloco = lerBlocoBloqueio('workflow-captacao.ts', 'const PRODUTOS_BLOQUEADOS_CAPTACAO:')
    expect(bloco).not.toContain('CGI_HOME_EQUITY')
    expect(bloco).toContain('CONSORCIO')
    expect(bloco).toContain('PORTABILIDADE')
  })

  it('ambos os workflows roteiam CGI_HOME_EQUITY para executarFluxoCgi', () => {
    const consulta = readFileSync(join(__dirname, '..', 'workflow-consulta.ts'), 'utf-8')
    const captacao = readFileSync(join(__dirname, '..', 'workflow-captacao.ts'), 'utf-8')
    expect(consulta).toContain('executarFluxoCgi')
    expect(captacao).toContain('executarFluxoCgi')
  })
})
