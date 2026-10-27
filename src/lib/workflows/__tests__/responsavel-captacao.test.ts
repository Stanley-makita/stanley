/**
 * *cria cliente: quem cria vira responsável (comercial) do lead quando o perfil é
 * 'comercial' OU o cargo do RH é comercial. Caso real (27/10/2026): Luciana (perfil
 * admin, cargo "Consultor Comercial") criava leads que nasciam sem responsável.
 */
import { describe, it, expect, vi } from 'vitest'
import { cargoEhComercial, responsavelDaCaptacao } from '../responsavel-captacao'

function supabaseComCargo(resposta: { data: unknown; error: unknown }) {
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    abortSignal: vi.fn(() => chain),
    maybeSingle: vi.fn().mockResolvedValue(resposta),
  }
  return { from: vi.fn(() => chain), chain } as any
}

describe('cargoEhComercial', () => {
  it.each(['Consultor Comercial', 'Comercial interno', 'Comercial Externo', 'COMERCIAL'])(
    'reconhece "%s"',
    (nome) => expect(cargoEhComercial(nome)).toBe(true),
  )

  it.each(['Supervisor Operacional', 'Recepcionista', 'Assistente Administrativo', '', null, undefined])(
    'não reconhece %s',
    (nome) => expect(cargoEhComercial(nome)).toBe(false),
  )
})

describe('responsavelDaCaptacao', () => {
  it('perfil comercial vira responsável sem consultar o cargo', async () => {
    const sb = supabaseComCargo({ data: null, error: null })
    expect(await responsavelDaCaptacao(sb, 'u1', 'comercial')).toBe('u1')
    expect(sb.from).not.toHaveBeenCalled()
  })

  it('admin com cargo comercial (Luciana) vira responsável', async () => {
    const sb = supabaseComCargo({ data: { cargo: { nome: 'Consultor Comercial' } }, error: null })
    expect(await responsavelDaCaptacao(sb, 'luciana', 'admin')).toBe('luciana')
    expect(sb.from).toHaveBeenCalledWith('usuarios')
  })

  it('perfil customizado com cargo Comercial Externo vira responsável', async () => {
    const sb = supabaseComCargo({ data: { cargo: { nome: 'Comercial Externo' } }, error: null })
    expect(await responsavelDaCaptacao(sb, 'francis', 'customizado')).toBe('francis')
  })

  it('recepção cria em nome de terceiros: lead sem responsável', async () => {
    const sb = supabaseComCargo({ data: { cargo: { nome: 'Recepcionista' } }, error: null })
    expect(await responsavelDaCaptacao(sb, 'ana', 'apoio')).toBeNull()
  })

  it('sem cargo: lead sem responsável', async () => {
    const sb = supabaseComCargo({ data: { cargo: null }, error: null })
    expect(await responsavelDaCaptacao(sb, 'claudia', 'juridico')).toBeNull()
  })

  it('erro na consulta não derruba o *cria cliente: lead sem responsável', async () => {
    const sb = supabaseComCargo({ data: null, error: { message: 'timeout' } })
    expect(await responsavelDaCaptacao(sb, 'x', 'admin')).toBeNull()
  })
})
