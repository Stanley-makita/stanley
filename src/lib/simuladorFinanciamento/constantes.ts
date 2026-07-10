import type { BancoId, TipoOperacao } from './tipos'

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
    // 11,29% a.a. + TR = Bonificação 1 (só "relacionamento: Sim", sem crédito salário/débito
    // automático) — confirmado jul/2026 por 6 simulações reais no caixa.gov.br (idades
    // 25/30/45 × SAC/PRICE, "Você tem ou gostaria de ter relacionamento? Sim" +
    // "crédito salário ou Previdência? Não"). O valor antigo (0.1119) era na verdade
    // Bonificação 2, que exige crédito salário/débito automático — requisito extra ainda
    // não modelado como campo de input separado (hoje o flag `correntista` é único).
    taxaAnualCorrentista: 0.1129,
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
    // Ajustado jul/2026: a taxa real do Bradesco varia por CPF/rating de crédito (igual
    // Itaú/Santander), não por correntista/segmento — não temos como replicar esse scoring,
    // então assumimos o piso praticado (11,90%) como premissa de calibração, sabendo que o
    // resultado real pode vir mais alto para um CPF específico.
    taxaAnualBase:        0.1190, // 11,90% a.a. — piso assumido (taxa real varia por CPF/rating)
    taxaAnualCorrentista: 0.1190,
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
    // Ajustado jul/2026: colapsado no piso (11,69%) para as duas variantes — a taxa real
    // varia por CPF/rating de crédito, não estritamente por relacionamento; sem como
    // replicar o scoring, assumimos sempre o piso praticado como premissa de calibração.
    taxaAnualBase:        0.1169, // 11,69% a.a. — piso assumido (taxa real varia por CPF/rating)
    taxaAnualCorrentista: 0.1169,
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
    // Ajustado jul/2026: não temos como saber a taxa real do BB pra um CPF específico
    // (varia por rating de crédito); assumido 12,00% como piso de calibração até termos
    // dado melhor.
    taxaAnualBase:        0.1200, // 12,00% a.a. — piso assumido (taxa real varia por CPF/rating)
    taxaAnualCorrentista: 0.1200,
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

// Caixa — MIP tabela oficial (alíquota mensal sobre SD)
// Faixa ≤50 = 0.000386 verificado no simulador caixa.gov.br (DOB 19/02/1979, R$400k, junho/2026)
// Faixa 35 mantida do módulo de referência — ainda sem dado real (ver nota de
// monotonicidade abaixo).
//
// Faixa ≤40 corrigida em jul/2026: 0.000264 → 0.000093, confirmado testando o simulador
// oficial (imóvel R$1,6M novo, idade 38, sem renda, "financiando valor máximo", PRICE).
// Cálculo limpo (sem precisar assumir taxa de juros, só 1ªParcela − últimaParcela, que
// bate exato entre Fonti e oficial): seguro real = R$209,76; DFI fixo (0.000066 × 1,6M) =
// R$105,60; MIP implícito = R$104,16 / R$1.120.000 financiado = **0.000093 exato** —
// idêntico à faixa ≤25 já confirmada, não aos 0.000264 que o código usava. Antes da
// correção, a 1ª parcela do PRICE divergia R$191,53 (SAC: R$218,90) — proporcionalmente
// grande porque o imóvel é caro; passaria despercebido em valores menores.
//
// Faixas ≤25/≤30/≤45 recalibradas em jul/2026 com um dataset limpo: 12 simulações reais
// no caixa.gov.br, mesmo imóvel (R$450k, usado, Maringá-PR), cruzando idade (25/30/45) ×
// sistema (SAC/PRICE) × relacionamento (com/sem), sempre coluna "Caixa Residencial
// Habitacional". Isolando o MIP+DFI da 1ª parcela via PRICE (que não exige nenhuma taxa de
// juros assumida — basta 1ªParcela − últimaParcela, já que a última não tem seguro), as
// 4 combinações (SAC/PRICE × com/sem) deram resultados idênticos por idade (58,99 / 59,94 /
// 109,08 respectivamente para 25/30/45, com e sem relacionamento) — ou seja,
// **relacionamento NÃO afeta o seguro**. A hipótese anterior (que sugeria variar por
// relacionamento) vinha de um bug real e separado, também corrigido nesta sessão:
// `taxaAnualCorrentista` estava em 0.1119 (Bonificação 2) em vez de 0.1129 (Bonificação 1,
// o cenário real de "relacionamento: Sim" sem crédito salário) — ver o campo em
// `BANCOS_CONFIG.caixa` abaixo. Com DFI fixo em 0.000066 sobre valor do imóvel
// (R$450k → R$29,70/mês), os MIPs implícitos batem em números redondos: ≤25 = 0.000093
// (idêntico ao já confirmado por outro caso-âncora, R$1,2M/idade 25/jul-2026), ≤30 =
// 0.000096, ≤45 = 0.000252. Com os dois bugs corrigidos, todos os 12 casos batem a
// 1-2 centavos (ver `criteria-migracao-fase4-caixa.test.ts`).
//
// Faixa ≤35 corrigida em jul/2026: 0.000204 → 0.000116, confirmado testando o simulador
// oficial (SBPE, imóvel R$550k novo, Balcão/sem relacionamento, nascimento 15/10/1993 —
// 32 anos, PRICE 360 meses). Cálculo limpo (1ªParcela − últimaParcela): seguro real =
// R$3.159,98 − R$3.086,17 = R$73,81; DFI fixo (0.000066 × 550.000) = R$36,30; MIP
// implícito = R$37,51 / R$323.342,11 financiado = **0.000116** — confirma a suspeita
// anterior de que 0.000204 estava superestimada, e resolve a inconsistência de
// monotonicidade (0.000116 fica corretamente entre ≤30=0.000096 e ≤40=0.000093, coerente
// com o "plateau" das idades jovens observado nas outras faixas confirmadas).
//
// Faixas ≤55/≤60/≤65/999 corrigidas em jul/2026: dataset de 5 simulações reais (SBPE
// Balcão, imóvel R$550k novo, PRICE), uma por faixa, idades 48/53/58/63/70 (todas com
// aniversário já passado em 2026, prazo reduzido automaticamente pelo teto de idade da
// Caixa — usado aqui como confirmação de que a idade certa caiu em cada faixa). Mesmo
// cálculo limpo (1ªParcela − últimaParcela − DFI):
//   idade 48 (≤50): R$121,50 / R$314.755,08 = 0.000386 — já estava certa, sem mudança.
//   idade 53 (≤55): R$203,92 / R$301.653,00 = 0.000676 (era 0.000636).
//   idade 58 (≤60): R$412,16 / R$268.856,03 = 0.001533 (era 0.000900 — bem subestimada).
//   idade 63 (≤65): R$627,37 / R$229.722,09 = 0.002731 (era 0.001344 — quase metade).
//   idade 70 (999):  R$599,21 / R$183.863,11 = 0.003259 (era 0.002040).
// Sequência agora estritamente crescente com a idade em toda a tabela, coerente com o
// perfil atuarial esperado. A faixa 999 (66+) continua sendo um único valor "catch-all"
// calibrado só com um ponto (idade 70) — pode não representar bem idades bem mais altas
// (75-80+); sem dado real acima de 70 não dá pra refinar mais.
export const CAIXA_MIP_RATES: Array<{ maxAge: number; taxa: number }> = [
  { maxAge: 25,  taxa: 0.000093 },
  { maxAge: 30,  taxa: 0.000096 },
  { maxAge: 35,  taxa: 0.000116 },
  { maxAge: 40,  taxa: 0.000093 },
  { maxAge: 45,  taxa: 0.000252 },
  { maxAge: 50,  taxa: 0.000386 },
  { maxAge: 55,  taxa: 0.000676 },
  { maxAge: 60,  taxa: 0.001533 },
  { maxAge: 65,  taxa: 0.002731 },
  { maxAge: 999, taxa: 0.003259 },
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
//
// Idades 18–43: CORRIGIDO em 2026-07-06 (Fase 3 da migração para o motor agnóstico) com
// os valores REAIS da tabela oficial "Tabela MIP" (seguradora Itaú, tabela ATUAL) extraída
// diretamente de VALIDADE!AH11:AI36 no simulador itau.xlsm — a mesma planilha que já
// origina as idades 44+ abaixo. Antes desta correção, essas 26 idades eram estimativas
// interpoladas ("com base na progressão observada"), sem nenhum dado real por trás. A
// idade 44 (fronteira com o bloco abaixo) bate exatamente entre as duas fontes
// (0,03829% na tabela vs. 0,0003829 já calibrado), confirmando que é a mesma tabela viva
// usada pelo simulador oficial. Ver docs/calibracao-simuladores/migracao-motor-agnostico-fase-3-itau.md
// para o antes/depois completo desta correção e docs/calibracao-simuladores/casos-ancora/itau-casos.json.
// Idades 44–54: extraídas diretamente do simulador oficial (CALCULOS!U, ago/2025) —
// não alteradas nesta correção (mantêm mais casas decimais de precisão que a tabela
// VALIDADE, que arredonda em 7 casas — ver nota no documento da Fase 3 sobre por que
// não foram unificadas com a mesma fonte).
export const ITAU_MIP_P1: Record<number, number> = {
  18: 0.0001031, 19: 0.0001031, 20: 0.0001031,
  21: 0.0001031, 22: 0.0001031, 23: 0.0001031, 24: 0.0001031, 25: 0.0001031,
  26: 0.0001031, 27: 0.0001031, 28: 0.0001031, 29: 0.0001031, 30: 0.0001031,
  31: 0.0001581, 32: 0.0001612, 33: 0.0001645, 34: 0.0001683, 35: 0.0001746,
  36: 0.0002477, 37: 0.0002589, 38: 0.0002730, 39: 0.0002903, 40: 0.0003114,
  41: 0.0003198, 42: 0.0003185, 43: 0.0003486,
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
// mipSubsidizado: Faixas 1-3 usam MIP_RATE_MCMV (seguro subsidiado, baixa renda); Classe
// Média usa MIP normal (idade, igual ao SBPE) — produto SBPE com taxa reduzida, não é
// beneficiário do subsídio habitacional do FGTS.
//
// Corrigido em jul/2026: um comentário mais antigo aqui já dizia isso corretamente
// ("Faixa 4 usa MIP normal"), mas o campo `mipSubsidizado` da Classe Média no array abaixo
// estava `true` (contradição introduzida numa sessão anterior) — descoberto testando o
// cenário real do usuário (renda R$13.000, imóvel R$450k usado): a última parcela batia
// exatamente com o simulador oficial (juros/amortização corretos), mas a 1ª divergia em
// ~R$21-22, tanto no SAC quanto no PRICE. Reconstruindo o seguro implícito do oficial via
// a diferença entre 1ª e última parcela: ≈R$55/mês — bate com MIP normal por idade (idade
// 26, faixa ≤30 = 0,000096) + DFI padrão (0,000066), não com o MIP subsidiado (0,0000151),
// que daria só ≈R$34/mês.
//
// Classe Média corrigido em jul/2026: era 0.0800 (calibração antiga, fonte não documentada
// com precisão — "P=400k/420mo/8%aa"), confirmado ERRADO contra o normativo oficial
// MO30824 v040 §6.5 ("parametros mcmv.pdf"), que traz 10,00% nominal / 10,47% efetiva —
// mesma fonte que já havia sido documentada em base-criterios-caixa.md numa sessão
// anterior, mas nunca propagada pro código. Usado o valor EFETIVO (0.1047), consistente
// com a convenção do restante do arquivo (taxaAnualBase/Correntista também são efetivas,
// convertidas via `taxaAnualParaMensal` = (1+taxaAnual)^(1/12)-1).
//
// ⚠️ Pendência (decisão do usuário, jul/2026): Faixas 1 e 3 NÃO foram atualizadas nesta
// rodada. O normativo mostra que a taxa real varia por 4 dimensões — faixa de renda (7
// sub-faixas, não as 4 usadas aqui), região (N/NE vs CO/S/SE), elegibilidade a desconto
// FGTS, e redutor de 0,5% (≥3 anos FGTS) — nenhuma dessas é capturada pelo modelo atual
// (`rendaMax`+`taxaAnual` fixo). Os valores hoje (4%/7,66%) batem com combinações "com
// desconto" específicas do normativo, não com a taxa geral. Reconstrução completa (novos
// campos de input: região, elegibilidade a desconto, redutor) fica para uma sessão
// futura — decisão explícita de não fazer isso agora, escopo grande demais pra este ciclo.
//
// Faixa 2 corrigida em jul/2026: 0.0650 → 0.0723 (efetiva), confirmado testando o
// simulador oficial (renda R$5.000, sem FGTS/redutor, Maringá-PR/Sul) — bate exatamente
// com o normativo MO30824 v040 §2.1, bracket "de R$4.000,01 a R$5.000,00, com desconto,
// sem redutor 0,5%, região CO/S/SE" (nominal 7,00% / efetiva 7,2290%). Mesma ressalva das
// outras faixas: dentro do próprio range da Faixa 2 (R$3.200,01–5.000) o normativo tem
// OUTROS 2 sub-brackets com taxas menores (5,25%/5,38% até R$3.500; 6,00%/6,17% até
// R$4.000) — 0.0723 é o valor certo só pra quem está na ponta de cima (R$4.000,01–5.000);
// clientes com renda mais baixa dentro da Faixa 2 vão ficar com uma taxa um pouco mais
// alta que a real deles até a reconstrução completa (mesma limitação estrutural de
// sempre, um valor único por faixa em vez dos 7 sub-brackets do normativo).
export const MCMV_FAIXAS: Array<{ rendaMax: number; taxaAnual: number; programa: string; tetoImovel: number; mipSubsidizado: boolean }> = [
  { rendaMax: 3_200,  taxaAnual: 0.0400, programa: 'MCMV Faixa 1', tetoImovel: 270_000,  mipSubsidizado: true },
  { rendaMax: 5_000,  taxaAnual: 0.0723, programa: 'MCMV Faixa 2', tetoImovel: 350_000,  mipSubsidizado: true },
  { rendaMax: 9_600,  taxaAnual: 0.0766, programa: 'MCMV Faixa 3', tetoImovel: 400_000,  mipSubsidizado: true },
  { rendaMax: 13_000, taxaAnual: 0.1047, programa: 'MCMV Classe Média', tetoImovel: 600_000, mipSubsidizado: false },
]

// Caixa Pró-Cotista FGTS (imóveis até R$500k, mín. 36 meses FGTS)
// maxValorImovel corrigido em jul/2026: 350_000 → 500_000, confirmado pelo normativo
// MO30824 v040 §5.2/5.4 ("parametros mcmv.pdf") — "enquadramento ... limitado a
// R$500.000,00". O valor 350k era uma discrepância já registrada (sem resolução) em
// base-criterios-caixa.md; o R$300.000 que aparece no documento como "financiamento
// máximo" é 60% de 500k (a quota, não o teto de valor do imóvel) — conceito diferente,
// não confundir os dois.
// ⚠️ Pendência não corrigida nesta rodada: a quota máxima do Pró-Cotista é 60% (SAC e
// SFA/TP, tabela §5.4) — hoje o código não sobrescreve o LTV pro Pró-Cotista, ele herda o
// LTV do SBPE (80%/70%), então o teto de financiamento efetivo pode ficar maior que o
// real. Precisa de um campo de LTV próprio no critério do Pró-Cotista (mudança de
// arquitetura pequena, mas não feita agora — fora do escopo combinado desta sessão).
export const CAIXA_PRO_COTISTA = {
  taxaAnual: 0.0866,   // 8,66% a.a. + TR
  maxValorImovel: 500_000,
  programa: 'Pró-Cotista FGTS',
}

// Regra oficial: idade + prazo de financiamento não pode ultrapassar 80 anos e 6 meses.
// Movida de engine.ts para cá (Fase 1 da migração para o motor agnóstico — ver
// docs/calibracao-simuladores/arquitetura-motor-agnostico.md) para que tanto engine.ts
// quanto criteria-resolver.ts possam ler o mesmo valor sem criar import circular entre
// os dois. engine.ts reexporta esta constante para preservar o import externo existente
// (src/lib/workflows/motor-simulacao.ts importa LIMITE_IDADE_PRAZO_MESES de engine.ts).
export const LIMITE_IDADE_PRAZO_MESES = 966 // 80 anos e 6 meses

// Idade assumida quando "prazo máximo" é pedido sem data de nascimento. Fixa e jovem (em
// vez de "a mais velha ainda compatível com o maior prazo entre os bancos") de propósito:
// 25 anos + qualquer prazo hoje cadastrado (até 420 meses/35 anos) sempre fica bem dentro
// do limite de 80a6m, então nenhum banco é truncado por essa escolha — e a parcela/MIP
// resultante fica realista (comparável ao simulador oficial), em vez de superestimada.
// O aviso "Idade estimada" (idadeEstimada) já existente no PDF/WhatsApp cobre o risco de o
// cliente real ser mais velho. Calibrado em sessão de comparação com o simulador oficial
// da Caixa (julho/2026) — ver docs/calibracao-simuladores/.
export const IDADE_JOVEM_ASSUMIDA_ANOS = 25

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

// ─── Vocabulário regional — terreno/lote ─────────────────────────────────────
// Termos sinônimos para uso em camada de interpretação e ajuda contextual no formulário.
// Em Maringá/PR e região, "data" é termo popular para lote/terreno urbano.
// "greba" é variação comum de "gleba". Todos mapeiam para tipoOperacao = 'lote_urbanizado'.
export const TERMOS_TERRENO = [
  'terreno', 'lote', 'lote urbano', 'lote urbanizado',
  'data', 'data de terra',
  'gleba', 'greba',
  'fração de terra', 'fracao de terra',
  'pedaço de terra', 'pedaco de terra',
  'terreno vazio', 'terreno próprio', 'lote próprio', 'data própria', 'gleba própria',
] as const

// Teto Caixa SBPE para lote urbanizado (mesmo teto do SFH geral)
export const LOTE_URBANIZADO_MAX_VALOR = 2_250_000

// Observações contextuais por modalidade — exibidas no resultado e no PDF
export const OBSERVACOES_MODALIDADE: Record<TipoOperacao, string> = {
  aquisicao: '',
  comercial:
    'Imóvel comercial não se enquadra em MCMV ou Pró-Cotista. Simulação gerada via Carta de Crédito SBPE/SFI da Caixa. Para outros bancos, nossa equipe verifica condições específicas.',
  lote_urbanizado:
    'Para terreno/lote urbanizado, a Caixa é a principal referência operacional. Em Maringá e região, os termos terreno, lote, data, gleba e greba referem-se ao mesmo tipo de operação. Simulação sujeita à análise documental e de engenharia.',
  construcao_terreno_proprio:
    'O valor considerado é a soma do terreno estimado com o orçamento da obra. A liberação dos recursos pela Caixa depende de análise de engenharia, documentação do imóvel/projeto e evolução da obra.',
  terreno_mais_construcao:
    'O valor considerado é a soma do valor de compra do terreno com o orçamento da obra. A liberação dos recursos ocorre conforme regras da Caixa, documentação e evolução da obra.',
}
