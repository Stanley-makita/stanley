# Pendências de Calibração

> Lista do que **não foi encontrado de forma pública e completa**, ou que apareceu em conflito entre fontes, e por isso precisa ser calibrado por comparação com simulações reais dos bancos antes do uso operacional pleno do Fonti. Classificação:
>
> - **A** — Regra pública confirmada (fonte oficial, sem conflito relevante) — pode ser usada com confiança para calibrar o motor.
> - **B** — Regra provável, mas sem confirmação oficial (fonte não oficial, ou oficial mas incompleta/ambígua) — usar como estimativa inicial, revisar quando possível.
> - **C** — Parâmetro interno do banco que exigirá calibração empírica (não é público por natureza — só descobrível rodando simulações reais nos simuladores oficiais e comparando resultado).
> - **D** — Diferença matemática aceitável (variação pequena entre fontes, dentro de margem de arredondamento/tempo, não bloqueia uso).
> - **E** — Erro de regra que bloquearia a estreia do Fonti (conflito grande o suficiente para produzir simulação materialmente errada se não resolvido antes de operar).

Verificação cruzada com o código atual do motor de simulação do Fonti (`src/lib/simuladorFinanciamento/engine.ts`) feita nesta consolidação: **hoje o motor já restringe lote urbanizado, terreno+construção e construção em terreno próprio exclusivamente à Caixa** — todos os outros bancos (Itaú, Bradesco, Santander, BB, Inter) são marcados inelegíveis nessas modalidades independentemente desta pesquisa. Isso significa que as lacunas de LTV/prazo desses produtos nos outros bancos (ver abaixo) **não são risco imediato de simulação errada** — são apenas limitação de cobertura (o Fonti não oferece o que esses bancos poderiam oferecer). Marcado como categoria C/futuro, não E.

---

## 1. LTV — Aquisição residencial tradicional

| Banco | Situação | Classificação |
|---|---|---|
| Itaú | Conflito não resolvido: 80% vs 90% entre fontes não oficiais; nenhuma página oficial confirma o percentual | **E** — se o motor usa um LTV fixo de 80% ou 90% para Itaú hoje sem essa confirmação, o valor pode estar sistematicamente errado em toda simulação Itaú de aquisição. **Prioridade alta de validação real (simulador oficial ou proposta real).** |
| Santander | Conflito não resolvido: 80% (antigo) vs 90% (mudança reportada maio/2026, não confirmada oficialmente) | **E** — mesmo risco do Itaú; agravado pelo fato de o Santander ter bloqueado praticamente todo fetch oficial nesta pesquisa (ver `fontes.md`, item 3). |
| Bradesco | 80% confirmado em página oficial, sem conflito relevante | **A** |
| Banco do Brasil | 80% confirmado em página oficial e no manual 2019 (convergente) | **A** |
| Inter | 75% (oficial, comercial) mas para residencial só há dados não oficiais (75% e 70% divergentes) | **B** |

## 2. LTV — CGI / Home Equity

| Banco | Situação | Classificação |
|---|---|---|
| Itaú | 60%, confirmado em 2 fontes oficiais convergentes | **A** |
| Santander | 60%, fonte não oficial mas específica e consistente ao produto Usecasa | **B** |
| Bradesco | 60%, oficial + convergência de fonte terceira | **A** |
| Banco do Brasil | 55% residencial / 45% comercial, oficial e explícito | **A** |
| Inter | 60%, duas fontes oficiais convergentes (página + blog) | **A** |

**Nota:** este é o grupo de dados com melhor cobertura pública de toda a pesquisa — pode ser usado com mais confiança para calibrar o produto CGI/Home Equity do Fonti do que qualquer outro produto.

## 3. Prazo máximo — Aquisição residencial

| Banco | Situação | Classificação |
|---|---|---|
| Itaú, Bradesco, Banco do Brasil | 420 meses, oficial e convergente entre os 3 | **A** |
| Santander | 420 meses, mas apenas fonte não oficial (embora consistente) | **B** |
| Inter | 360 meses (não oficial); nenhuma página oficial do Inter confirma prazo máximo de aquisição residencial padrão | **B** — vale checar se é mesmo 360 ou se o Inter também vai a 420 como os demais (a divergência de 60 meses tem impacto real na parcela, não é diferença trivial). |

## 4. Regra idade + prazo

| Banco | Situação | Classificação |
|---|---|---|
| Itaú | 80 anos e 6 meses, confirmado via apólice de seguro oficial — mas documento fonte é de 2013, vigência em 2026 não reconfirmada | **B** (tende a A, mas datação do documento pesa contra) |
| Banco do Brasil | 80 anos, 5 meses e 29 dias, confirmado no manual oficial para linhas FGTS — **mas não há regra equivalente confirmada para linhas SBPE**, que são a maior parte do volume | **A para FGTS / C para SBPE** |
| Santander | Conflito entre 80 anos e 80 anos e 6 meses, nenhuma fonte oficial | **C** — precisa calibração empírica (testar propostas-limite no simulador real) |
| Bradesco | Regra setorial citada por terceiros, nunca confirmada como texto do próprio Bradesco | **C** |
| Inter | Não encontrado em nenhuma fonte, nem oficial nem não oficial específica do banco | **C** |

**Risco prático:** se o Fonti aplica hoje uma regra única de "idade + prazo ≤ 80 anos e 6 meses" para todos os bancos (como parece ser o padrão atual do motor, pela constante `LIMITE_IDADE_PRAZO_MESES` vista no código), isso é uma **aproximação razoável (categoria D)** dado que é a regra mais citada do mercado e tem confirmação direta para 2 dos 5 bancos — mas não deve ser tratada como confirmada para Santander, Bradesco e Inter até validação empírica.

## 5. Comprometimento máximo de renda

| Banco | Situação | Classificação |
|---|---|---|
| Bradesco | 30% (SAC) / 15% (PRICE), oficial, confirmado em 3 páginas | **A** |
| Inter | 30%, oficial (blog cita base legal) | **A** |
| Itaú | Não publicado numericamente em nenhuma página oficial — só citado por terceiros | **C** |
| Santander | Não publicado numericamente em nenhuma página oficial — só citado por terceiros | **C** |
| Banco do Brasil | Não publicado para o crédito imobiliário padrão (só 25% para convênio de nicho POUPEX, não generalizável) | **C** |

**Se o Fonti usa 30% fixo como regra universal hoje, isso é uma aproximação plausível (o valor de mercado mais citado), mas só está confirmada oficialmente para 2 dos 5 bancos.** Classificar o uso de 30% para Itaú/Santander/BB como **categoria D** (diferença aceitável) apenas se o motor já trata isso como estimativa e não como regra de corte rígida — se for usado como bloqueio duro de elegibilidade, deve ser revisto como **C**.

## 6. Taxas de juros nominais (aquisição residencial)

Todos os 5 bancos têm conflito relevante entre fontes, e nenhum publica tabela fixa e vigente sem simulação individual:

| Banco | Faixa encontrada | Classificação |
|---|---|---|
| Itaú | 11,60%–11,90% a.a. (conflito) | **C** |
| Santander | 11,69%–11,79% a.a. padrão / 6,99% bonificado (campanha) | **C** |
| Bradesco | 11,49%–13,99% a.a. (grande dispersão entre fontes) | **C** |
| Banco do Brasil | "a partir de 11,60% a.a." — sem tabela pública discriminada | **C** |
| Inter | 13,76% a.a. (não oficial) / 9,4% bonificado (não oficial) | **C** |

**Recomendação explícita:** taxas de juros de aquisição residencial **não devem ser codificadas como parâmetro fixo no motor a partir desta pesquisa**. É a maior pendência de calibração empírica de todo o levantamento — recomenda-se extrair via simulador oficial de cada banco, periodicamente, em vez de fixar valor no código.

## 7. IOF — alíquota exata

| Banco | Situação | Classificação |
|---|---|---|
| Itaú (CGI) | 0,38% + 0,0082%/dia, oficial e explícito | **A** — único caso de alíquota exata confirmada em toda a pesquisa |
| Demais produtos/bancos | Incidência (sim/não) frequentemente confirmada, mas alíquota exata não | **B/C** conforme o caso — ver seção 6 de `resumo-comparativo.md` |

## 8. Seguros MIP/DFI — fórmula de prêmio

Nenhum dos 5 bancos publica a fórmula/tabela exata de cálculo do prêmio (por faixa etária no MIP, por percentual sobre valor do imóvel no DFI). Classificação uniforme: **C** para todos os 5 bancos. Este é o maior ponto cego estrutural comum — não é falha de pesquisa, é ausência de publicação por parte dos bancos (dado comercialmente sensível/atuarial).

**Implicação prática:** o Fonti provavelmente já usa uma fórmula própria/estimada para MIP e DFI (ver `motor-simulacao.ts`/`engine.ts`) — essa fórmula não pode ser validada contra nenhuma fonte pública encontrada nesta pesquisa. Precisa ser calibrada comparando o valor de parcela final (que inclui seguro) contra simulações reais.

## 9. Seguradora parceira de MIP/DFI

| Banco | Situação | Classificação |
|---|---|---|
| Itaú | Itaú Seguros + Tokio Marine, mas com conflito de numeração de apólice entre 2 PDFs oficiais do próprio banco | **B** (existência confirmada, detalhe exato não) |
| Bradesco | Bradesco Seguros **ou** Aliança do Brasil, oficial mas ambíguo sobre qual é padrão | **B** |
| Santander | HDI (2018) ou seguradora de apólice "SH/AM" (2023) — não resolvido qual vigora | **C** |
| Banco do Brasil | Não confirmado (hipótese: Brasilseg) | **C** |
| Inter | Não encontrado | **C** |

Não é bloqueante para o motor de simulação (o nome da seguradora não afeta o cálculo da parcela), mas é relevante se o Fonti algum dia gerar documentos/contratos que mencionem a seguradora.

## 10. Produtos ausentes ou não confirmados

| Banco | Produto | Situação |
|---|---|---|
| Santander | Aquisição isolada de terreno | Indício (não oficial) de que **não existe** este produto no Santander | **B** — se o motor permite simular "terreno" no Santander, validar se o produto realmente existe antes de habilitar para o cliente final (hoje o motor já restringe terreno à Caixa, então não há exposição atual — mas se essa restrição for removida no futuro, checar Santander primeiro). |
| Inter | Aquisição isolada de terreno | **Confirmado (não oficial, mas explícito e consistente)** que não existe | **B**, mesma nota acima |
| Itaú | Financiamento de terreno isolado (produto próprio, com página dedicada) | Não encontrada página de produto específica — pode estar dentro do guarda-chuva geral "Crédito Imobiliário" | **C** |
| Todos os 5 bancos | PJ com garantia imobiliária "genérica" (fora de CGI/Home Equity PJ e das linhas de produção/incorporação) | Não encontrado em nenhum dos 5 | **C** — pode simplesmente não existir como produto de prateleira em nenhum dos 5, ficando restrito a operações estruturadas/sob consulta |

## 11. Conflitos internos (mesma fonte oficial se contradiz)

Estes são os itens de maior atenção, pois não são "terceiros divergindo do banco" — são o próprio site/documento oficial do banco se contradizendo:

| Banco | Conflito | Classificação |
|---|---|---|
| Bradesco | Tarifa de avaliação PJ: R$ 2.800 vs R$ 3.100, duas páginas oficiais da mesma família de produto | **E** — precisa resolução antes de cobrar/exibir esse valor a um cliente PJ |
| Banco do Brasil | Prazo do Pró-Cotista: 360 meses (manual 2019) vs 420 meses (página 2026) | **D** — resolvido a favor do dado mais recente (420), tratado como não bloqueante, mas registrado |
| Banco do Brasil | Prazo do EGI: 238 vs 240 meses, mesma página atual | **D** — diferença de 2 meses, provável resíduo de conteúdo desatualizado, impacto baixo |
| Itaú | Numeração de apólice de seguro: 01.68.4000030 vs 01.68.4000063, dois PDFs oficiais | **D** — não afeta cálculo de parcela, apenas identificação de apólice |
| Itaú | Taxa Uniclass (11,90% a.a.) maior que a taxa pública padrão (11,70% a.a.) — contraintuitivo para linha "diferenciada" | **B** — pode ser efeito de datas de captura diferentes, mas vale checar |
| Inter | Taxa do Home Equity pós-fixado: 1%, 1,09%, 1,19% a.m. em capturas diferentes da mesma página/domínio oficial | **C** — reforça que taxa deve vir de simulação em tempo real, não de valor fixo no motor |

---

## Prioridades recomendadas de calibração empírica (ordem sugerida)

1. **Taxas de juros de aquisição residencial dos 5 bancos** (seção 6) — maior lacuna, maior impacto na parcela final.
2. **LTV de aquisição residencial de Itaú e Santander** (seção 1) — conflito de até 10 p.p., impacto direto no valor financiável.
3. **Fórmula de MIP/DFI** (seção 8) — impacta toda simulação com seguro embutido na parcela, comum a todos os bancos.
4. **Conflito de tarifa de avaliação PJ do Bradesco** (seção 11) — resolução simples (visitar a versão "corporate" da página, ainda não visitada nesta pesquisa) antes de expor a clientes PJ.
5. **Regra idade+prazo para Santander, Bradesco e Inter** (seção 4) — hoje coberta pela aproximação de mercado (80 anos e 6 meses), mas sem confirmação own-bank.

Nenhum item desta lista foi inventado ou completado por suposição — cada lacuna está registrada em detalhe no arquivo do banco correspondente, com a fonte (ou ausência dela) explicitada.
