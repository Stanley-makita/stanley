/**
 * Regressão (2026-10-02): excluir uma Pessoa que era a cliente de um negócio de Consórcio
 * (#proc-077, Igor) deixou o negócio sem cliente — a sincronização de participantes ignora
 * Pessoa excluída e tirou ela do negócio, que ficou com cotas e 104 parcelas sem dono.
 * Agora a exclusão é recusada enquanto a Pessoa estiver em lead ou negócio ativo.
 */
import { describe, it, expect } from 'vitest'
import { mensagemBloqueioExclusao, propostasAtivasDaPessoa } from '../bloqueioExclusaoPessoa'

describe('mensagemBloqueioExclusao', () => {
  it('sem propostas ativas → null (pode excluir)', () => {
    expect(mensagemBloqueioExclusao([])).toBeNull()
  })

  it('lista negócios e leads em que a Pessoa está', () => {
    const msg = mensagemBloqueioExclusao([
      { tipo: 'processo', id: 'p1', rotulo: '#proc-077 (Consórcio)' },
      { tipo: 'lead', id: 'l1', rotulo: 'IGOR ROSSI FERMO' },
    ])
    expect(msg).toContain('#proc-077 (Consórcio)')
    expect(msg).toContain('lead IGOR ROSSI FERMO')
    expect(msg).toMatch(/remova/i)
  })
})

function fakeSb(dados: Record<string, unknown[]>, erro?: string) {
  return {
    from(tabela: string) {
      const q: Record<string, unknown> = {}
      q.select = () => q
      q.eq = () => q
      q.is = () => q
      q.then = (resolve: (v: unknown) => unknown) =>
        resolve(erro ? { data: null, error: { message: erro } } : { data: dados[tabela] ?? [], error: null })
      return q
    },
  }
}

describe('propostasAtivasDaPessoa', () => {
  it('junta participações e ponteiros diretos, sem repetir e ignorando excluídos', async () => {
    const sb = fakeSb({
      participacoes: [
        { lead: null, processo: { id: 'p1', numero_processo: '#proc-077', modalidade: 'Consorcio', deleted_at: null } },
        { lead: { id: 'l1', nome: 'IGOR', deleted_at: null }, processo: null },
        { lead: { id: 'l9', nome: 'VELHO', deleted_at: '2026-09-01' }, processo: null },
        { lead: null, processo: { id: 'p9', numero_processo: '#proc-001', modalidade: 'SBPE', deleted_at: '2026-09-01' } },
      ],
      processos: [{ id: 'p1', numero_processo: '#proc-077', modalidade: 'Consorcio' }],
      leads: [{ id: 'l1', nome: 'IGOR' }],
    })
    const r = await propostasAtivasDaPessoa(sb as never, 'emp', 'pessoa')
    expect(r).toEqual([
      { tipo: 'processo', id: 'p1', rotulo: '#proc-077 (Consórcio)' },
      { tipo: 'lead', id: 'l1', rotulo: 'IGOR' },
    ])
  })

  it('erro na consulta lança (nunca libera a exclusão por engano)', async () => {
    await expect(propostasAtivasDaPessoa(fakeSb({}, 'falhou') as never, 'emp', 'pessoa')).rejects.toThrow('falhou')
  })
})
