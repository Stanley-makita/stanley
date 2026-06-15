export type { DadosConfirmacaoValores } from './types'
export { gerarEmailCaixa } from './caixa'
export { gerarEmailBancoDoBrasil } from './bancoDoBrasil'
export { gerarEmailBradesco } from './bradesco'
export { gerarEmailItau } from './itau'
export { gerarEmailSantander } from './santander'

import { DadosConfirmacaoValores } from './types'
import { gerarEmailCaixa } from './caixa'
import { gerarEmailBancoDoBrasil } from './bancoDoBrasil'
import { gerarEmailBradesco } from './bradesco'
import { gerarEmailItau } from './itau'
import { gerarEmailSantander } from './santander'

export type BancoTemplate = 'CAIXA' | 'BANCO_DO_BRASIL' | 'BRADESCO' | 'ITAU' | 'SANTANDER'

export function normalizarBancoTemplate(nome: string): BancoTemplate | null {
  const n = nome.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  if (n.includes('caixa'))                      return 'CAIXA'
  if (n.includes('brasil') || n === 'bb')       return 'BANCO_DO_BRASIL'
  if (n.includes('bradesco'))                   return 'BRADESCO'
  if (n.includes('itau') || n.includes('itaú')) return 'ITAU'
  if (n.includes('santander'))                  return 'SANTANDER'
  return null
}

export function gerarEmailConfirmacaoValores(
  banco: BancoTemplate,
  dados: DadosConfirmacaoValores,
): { assunto: string; corpo: string } {
  switch (banco) {
    case 'CAIXA':          return gerarEmailCaixa(dados)
    case 'BANCO_DO_BRASIL': return gerarEmailBancoDoBrasil(dados)
    case 'BRADESCO':       return gerarEmailBradesco(dados)
    case 'ITAU':           return gerarEmailItau(dados)
    case 'SANTANDER':      return gerarEmailSantander(dados)
  }
}
