/**
 * `*fonti salva [nome]` não dizia onde o documento foi parar nem que a pessoa tinha processos
 * (para onde o *salva por nome não vincula). A resposta agora mostra o destino e lista os processos.
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/pessoa', () => ({ buscarOuCriarPessoa: vi.fn() }))
vi.mock('@/lib/workflows/workflow-captacao', () => ({ executarWorkflowCaptacao: vi.fn() }))

describe('montarRespostaSalvaPessoa', () => {
  it('lead + processos: mostra destino, lista os processos e como vincular', async () => {
    const { montarRespostaSalvaPessoa } = await import('../fonti-comandos')
    const r = montarRespostaSalvaPessoa({
      total: 4, nome: 'João da Silva', temLead: true, faseLead: 'Lead',
      processos: [
        { numero_processo: '#proc-021', modalidade: 'Consorcio' },
        { numero_processo: '#proc-034', modalidade: 'SBPE' },
      ],
    })
    expect(r).toBe([
      '✅ 4 documento(s) salvos em *João da Silva* (pessoa)',
      '📎 Vinculado ao Lead (etapa Lead)',
      '⚠️ Ele tem também: #proc-021 Consórcio, #proc-034 SBPE.',
      'Para vincular a um processo: *fonti processo 021',
    ].join('\n'))
  })

  it('sem lead: avisa que ficou só na pessoa e lista os processos', async () => {
    const { montarRespostaSalvaPessoa } = await import('../fonti-comandos')
    const r = montarRespostaSalvaPessoa({
      total: 2, nome: 'Joao PEde Feijao', temLead: false, faseLead: null,
      processos: [{ numero_processo: '#proc-057', modalidade: 'Consorcio' }],
    })
    expect(r).toContain('📎 Sem lead aberto — ficou só na pessoa')
    expect(r).toContain('Processos dele: #proc-057 Consórcio.')
    expect(r).toContain('*fonti processo 057')
    expect(r).not.toContain('Vinculado ao Lead')
  })

  it('sem processos: não mostra o aviso de processos', async () => {
    const { montarRespostaSalvaPessoa } = await import('../fonti-comandos')
    const r = montarRespostaSalvaPessoa({ total: 1, nome: 'Ana', temLead: true, faseLead: null, processos: [] })
    expect(r).toBe(['✅ 1 documento(s) salvos em *Ana* (pessoa)', '📎 Vinculado ao Lead'].join('\n'))
  })
})
