import { describe, it, expect } from 'vitest'
import { codigoRaiz, idsDaArvore, pastasParaSelecao, pastasPrincipais, rotuloPasta, subpastasDe } from '../pastas'

const catalogo = [
  { id: '1', codigo: 'comprador', nome: '01 Comprador', ordem_exibicao: 10, pai_codigo: null },
  { id: '2', codigo: 'vendedor', nome: '03 Vendedor', ordem_exibicao: 30, pai_codigo: null },
  { id: '3', codigo: 'comprador_renda', nome: '02 Comprovação de Renda', ordem_exibicao: 12, pai_codigo: 'comprador' },
  { id: '4', codigo: 'comprador_pessoais', nome: '01 Documentos Pessoais', ordem_exibicao: 11, pai_codigo: 'comprador' },
  { id: '5', codigo: 'terceiros', nome: '01B Terceiros Interessados', ordem_exibicao: 15, pai_codigo: null },
]

describe('pastas (árvore)', () => {
  it('principais sem subpastas, na ordem', () => {
    expect(pastasPrincipais(catalogo).map((p) => p.codigo)).toEqual(['comprador', 'terceiros', 'vendedor'])
  })
  it('subpastas da mãe, na ordem', () => {
    expect(subpastasDe('comprador', catalogo).map((p) => p.codigo)).toEqual(['comprador_pessoais', 'comprador_renda'])
    expect(subpastasDe('vendedor', catalogo)).toEqual([])
  })
  it('árvore inclui a pasta e as subpastas', () => {
    expect(Array.from(idsDaArvore('comprador', catalogo)).sort()).toEqual(['1', '3', '4'])
    expect(Array.from(idsDaArvore('vendedor', catalogo))).toEqual(['2'])
  })
  it('raiz e rótulo', () => {
    expect(codigoRaiz('comprador_renda', catalogo)).toBe('comprador')
    expect(codigoRaiz('vendedor', catalogo)).toBe('vendedor')
    expect(rotuloPasta(catalogo[2], catalogo)).toBe('01 Comprador › 02 Comprovação de Renda')
    expect(rotuloPasta(catalogo[1], catalogo)).toBe('03 Vendedor')
  })
  it('seleção: mãe seguida das subpastas', () => {
    expect(pastasParaSelecao(catalogo).map((p) => p.codigo))
      .toEqual(['comprador', 'comprador_pessoais', 'comprador_renda', 'terceiros', 'vendedor'])
  })
})
