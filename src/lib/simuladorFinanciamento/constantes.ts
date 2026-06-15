import type { BancoId } from './tipos'

export interface BancoConfig {
  id: BancoId
  nome: string
  cor: string
  corTexto: string
  taxaAnualBase: number       // % a.a. sem relacionamento bancário
  taxaAnualCorrentista: number // % a.a. com relacionamento/conta ativa
  programa: string
  maxLtv: number              // LTV máximo (% do valor do imóvel)
  maxLtvCorrentista: number   // LTV com relacionamento (alguns bancos diferem)
  maxValorImovel: number      // 0 = sem limite
  prazoMaximoMeses: number    // prazo máximo independente de idade
  aceitaMcmv: boolean         // agente operador do MCMV/FGTS
  observacao?: string
}

// Taxas SBPE vigentes — junho/2026
// Fontes: caixa.gov.br, gov.br, infomoney, larya, spimovel (atualizado 2026-06-15)
export const BANCOS_CONFIG: Record<BancoId, BancoConfig> = {
  caixa: {
    id: 'caixa',
    nome: 'Caixa Econômica Federal',
    cor: '#003087',
    corTexto: '#ffffff',
    taxaAnualBase:        0.1149, // 11,49% a.a. + TR (balcão)
    taxaAnualCorrentista: 0.1119, // 11,19% a.a. + TR (c/ débito auto + salário domiciliado)
    programa: 'SBPE',
    maxLtv: 0.80,
    maxLtvCorrentista: 0.80,
    maxValorImovel: 2_250_000,    // teto SFH 2026
    prazoMaximoMeses: 420,
    aceitaMcmv: true,
  },
  itau: {
    id: 'itau',
    nome: 'Itaú',
    cor: '#EC7000',
    corTexto: '#ffffff',
    taxaAnualBase:        0.1170, // 11,70% a.a. + TR
    taxaAnualCorrentista: 0.1170, // sem tabela diferenciada formal
    programa: 'SBPE',
    maxLtv: 0.80,
    maxLtvCorrentista: 0.80,
    maxValorImovel: 0,
    prazoMaximoMeses: 420,
    aceitaMcmv: false,
  },
  bradesco: {
    id: 'bradesco',
    nome: 'Bradesco',
    cor: '#CC092F',
    corTexto: '#ffffff',
    taxaAnualBase:        0.1170, // 11,70% a.a. + TR
    taxaAnualCorrentista: 0.1140, // ~11,40% via Open Finance (relacionamento ativo)
    programa: 'SBPE',
    maxLtv: 0.80,
    maxLtvCorrentista: 0.90,      // correntistas Bradesco podem obter até 90% LTV
    maxValorImovel: 0,
    prazoMaximoMeses: 420,
    aceitaMcmv: false,
  },
  santander: {
    id: 'santander',
    nome: 'Santander',
    cor: '#EC0000',
    corTexto: '#ffffff',
    taxaAnualBase:        0.1199, // 11,99% a.a. + TR (balcão)
    taxaAnualCorrentista: 0.1169, // 11,69% a.a. (clientes de relacionamento — fonte: larya/spimovel 2026)
    programa: 'SBPE',
    maxLtv: 0.80,
    maxLtvCorrentista: 0.80,
    maxValorImovel: 0,
    prazoMaximoMeses: 420,
    aceitaMcmv: false,
    observacao: 'Exige abertura de conta-corrente no Santander para contratação',
  },
  bb: {
    id: 'bb',
    nome: 'Banco do Brasil',
    cor: '#FDCA00',
    corTexto: '#000000',
    taxaAnualBase:        0.1200, // 12,00% a.a. + TR (fonte: larya/spimovel 2026)
    taxaAnualCorrentista: 0.1180, // 11,80% a.a. (correntista com conta ativa)
    programa: 'SBPE',
    maxLtv: 0.80,
    maxLtvCorrentista: 0.80,
    maxValorImovel: 5_000_000,
    prazoMaximoMeses: 420,
    aceitaMcmv: false,
    observacao: 'Pró-Cotista FGTS disponível a 9,00% a.a. para imóveis até R$2,25M',
  },
  inter: {
    id: 'inter',
    nome: 'Banco Inter',
    cor: '#FF6600',
    corTexto: '#ffffff',
    taxaAnualBase:        0.1376, // 13,76% a.a. + TR
    taxaAnualCorrentista: 0.1376, // exige conta Inter para contratar
    programa: 'SBPE',
    maxLtv: 0.75,                 // entrada mínima de 25%
    maxLtvCorrentista: 0.75,
    maxValorImovel: 0,
    prazoMaximoMeses: 360,        // prazo máximo 30 anos (vs 35 nos demais)
    aceitaMcmv: false,
    observacao: 'Processo 100% digital. Entrada mínima de 25%. Prazo máximo 30 anos.',
  },
  daycoval: {
    id: 'daycoval',
    nome: 'Daycoval (CGI)',
    cor: '#1B3F6E',
    corTexto: '#ffffff',
    taxaAnualBase:        0.1540, // ~15,40% a.a. (Crédito com Garantia de Imóvel)
    taxaAnualCorrentista: 0.1540,
    programa: 'CGI',
    maxLtv: 0.60,                 // LTV 60% (produto é CGI, não SBPE)
    maxLtvCorrentista: 0.60,
    maxValorImovel: 1_000_000,
    prazoMaximoMeses: 240,        // 20 anos
    aceitaMcmv: false,
    observacao: 'Daycoval não opera financiamento SBPE. Produto disponível: Crédito com Garantia de Imóvel (CGI/Home Equity).',
  },
}

// Tabela MIP — Seguro de Morte e Invalidez Permanente
// Alíquota mensal sobre o SALDO DEVEDOR
// Fonte: ParcelaImóvel / tabela referência SFH (junho/2026)
export const MIP_RATES: Array<{ idadeMin: number; idadeMax: number; taxa: number }> = [
  { idadeMin: 18, idadeMax: 30, taxa: 0.000145 }, // 0,0145% a.m.
  { idadeMin: 31, idadeMax: 40, taxa: 0.000225 }, // 0,0225% a.m.
  { idadeMin: 41, idadeMax: 50, taxa: 0.000395 }, // 0,0395% a.m.
  { idadeMin: 51, idadeMax: 60, taxa: 0.000780 }, // 0,0780% a.m.
  { idadeMin: 61, idadeMax: 70, taxa: 0.001520 }, // 0,1520% a.m.
  { idadeMin: 71, idadeMax: 80, taxa: 0.002800 }, // 0,2800% a.m.
]

// MIP subsidiado para programas MCMV Faixas 1-3 — seguro habitacional governamental subsidiado
// Calibrado do simulador oficial Caixa (Faixas 1-3): valor ~10x menor que SBPE
// MCMV Classe Média (Faixa 4) usa MIP normal (não subsidiado) — produto SBPE com taxa reduzida
export const MIP_RATE_MCMV = 0.0000151

// DFI — Danos Físicos ao Imóvel
// IMPORTANTE: calculado sobre o VALOR DO IMÓVEL (não sobre o saldo devedor)
// Taxa fixa durante todo o contrato
// Fonte: mercado SFH (ponto médio entre Caixa ~0,006% e Itaú ~0,01337%)
export const DFI_RATE_MENSAL = 0.0000663 // 0,00663% ao mês sobre VALOR DO IMÓVEL

// MCMV — Minha Casa Minha Vida (Caixa, novas condições vigentes desde 22/04/2026)
// Fonte: Portaria MCID n° 333/2026, caixanoticias, infomoney, gov.br
// mipSubsidizado: Faixas 1-3 usam MIP_RATE_MCMV; Faixa 4 usa MIP normal (produto SBPE com juros reduzidos)
export const MCMV_FAIXAS: Array<{ rendaMax: number; taxaAnual: number; programa: string; tetoImovel: number; mipSubsidizado: boolean }> = [
  { rendaMax: 3_200,  taxaAnual: 0.0450, programa: 'MCMV Faixa 1', tetoImovel: 270_000,  mipSubsidizado: true  },
  { rendaMax: 5_000,  taxaAnual: 0.0650, programa: 'MCMV Faixa 2', tetoImovel: 350_000,  mipSubsidizado: true  },
  { rendaMax: 9_600,  taxaAnual: 0.0816, programa: 'MCMV Faixa 3', tetoImovel: 400_000,  mipSubsidizado: true  },
  { rendaMax: 13_000, taxaAnual: 0.1050, programa: 'MCMV Classe Média', tetoImovel: 600_000, mipSubsidizado: false },
]

// Caixa Pró-Cotista FGTS (imóveis até R$500k, mín. 36 meses FGTS)
// Fonte: Portaria MCID n° 333/2026 — teto elevado de R$350k para R$500k
export const CAIXA_PRO_COTISTA = {
  taxaAnual: 0.0866,   // 8,66% a.a. + TR
  maxValorImovel: 500_000,
  programa: 'Pró-Cotista FGTS',
}

export const TODOS_BANCOS: BancoId[] = [
  'caixa', 'itau', 'bradesco', 'santander', 'bb', 'inter', 'daycoval',
]
