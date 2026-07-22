import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PERMISSOES_PADRAO } from '@/lib/auth/permissions'
import type { UsuarioPerfil } from '@/types/auth'

// Estado mutável lido pelos fakes em tempo de chamada.
const fakeState = {
  autenticado: true,
  perfil: 'comercial' as UsuarioPerfil,
  empresaId: 'empresa-1',
  usuarioAtivo: true as boolean, // false simula sessão válida sem usuário interno ativo resolvido
  contrato: { id: 'contrato-1', processo_id: 'processo-1', empresa_id: 'empresa-1' } as
    | { id: string; processo_id: string; empresa_id: string }
    | null,
  comprador: { nome: 'Cliente Real', email: 'cliente-real@example.com' } as
    | { nome: string; email: string }
    | null,
}

const getUserMock = vi.fn(async () =>
  fakeState.autenticado
    ? { data: { user: { id: 'auth-user-1' } }, error: null }
    : { data: { user: null }, error: { message: 'no session' } },
)

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: getUserMock },
  })),
}))

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: (tabela: string) => {
      const proxy: Record<string, unknown> = {}
      Object.assign(proxy, {
        select: () => proxy,
        or: () => proxy,
        eq: () => proxy,
        update: () => proxy,
        single: async () => {
          if (tabela === 'usuarios') {
            if (!fakeState.usuarioAtivo) return { data: null, error: null }
            return { data: { empresa_id: fakeState.empresaId, perfil: fakeState.perfil }, error: null }
          }
          return { data: null, error: null }
        },
        maybeSingle: async () => {
          if (tabela === 'processo_contratos') return { data: fakeState.contrato, error: null }
          if (tabela === 'processo_compradores') return { data: fakeState.comprador, error: null }
          return { data: null, error: null }
        },
      })
      return proxy
    },
  },
}))

const criarEnvelopeMock = vi.fn((..._args: any[]) => Promise.resolve('envelope-1'))
const uploadDocumentoMock = vi.fn((..._args: any[]) => Promise.resolve('document-1'))
const adicionarSignatarioMock = vi.fn((..._args: any[]) => Promise.resolve('signer-1'))
const adicionarRequistoQualificacaoMock = vi.fn((..._args: any[]) => Promise.resolve(undefined))
const adicionarRequisitoAutenticacaoMock = vi.fn((..._args: any[]) => Promise.resolve(undefined))
const ativarEnvelopeMock = vi.fn((..._args: any[]) => Promise.resolve(undefined))
const notificarSignatariosMock = vi.fn((..._args: any[]) => Promise.resolve(undefined))

vi.mock('@/lib/clicksign/client', () => ({
  criarEnvelope: criarEnvelopeMock,
  uploadDocumento: uploadDocumentoMock,
  adicionarSignatario: adicionarSignatarioMock,
  adicionarRequistoQualificacao: adicionarRequistoQualificacaoMock,
  adicionarRequisitoAutenticacao: adicionarRequisitoAutenticacaoMock,
  ativarEnvelope: ativarEnvelopeMock,
  notificarSignatarios: notificarSignatariosMock,
}))

function montarRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/clicksign/enviar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as import('next/server').NextRequest
}

const corpoValido = {
  processo_contrato_id: 'contrato-1',
  pdf_base64: 'BASE64DATA',
  filename: 'contrato.pdf',
}

function nenhumaChamadaAoClicksign() {
  expect(criarEnvelopeMock).not.toHaveBeenCalled()
  expect(uploadDocumentoMock).not.toHaveBeenCalled()
  expect(adicionarSignatarioMock).not.toHaveBeenCalled()
  expect(ativarEnvelopeMock).not.toHaveBeenCalled()
  expect(notificarSignatariosMock).not.toHaveBeenCalled()
}

const perfisAutorizados = (Object.keys(PERMISSOES_PADRAO) as UsuarioPerfil[]).filter((p) =>
  PERMISSOES_PADRAO[p].includes('processos.editar'),
)
const perfisNaoAutorizados = (Object.keys(PERMISSOES_PADRAO) as UsuarioPerfil[]).filter(
  (p) => !PERMISSOES_PADRAO[p].includes('processos.editar'),
)

describe('POST /api/clicksign/enviar', () => {
  beforeEach(() => {
    process.env.CLICKSIGN_EMPRESA_NOME = 'Fontinhas Assessoria'
    process.env.CLICKSIGN_EMPRESA_EMAIL = 'empresa@fontinhas.example.com'
    fakeState.autenticado = true
    fakeState.perfil = 'comercial'
    fakeState.empresaId = 'empresa-1'
    fakeState.usuarioAtivo = true
    fakeState.contrato = { id: 'contrato-1', processo_id: 'processo-1', empresa_id: 'empresa-1' }
    fakeState.comprador = { nome: 'Cliente Real', email: 'cliente-real@example.com' }
    getUserMock.mockClear()
    criarEnvelopeMock.mockClear()
    uploadDocumentoMock.mockClear()
    adicionarSignatarioMock.mockClear()
    adicionarRequistoQualificacaoMock.mockClear()
    adicionarRequisitoAutenticacaoMock.mockClear()
    ativarEnvelopeMock.mockClear()
    notificarSignatariosMock.mockClear()
  })

  it('401 sem sessão, sem nenhuma chamada ao Clicksign', async () => {
    fakeState.autenticado = false
    const { POST } = await import('../enviar/route')

    const response = await POST(montarRequest(corpoValido))
    expect(response.status).toBe(401)
    nenhumaChamadaAoClicksign()
  })

  it('403 para sessão válida sem usuário interno ativo resolvido', async () => {
    fakeState.usuarioAtivo = false
    const { POST } = await import('../enviar/route')

    const response = await POST(montarRequest(corpoValido))
    expect(response.status).toBe(403)
    nenhumaChamadaAoClicksign()
  })

  it.each(perfisNaoAutorizados)('403 para perfil sem processos.editar (%s)', async (perfil) => {
    fakeState.perfil = perfil
    const { POST } = await import('../enviar/route')

    const response = await POST(montarRequest(corpoValido))
    expect(response.status).toBe(403)
    nenhumaChamadaAoClicksign()
  })

  it('404 para contrato inexistente', async () => {
    fakeState.contrato = null
    const { POST } = await import('../enviar/route')

    const response = await POST(montarRequest(corpoValido))
    expect(response.status).toBe(404)
    nenhumaChamadaAoClicksign()
  })

  it('404 para contrato de outra empresa (mesma resposta do inexistente)', async () => {
    // O select já filtra .eq('empresa_id', usuario.empresa_id) — simulamos o
    // resultado desse filtro não encontrando linha, como faria o Postgres real.
    fakeState.contrato = null
    const { POST } = await import('../enviar/route')

    const response = await POST(montarRequest(corpoValido))
    const body = await response.json()
    expect(response.status).toBe(404)
    expect(body.error).toBe('Contrato não encontrado')
    nenhumaChamadaAoClicksign()
  })

  it.each(perfisAutorizados)('permite contrato válido para perfil autorizado (%s)', async (perfil) => {
    fakeState.perfil = perfil
    const { POST } = await import('../enviar/route')

    const response = await POST(montarRequest(corpoValido))
    expect(response.status).toBe(200)
    expect(criarEnvelopeMock).toHaveBeenCalled()
  })

  it('resolve comprador principal no servidor e ignora nome/e-mail forjados no body', async () => {
    const { POST } = await import('../enviar/route')

    const corpoForjado = {
      ...corpoValido,
      signatario_nome: 'Nome Forjado',
      signatario_email: 'forjado@atacante.com',
    }
    const response = await POST(montarRequest(corpoForjado))
    expect(response.status).toBe(200)

    // Primeira chamada a adicionarSignatario é o signatário-cliente — deve
    // usar os dados resolvidos no servidor (processo_compradores), nunca o body.
    expect(adicionarSignatarioMock).toHaveBeenNthCalledWith(1, 'envelope-1', {
      nome: 'Cliente Real',
      email: 'cliente-real@example.com',
    })
  })

  it('signatário da empresa vem de configuração do servidor, não do body', async () => {
    const originalNome = process.env.CLICKSIGN_EMPRESA_NOME
    const originalEmail = process.env.CLICKSIGN_EMPRESA_EMAIL
    process.env.CLICKSIGN_EMPRESA_NOME = 'Empresa Real Ltda'
    process.env.CLICKSIGN_EMPRESA_EMAIL = 'empresa-real@example.com'

    const { POST } = await import('../enviar/route')
    const corpoForjado = {
      ...corpoValido,
      signatario_nome: 'Empresa Forjada',
      signatario_email: 'forjada@atacante.com',
    }
    const response = await POST(montarRequest(corpoForjado))
    expect(response.status).toBe(200)

    // Segunda chamada a adicionarSignatario é o signatário-empresa.
    expect(adicionarSignatarioMock).toHaveBeenNthCalledWith(2, 'envelope-1', {
      nome: 'Empresa Real Ltda',
      email: 'empresa-real@example.com',
    })

    process.env.CLICKSIGN_EMPRESA_NOME = originalNome
    process.env.CLICKSIGN_EMPRESA_EMAIL = originalEmail
  })

  it('400 quando comprador principal não tem nome/e-mail cadastrado, sem chamar o Clicksign', async () => {
    fakeState.comprador = null
    const { POST } = await import('../enviar/route')

    const response = await POST(montarRequest(corpoValido))
    expect(response.status).toBe(400)
    nenhumaChamadaAoClicksign()
  })

  it('nenhuma chamada ao Clicksign ocorre antes de todas as validações passarem', async () => {
    // Cenário onde tudo falharia em cascata se a ordem de checagem estivesse errada:
    // sem sessão E sem contrato E sem comprador.
    fakeState.autenticado = false
    fakeState.contrato = null
    fakeState.comprador = null
    const { POST } = await import('../enviar/route')

    await POST(montarRequest(corpoValido))
    nenhumaChamadaAoClicksign()
  })
})
