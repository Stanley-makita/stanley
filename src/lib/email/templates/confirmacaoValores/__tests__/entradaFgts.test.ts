import { describe, it, expect } from 'vitest'
import { linhasEntradaFgts, calcularRecursosProprios } from '../entradaFgts'
import { gerarEmailConfirmacaoValores, type BancoTemplate, type DadosConfirmacaoValores } from '..'

describe('calcularRecursosProprios', () => {
  it('usa o valor do negócio quando informado', () => {
    expect(calcularRecursosProprios({ recursosProprios: 17348.86, entrada: 46000, fgts: 28651.14 })).toBe(17348.86)
  })
  it('sem o valor do negócio: entrada − FGTS (arredondado em centavos)', () => {
    expect(calcularRecursosProprios({ recursosProprios: null, entrada: 46000, fgts: 28651.14 })).toBe(17348.86)
  })
  it('sem FGTS: recursos próprios = entrada', () => {
    expect(calcularRecursosProprios({ recursosProprios: null, entrada: 46000, fgts: null })).toBe(46000)
  })
  it('sem entrada: null', () => {
    expect(calcularRecursosProprios({ recursosProprios: null, entrada: null, fgts: 1000 })).toBeNull()
  })
})

describe('linhasEntradaFgts', () => {
  it('formato novo: "Entrada (recursos próprios)" + FGTS separado', () => {
    expect(linhasEntradaFgts({ entrada: 46000, fgts: 28651.14, recursos_proprios: 17348.86 })).toEqual([
      ['Entrada (recursos próprios)', 'R$ 17.348,86'],
      ['FGTS', 'R$ 28.651,14'],
    ])
  })
  it('formato novo sem FGTS: a linha do FGTS não aparece', () => {
    expect(linhasEntradaFgts({ entrada: 46000, fgts: null, recursos_proprios: 46000 }).map(l => l[0])).toEqual(['Entrada (recursos próprios)'])
    expect(linhasEntradaFgts({ entrada: 46000, fgts: 0, recursos_proprios: 46000 }).map(l => l[0])).toEqual(['Entrada (recursos próprios)'])
  })
  it('confirmação antiga (sem recursos_proprios): mantém Entrada total + FGTS como foi enviada', () => {
    expect(linhasEntradaFgts({ entrada: 46000, fgts: 28651.14 })).toEqual([
      ['Entrada', 'R$ 46.000,00'],
      ['FGTS', 'R$ 28.651,14'],
    ])
  })
})

describe('e-mail dos 5 bancos usa recursos próprios na entrada', () => {
  const base = {
    cliente_nome: 'Cliente', banco_nome: 'Banco', engenharia_laudo: 235000, compra_venda: 230000, entrada: 46000,
    fgts: 28651.14, recursos_proprios: 17348.86, subsidio: null, valor_financiado: 184000, despesas_financiadas: null,
    valor_total_financiado: 184000, prazo_meses: 303, modalidade: 'PMCMV', amortizacao: 'PRICE', taxa: '7,93% a.a.',
    iof: null, tarifa_banco: null, observacoes: null, usuario_nome: 'U', usuario_funcao: 'comercial',
    usuario_email: 'u@x.com', usuario_telefone_whatsapp: null, tem_assessoria: true,
  } as DadosConfirmacaoValores
  it.each(['CAIXA', 'BANCO_DO_BRASIL', 'BRADESCO', 'ITAU', 'SANTANDER'] as BancoTemplate[])('%s', (banco) => {
    const { corpo } = gerarEmailConfirmacaoValores(banco, base)
    expect(corpo).toContain('Entrada (recursos próprios)')
    expect(corpo).toContain('17.348,86')
    expect(corpo).not.toContain('46.000,00')
  })
})
