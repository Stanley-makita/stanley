import type { BancoId } from './tipos'

export interface BancoConfig {
  id: BancoId
  nome: string
  cor: string
  corTexto: string
  taxaAnualBase: number        // % a.a. sem relacionamento bancário
  taxaAnualCorrentista: number // % a.a. com relacionamento/conta ativa
  programa: string
  maxLtv: number               // LTV máximo SAC (% do valor do imóvel)
  maxLtvCorrentista: number    // LTV com relacionamento (alguns bancos diferem)
  maxLtvPrice?: number         // LTV máximo PRICE — Caixa = 70% (doc seção 3.1)
  comprometimentoMaxPrice?: number // comprometimento máximo renda PRICE — Caixa = 25%
  suportaPrice?: boolean       // banco oferece modalidade PRICE (padrão: false)
  maxValorImovel: number       // 0 = sem limite
  prazoMaximoMeses: number     // prazo máximo independente de idade
  aceitaMcmv: boolean          // agente operador do MCMV/FGTS
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
    maxLtvPrice: 0.70,            // PRICE: cota máxima 70% (doc seção 3.1)
    comprometimentoMaxPrice: 0.25, // PRICE: comprometimento máximo 25% (doc seção 3.2)
    suportaPrice: true,
    maxValorImovel: 2_250_000,    // teto SFH 2026
    prazoMaximoMeses: 420,
    aceitaMcmv: true,
  },
  itau: {
    id: 'itau',
    nome: 'Itaú',
    cor: '#EC7000',
    corTexto: '#ffffff',
    taxaAnualBase:        0.1190, // 11,90% a.a. (mínimo praticado jun/2026 — fonte: simulador Itaú + site oficial)
    taxaAnualCorrentista: 0.1190, // taxa varia por rating/CPF (11,90%–13,99%), não por correntista
    programa: 'SBPE',
    maxLtv: 0.80,
    maxLtvCorrentista: 0.80,
    suportaPrice: true,
    maxValorImovel: 0,
    prazoMaximoMeses: 420,
    aceitaMcmv: false,
  },
  bradesco: {
    id: 'bradesco',
    nome: 'Bradesco',
    cor: '#CC092F',
    corTexto: '#ffffff',
    taxaAnualBase:        0.1230, // 12,30% a.a. — todos os segmentos PF residencial (fonte: simulador oficial jun/2026)
    taxaAnualCorrentista: 0.1230, // taxa independe do segmento (PRIME/EXCLUSIVE/CLASSIC/PRINCIPAL/PRIVATE = mesma taxa)
    programa: 'SBPE',
    maxLtv: 0.80,
    maxLtvCorrentista: 0.80,
    maxValorImovel: 0,
    prazoMaximoMeses: 420,
    aceitaMcmv: false,
  },
  santander: {
    id: 'santander',
    nome: 'Santander',
    cor: '#EC0000',
    corTexto: '#ffffff',
    taxaAnualBase:        0.1249, // 12,49% a.a. + TR (taxa praticada nas simulações)
    taxaAnualCorrentista: 0.1169, // 11,69% a.a. (mínimo para clientes de relacionamento)
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
    taxaAnualBase:        0.1174, // 11,74% a.a. + TR
    taxaAnualCorrentista: 0.1160, // 11,60% a.a. (correntista com conta ativa)
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
    taxaAnualBase:        0.0950, // 9,50% a.a. SFH — fonte: simulador oficial Inter (nov/2024). Verificar taxa atual antes de usar.
    taxaAnualCorrentista: 0.0950, // exige conta Inter para contratar
    programa: 'SBPE',
    maxLtv: 0.80,                 // 1.340.000 / 1.690.000 = 79,3% → confirmado simulador
    maxLtvCorrentista: 0.80,
    maxValorImovel: 0,
    prazoMaximoMeses: 420,        // 35 anos — confirmado simulador (420 parcelas)
    aceitaMcmv: false,
    observacao: 'Processo 100% digital. Seguro MIP: Sompo SuperHab SFH (faixas etárias 5 anos). Taxa: verificar no simulador Inter com CPF.',
  },
  daycoval: {
    id: 'daycoval',
    nome: 'Daycoval (CGI)',
    cor: '#1B3F6E',
    corTexto: '#ffffff',
    taxaAnualBase:        0.1394, // 13,94% efetivo a.a. — CGI PRICE (nominal 13,08% = 1,09%/mês × 12). Fonte: simulador jun/2026.
    taxaAnualCorrentista: 0.1394,
    programa: 'CGI',
    maxLtv: 0.60,                 // LTV máx 60% (CGI/Home Equity)
    maxLtvCorrentista: 0.60,
    maxValorImovel: 1_000_000,
    prazoMaximoMeses: 360,        // 30 anos (CGI)
    aceitaMcmv: false,
    observacao: 'Daycoval não opera financiamento SBPE. Produto: Crédito com Garantia de Imóvel (CGI/Home Equity).',
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

// Caixa — MIP tabela oficial (faixas de 5 anos, alíquota mensal sobre SD)
// Faixa ≤50 = 0.000386 verificado no simulador caixa.gov.br (DOB 19/02/1979, R$400k, junho/2026)
// Demais faixas mantidas do módulo de referência; verificar se necessário para outras idades
export const CAIXA_MIP_RATES: Array<{ maxAge: number; taxa: number }> = [
  { maxAge: 30,  taxa: 0.000168 },
  { maxAge: 35,  taxa: 0.000204 },
  { maxAge: 40,  taxa: 0.000264 },
  { maxAge: 45,  taxa: 0.000348 },
  { maxAge: 50,  taxa: 0.000386 },
  { maxAge: 55,  taxa: 0.000636 },
  { maxAge: 60,  taxa: 0.000900 },
  { maxAge: 65,  taxa: 0.001344 },
  { maxAge: 999, taxa: 0.002040 },
]

// DFI Caixa — verificado: R$33,00 em R$500k = 0,0066%/mês sobre valor do imóvel
export const CAIXA_DFI_RATE  = 0.000066

// TA Caixa — Tarifa de Administração SFH, devida mensalmente (MO43000269 seção 3.18.3.5)
// Verificado no breakdown da parcela do simulador oficial: R$25,00/mês (fixo)
export const CAIXA_TA_MENSAL = 25.00

// MIP subsidiado para programas MCMV Faixas 1-3 — seguro habitacional governamental subsidiado
// Calibrado do simulador oficial Caixa (Faixas 1-3): valor ~10x menor que SBPE
// MCMV Classe Média (Faixa 4) usa MIP normal (não subsidiado) — produto SBPE com taxa reduzida
export const MIP_RATE_MCMV = 0.0000151

// DFI — Danos Físicos ao Imóvel
// IMPORTANTE: calculado sobre o VALOR DO IMÓVEL (não sobre o saldo devedor)
// Taxa fixa durante todo o contrato
// Fonte: mercado SFH (ponto médio entre Caixa ~0,006% e Itaú ~0,01337%)
export const DFI_RATE_MENSAL = 0.0000663 // 0,00663% ao mês sobre VALOR DO IMÓVEL

// ─── Itaú Seguradora — Nova Alíquota ───────────────────────────────────────
// Fonte: calibrado do simulador oficial Itaú (simulador itau.xlsm, CALCULOS!U32:U452)
// Extração: jun/2026 — cliente DOB 29/12/1980, prazo 396 meses, saldo R$1.054.500

// DFI Itaú (nova alíquota) — sobre VALOR DE AVALIAÇÃO do imóvel
export const ITAU_DFI_RATE = 0.0000554 // 0,00554% ao mês

// MIP Itaú — Período 1 (meses 0–120, primeiros 10 anos)
// Alíquota mensal sobre saldo devedor, por idade inteira (floor) do mutuário
// Idades 18–43: estimadas com base na progressão observada da tabela Itaú
// Idades 44–54: extraídas diretamente do simulador oficial (CALCULOS!U, ago/2025)
export const ITAU_MIP_P1: Record<number, number> = {
  18: 0.0000900, 19: 0.0000950, 20: 0.0001000,
  21: 0.0001080, 22: 0.0001140, 23: 0.0001200, 24: 0.0001270, 25: 0.0001350,
  26: 0.0001450, 27: 0.0001570, 28: 0.0001690, 29: 0.0001810, 30: 0.0001950,
  31: 0.0002080, 32: 0.0002220, 33: 0.0002370, 34: 0.0002530, 35: 0.0002700,
  36: 0.0002840, 37: 0.0002990, 38: 0.0003160, 39: 0.0003340, 40: 0.0003480,
  41: 0.0003580, 42: 0.0003660, 43: 0.0003740,
  // Valores exatos do simulador:
  44: 0.0003829000,
  45: 0.0004223775,
  46: 0.0004924938,
  47: 0.0005412695,
  48: 0.0005933640,
  49: 0.0006490816,
  50: 0.0007079316,
  51: 0.0008038063,
  52: 0.0008720327,
  53: 0.0009434927,
  54: 0.0010189828,
}

// MIP Itaú — Período 2 (meses 121+, após renovação decenal)
// Os valores resetam no 10º ano e voltam a crescer com a idade
export const ITAU_MIP_P2: Record<number, number> = {
  54: 0.0006585900,
  55: 0.0007160355,
  56: 0.0007773832,
  57: 0.0008443117,
  58: 0.0009174841,
  59: 0.0009991547,
  60: 0.0010918590,
  61: 0.0011983857,
  62: 0.0013214359,
  63: 0.0014637220,
  64: 0.0016274190,
  65: 0.0018145477,
  66: 0.002027, 67: 0.002269, 68: 0.002541, 69: 0.002847,
  70: 0.003190, 71: 0.003576, 72: 0.004008, 73: 0.004495,
  74: 0.005048, 75: 0.005691,
}

// MCMV — Minha Casa Minha Vida (Caixa, novas condições vigentes desde 22/04/2026)
// Fonte: Portaria MCID n° 333/2026, caixanoticias, infomoney, gov.br
// mipSubsidizado: Faixas 1-3 usam MIP_RATE_MCMV; Faixa 4 usa MIP normal (produto SBPE com juros reduzidos)
// mipSubsidizado: Faixas 1-3 e Classe Média usam MIP_RATE_MCMV (seguro subsidiado Caixa)
// Classe Média calibrado do simulador oficial Caixa: P=400k/420mo/8%aa → 1ª parcela R$3.565
export const MCMV_FAIXAS: Array<{ rendaMax: number; taxaAnual: number; programa: string; tetoImovel: number; mipSubsidizado: boolean }> = [
  { rendaMax: 3_200,  taxaAnual: 0.0400, programa: 'MCMV Faixa 1', tetoImovel: 270_000,  mipSubsidizado: true },
  { rendaMax: 5_000,  taxaAnual: 0.0650, programa: 'MCMV Faixa 2', tetoImovel: 350_000,  mipSubsidizado: true },
  { rendaMax: 9_600,  taxaAnual: 0.0766, programa: 'MCMV Faixa 3', tetoImovel: 400_000,  mipSubsidizado: true },
  { rendaMax: 13_000, taxaAnual: 0.0800, programa: 'MCMV Classe Média', tetoImovel: 600_000, mipSubsidizado: true },
]

// Caixa Pró-Cotista FGTS (imóveis até R$350k, mín. 36 meses FGTS)
export const CAIXA_PRO_COTISTA = {
  taxaAnual: 0.0866,   // 8,66% a.a. + TR
  maxValorImovel: 350_000,
  programa: 'Pró-Cotista FGTS',
}

export const TODOS_BANCOS: BancoId[] = [
  'caixa', 'itau', 'bradesco', 'santander', 'bb', 'inter', 'daycoval',
]

/** Bancos que oferecem financiamento na modalidade PRICE */
export const BANCOS_PRICE: BancoId[] = TODOS_BANCOS.filter(
  (id) => BANCOS_CONFIG[id].suportaPrice,
)

// ─── Inter — Sompo SuperHab SFH ──────────────────────────────────────────────
// Alíquota MIP mensal sobre saldo devedor, faixas de 5 anos
// Fonte: planilha "Tx Sompo SuperHab SFH" do simulador oficial Inter (nov/2024)
// Os valores estão em decimal (ex: 0.0000622 = 0,006% a.m.)
export const INTER_MIP_SOMPO: Array<{ maxAge: number; taxa: number }> = [
  { maxAge: 30,  taxa: 0.0000622 }, // 0,00622%
  { maxAge: 35,  taxa: 0.0000823 }, // 0,00823%
  { maxAge: 40,  taxa: 0.0001064 }, // 0,01064%
  { maxAge: 45,  taxa: 0.0001877 }, // 0,01877% — verificado: R$264,84 em R$1.411.000
  { maxAge: 50,  taxa: 0.0003262 }, // 0,03262% — verificado: salto no mês 20 (idade 46)
  { maxAge: 55,  taxa: 0.0005039 },
  { maxAge: 60,  taxa: 0.0006595 },
  { maxAge: 65,  taxa: 0.0009586 },
  { maxAge: 70,  taxa: 0.0015659 },
  { maxAge: 75,  taxa: 0.0025888 },
  { maxAge: 999, taxa: 0.0042099 },
]

// DFI Inter — sobre VALOR DO IMÓVEL
// Verificado: R$144,66 em R$1.690.000 = 0,008558%/mês
export const INTER_DFI_RATE = 0.00008558

// ─── Daycoval CGI ────────────────────────────────────────────────────────────
// MIP flat (sem variação por idade) — sobre saldo devedor
// Verificado: R$46,00 em R$200.000 = 0,023%/mês
export const DAYCOVAL_MIP_RATE = 0.000230

// DFI Daycoval — sobre VALOR ESTIMADO do imóvel
// Verificado: R$20,00 em R$500.000 = 0,004%/mês; R$12,00 em R$300.000 = 0,004%/mês
export const DAYCOVAL_DFI_RATE = 0.000040
