import type { BancoId } from './tipos'

export interface BancoConfig {
  id: BancoId
  nome: string
  cor: string
  corTexto: string
  // Taxa nominal anual sem correntista
  taxaAnualBase: number
  // Taxa nominal anual com correntista (relacionamento)
  taxaAnualCorrentista: number
  // Programa padrão
  programa: string
  // Máximo LTV (% do valor do imóvel que pode ser financiado)
  maxLtv: number
  // Valor máximo de imóvel elegível (0 = sem limite)
  maxValorImovel: number
  // Aceita MCMV (Minha Casa Minha Vida)?
  aceitaMcmv: boolean
}

export const BANCOS_CONFIG: Record<BancoId, BancoConfig> = {
  caixa: {
    id: 'caixa',
    nome: 'Caixa Econômica Federal',
    cor: '#003087',
    corTexto: '#ffffff',
    taxaAnualBase: 0.1049,        // 10,49% a.a. SBPE sem relacionamento
    taxaAnualCorrentista: 0.0989, // 9,89% a.a. SBPE com relacionamento
    programa: 'SBPE',
    maxLtv: 0.80,
    maxValorImovel: 0,
    aceitaMcmv: true,
  },
  itau: {
    id: 'itau',
    nome: 'Itaú',
    cor: '#EC7000',
    corTexto: '#ffffff',
    taxaAnualBase: 0.1099,
    taxaAnualCorrentista: 0.1049,
    programa: 'SBPE',
    maxLtv: 0.82,
    maxValorImovel: 0,
    aceitaMcmv: false,
  },
  bradesco: {
    id: 'bradesco',
    nome: 'Bradesco',
    cor: '#CC092F',
    corTexto: '#ffffff',
    taxaAnualBase: 0.1099,
    taxaAnualCorrentista: 0.1039,
    programa: 'SBPE',
    maxLtv: 0.80,
    maxValorImovel: 0,
    aceitaMcmv: false,
  },
  santander: {
    id: 'santander',
    nome: 'Santander',
    cor: '#EC0000',
    corTexto: '#ffffff',
    taxaAnualBase: 0.1099,
    taxaAnualCorrentista: 0.1049,
    programa: 'SBPE',
    maxLtv: 0.80,
    maxValorImovel: 0,
    aceitaMcmv: false,
  },
  bb: {
    id: 'bb',
    nome: 'Banco do Brasil',
    cor: '#FDCA00',
    corTexto: '#000000',
    taxaAnualBase: 0.1069,
    taxaAnualCorrentista: 0.0999,
    programa: 'SBPE',
    maxLtv: 0.80,
    maxValorImovel: 0,
    aceitaMcmv: false,
  },
  inter: {
    id: 'inter',
    nome: 'Banco Inter',
    cor: '#FF6600',
    corTexto: '#ffffff',
    taxaAnualBase: 0.1089,
    taxaAnualCorrentista: 0.1049,
    programa: 'SBPE',
    maxLtv: 0.80,
    maxValorImovel: 0,
    aceitaMcmv: false,
  },
  daycoval: {
    id: 'daycoval',
    nome: 'Daycoval',
    cor: '#1B3F6E',
    corTexto: '#ffffff',
    taxaAnualBase: 0.1119,
    taxaAnualCorrentista: 0.1099,
    programa: 'SBPE',
    maxLtv: 0.80,
    maxValorImovel: 0,
    aceitaMcmv: false,
  },
}

// Tabela MIP (Morte e Invalidez Permanente) por faixa etária — alíquota mensal
export const MIP_RATES: Array<{ idadeMax: number; taxa: number }> = [
  { idadeMax: 25,  taxa: 0.000139 },
  { idadeMax: 30,  taxa: 0.000139 },
  { idadeMax: 35,  taxa: 0.000182 },
  { idadeMax: 40,  taxa: 0.000254 },
  { idadeMax: 45,  taxa: 0.000371 },
  { idadeMax: 50,  taxa: 0.000548 },
  { idadeMax: 55,  taxa: 0.000797 },
  { idadeMax: 60,  taxa: 0.001176 },
  { idadeMax: 65,  taxa: 0.001744 },
  { idadeMax: 70,  taxa: 0.002591 },
  { idadeMax: 80,  taxa: 0.004512 },
]

// DFI (Danos Físicos ao Imóvel) — alíquota mensal fixa
export const DFI_RATE = 0.000225

// MCMV faixas (Caixa) — renda máxima e taxa
export const MCMV_FAIXAS = [
  { rendaMax: 2640,  taxaAnual: 0.0500, programa: 'MCMV Faixa 1' },
  { rendaMax: 4400,  taxaAnual: 0.0600, programa: 'MCMV Faixa 2' },
  { rendaMax: 8000,  taxaAnual: 0.0749, programa: 'MCMV Faixa 3' },
]

export const TODOS_BANCOS: BancoId[] = [
  'caixa', 'itau', 'bradesco', 'santander', 'bb', 'inter', 'daycoval',
]
