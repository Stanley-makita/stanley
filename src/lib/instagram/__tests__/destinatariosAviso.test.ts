import { describe, it, expect } from 'vitest'
import { escolherDestinatariosAviso } from '../destinatariosAviso'

const usuarios = [
  { id: 'admin-1', perfil: 'admin' },
  { id: 'gestor-1', perfil: 'gestor' },
  { id: 'com-1', perfil: 'comercial' },
  { id: 'com-2', perfil: 'comercial' },
]

describe('escolherDestinatariosAviso', () => {
  it('conversa com dono avisa só o dono', () => {
    expect(
      escolherDestinatariosAviso({ responsavelAvisosId: 'com-2', atendentesConfigurados: ['com-1'], usuariosAtivos: usuarios }),
    ).toEqual(['com-2'])
  })

  it('sem dono avisa a lista configurada', () => {
    expect(
      escolherDestinatariosAviso({ responsavelAvisosId: null, atendentesConfigurados: ['com-1', 'com-2', 'com-1'], usuariosAtivos: usuarios }),
    ).toEqual(['com-1', 'com-2'])
  })

  it('lista vazia avisa admin e gestor', () => {
    expect(
      escolherDestinatariosAviso({ responsavelAvisosId: null, atendentesConfigurados: [], usuariosAtivos: usuarios }),
    ).toEqual(['admin-1', 'gestor-1'])
  })

  it('ignora usuário inativo da lista e cai no fallback se não sobrar ninguém', () => {
    expect(
      escolherDestinatariosAviso({ responsavelAvisosId: null, atendentesConfigurados: ['inativo'], usuariosAtivos: usuarios }),
    ).toEqual(['admin-1', 'gestor-1'])
  })

  it('dono inativo volta a avisar a lista', () => {
    expect(
      escolherDestinatariosAviso({ responsavelAvisosId: 'saiu', atendentesConfigurados: ['com-1'], usuariosAtivos: usuarios }),
    ).toEqual(['com-1'])
  })
})
