# Base de Critérios Estruturada — Caixa Econômica Federal (v2)

> Engenharia do conhecimento, sem implementação. **Reconstrução completa** desta
> base a partir dos documentos atualizados na pasta do projeto — a versão
> anterior (baseada em `MO43000269`, que não existe mais no projeto) foi
> **desconsiderada por completo**, conforme solicitado. As diferenças entre as
> duas versões estão detalhadas em `docs/calibracao-simuladores/delta-base-caixa.md`.
>
> **Não há código, `SimulationCriteria` ou Programas Especiais implementados
> aqui.** O par `base-criterios-caixa.json` acompanha este documento com os
> mesmos dados em formato de dados — não é o formato definitivo do Fonti.

## 0. Documentos analisados, vigência e status

| Documento | Arquivo no projeto | Versão | Vigência / data-base | Status | Cobertura desta análise |
|---|---|---|---|---|---|
| **MO43000271** | `_projeto/simuladores bancos/Juros caixa imobiliario/271.pdf` | — | **26/06/2026** (rodapé) | **Vigente.** Sucede o antigo MO43000269 (não confirmado textualmente no documento — inferência por numeração sequencial e ausência do arquivo antigo no projeto; grau de confiança **médio** para essa relação de sucessão, **alto** para o conteúdo em si) | Lido integralmente, 69 páginas |
| **MO30769** | `_projeto/simuladores bancos/Juros caixa imobiliario/taxas caixa.pdf` | v031 micro | Baseado em atas até 20/01/2026 (Informe DEHAB DECCI 454/2026) | **Vigente, sem alteração de conteúdo** em relação à análise anterior (mesmo texto, byte a byte) | Lido integralmente, 5 páginas |
| **MO30824** | `_projeto/simuladores bancos/Juros caixa imobiliario/MO30824040.pdf` | **v040** | Sem data de vigência explícita; conteúdo reflete a reforma do MCMV pós-2023 (Faixas 1/2/3/Classe Média nominadas) | **Vigente** — é a versão mais nova encontrada | Lido integralmente, 21 páginas |
| ~~MO30824~~ | `_projeto/simuladores bancos/Juros caixa imobiliario/30824.pdf` | v036 | — | **Superado pela v040.** Mesmo documento, versão anterior — **desconsiderado**, exceto para registrar o que mudou (seção 8) | Lido integralmente, 20 páginas, só para comparação |
| **MO43062** | `_projeto/simuladores bancos/Juros caixa imobiliario/analise de credito e risco de renda.pdf` | v042 | **27/01/2025** (rodapé) | **Vigente.** Campo "normativos revogados": "Não se aplica" — é uma atualização incremental da mesma norma, não uma substituição de outro código | Lido integralmente, 36 páginas |
| **Anexo IV — Uso do FGTS** (do MO43000) | `_projeto/simuladores bancos/Juros caixa imobiliario/uso do fgts.pdf` | — | Sem data explícita | **Vigente, "Sem alterações"** declarado no próprio cabeçalho em relação à versão anterior do anexo | Lido integralmente, 14 páginas |
| **30.844** (Formulário Cliente Habitação) | `_projeto/formulariosbancos/FORMULARIOS/CAIXA/MO30341047.pdf` | v003 micro | — | Vigente, inalterado desde a análise anterior | Lido integralmente, 2 páginas — **operacional** |
| **33.377** (Guia de Pesquisa Vendedores) | `_projeto/formulariosbancos/FORMULARIOS/CAIXA/2-GUIA DE PESQUISA VENDEDORES - .pdf` | v020 micro | — | Vigente | Lido integralmente, 4 páginas — **operacional**, confirma apenas o fluxo de consulta SCR/SIRIC já mapeado |
| **Anexo II** (Autorização Saldo Devedor — Interveniente Quitante) | `_projeto/formulariosbancos/FORMULARIOS/CAIXA/Autorização Saldo Devedor- IQ.pdf` | — | — | Vigente | Lido integralmente, 1 página — **operacional puro**, sem critério de simulação |
| DAMP (Declaração de Enquadramento) | `_projeto/formulariosbancos/FORMULARIOS/CAIXA/DAMP certa (2).html` | — | — | Vigente, inalterado | Não relido nesta rodada (conteúdo já coberto por MO43000271 e Anexo IV) — **operacional** |

**Nenhuma planilha/simulador (XLS/XLSX/XLSM) da Caixa foi encontrada no projeto** — igual à análise anterior. Toda a base é normativa/textual.

### Correspondência com os nomes citados pelo usuário

| Nome citado | Documento real | Confirmação |
|---|---|---|
| MO43000271 | `271.pdf` | Confirmado — mesmo número, mesma família de manual ("Concessão de Crédito Imobiliário PF — Aquisição e Construção — Rede Parceira") |
| MO43062 | `analise de credito e risco de renda.pdf` | Confirmado pelo próprio rodapé do documento: "MO43062 v042" |
| MO30824 | `MO30824040.pdf` (vigente) e `30824.pdf` (superado) | Confirmado — mesmo manual, duas versões (v040 e v036) |
| Uso do FGTS | `uso do fgts.pdf` | Confirmado — é o "Anexo IV — Uso do FGTS" do MO43000, citado no corpo do MO43000271 |
| Taxas Caixa | `taxas caixa.pdf` | Confirmado — é o MO30769 v031 (mesmo conteúdo da análise anterior) |
| Simuladores/planilhas | — | **Não encontrados.** Nenhum XLS/XLSX/XLSM da Caixa existe no projeto |

---

## 1. Produtos

| Produto | Modalidades | Documento de origem | Página | Vigência | Confiança | Tipo |
|---|---|---|---|---|---|---|
| **PMCMV** | Aquisição Novo/Usado; Aquisição Terreno+Construção; Construção em Terreno Próprio; Conclusão/Ampliação/Reforma/Melhoria; Reforma/Melhoria PCD; Imóveis CAIXA/AMV | MO43000271 §3.1.2 | p.8-9 | 26/06/2026 | Alto | Regra permanente (estrutura do produto) |
| **Pró-Cotista** | Aquisição Novo/Usado; Aquisição Terreno+Construção; Construção em Terreno Próprio | MO43000271 §3.1.2/3.4.1.5 | p.8-9 / p.13 | 26/06/2026 | Alto | Regra permanente |
| **Carta de Crédito SBPE** | Aquisição Novo/Usado (residencial e comercial/misto); Aquisição Terreno+Construção (residencial); Construção em Terreno Próprio (residencial); Reforma Casa com Garantia de Imóvel; Aquisição de Lote Urbanizado (residencial); Imóveis CAIXA/AMV | MO43000271 §3.1.2 | p.8-9 | 26/06/2026 | Alto | Regra permanente |
| **Recursos Livres** | Aquisição Novo/Usado (residencial) | MO43000271 §3.1.2 | p.8-9 | 26/06/2026 | Alto | Regra permanente |
| **Programa Classe Média** | Aquisição Novo/Usado; Construção em Terreno Próprio; Aquisição Terreno+Construção | MO30824 v040 §6 | p.8-9 | v040 vigente | Alto | Parâmetro configurável (taxa e teto de financiamento revisados entre versões — ver seção 8) |
| **Imóveis CAIXA/AMV** (leilão/adjudicado) | Aquisição | MO30769 §4 / MO30824 v040 §4.4 | p.4 / p.6-7 | 20/01/2026 (MO30769) | Alto | Regra permanente (produto), taxa/quota parametrizável |
| **Crédito Imobiliário CDI** | Aquisição residencial de alto valor (> R$2.250.000) | MO30769 §1 | p.1 | 20/01/2026 | Alto | Regra permanente |
| **PMCMV Reconstrução RS** | Linha emergencial pós-calamidade | MO43000271 §3.9 | p.9 (citação) | 26/06/2026 | Baixo (cartilha própria não localizada) | Operacional/comercial |

Regras estruturais adicionais:
- Construção em Terreno Próprio e Aquisição de Terreno+Construção são **exclusivas de Pessoa Física** (MO43000271 §3.1.3, p.9). *Regra permanente.*
- Unidade vinculada a empreendimento CAIXA e Alocação de Recursos são variações de quota dentro de cada modalidade, não produtos à parte (MO30769 §3.1). *Regra permanente.*

---

## 2. Elegibilidade

### 2.1 Idade / idade + prazo

| Critério | Achado | Documento(s) verificados | Confiança |
|---|---|---|---|
| Idade máxima do proponente | **Não encontrada em nenhum documento normativo desta pasta**, incluindo o manual dedicado a análise de risco de crédito (MO43062) | MO43000271, MO30769, MO30824 (v040 e v036), MO43062, Uso do FGTS | Busca exaustiva — confiança **alta** de que a regra simplesmente não está nestes documentos |
| Idade + prazo (ex. "80 anos") | **Idem — não encontrada** | mesmos 5 documentos | mesma confiança |
| Valor hoje usado no motor Fonti | `LIMITE_IDADE_PRAZO_MESES = 966` (80 anos e 6 meses), `idadeMaximaAbsoluta = 80` | `constantes.ts` (não normativo) | **Baixo** — não confirmado por nenhum normativo Caixa lido até agora, inclusive nesta rodada, que ampliou a cobertura para 5 documentos (3 a mais que a rodada anterior) |

**Conclusão reforçada**: agora com o manual específico de risco de crédito (MO43062) analisado e sem essa regra, a hipótese mais provável é que o limite de idade+prazo seja uma regra de **sistema** (SIRIC/SICAQ/SIPAH, aplicada automaticamente no cálculo de capacidade de pagamento), não documentada em nenhum manual textual disponível — não necessariamente que ela não exista na prática da Caixa. **Ainda depende de confirmação por simulador real.**

### 2.2 FGTS — uso, impedimentos e Pró-Cotista

| Critério | Regra/valor | Documento | Página | Vigência | Confiança | Tipo |
|---|---|---|---|---|---|---|
| Tempo mínimo de trabalho sob regime FGTS | **3 anos** (36 meses), períodos somados, consecutivos ou não | Uso do FGTS (Anexo IV) §3.2.1.1-a | p.1-2 | Sem alterações (vigente) | Alto | Regra permanente |
| Impedimento — financiamento SFH ativo | Vedado uso de FGTS se já houver financiamento habitacional SFH ativo em qualquer parte do país | Uso do FGTS §3.2.1.1-b | p.1-2 | idem | Alto | Regra permanente |
| Impedimento — outro imóvel no município | Vedado se proprietário/possuidor/promitente comprador de imóvel residencial no município de residência ou trabalho (inclui limítrofes e Região Metropolitana/RIDE) | Uso do FGTS §3.2.1.1-c | p.1-2 | idem | Alto | Regra permanente |
| Interstício sobre o imóvel | Imóvel não pode ter sido objeto de uso do FGTS há **menos de 3 anos** (contado do registro em matrícula) — dispensado em Terreno+Construção, Construção em Terreno Próprio e espólio | Uso do FGTS §3.2.14.1/3.2.14.6 | p.6 | idem | Alto | Regra permanente |
| Pró-Cotista — requisito específico | Titularidade de CV FGTS ≥ 3 anos **com vínculo ativo OU** saldo em CV ≥ **10% do valor de avaliação** | MO43000271 §3.1.2/3.4.1.5 | p.8-9 / p.13 | 26/06/2026 | Médio — **não corroborado explicitamente** no MO30824 v040 nesta rodada (o manual FGTS/PMCMV trata taxa/quota do Pró-Cotista mas não repete esse critério de elegibilidade) | Regra permanente |
| Redutor de taxa por cotista FGTS | **-0,5 p.p.** na taxa, para quem tem ≥3 anos de FGTS | MO43000271 §4.6.9 **e** MO30824 v040 §3 (convergem) | p.53 (aprox.) / p.5-7 | ambos vigentes | **Alto — corroborado por 2 documentos independentes** | Regra permanente |
| Exceções ao impedimento por propriedade | Fração ideal ≤ 40%; separado com renúncia formal; usufrutuário/nu-proprietário com renúncia; sinistrado; doador a filho maior; cotista de consórcio; proprietário de imóvel comercial/rural; obra paralisada há mais de 365 dias; perda de residência por separação/divórcio/sinistro | Uso do FGTS §3.2.2 a §3.2.17 | p.1-8 | idem | Alto | Regra permanente |
| Regime de bens do casal | Tabela completa de contaminação de impedimento entre cônjuges por regime (Comunhão Universal/Parcial, Separação Convencional/Obrigatória, União Estável) | Uso do FGTS §3.2.2.1 | p.2-3 | idem | Alto | Regra permanente |
| Cessão de Direitos Creditórios do FGTS Futuro | Renda familiar ≤ R$2.640,00; comprometimento 20%–30%; VF mínimo R$2.000,00; prazo de amortização da cessão fixo em **120 meses** (financiamento até 420 meses); ≥6 depósitos nos últimos 12 meses | MO43000271 §3.7.17 **e** Uso do FGTS §5.3.c/5.5 (convergem) | p.31-32 / p.9 | ambos vigentes | **Alto — corroborado por 2 documentos** | Regra permanente |
| Limite de uso do FGTS na aquisição | Menor valor entre compra-e-venda e avaliação Caixa | Uso do FGTS §11.2 | p.10 | idem | Alto | Regra permanente |
| Limite de uso do FGTS na construção | Menor valor entre avaliação "como pronto", custo da obra, ou (obra + menor valor do terreno) conforme a modalidade | Uso do FGTS §11.3 | p.10-11 | idem | Alto | Regra permanente |
| Teto de valor de imóvel SFH | Remetido ao que for "definido pelo Conselho Monetário Nacional" — **não fixado neste anexo** | Uso do FGTS §11.1 | p.10 | idem | — | Parâmetro configurável (fonte externa: CMN) |
| Documentação — declaração do vendedor | Declaração de que o imóvel não foi objeto de uso do FGTS do vendedor nos últimos 3 anos | Uso do FGTS §13 | p.14 | idem | Alto | Operacional |

### 2.3 Renda (apuração e enquadramento)

| Critério | Regra/valor | Documento | Página | Vigência | Confiança | Tipo |
|---|---|---|---|---|---|---|
| Renda mínima (crédito comercial) | R$ 780,00 | MO43062 §3.6.1.4 | p.8 | 27/01/2025 | Alto | Parâmetro configurável |
| Validade de contracheque/FGTS/benefício INSS/declaração do empregador | **2 meses** | MO43062 §3.6.4 (vários subitens) | p.9-13 | 27/01/2025 | Alto | Regra permanente (prazo estrutural) |
| Validade de aplicação financeira (fora da Caixa) | **30 dias** mínimos | MO43062 §3.6.4 | p.11-12 | 27/01/2025 | Alto | Regra permanente |
| Renda via extrato FGTS | depósito mensal × **12,5** | MO43062 §3.6.4 (Extrato FGTS) | p.10 | 27/01/2025 | Alto | Regra permanente (fórmula) |
| Renda via notas fiscais (atividade rural) | **30% da média de vendas** dos últimos 12 meses | MO43062 §3.6.4 | p.14 | 27/01/2025 | Alto | Regra permanente |
| Renda via extrato de conta salário/aposentadoria | Média dos últimos 6 meses, descartando maior e menor (usa os 4 do meio) | MO43062 §3.6.4 | p.13 | 27/01/2025 | Alto | Regra permanente |
| Renda via DIRPF | Rendimento anual ÷ 12; regras extensas por tipo de rendimento (PJ, PF, livro caixa, rural, distribuição de lucros) | MO43062 §3.6.4.9 | p.15-22 | 27/01/2025 | Alto | Regra permanente |
| Validação cruzada CLT + FGTS | Usa o **maior valor** entre (depósito FGTS × 12,5) e valor do contracheque | MO43000271 §3.7.13.2.5/§4.6.5.1 | p.29/53 | 26/06/2026 — **regra nova** desta versão | Alto | Regra permanente |
| Pró-labore acima de 8,5 salários-mínimos | Exige comprovante de pagamento de DARF | MO43062 (changelog, p.2) | p.2 | 27/01/2025 — **regra nova** desta versão do manual | Alto | Parâmetro configurável (indexado ao salário-mínimo) |
| Dispensa de declaração de renda descontinuada | Soma ≤ R$600,00/ano **e** renda familiar mensal ≤ R$11.950,00 | MO43000271 §3.7.13.2.6.1 | p.28 | 26/06/2026 | Alto | Parâmetro configurável |
| Renda informal | Cadastrada sem documento comprobatório: tipo de atividade, data de início, valor mensal líquido — só depois de esgotar tentativa de enquadramento formal | MO43062 §3.6.5 | p.22 | 27/01/2025 | Alto | Regra permanente |
| Renda de cônjuge/dependente em DIRPF conjunta | Contada separadamente, **não soma** à renda do titular na apuração formal | MO43062 §3.6.4.9.4 | p.21-22 | 27/01/2025 | Alto | Regra permanente |
| Renda de menor de idade | Vedado usar para lastrear operação, exceto com autorização judicial | MO43062 §3.6.1.6 | p.8 | 27/01/2025 | Alto | Regra permanente |

### 2.4 Comprometimento de renda — ver seção 3.4 (tratado nas regras financeiras, com nota de conflito na seção 9)

### 2.5 Avaliação de risco de crédito

| Critério | Regra/valor | Documento | Página | Vigência | Confiança | Tipo |
|---|---|---|---|---|---|---|
| Resultados possíveis | Aprovado / Condicionado / Reprovado | MO43062 §3.7 | p.22 | 27/01/2025 | Alto | Regra permanente |
| Validade da avaliação | Comercial: **30 dias**. Habitacional: **180 dias** (da 1ª avaliação) | MO43062 §3.8 | p.23 | 27/01/2025 | Alto | Parâmetro configurável |
| Limite de solicitações | Comercial: até **10** em 30 dias. Habitacional: até **41** dentro da validade | MO43062 §3.8 | p.23 | 27/01/2025 | Alto | Parâmetro configurável |
| Defasagem SCR | Média de **2 meses** entre última consulta disponível e data-base | MO43062 §3.5/3.8 | p.7, 22 | 27/01/2025 | Alto | Regra permanente |
| Restrição SERASA/SCPC | Impede contratação (exceto Cheque Especial de conta salário e Consignado); severidade qualificada automaticamente | MO43062 §3.5 | p.7-8 | 27/01/2025 | Alto | Regra permanente |
| Restrição CADIN (Caixa/Bancos Federais) | Impede crédito comercial e habitacional | MO43062 §3.5 | p.7-8 | 27/01/2025 | Alto | Regra permanente |
| Restrição CADIN (Fiscais/Parafiscais) | Só restritivo para habitacional com recursos públicos | MO43062 §3.5 | p.7-8 | 27/01/2025 | Alto | Regra permanente |
| Restrição SCR (dívida vencida/prejuízo) | Restritivo para habitacional/comercial, exceto Consignado; regularização é condição para prosseguir | MO43062 §3.5 | p.7-8 | 27/01/2025 | Alto | Regra permanente |
| Consignado PAB (Auxílio Brasil) | Impede novas contratações comerciais (exceto cartão) | MO43062 §3.8.8 | p.23 | 27/01/2025 | Alto | Regra permanente |
| Restrição CCA/família até 3º grau | Correspondente CAIXA Aqui e parentes até 3º grau **não podem** ser parte em operações originadas no próprio estabelecimento | MO43000271 §3.3.1.2 | p.9 | 26/06/2026 — **regra nova** | Alto | Operacional/compliance |

### 2.6 Tipo de imóvel / imóvel impeditivo / localização — sem mudança de substância

A lista de imóveis impeditivos (contaminação, tombamento, hipoteca fora de IQ, uso institucional, multifamiliar, "Laje", hotel exceto unidade autônoma, etc.) e as regras de localização (Regime de Ocupação restrito a PE/Recife e RJ/Sul Fluminense, enfiteuse até 10/01/2003) permanecem substancialmente as mesmas da análise anterior, agora confirmadas por **MO43000271 §3.3.3** (p.10-13), com uma adição:

| Critério novo | Regra/valor | Documento | Página | Vigência | Confiança | Tipo |
|---|---|---|---|---|---|---|
| Alienação superveniente | Nova vedação de imóvel com registro de alienação superveniente, conforme Lei 14.711/2023 | MO43000271 §3.3.3.7 | p.12-13 | 26/06/2026 — **regra nova** | Alto | Regra permanente |

### 2.7 Pesquisas cadastrais obrigatórias

Confirmadas e ligeiramente detalhadas: SIRIC (Pesquisa Completa — engloba SINAD, CONRES, SICOW, CADIN, SERASA/SCPC), CADIN, SICOW/CRF, CONRES (com lista de códigos impeditivos específicos: 217750376, 431166, 472365, 472988, 473001, 141949987, 193997931), SIJUR (obrigatório se avaliação ≥ R$2 milhões com apontamento ativo) — MO43000271 §3.7.14.1, p.29-30. Validade das pesquisas dos proponentes remetida ao **MO43062**; demais participantes: **30 dias**. *Tipo: regra permanente.*

---

## 3. Regras financeiras

### 3.1 Taxas de juros e estratégia de relacionamento — SBPE/Recursos Livres (MO30769, inalterado)

Confirmado **sem qualquer mudança** em relação à análise anterior — mesmos 4 níveis (Balcão / Bonificação 1 / Bonificação 2 / Taxa Customizada), mesmas taxas efetivas:

| Nível | Residencial SFH | Residencial SFI | Comercial/Lote SFI | Construção Individual SFH | Construção Sustentável SFI | Documento | Página | Confiança | Tipo |
|---|---|---|---|---|---|---|---|---|---|
| Balcão | 11,49% | 12% | 13,50% | 12% | 13,40% | MO30769 §1 | p.1 | Alto | Comercial (política de relacionamento) |
| Bonificação 1 | 11,29% | 11,90% | 13% | 11,90% | 13,10% | MO30769 §1/§2 | p.1-2 | Alto | Comercial |
| Bonificação 2 | 11,19% | 11,80% | 12,15% | 11,80% | 12,80% | MO30769 §1/§2 | p.1-2 | Alto | Comercial |
| Taxa Customizada | 10,99% | — | — | — | — | MO30769 §2 | p.2 | Alto | **Comercial, não simulável** (depende de `relacionamento.caixa`, ferramenta interna) |

Reforma pré-fixada, CDI, Poupança CAIXA (fórmula 70% Selic / 6,17% fixo), suspensão de IPCA/Pré-fixada/Poupança para Aquisição/Construção — todos **confirmados sem mudança** (MO30769 §1, p.1; MO43000271 §3.7.2, p.22, convergem).

### 3.2 LTV / quota máxima (MO30769, inalterado) — SBPE/Recursos Livres

Tabela completa (Aquisição/Construção/Alocação de Recursos/Lote Urbanizado/Reforma × SAC/PRICE × TR/CDI/Pré-fixado) **confirmada sem mudança numérica** — ver `docs/calibracao-simuladores/base-criterios-caixa.json` para os valores completos. *Documento: MO30769 §3.1, p.3. Confiança: Alta. Tipo: Parâmetro configurável.*

Regra de cálculo do valor-base da quota (menor valor entre compra/avaliação; limite de 80% para a parte do terreno em Terreno+Construção) **confirmada e repetida** em MO43000271 §3.7.3, p.23. *Confiança: Alta (corroborado por 2 documentos). Tipo: Regra permanente.*

### 3.3 Prazos (MO30769 + MO43000271, convergem sem conflito)

| Critério | Regra/valor | Documento | Página | Confiança | Tipo |
|---|---|---|---|---|---|
| Aquisição TR Residencial SAC/PRICE | 120–420 / 120–360 meses | MO30769 §3.3 | p.3 | Alto | Parâmetro configurável |
| Construção TR SAC/PRICE | 120–420 / 156–360 meses | MO30769 §3.3 | p.3 | Alto | Parâmetro configurável |
| Reforma pré-fixado | 60–180 meses | MO30769 §3.3 | p.3 | Alto | Parâmetro configurável |
| Fase de construção | 2–24 meses, prorrogável a 36 (FGTS) / 30 (SBPE) | MO43000271 §3.6.6.1 | p.18 | Alto | Regra permanente |
| Reenquadramento Construção→Conclusão | obra executada > 70% | MO43000271 §3.6.7.2 | p.18-19 | Alto | Regra permanente |
| Antecipação de recursos de obra | até 20% do VF de obra, entre 1ª/2ª parcela | MO43000271 §3.6.8.3 | p.20 | Alto | Regra permanente |
| **Antecipação de parcela intermediária** | **Não é mais permitida** para contratos assinados a partir de **02/01/2023** | MO43000271 §3.6.8.3 (nota) | p.20 | Alto — **regra alterada/restringida** vs. entendimento anterior | Regra permanente |
| Última parcela do cronograma de obra | não pode ser inferior a **5%** | MO43000271 §3.6.10.3 | p.20 | Alto — **detalhe novo** | Regra permanente |
| Cessão FGTS Futuro | amortização fixa em 120 meses, independente do prazo do financiamento (até 420) | MO43000271 §3.7.17 | p.31-32 | Alto | Regra permanente |
| Carência | até 6 meses (Ilha Pura/calamidade), reduz quota em 3pp | MO30769 (implícito) + MO43000271 §3.7.7 | p.25 | Alto | Regra permanente |
| **Carência — antecipação de amortização** | Construção individual/PF vinculada a empreendimento em obra: **não é mais possível** antecipar a fase de amortização durante a carência | MO43000271 §3.7.7.2.8 | p.25 | Alto — **regra alterada** (changelog explícito do documento) | Regra permanente |
| Prazo de registro do contrato | 30 dias, prorrogável +15 | MO43000271 (estrutural) | — | Alto | Regra permanente |
| **Validade do Laudo de Avaliação** | **720 dias** (CAIXA/AMV e FAR/PAR) vs. **180 dias** (demais imóveis) | MO43000271 §4.6.8.3 | — | Alto — **detalhe novo**, não capturado antes | Operacional |

### 3.4 Comprometimento de renda — ⚠️ ver conflito na seção 9

| Fonte | Regra | Documento | Página | Vigência | Confiança |
|---|---|---|---|---|---|
| SBPE/Recursos Livres (produto) | **SAC até 30% / PRICE até 25%** | MO30769 §3.2 | p.4 | 20/01/2026 (atas mais recentes citadas) | Alto |
| Risco de crédito (motor de avaliação) | **Teto único de até 30%**, sem distinção SAC/PRICE, "podendo ser menor conforme perfil de risco do cliente" | MO43062 §3.7.1.4 | p.22 | 27/01/2025 | Alto |
| Cessão FGTS Futuro | comprometimento entre **20% e 30%** | MO43000271 §3.7.17 / Uso do FGTS §5.5.3 | p.31-32 / p.9 | 26/06/2026 | Alto |

**Resolução (ver seção 9)**: não é um conflito real, é uma diferença de granularidade — o teto de **produto** (30%/25% por sistema de amortização) é o parâmetro mais específico e mais recente; o teto de **risco** (30% geral, ajustável para baixo pelo motor de score) é uma camada adicional que pode restringir ainda mais, nunca liberar acima do teto do produto.

### 3.5 SAC / PRICE — fórmulas

Confirmadas em ambas as versões dos manuais (MO43000271 §3.18.3, p.39, e o cálculo já documentado anteriormente a partir do MO43000269): `AM = SD/N` (SAC); PRICE recalculada com o SD atualizado pelo prazo remanescente. **Não foi possível, nesta rodada, confirmar se a redação exata da fórmula PRICE mudou** entre as versões 269→271 (o novo documento descreve o método de forma textual, sem repetir a equação algébrica que a versão anterior trazia) — ver seção 9, ponto de atenção. *Confiança: Média para a equivalência exata da fórmula; Alta para a lógica geral. Tipo: Regra permanente.*

### 3.6 Tarifas

| Tarifa | Regra/valor | Documento | Página | Vigência | Confiança | Tipo |
|---|---|---|---|---|---|---|
| Avaliação de bens em garantia | R$750,00 (1ª etapa) + remanescente na assinatura | MO43000271 §3.12.3 | p.33-34 | 26/06/2026 | Alto — **confirmado novamente, valor sem mudança** | Parâmetro configurável |
| Administração (TA) | Valor na Tabela de Tarifas externa (não fixado no corpo) | MO43000271 §3.18.3.5 | p.40 | 26/06/2026 | Baixo (numérico) / Alto (existência da regra) | Parâmetro configurável |
| **Desconto de TA (FGTS/PMCMV)** | Até **R$25,00**, até a liquidação, para renda ≤ R$2.850,00 | MO30824 v040 §12 | p.16-19 | v040 vigente | Alto — **corrobora indiretamente** o valor de R$25/mês já usado no motor Fonti (é o valor do desconto aplicável, sugestivo de que a TA cheia é próxima desse valor para o público subsidiado) | Parâmetro configurável |
| Acompanhamento da Operação (TAO) | % sobre parcela liberada para terreno | MO43000271 §3.13.1 | p.34-35 | 26/06/2026 | Alto | Parâmetro configurável |
| Reavaliação (SBPE) | A cada vistoria de obra | MO43000271 §3.13.2 | p.35 | 26/06/2026 | Alto | Operacional |
| Despesas cartorárias/acessórias | até 5% do VF | MO43000271 §3.7.8 | p.26 | 26/06/2026 | Alto | Parâmetro configurável |
| **Comissão de leiloeiro** | até 5% do VF — **regra nova**, específica para imóveis retomados por credores FGTS | MO43000271 §4.6.2.4.12 / MO30824 v040 §10 | p.49 / p.11 | ambos vigentes, convergem | Alto — **corroborado por 2 documentos** | Parâmetro configurável |

### 3.7 IOF

Confirmado sem mudança: incide só sobre financiamento de imóvel comercial (à vista na aquisição, parcelado na construção); incide também sobre prêmios de seguro de imóvel comercial. *MO43000271 §3.12.5, p.34. Confiança: Alta. Tipo: Regra permanente.*

### 3.8 ITBI

**Continua sem regra de cálculo/incorporação em nenhum documento analisado**, incluindo os 4 documentos novos desta rodada. Única menção seguiria sendo de compliance/PLD (não verificada novamente nesta rodada por não ter sido reportada pelos agentes, mas não há indício de mudança). *Confiança: Alta (ausência confirmada). Tipo: N/A.*

### 3.9 MIP / DFI / DFC — avanço importante desta rodada

| Critério | Regra/valor | Documento | Página | Vigência | Confiança | Tipo |
|---|---|---|---|---|---|---|
| Base de cálculo MIP | Sobre saldo devedor atualizado | MO43000271 §3.18.3.6 | p.40 | 26/06/2026 | Alto | Regra permanente |
| Base de cálculo DFI/DFC | Sobre valor da garantia | MO43000271 §3.18.3.6 | p.40 | 26/06/2026 | Alto | Regra permanente |
| Unidade vinculada a empreendimento | só MIP na fase de obra; DFI só a partir da amortização | MO43000271 §3.18.3.6 | p.40 | 26/06/2026 | Alto | Regra permanente |
| **Alíquotas MIP/DFI/DFC — operações FGTS/PMCMV** | **Tabelas completas por faixa etária (18-25 até 76-80a6m) e tipo de apólice** (CAIXA Residencial Habitacional PMCMV/Mais vs. Habitacional FGTS/Especial/Especial Ampliado), variando de ~0,008% a ~0,55% | **MO30824 v040 §13** | p.18-20 (v040: p.19-21) | v040 vigente | **Alto — GAP PARCIALMENTE FECHADO** nesta rodada (antes só se sabia que existiam, agora há números concretos, ainda que só para o universo FGTS/PMCMV) | Parâmetro configurável |
| Alíquotas MIP/DFI — operações SBPE/Recursos Livres (uso geral do Fonti hoje) | **Ainda não confirmadas** — continuam remetidas ao "Anexo III — Roteiro para contratação dos Seguros", não presente no projeto | — | — | — | Baixo (mesma lacuna de antes, para o produto que o Fonti efetivamente simula hoje) | Parâmetro configurável |
| DFI não aplicável a Lote Urbanizado | Confirmado no formulário 30.844 (item 3), não contradito por nenhum documento novo | MO30341047/30.844 | p.2 | inalterado | Alto | Regra permanente |
| Seguradoras | CAIXA Residencial, TokioMarine, TooSeguros | MO30341047/30.844 (não relido, sem indicação de mudança) | p.2 | inalterado | Médio | Comercial |

**Observação importante**: os valores numéricos hoje usados no motor Fonti (`CAIXA_MIP_RATES`, `CAIXA_DFI_RATE`) foram calibrados a partir do **simulador oficial da Caixa** para o produto SBPE — não são, portanto, diretamente substituíveis pelas tabelas do MO30824 (que são específicas de operações com recurso FGTS/PMCMV, um produto diferente do que o Fonti simula hoje como "Caixa" padrão). Não alterar isso sem confirmar qual produto o Fonti realmente representa.

---

## 4. FGTS — consolidado (uso geral + Pró-Cotista)

Ver seção 2.2 para a tabela completa. Resumo de mudanças relevantes desta rodada:
- **Anexo IV (Uso do FGTS) confirmado como "sem alterações"** em relação à versão anterior — os impedimentos e exceções já detalhados permanecem os mesmos.
- **Redutor de 0,5% e regra da Cessão FGTS Futuro agora corroborados por 2 documentos independentes** (MO43000271 e MO30824/Uso do FGTS), aumentando a confiança de Média para Alta.
- **A regra "saldo ≥10% do valor de avaliação" do Pró-Cotista permanece sourced de um único documento** (MO43000271) — não foi encontrada no Anexo IV nem no MO30824 nesta rodada. Não é uma contradição, é uma lacuna de corroboração.

---

## 5. MCMV / Programa Classe Média — seção nova (antes, dados só calibrados externamente)

Esta é a maior evolução desta rodada: o manual **MO30824** estava totalmente ausente antes; agora está disponível (2 versões, v040 vigente) com dados financeiros completos.

### 5.1 Faixas de renda × teto de imóvel por porte de município (MO30824 v040 §1, p.1-2)

| Faixa de renda | Teto de imóvel (dentro do limite do município) | Documento | Confiança | Tipo |
|---|---|---|---|---|
| Até R$5.000,00 (Grande Metrópole Nacional, ≥750 mil hab.) | R$275.000 | MO30824 v040 §1 | Alto | Parâmetro configurável |
| Até R$5.000,00 (demais portes, tabela completa) | R$210.000 a R$270.000 conforme porte | MO30824 v040 §1 | Alto | Parâmetro configurável |
| Acima de R$5.000,00 | R$400.000 (teto único, todos os municípios) | MO30824 v040 §1 | Alto | Parâmetro configurável |

### 5.2 Enquadramento por faixa nominada (MO30824 v040 §1.1, p.2 — nomenclatura nova desta versão)

| Renda familiar | Valor do imóvel | Faixa (v040) |
|---|---|---|
| até R$3.200 | dentro do limite do município | Faixa 1 |
| até R$3.200 | acima do limite até R$400 mil | Faixa 3 |
| até R$3.200 | R$400 mil a R$600 mil | Classe Média |
| R$3.200,01–5.000 | dentro do limite | Faixa 2 |
| R$3.200,01–5.000 | acima até R$400 mil | Faixa 3 |
| R$3.200,01–5.000 | R$400 mil a R$600 mil | Classe Média |
| R$5.000,01–9.600 | até R$600 mil | Classe Média |
| R$9.600,01–13.000 | até R$600 mil | Classe Média |

*Documento: MO30824 v040 §1.1, p.2. Vigência: v040. Confiança: Alta. Tipo: Regra permanente (estrutura), valores parametrizáveis.*

### 5.3 Taxas por faixa de renda — PMCMV Imóvel Novo/Usado (MO30824 v040 §2.1, p.5-6 — idêntica à v036)

Tabela completa de taxas nominal/efetiva por faixa de renda (R$0–2.160 a R$5.000,01–9.600), separada por região (N/NE vs. CO/S/SE), com/sem desconto, com/sem redutor de 0,5% — ver `base-criterios-caixa.json` para os valores completos (7 faixas × 4 variações = 28 combinações). *Confiança: Alta. Tipo: Parâmetro configurável.*

### 5.4 Pró-Cotista (MO30824 v040 §5, p.7-8 — idêntica à v036)

| Critério | Valor | Confiança |
|---|---|---|
| Taxa nominal / efetiva | 8,66% / 9,0121% a.a. | Alto |
| Quota máxima | 60% (SAC e SFA/TP) | Alto |
| Prazo | 60 a 420 meses | Alto |
| Faixa de financiamento | R$80.000 a R$300.000 | Alto |
| Teto de imóvel | R$500.000 (300k = 60% de 500k) | Alto |

*Tipo: Parâmetro configurável.*

### 5.5 Programa Classe Média (MO30824 — mudou entre versões, ver seção 8)

| Critério | v036 (superado) | **v040 (vigente)** | Confiança |
|---|---|---|---|
| Taxa nominal/efetiva | 10,00% / 10,47% a.a. | 10,00% / 10,47% a.a. (sem mudança) | Alto |
| Quota máxima | 80% (SFA/TP) / 60% (SAC) | idem | Alto |
| Prazo | 120 (SFA/TP) ou 240 (SAC) a 420 meses | idem | Alto |
| **Financiamento mínimo/máximo** | **R$100.000 a R$400.000** | **R$100.000 a R$480.000** | Alto — **regra alterada** |
| Público-alvo | Renda ≤ R$13.000,00 | idem | Alto |

*Tipo: Parâmetro configurável.*

### 5.6 Descontos/subsídios PMCMV (MO30824 v040 §12, p.13-19 — fórmulas idênticas, 2 cláusulas novas)

Fórmula geral do desconto de complemento de aquisição/construção:
```
D = Frenda × (1 + (FD/R + Fdfin + FUH)/100) × Fpop
```
- Limites: R$1.500 (mínimo) a R$65.000 (Norte) / R$55.000 (demais regiões); limitado a R$49.500 no Programa Carta de Crédito Individual para imóveis prontos.
- Componentes (`FD/R` por UF, `Fdfin` por relação dívida/renda, `FUH` por tipologia da unidade, `Fpop` por recorte populacional) têm tabelas completas e estáveis entre as duas versões — ver JSON.
- Reduções do desconto: 20% (construção em terreno próprio do beneficiário), **70% (família unipessoal — Fator Social)**, 50% (imóvel usado), 30% (imóveis CAIXA/AMV).
- Desconto para redução de prestação (diferencial de juros + TA): limitado a 75% do saldo devedor inicial, calculado com Selic acumulada trimestral.

*Documento: MO30824 v040 §12. Confiança: Alta. Tipo: Parâmetro configurável (valores/tabelas) sobre Regra Permanente (fórmula).*

**Regras novas na v040** (ausentes na v036 — ver detalhamento na seção 8):
- Regras de devolução de desconto só valem a partir da fase de amortização (§12.5).
- Transferência de titularidade entre mutuários originários (inclusive por separação/divórcio) **não gera devolução** de desconto, desde que sem cessão a terceiro (§12.5.1).

### 5.7 Hierarquização de propostas (seleção quando há limite orçamentário CCFGTS)

| Critério | v036 | **v040 (vigente)** |
|---|---|---|
| Prioridade geral | renda ≤ R$5.000 | renda ≤ R$5.000 (Carta de Crédito Individual/Associativo/Apoio à Produção) |
| Prioridade Pró-Cotista | não diferenciada | **renda ≤ R$9.600** — critério novo/diferenciado |
| Calamidade pública | não previsto | **novo item 11.2.1** — prioridade para municípios em calamidade |

*Documento: MO30824 v040 §11, p.11-12. Confiança: Alta. Tipo: Operacional/comercial (regra de fila de originação, não afeta o valor da simulação individual).*

---

## 6. Programas especiais (identificação apenas — não modelados)

| Programa | Regras próprias | Taxas próprias | Cotas próprias | Elegibilidade própria | Fonte |
|---|---|---|---|---|---|
| MCMV (Faixas 1/2/3) | Sim | Sim | Sim (teto por faixa/porte) | Sim (renda por faixa) | MO30824 v040 |
| Programa Classe Média | Sim | Sim (10%/10,47%) | Sim (60-80%) | Sim (renda ≤ R$13.000) | MO30824 v040 |
| Pró-Cotista | Sim | Sim (8,66%/9,01%) | Sim (60%) | Sim (3 anos FGTS + vínculo/saldo) | MO30824 v040 + MO43000271 |
| Taxa Customizada | Sim | Sim (mais baixa) | Sim | Sim (só via ferramenta interna) | MO30769 |
| Imóveis CAIXA/AMV | Sim | Sim (por prazo mínimo) | Sim (até 100% s/ compra) | Não (elegibilidade geral) | MO30769 + MO30824 |
| Selo Casa Azul (Construção Sustentável) | Sim (parcial) | Sim (redutor por nível) | Não | Sim (obrigatório no SFI construção individual) | MO30769 |
| FGTS Futuro / Cessão de Direitos | Sim | Não | Não | Sim (renda ≤ R$2.640, comprometimento 20-30%) | MO43000271 + Uso do FGTS |
| PMCMV Reconstrução RS | Sim (cartilha própria) | Desconhecida | Desconhecida | Sim (calamidade) | MO43000271 (citação) |
| Crédito Imobiliário CDI | Sim | Sim | Não (mesma tabela, exceto PRICE) | Sim (imóvel > R$2,25M) | MO30769 |

---

## 7. Restrições (consolidado)

Ver detalhamento por seção acima. Lista consolidada de restrições **novas ou alteradas** nesta rodada:

1. **CCA e família até 3º grau** impedidos de contratar no próprio estabelecimento (MO43000271 §3.3.1.2 — nova).
2. **Alienação superveniente** (Lei 14.711/2023) passa a ser imóvel impeditivo explícito (MO43000271 §3.3.3.7 — nova).
3. **Antecipação de parcela intermediária de obra não é mais permitida** para contratos a partir de 02/01/2023 (MO43000271 §3.6.8.3 — restrição nova/esclarecida).
4. **Não é mais possível antecipar a fase de amortização durante carência** para construção individual/PF vinculada a empreendimento (MO43000271 §3.7.7.2.8 — restrição nova).
5. **Interveniente Quitante para liquidação de Home Equity de outra IF passou a ser PERMITIDO** — inversão de uma vedação anterior (MO43000271 §3.7.10.4/3.7.10.6 — ver conflito na seção 9).
6. Renda acima de R$5.000 não recebe descontos PMCMV, exceto Pró-Cotista com regras próprias (MO30824 — já conhecido, reconfirmado).
7. Consignado PAB impede novas contratações comerciais, exceto cartão (MO43062 — novo nesta base).

Restrições já conhecidas e **reconfirmadas sem mudança**: teto SFH R$2.250.000, suspensão de IPCA/Pré-fixada/Poupança em Aquisição/Construção, lista de imóveis impeditivos, vedação de uso de FGTS em Reforma/antecipação de obra no SBPE, vedação de imóvel misto em certas modalidades.

---

## 8. O que mudou entre MO30824 v036 → v040 (detalhamento)

| # | Mudança | v036 | v040 | Impacto em simulação |
|---|---|---|---|---|
| 1 | Nomenclatura de faixas | Sem rótulos, só faixas de renda numéricas | "Faixa 1/2/3/Classe Média" nominadas | Nenhum impacto numérico, só organização |
| 2 | **Teto de financiamento Classe Média** | **R$400.000,00** | **R$480.000,00** | **Sim — muda o teto de simulação para esse programa** |
| 3 | Hierarquização de propostas | Só R$5.000 (geral) | R$5.000 (geral) + **R$9.600 (Pró-Cotista)** + prioridade por calamidade | Afeta fila de originação, não o valor da parcela |
| 4 | Devolução de desconto | Sem exceção para transferência entre mutuários | Isenta transferência entre mutuários originários (inclusive separação/divórcio), regra só vale a partir da amortização | Afeta cenário de portabilidade/transferência, não a simulação inicial |
| 5 | Demais (taxas, quotas, prazos, fórmulas de desconto, tabelas MIP/DFI) | idênticas | idênticas | Nenhum |

---

## 9. Conflitos identificados e resolução

Conforme instrução do usuário: **em caso de conflito, prevalece o documento mais recente**; documento revogado é registrado e desconsiderado.

| # | Conflito | Documentos em conflito | Resolução | Status |
|---|---|---|---|---|
| 1 | MO30824 v036 vs v040 (mesmo manual, 2 versões) | `30824.pdf` (v036) vs `MO30824040.pdf` (v040) | **v040 prevalece** por ser a versão de maior número/mais recente. v036 registrado e desconsiderado, exceto para documentar as 2 mudanças reais (seção 8) | **Resolvido** |
| 2 | Comprometimento de renda: 30%/25% por sistema (MO30769) vs. teto único de 30% "podendo ser menor" (MO43062) | MO30769 §3.2 vs. MO43062 §3.7.1.4 | **Não é conflito de substituição, é complementaridade**: o teto de produto (30%/25%) é o parâmetro de simulação; o teto de risco (30% redutível) é uma camada adicional do motor de score que pode restringir ainda mais — nunca contradiz, só pode ser mais conservador | **Resolvido por interpretação, não por prevalência de data** |
| 3 | Interveniente Quitante para Home Equity de outra IF: vedado (entendimento anterior, baseado no MO43000269) vs. permitido (MO43000271 §3.7.10.4/3.7.10.6) | MO43000269 (descontinuado) vs. MO43000271 (vigente) | **MO43000271 prevalece** — documento mais recente, mudança explícita no próprio changelog do documento | **Resolvido — regra alterada, não mero erro de leitura** |
| 4 | Fórmula exata do PRICE: equação algébrica explícita (entendimento anterior, do MO43000269) vs. descrição textual sem equação (MO43000271) | MO43000269 (descontinuado, não disponível para reconferência) vs. MO43000271 | **Não é possível resolver com certeza** — o documento antigo não está mais disponível para comparação byte a byte. Assume-se que a lógica (SAC/PRICE conforme já implementado) permanece válida, mas a **igualdade exata da fórmula não pôde ser reconfirmada** nesta rodada | **Não resolvido — ver seção 10 (dependência de simulador real)** |
| 5 | Regra de "saldo ≥10%" do Pró-Cotista: citada só no MO43000271, ausente no Anexo IV (Uso do FGTS) e no MO30824 v040 | MO43000271 vs. (ausência em) Uso do FGTS e MO30824 | Não é uma contradição factual (nenhum documento nega a regra), é uma **lacuna de corroboração** — mantido o valor do MO43000271 por ser o único que o declara | **Parcialmente resolvido — vale re-confirmar se surgir um manual específico do Pró-Cotista** |

---

## 10. Informações que ainda dependem de simuladores reais

1. **Alíquotas de MIP/DFI para operações SBPE/Recursos Livres** (o produto que o Fonti simula hoje como "Caixa" padrão) — só as alíquotas de FGTS/PMCMV foram encontradas (MO30824). O "Anexo III — Roteiro para contratação dos Seguros" continua ausente do projeto.
2. **Valor exato da Tarifa de Administração (TA)** para clientes fora do público FGTS/PMCMV subsidiado — só o valor do desconto (até R$25,00) foi encontrado, não o valor cheio da tarifa.
3. **Regra de idade/idade+prazo** — busca exaustiva em 5 documentos normativos não encontrou nada; precisa de confirmação via simulador oficial ou de um manual de originação/formalização ainda não identificado.
4. **Equação exata da fórmula PRICE** na versão vigente (ver conflito #4).
5. **Corroboração da regra de saldo ≥10% do Pró-Cotista** em uma segunda fonte.

## 11. Informações que dependem de parametrização futura (estruturais, não numéricas)

1. Como representar as **8 combinações de faixa de renda × porte de município × teto de imóvel** do MCMV — é uma matriz de 2 dimensões, mais granular do que o `MCMV_FAIXAS` simples hoje no motor Fonti.
2. Como representar os **4 componentes da fórmula de desconto do PMCMV** (`Frenda`, `FD/R`, `Fdfin`, `FUH`, `Fpop`) — cada um com sua própria tabela/fórmula, se o Fonti algum dia precisar simular o valor do subsídio, não só a taxa final.
3. Como (e se) representar o **Programa Classe Média** como uma variante separada do MCMV ou como um produto próprio (hoje `MCMV_FAIXAS` no Fonti já tem uma entrada "Classe Média", mas com teto de R$600.000 — diferente do teto de financiamento de R$480.000 encontrado aqui; são conceitos distintos: **teto de valor do imóvel** vs. **teto de valor financiado** — atenção a essa distinção ao calibrar).
4. Como representar a **hierarquização de propostas** (fila de originação por renda/calamidade) — é uma regra de alocação de orçamento do FGTS, não uma regra de cálculo de parcela; provavelmente fica fora do motor de simulação.
5. Como representar a **camada dupla de comprometimento de renda** (teto de produto + teto de risco reduzível) sem duplicar lógica.

---

## 12. O que deve ficar fora do motor por ser apenas operacional

- Formulário 30.844 (débito em conta, declaração SCR/LGPD, proposta de seguro habitacional) — **100% operacional**, nenhum critério de cálculo.
- Formulário 33.377 (Guia de Pesquisa Vendedores) — **100% operacional**, só formaliza a autorização de consulta cadastral já mapeada como regra (SIRIC/CADIN/CONRES).
- Anexo II (Autorização Saldo Devedor — Interveniente Quitante) — **100% operacional**, formulário de repasse de dados entre bancos.
- DAMP (Declaração de Enquadramento) — **100% operacional**, formaliza a autoclassificação do cliente em produto/modalidade já coberta pelas regras de elegibilidade.
- Toda a Seção 4 do MO43000271 ("Procedimentos") — fluxo de atendimento do Correspondente CAIXA Aqui, cadastro no SIOPI, abertura de conta, PLD/FTP — processo interno, sem variável de cálculo de parcela.
- Hierarquização de propostas do MO30824 (fila de orçamento FGTS) — afeta se a proposta é aceita pelo orçamento do período, não o valor calculado da parcela.
- Pesquisas cadastrais (SIRIC/CADIN/CONRES/SIJUR) enquanto **processo** — o *resultado* (aprovado/reprovado) é elegibilidade; o *processo* de consulta em si é operacional.

---

## 13. Referência cruzada com o código já implementado (não alterado)

| Item no código (`constantes.ts`) | Confirmado pelos novos documentos? |
|---|---|
| `taxaAnualBase = 0.1149` / `taxaAnualCorrentista = 0.1119` | **Sim, reconfirmado** (MO30769 inalterado) |
| `maxLtv = 0.80` / `maxLtvPrice = 0.70` | **Sim, reconfirmado** |
| `comprometimentoMaxPrice = 0.25` / SAC 0.30 | **Sim, reconfirmado — e agora com uma nuance adicional do MO43062** (ver seção 9, conflito 2) |
| `maxValorImovel = 2_250_000` / `prazoMaximoMeses = 420` | **Sim, reconfirmado** |
| `CAIXA_TA_MENSAL = 25.00` | **Ainda não confirmado numericamente para o público geral**, mas agora há um indício indireto (desconto de até R$25 para público FGTS de baixa renda) |
| `CAIXA_MIP_RATES` / `CAIXA_DFI_RATE` | **Ainda não confirmado para SBPE** (o produto do Fonti); **agora existe uma tabela real, mas só para FGTS/PMCMV** — não usar diretamente sem validar o produto |
| Penalidade de -10pp de LTV para imóvel usado | **Removida do código em 2026-07-07** — não encontrada em nenhum normativo e desmentida por simulação real no simulador oficial (SAC 80%/PRICE 70% para usado, iguais às de novo). Ver `migracao-motor-agnostico-fase-4-caixa.md`, seção "Remoção da penalidade de LTV para imóvel usado" |
| `LIMITE_IDADE_PRAZO_MESES = 966` / `idadeMaximaAbsoluta = 80` | **Ainda não encontrada** (busca ampliada, mesmo resultado) |
| `MCMV_FAIXAS` | **Parcialmente confirmável agora** — a estrutura de faixas existe, mas a granularidade real (renda × porte de município) é maior do que a implementação atual; os valores de teto de imóvel por faixa simples **não batem exatamente** com a matriz completa do MO30824 (ver seção 11, ponto 3) |
| `CAIXA_PRO_COTISTA.taxaAnual = 0.0866` | **Sim, confirmado exatamente** — MO30824 v040 confirma 8,66% nominal / 9,0121% efetivo |
| `CAIXA_PRO_COTISTA.maxValorImovel = 350_000` | **Não confirmado** — o MO30824 indica teto de **R$500.000** para o Pró-Cotista (300 mil = 60% de 500 mil), não R$350.000. **Discrepância a investigar** (não corrigida aqui, conforme instrução de não alterar código) |

---

## 14. Fontes utilizadas nesta reconstrução

- `_projeto/simuladores bancos/Juros caixa imobiliario/271.pdf` — MO43000271, 69 páginas, lido integralmente.
- `_projeto/simuladores bancos/Juros caixa imobiliario/taxas caixa.pdf` — MO30769 v031, 5 páginas, lido integralmente (conteúdo idêntico à rodada anterior).
- `_projeto/simuladores bancos/Juros caixa imobiliario/MO30824040.pdf` — MO30824 v040 (vigente), 21 páginas, lido integralmente.
- `_projeto/simuladores bancos/Juros caixa imobiliario/30824.pdf` — MO30824 v036 (superado), 20 páginas, lido integralmente só para comparação.
- `_projeto/simuladores bancos/Juros caixa imobiliario/analise de credito e risco de renda.pdf` — MO43062 v042, 36 páginas, lido integralmente.
- `_projeto/simuladores bancos/Juros caixa imobiliario/uso do fgts.pdf` — Anexo IV (MO43000), 14 páginas, lido integralmente.
- `_projeto/formulariosbancos/FORMULARIOS/CAIXA/MO30341047.pdf` — 30.844 v003, 2 páginas, lido integralmente (operacional).
- `_projeto/formulariosbancos/FORMULARIOS/CAIXA/2-GUIA DE PESQUISA VENDEDORES - .pdf` — 33.377 v020, 4 páginas, lido integralmente (operacional).
- `_projeto/formulariosbancos/FORMULARIOS/CAIXA/Autorização Saldo Devedor- IQ.pdf` — Anexo II, 1 página, lido integralmente (operacional).
- `src/lib/simuladorFinanciamento/constantes.ts` e `engine.ts` — referência cruzada, **não alterados**.
- `docs/calibracao-simuladores/base-criterios-caixa.md` (versão anterior, agora substituída) — usada só para gerar o `delta-base-caixa.md`.

**Documentos ainda ausentes do projeto**: Anexo III (Roteiro de Seguros — alíquotas MIP/DFI do produto SBPE), Anexo VI (Códigos de Convênio), Anexo VII (Resumo de Modalidades), Anexo VIII (Definições), Tabela de Tarifas (site institucional), Tabela de Municípios (site institucional — referenciada extensivamente pelo MO30824), manual específico do Pró-Cotista (se existir separado do MO30824), planilhas/simuladores oficiais da Caixa.
