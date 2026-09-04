import { describe, it, expect } from 'vitest'
import { slugify, gerarCodigoUnico } from '../origensLeadHelpers'

describe('slugify', () => {
  it('minúsculas, sem acento, espaços viram underscore', () => {
    expect(slugify('Parceiro Comercial')).toBe('parceiro_comercial')
  })

  it('remove acentuação', () => {
    expect(slugify('Indicação')).toBe('indicacao')
  })

  it('colapsa underscores repetidos e remove das pontas', () => {
    expect(slugify('  Feira -- Imóveis  ')).toBe('feira_imoveis')
  })

  it('string vazia ou só símbolos vira string vazia', () => {
    expect(slugify('   ')).toBe('')
    expect(slugify('!!!')).toBe('')
  })
})

describe('gerarCodigoUnico', () => {
  it('sem colisão, usa o slug direto', () => {
    expect(gerarCodigoUnico('Feira de Imóveis', ['site', 'whatsapp'])).toBe('feira_de_imoveis')
  })

  it('com colisão, adiciona sufixo numérico incremental', () => {
    expect(gerarCodigoUnico('Parceiro', ['parceiro', 'parceiro_2'])).toBe('parceiro_3')
  })

  it('nome que vira slug vazio usa "origem" como base', () => {
    expect(gerarCodigoUnico('!!!', [])).toBe('origem')
    expect(gerarCodigoUnico('!!!', ['origem'])).toBe('origem_2')
  })
})
