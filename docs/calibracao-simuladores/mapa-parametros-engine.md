# Mapa de Parâmetros — Motor de Simulação (`engine.ts`)

> Levantamento do código atual (`src/lib/simuladorFinanciamento/engine.ts` + `constantes.ts` + UI de config em `BancosLista.tsx`), cruzado com a biblioteca técnica em `docs/calibracao-simuladores/biblioteca-bancos/`. **Nenhum código foi alterado nesta tarefa** — este é um documento de mapeamento para orientar o que precisa sair do hardcoded e virar critério configurável.

Classificação usada em cada item:
1. **Já existe no código** — o parâmetro é lido e usado no cálculo hoje.
2. **Está hardcoded** — valor fixo em `constantes.ts`, sem caminho de configuração.
3. **Precisa virar configuração** — hoje hardcoded, mas varia por banco/produto/tempo o suficiente para justificar virar campo editável (DB + UI).
4. **Foi encontrado na biblioteca técnica** — há dado público (`biblioteca-bancos/*.md`) que confirma, contradiz ou aproxima o valor hoje no código.
5. **Não foi encontrado e precisa calibração empírica** — nem o código nem a biblioteca têm o dado; só descobrível rodando simulações reais.

Um mesmo parâmetro frequentemente recebe **mais de uma classificação simultaneamente** (ex.: "já existe" + "hardcoded" + "precisa virar config").

---

## 0. Já existe caminho de configuração hoje (DB + UI) — ponto de partida

A tabela `bancos` (Supabase) e a tela `Configurações > Bancos` (`BancosLista.tsx`) já permitem editar, **por banco**, via UI:

| Campo na UI/DB | Mapeia para (engine) | Realmente usado no cálculo? |
|---|---|---|
| `taxa_anual` | `overrides.taxaAnual` | **Sim** — sobrescreve `taxaAnualBase`/`taxaAnualCorrentista` |
| `prazo_maximo` | `overrides.prazoMaximoMeses` | **Sim** — sobrescreve `cfg.prazoMaximoMeses` |
| `ltv_maximo` | `overrides.maxLtv` | **Sim** — sobrescreve `maxLtv`/`maxLtvCorrentista` (mesmo valor para os dois) |
| `seguro_mip` | `overrides.mipRate` | **Sim** — sobrescreve a alíquota MIP mensal calculada |
| `seguro_dfi` | `overrides.dfiRate` | **Sim** — sobrescreve a alíquota DFI mensal (exceto Itaú/Caixa, que usam DFI próprio embutido no cálculo especializado, ver seção 2) |
| `taxa_admin` | `overrides.taxaAdmin` | **NÃO — bug/gap confirmado.** O campo existe na interface `BancoSimOverrides` e é editável na UI para qualquer banco, mas **nenhuma função de cálculo em `engine.ts` lê `overrides?.taxaAdmin`**. A única tarifa de administração aplicada é `CAIXA_TA_MENSAL` (constante fixa, só para Caixa), hardcoded diretamente em `calcularSACCaixa`/`calcularPRICECaixa`. **Hoje, editar "Tarifa de Administração" na tela de Bancos não tem nenhum efeito na simulação de nenhum banco, incluindo a Caixa.** |

**Não existe** caminho de configuração (nem DB nem UI) para: `maxLtvPrice`, `comprometimentoMaxPrice`, `suportaPrice`, `maxValorImovel`, `aceitaMcmv`, `programa`, tabelas de MIP por idade (todas), tabelas MCMV/Pró-Cotista, regra de idade+prazo, percentual de ITBI incorporável, comprometimento de renda genérico (30%).

---

## 1. Parâmetros de `BancoConfig` (um valor fixo por banco)

| Parâmetro | Caixa | Itaú | Bradesco | Santander | BB | Inter | Daycoval | Classificação |
|---|---|---|---|---|---|---|---|---|
| `taxaAnualBase` | 11,49% | 11,90% | 12,30% | 12,49% | 11,74% | **9,50%** | 13,94% | 1, 2, 3, 4 (parcial), 5 (parcial) — ver nota abaixo |
| `taxaAnualCorrentista` | 11,19% | 11,90% (igual à base) | 12,30% (igual à base) | 11,69% | 11,60% | 9,50% (igual à base) | 13,94% (igual à base) | 1, 2, 3, 4 (parcial), 5 (parcial) |
| `maxLtv` (aquisição) | 80% | 80% | 80% | 80% | 80% | 80% | — | 1, 2, 4 (conflito p/ Itaú e Santander), 5 (Inter) |
| `maxLtvCorrentista` | 80% | 80% | 80% | 80% | 80% | 80% | — | 1, 2 — **nenhum dos 5 bancos pesquisados tem confirmação pública de LTV diferenciado por relacionamento**; hoje o código não diferencia (mesmo valor de `maxLtv` na prática) |
| `maxLtvPrice` | 70% | — | — | — | — | — | — | 1, 2, 3, 5 |
| `comprometimentoMaxPrice` | 25% | — | — | — | — | — | — | 1, 2, 3, 4 (só Bradesco/BB têm dado público, e nenhum dos dois está implementado) |
| `suportaPrice` | true | true | **false** | false | **false** | false | — | 1, 2, 3, **4 (contradição encontrada — ver seção 6)** |
| `maxValorImovel` | 2.250.000 | 0 (sem limite) | 0 | 0 | 5.000.000 | 0 | 1.000.000 | 1, 2, 3, 5 (a maioria) |
| `prazoMaximoMeses` | 420 | 420 | 420 | 420 | 420 | 420 | 360 | 1, 2, 4 (convergente p/ Itaú/Bradesco/BB; não confirmado p/ Santander; **conflito com Inter** — ver seção 6) |
| `aceitaMcmv` | true | false | false | false | **false** | false | — | 1, 2, **4 (contradição para BB — ver seção 6)** |
| `programa` | 'SBPE' (+ MCMV/Pró-Cotista dinâmico) | 'SBPE' | 'SBPE' | 'SBPE' | 'SBPE' | 'SBPE' | 'CGI' | 1, 2 |

**Nota sobre taxas (`taxaAnualBase`/`taxaAnualCorrentista`):** este é o parâmetro com maior volatilidade de mercado e o que a biblioteca técnica classificou como maior lacuna geral (ver `pendencias-de-calibracao.md`, seção 6). Cruzando valor a valor:

| Banco | Valor no código | Faixa encontrada na biblioteca | Compatível? |
|---|---|---|---|
| Itaú | 11,90% (base e correntista iguais) | 11,60%–11,90% a.a. (conflito entre fontes) | Compatível com o teto da faixa, mas biblioteca não confirma que base = correntista |
| Bradesco | 12,30% (base e correntista iguais) | 11,49%–13,99% a.a. (grande dispersão) | Dentro da faixa, mas faixa é larga demais para validar com confiança |
| Santander | 12,49% base / 11,69% correntista | 11,69%–11,79% padrão / 6,99% bonificado promocional | Correntista bate com o "padrão" da biblioteca (11,69%), mas a base (12,49%) é mais alta que qualquer valor "padrão" encontrado — **possível confusão entre taxa "sem relacionamento" e taxa "cheia" de tabela antiga** |
| Banco do Brasil | 11,74% base / 11,60% correntista | "a partir de 11,60% a.a." (oficial, sem discriminar relacionamento) | Correntista bate exatamente; base (11,74%) não tem contraparte confirmada |
| Inter | **9,50% (base e correntista iguais)** | 13,76% a.a. padrão (não oficial) / **9,00% a.a. + TR é a taxa do Pró-Cotista (FGTS), não do produto residencial padrão** (oficial) | **Discrepância relevante — ver seção 6, item destacado** |
| Daycoval | 13,94% efetivo (CGI) | Daycoval não fez parte dos 5 bancos pesquisados na biblioteca | Não verificável — biblioteca não cobre este banco |

---

## 2. Seguros — MIP (Morte e Invalidez Permanente)

| Tabela/constante | Banco(s) | Fonte declarada no código | Classificação |
|---|---|---|---|
| `MIP_RATES` (genérica, 6 faixas de 10 anos) | Bradesco, Santander, BB (qualquer banco fora de Caixa/Itaú/Inter/Daycoval) | "tabela referência SFH (junho/2026)" — comentário não cita simulador específico | 1, 2, **3 — é a tabela usada por 3 dos 5 bancos pesquisados sem nenhuma delas ter uma tabela própria calibrada**, 5 (biblioteca confirma que nenhum dos 5 bancos publica fórmula de MIP — ver `pendencias-de-calibracao.md` seção 8) |
| `CAIXA_MIP_RATES` (9 faixas de 5 anos) | Caixa | "verificado no simulador caixa.gov.br" (1 ponto de calibração real citado: DOB 19/02/1979, R$400k) | 1, 2 — calibrado empiricamente contra simulador real, fora do escopo dos 5 bancos da biblioteca (Caixa não foi pesquisada) |
| `ITAU_MIP_P1` / `ITAU_MIP_P2` | Itaú | Idades 44–54 (P1) "extraídas diretamente do simulador oficial"; **idades 18–43 "estimadas com base na progressão observada"** (não verificadas) | 1, 2, 4 (parcial — biblioteca confirma que existe variação por idade e por período de 10 anos, mas não publica valores), **5 para as idades 18–43, que são interpoladas, não reais** |
| `INTER_MIP_SOMPO` (10 faixas de 5 anos) | Inter | "planilha Tx Sompo SuperHab SFH do simulador oficial Inter (**nov/2024**)" | 1, 2, 4 (biblioteca não achou seguradora do Inter — este código na verdade **já tem o nome, Sompo, que a biblioteca não encontrou** — vale reportar de volta), **3 (dado de nov/2024, quase 2 anos antes da pesquisa — recomenda-se reverificar)** |
| `DAYCOVAL_MIP_RATE` (flat, sem variação por idade) | Daycoval | "Verificado: R$46,00 em R$200.000" | 1, 2 — calibrado empiricamente, fora do escopo da biblioteca |
| `MIP_RATE_MCMV` | Caixa (MCMV Faixas 1–3 e Classe Média) | "Calibrado do simulador oficial Caixa" | 1, 2 — calibrado empiricamente |

## 3. Seguros — DFI (Danos Físicos ao Imóvel)

| Constante | Banco(s) | Fonte declarada | Classificação |
|---|---|---|---|
| `DFI_RATE_MENSAL` (0,00663%/mês) | Bradesco, Santander, BB | **"Fonte: mercado SFH (ponto médio entre Caixa ~0,006% e Itaú ~0,01337%)"** — o próprio comentário do código admite que é uma estimativa de mercado, não um dado de um banco específico | 1, 2, **3 — é literalmente uma média estimada, o candidato mais óbvio a virar parâmetro configurável e revisável**, 5 (biblioteca confirma: nenhum dos 5 bancos publica fórmula de DFI) |
| `CAIXA_DFI_RATE` | Caixa | "verificado: R$33,00 em R$500k" | 1, 2 — calibrado empiricamente |
| `ITAU_DFI_RATE` | Itaú | "calibrado do simulador oficial Itaú (...) jun/2026" | 1, 2 — calibrado empiricamente, mais recente que os demais |
| `INTER_DFI_RATE` | Inter | "Verificado: R$144,66 em R$1.690.000" | 1, 2 — calibrado empiricamente |
| `DAYCOVAL_DFI_RATE` | Daycoval | "Verificado: R$20,00 em R$500.000 (...) R$12,00 em R$300.000" | 1, 2 — calibrado empiricamente |

**Leitura:** Bradesco, Santander e BB — 3 dos 5 bancos-alvo da biblioteca — dependem hoje de uma taxa de MIP genérica (`MIP_RATES`) e de uma taxa de DFI **explicitamente estimada por interpolação** (`DFI_RATE_MENSAL`), enquanto Caixa, Itaú, Inter e Daycoval têm valores calibrados a partir de simulações reais. Esses 3 bancos são a prioridade número 1 de calibração empírica de seguros.

## 4. Tarifas

| Item | Situação no código | Classificação |
|---|---|---|
| `CAIXA_TA_MENSAL` (R$ 25,00/mês) | Hardcoded, só para Caixa; **bate com o valor oficial confirmado na biblioteca para o BB (R$25/mês, tabela de tarifas oficial vigente 29/06/2026)** — mas o código não aplica esse valor a nenhum outro banco | 1, 2, 4 (confirmado para Caixa e coincide com BB), **3 — deveria virar `overrides.taxaAdmin` de fato lido pelo cálculo, e estendido a outros bancos conforme dado real** |
| Tarifa de administração — Itaú, Bradesco, Santander, BB, Inter, Daycoval | **Não existe no cálculo.** Nenhuma das funções `calcularSAC`/`calcularPRICE`/`calcularSACItau`/`calcularPRICEItau` soma qualquer tarifa mensal fixa fora da Caixa | 2 (ausência, não hardcoded-com-valor — é hardcoded-em-zero), **3 — BB tem tarifa de R$25/mês confirmada oficialmente e não está sendo cobrada na simulação do BB** |
| Tarifa de avaliação do imóvel (evento único) | **Não existe em lugar nenhum do motor de cálculo** — não é somada à parcela nem ao CET, é só documental (biblioteca) | **5 — se o Fonti algum dia precisar mostrar custo total de contratação (não só parcela), esse valor precisa ser adicionado por banco** |
| ITBI incorporado ao financiamento | `input.incorporarItbi` + `input.percentualItbi` (padrão 5%), **usado apenas para Itaú** (`cfg.id === 'itau' && input.incorporarItbi`) | 1, 2, 4 (Itaú confirma oficialmente "até 5%" na biblioteca — bate com o padrão do código), **3 — não há suporte no código para os outros 4 bancos incorporarem ITBI, e a biblioteca não pesquisou se eles permitem** |

## 5. Regras transversais (aplicadas a todos os bancos igualmente)

| Regra | Valor no código | Classificação |
|---|---|---|
| `LIMITE_IDADE_PRAZO_MESES` (idade + prazo) | 966 meses = 80 anos e 6 meses, **aplicado identicamente a todos os 7 bancos** | 1, 2, 4 (confirmado oficialmente só para **Itaú** — via apólice de seguro datada de 2013 — e **BB**, só para linhas FGTS — 80 anos, 5 meses e 29 dias, arredondado no código para 6 meses), **5 para Santander, Bradesco e Inter (hipótese de mercado, sem confirmação oficial própria — ver `pendencias-de-calibracao.md` seção 4)** |
| Corte duro de idade ≥ 80 anos (inelegível, independente do cálculo de prazo) | Regra adicional e redundante à de `LIMITE_IDADE_PRAZO_MESES`, hardcoded em `simularBancoComTaxa` | 1, 2, **5 — não localizada nenhuma fonte pública (nem no código, nem na biblioteca) que justifique esse corte duro adicional separado da conta de idade+prazo** |
| Comprometimento de renda — 30% (genérico) | Hardcoded em `simularBancoComTaxa` (`comprometimentoMax = 0.30`), exceto Caixa PRICE (25%, via `cfg.comprometimentoMaxPrice`) | 1, 2, 4 (confirmado oficialmente só para **Bradesco** — 30% SAC / **15% PRICE**, e **Inter** — 30%), **3 e 5 para Itaú, Santander e BB (não publicado oficialmente) — e o valor de PRICE do Bradesco, 15%, não está implementado em nenhum lugar do código (Bradesco tem `suportaPrice: false`, então o cenário nem chega a ser calculado)** |
| MCMV (`MCMV_FAIXAS`) | 4 faixas de renda/taxa, **exclusivas da Caixa** no código (`aceitaMcmv: true` só para Caixa) | 1, 2, 4 (Caixa confirmada como operadora principal do MCMV no mercado), **4 contraditório — biblioteca do BB lista "Programa Minha Casa Minha Vida (PMCMV, linhas 524/586)" como produto próprio do BB, com tabela de taxa por faixa de renda publicada no manual oficial do BB — ver seção 6** |
| Pró-Cotista FGTS (`CAIXA_PRO_COTISTA`) | Exclusivo da Caixa no código | 1, 2, 4 contraditório — **biblioteca confirma Pró-Cotista como produto próprio também de Itaú (não, Itaú não tem), Banco do Brasil (9% a.a. confirmado oficialmente) e Inter (9% a.a., oficial)** — hoje só a Caixa simula Pró-Cotista no Fonti |

## 6. Discrepâncias entre o código e a biblioteca técnica (achados que merecem atenção prioritária)

Estes são os pontos onde o cruzamento código × biblioteca revelou algo que não é só "lacuna", mas uma **contradição real** que pode estar produzindo simulação incorreta ou incompleta:

1. **Inter — taxa base pode estar usando o produto errado.** O código usa `taxaAnualBase: 0.0950` (9,50% a.a.) para o Inter — mas a biblioteca (`inter.md`) confirma que **9,00% a.a. + TR é a taxa oficial do produto Pró-Cotista (FGTS)**, um produto de nicho com regras próprias (renda até R$12 mil, imóvel R$300 mil–2,25 milhões), enquanto o produto residencial padrão do Inter (Taxa Bonificada) não teve taxa numérica oficial confirmada (só 13,76% a.a. não oficial). **Se o motor está tratando todo cliente Inter como se tivesse a taxa do Pró-Cotista, a simulação para clientes fora desse perfil pode estar subestimando a taxa real em ~4 pontos percentuais.** Prioridade máxima de verificação.

2. **`suportaPrice: false` para Bradesco e Banco do Brasil parece contradizer a biblioteca.** Ambos os arquivos (`bradesco.md`, `banco-do-brasil.md`) confirmam oficialmente que os dois bancos operam PRICE (Bradesco com comprometimento de renda diferenciado 15%; BB com LTV diferenciado 80% vs 90% nas linhas FGTS/PMCMV). Hoje o motor bloqueia PRICE para os dois. Isso é uma limitação de cobertura, não necessariamente um erro — mas vale decisão explícita: manter bloqueado por falta de calibração da taxa/regra PRICE desses bancos, ou habilitar com os dados parciais já encontrados.

3. **`aceitaMcmv: false` para o Banco do Brasil contradiz a biblioteca.** O BB tem página oficial e manual próprio de PMCMV com tabela de taxas por faixa de renda (ex.: até R$2.600 → 5,00% a.a.). O motor hoje trata MCMV como exclusividade da Caixa.

4. **`prazoMaximoMeses: 420` para o Inter não bate com a biblioteca.** A única fonte encontrada para prazo de aquisição residencial do Inter foi não oficial e indicou 360 meses (30 anos), não 420. Como o código usa 420 (mesmo valor dos outros 5 bancos), pode estar superestimando o prazo disponível no Inter em até 5 anos.

5. **Seguradora do MIP do Inter: o código já sabe o que a biblioteca não achou.** `INTER_MIP_SOMPO` (comentário: "Sompo SuperHab SFH") — a biblioteca (`inter.md`, seção 7) registrou "seguradora parceira: não encontrado em fonte pública" para o Inter. Isso é uma informação que **o motor de simulação já tinha e a pesquisa não recuperou** — vale registrar essa desconexão entre o conhecimento interno acumulado no código (comentários citam simuladores oficiais acessados diretamente, provavelmente por login/CPF real) e a pesquisa pública, que não tem acesso a essas mesmas fontes.

6. **Taxa de administração mensal (`taxa_admin`) é editável na UI para todos os bancos, mas não tem efeito em nenhum cálculo.** Já registrado na seção 0 — reforçado aqui porque é o tipo de gap que pode gerar confusão operacional real (alguém edita o campo achando que está calibrando a simulação, e nada muda).

---

## Resumo priorizado — o que sair do hardcoded primeiro

Ordem sugerida, cruzando "impacto na parcela final" × "já há dado público ou empírico disponível para calibrar":

1. **Taxa de administração mensal (`taxaAdmin`)** — já tem campo na UI e no banco, só falta ligar ao cálculo. É o único item desta lista que é conserto de encanamento, não pesquisa nova.
2. **Taxa de juros base/correntista do Inter** — suspeita concreta de estar usando a taxa errada de produto (Pró-Cotista em vez de padrão); maior risco de erro sistemático hoje identificado.
3. **`DFI_RATE_MENSAL` genérico** (Bradesco/Santander/BB) — hoje é uma média estimada, assumida no próprio comentário do código; falta calibração empírica real para os 3 bancos.
4. **`MIP_RATES` genérica** (Bradesco/Santander/BB) — mesma situação do DFI; nenhum dos 3 tem tabela própria.
5. **`suportaPrice`/`maxLtvPrice`/`comprometimentoMaxPrice`** para Bradesco e BB — decisão de produto: habilitar PRICE com os dados parciais já encontrados, ou manter bloqueado até calibração completa.
6. **`prazoMaximoMeses` do Inter** — verificar 360 vs 420 antes de continuar oferecendo 35 anos a clientes Inter.
7. **`LIMITE_IDADE_PRAZO_MESES` por banco** (hoje único para todos) — virar parâmetro por banco quando houver dado confirmado para Santander/Bradesco/Inter (hoje só Itaú e BB têm confirmação oficial própria).
8. **`aceitaMcmv`/Pró-Cotista para BB e Inter** — ambos têm produto próprio confirmado; hoje o Fonti não oferece essas linhas para esses bancos.

Nenhum destes itens foi alterado nesta tarefa — este documento é só o mapa para decidir a próxima etapa.
