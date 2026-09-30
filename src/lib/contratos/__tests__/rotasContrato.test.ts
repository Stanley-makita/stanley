import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/processos/[id]/contratos/entender/route'

const mock = vi.hoisted(() => ({ entender: vi.fn(), consultas: [] as Array<{ tabela: string; filtros: Record<string, unknown> }> }))
vi.mock('@/lib/contratos/entenderNegociacao', () => ({ entenderNegociacao: mock.entender }))
vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: {
  auth: { getUser: async (token: string) => ({ data: { user: ['admin', 'juridico'].includes(token) ? { id: token } : null }, error: null }) },
  from: (tabela: string) => {
    const consulta = { tabela, filtros: {} as Record<string, unknown> }
    mock.consultas.push(consulta)
    const resultado = () => ({ data: tabela === 'usuarios' ? { empresa_id: 'empresa-1' } : tabela === 'processos' ? { id: 'p1', tipo_contrato: 'compra_venda', valor_contrato: 1000 } : [], error: null })
    const cadeia = {
      select: () => cadeia,
      eq: (campo: string, valor: unknown) => { consulta.filtros[campo] = valor; return cadeia },
      single: async () => resultado(), maybeSingle: async () => resultado(),
      then: (resolve: (valor: unknown) => unknown) => Promise.resolve(resultado()).then(resolve),
    }
    return cadeia
  },
} }))

beforeEach(() => { mock.entender.mockReset(); mock.consultas.length = 0 })
const request = (perfil: string) => new NextRequest('http://localhost/api/processos/p1/contratos/entender', { method: 'POST', headers: { authorization: `Bearer ${perfil}`, 'content-type': 'application/json' }, body: JSON.stringify({ descricao: 'Negociação de teste' }) })

describe('rotas de geração para contas da mesma empresa', () => {
  it.each(['admin', 'juridico'])('permite a análise para %s, mantendo o filtro de empresa', async (perfil) => {
    mock.entender.mockResolvedValue({ valor: 570000 })
    const resposta = await POST(request(perfil), { params: { id: 'p1' } })
    expect(resposta.status).toBe(200)
    expect((await resposta.json()).resumo.valor).toBe(570000)
    expect(mock.consultas.find(c => c.tabela === 'processos')?.filtros.empresa_id).toBe('empresa-1')
  })
  it('sessão inválida não chama a IA', async () => {
    const resposta = await POST(request('expirada'), { params: { id: 'p1' } })
    expect(resposta.status).toBe(401)
    expect(mock.entender).not.toHaveBeenCalled()
  })
  it('timeout do provedor retorna JSON 504, inclusive para jurídico', async () => {
    mock.entender.mockRejectedValue(Object.assign(new Error('detalhes internos'), { name: 'APIConnectionTimeoutError' }))
    const resposta = await POST(request('juridico'), { params: { id: 'p1' } })
    expect(resposta.status).toBe(504)
    const corpo = await resposta.json()
    expect(corpo.error).toContain('tempo de espera')
    expect(corpo.error).not.toContain('detalhes internos')
  })
})
