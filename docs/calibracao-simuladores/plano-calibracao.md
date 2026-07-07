# Plano de Calibração — Motor de Simulação Fonti

> Consolida `docs/calibracao-simuladores/biblioteca-bancos/*.md` (pesquisa pública) e `docs/calibracao-simuladores/mapa-parametros-engine.md` (mapeamento do código) num plano de ação. Cobre os 7 bancos configurados em `constantes.ts` (Caixa, Itaú, Bradesco, Santander, BB, Inter, Daycoval) — os 2 últimos (Caixa, Daycoval) **não fizeram parte dos 5 bancos pesquisados na biblioteca técnica**, então suas colunas de biblioteca aparecem como "não pesquisado" e a validação deles depende inteiramente de simulador oficial/calibração empírica já registrada nos comentários do código.
>
> **Nenhum código foi alterado neste documento** — é plano, não execução.

Data de consolidação: 2026-07-06.

---

## Como ler as colunas

- **Valor atual do engine**: o que está em `constantes.ts`/`engine.ts` hoje.
- **Valor encontrado na biblioteca**: o que a pesquisa pública (`biblioteca-bancos/`) achou — ou "não pesquisado"/"não encontrado em fonte pública".
- **Fonte / Confiança**: herdados do arquivo do banco correspondente.
- **Divergência**: Sim/Não — se o valor do engine e o valor da biblioteca não coincidem (ou não são comparáveis, marcado como "N/A").
- **Impacto na simulação**: crítico (muda se o cliente é aprovado/quanto pode financiar), alto (muda o valor da parcela de forma perceptível), médio (afeta parcela em menor grau ou afeta só um subconjunto de casos), baixo (efeito marginal ou cosmético).
- **Ação recomendada**: manter / substituir (já há dado público confiável para atualizar agora) / validar no simulador oficial (precisa rodar uma simulação real antes de mudar) / depende de calibração empírica (não há atalho público, só medir contra resultado real).

---

## 1. Caixa Econômica Federal

> Não incluída nos 5 bancos da biblioteca técnica. Todos os valores abaixo vêm de calibração empírica registrada nos comentários do próprio código (`constantes.ts`), com data e caso de teste citados.

| Parâmetro | Valor atual do engine | Valor na biblioteca | Fonte | Confiança | Divergência | Impacto | Ação recomendada |
|---|---|---|---|---|---|---|---|
| Taxa base (balcão) | 11,49% a.a. + TR | não pesquisado | comentário do código: "caixa.gov.br, gov.br, infomoney... jun/2026" | Interna (não pública/terceira) | N/A | Crítico | Validar no simulador oficial (revalidação periódica — taxa muda com frequência) |
| Taxa correntista (débito auto + salário) | 11,19% a.a. + TR | não pesquisado | idem | Interna | N/A | Crítico | Validar no simulador oficial |
| LTV SAC | 80% | não pesquisado | idem | Interna | N/A | Crítico | Manter |
| LTV PRICE | 70% | não pesquisado | idem (comentário cita "doc seção 3.1") | Interna, com referência a normativo | N/A | Crítico | Manter |
| Comprometimento renda PRICE | 25% | não pesquisado | idem ("doc seção 3.2") | Interna | N/A | Alto | Manter |
| Teto SFH (`maxValorImovel`) | R$ 2.250.000 | não pesquisado | idem | Interna | N/A | Alto | Manter (revisar se houver reajuste anual do teto SFH) |
| Prazo máximo | 420 meses | não pesquisado | idem | Interna | N/A | Alto | Manter |
| MCMV — 4 faixas de renda/taxa | Ver `MCMV_FAIXAS` | não pesquisado | "Portaria MCID n° 333/2026" citada no comentário | Interna, com referência a normativo | N/A | Crítico | Validar no simulador oficial (produto governamental, regras mudam por portaria) |
| Pró-Cotista FGTS | 8,66% a.a., teto R$350k | não pesquisado | idem | Interna | N/A | Alto | Validar no simulador oficial |
| MIP (`CAIXA_MIP_RATES`, 9 faixas) | Ver tabela | não pesquisado | "verificado no simulador caixa.gov.br (DOB 19/02/1979, R$400k, jun/2026)" — 1 ponto de calibração real | Interna, 1 ponto verificado | N/A | Médio | Depende de calibração empírica (mais pontos de verificação por faixa) |
| DFI | 0,0066%/mês s/ valor do imóvel | não pesquisado | "verificado: R$33,00 em R$500k" | Interna, 1 ponto verificado | N/A | Médio | Depende de calibração empírica |
| Tarifa de administração | R$ 25,00/mês (hardcoded, `CAIXA_TA_MENSAL`) | não pesquisado | "verificado no breakdown da parcela do simulador oficial" | Interna, verificado | N/A | Baixo | Manter valor — **mas ligar ao override `taxaAdmin`, hoje ignorado no cálculo (ver `mapa-parametros-engine.md`, seção 0)** |

---

## 2. Itaú

| Parâmetro | Valor atual do engine | Valor na biblioteca | Fonte | Confiança | Divergência | Impacto | Ação recomendada |
|---|---|---|---|---|---|---|---|
| Taxa base/correntista (iguais) | 11,90% a.a. | 11,60%–11,90% a.a. (conflito entre fontes) / 11,90% Uniclass (contraintuitivo) | itau.com.br (oficial) + terceiros | Alto (teto) / baixo (piso) | Sim (parcial — engine usa o teto da faixa) | Crítico | Validar no simulador oficial |
| LTV aquisição | 80% | 80–90% (conflito não resolvido) | terceiros (larya, spimovel), sem confirmação oficial | Baixo | Sim | Crítico | Validar no simulador oficial |
| Prazo máximo (aquisição) | 420 meses | 420 meses (35 anos) | itau.com.br (oficial) | Alto | Não | Alto | Manter |
| Prazo máximo (CGI/Home Equity — não modelado no engine hoje) | — (Fonti não simula CGI do Itaú) | 240 meses, LTV 60%, taxa 1,35–1,55% a.m. | itau.com.br + blog oficial | Alto | N/A (produto ausente no engine) | — | Fora do escopo desta calibração (produto não implementado) |
| Idade + prazo | 966 meses (80a6m), regra genérica para todos os bancos | 80 anos e 6 meses, confirmado via apólice de seguro oficial (documento datado 2013) | ww3.itau.com.br PDF oficial | Média-alta (documento antigo) | Não (valor bate) | Alto | Manter, mas revalidar se a apólice de 2013 ainda vigora |
| Comprometimento de renda | 30% (genérico) | Não publicado oficialmente pelo Itaú | terceiros (não confirmado) | Baixo | Não verificável | Alto | Depende de calibração empírica |
| MIP (`ITAU_MIP_P1`/`P2`) | Tabela por idade e por período (0–120 / 121+ meses) | Não publicada (fórmula/tabela de prêmio nunca é pública) | itau (simulador oficial, extraído diretamente, idades 44–54 e 55+) | Alto (idades extraídas) / baixo (idades 18–43, interpoladas) | Não comparável (biblioteca não tem tabela) | Médio | Depende de calibração empírica para as idades 18–43 (hoje interpoladas, não reais) |
| DFI | 0,00554%/mês s/ avaliação | Não publicada fórmula exata; só confirmado que a base é o valor de avaliação | itau (simulador oficial, jun/2026) + blog oficial (qualitativo) | Alto (base de cálculo) / interno (alíquota) | Não | Médio | Manter (já calibrado contra simulador real) |
| ITBI incorporável | 5% padrão, só Itaú no código | "Até 5% do menor valor... pode ser incorporado" | Guia Crédito Imobiliário Itaú, PDF oficial | Alto | Não | Baixo | Manter |
| Tarifa de avaliação | Não modelada no engine | até R$ 1.950 (residencial/comercial) | blog.itau.com.br + tabela de tarifas (fonte secundária) | Alto | N/A (não modelado) | — | Parâmetro que pode ser adicionado se o Fonti passar a exibir custo total de contratação |
| IOF (aquisição) | Não modelado no engine | Isento (regra geral de mercado, não confirmado na página do Itaú) | terceiros | Alto (regra geral) / baixo (específico Itaú) | N/A | — | Parâmetro que pode ser adicionado se necessário |

---

## 3. Bradesco

| Parâmetro | Valor atual do engine | Valor na biblioteca | Fonte | Confiança | Divergência | Impacto | Ação recomendada |
|---|---|---|---|---|---|---|---|
| Taxa base/correntista (iguais) | 12,30% a.a. | 11,49%–13,99% a.a. (grande dispersão entre 5+ fontes) | mbbrasilimoveis.com.br (cita tabela do banco) + terceiros | Média (dado mais citado: 12,79%) | Sim (parcial — 12,30% está dentro da faixa, mas não é o valor mais citado) | Crítico | Validar no simulador oficial |
| LTV aquisição (SAC) | 80% | 80%, confirmado oficialmente, sem conflito relevante | banco.bradesco (oficial) | Alta | Não | Crítico | Manter |
| `suportaPrice` | **false** (PRICE bloqueado para Bradesco) | PRICE existe — confirmado via diferenciação de comprometimento de renda (30% SAC / **15% PRICE**), oficial | banco.bradesco (3 páginas oficiais convergentes) | Alta | **Sim — contradição relevante** | Alto | Substituir (habilitar PRICE) **depende de validar taxa/LTV específicos de PRICE no simulador antes** — classificar como "validar no simulador oficial" |
| Comprometimento de renda SAC | 30% (genérico, igual a todos os bancos) | 30%, oficial, confirmado em 3 páginas | banco.bradesco | Alta | Não | Alto | Manter |
| Comprometimento de renda PRICE | Não implementado (PRICE bloqueado) | 15%, oficial | banco.bradesco | Alta | Sim (ausência) | Alto | Substituir — adicionar `comprometimentoMaxPrice: 0.15` quando PRICE for habilitado |
| Prazo máximo (aquisição) | 420 meses | 420 meses, oficial | banco.bradesco | Alta | Não | Alto | Manter |
| Idade + prazo | 966 meses (80a6m), regra genérica | 80 anos e 6 meses citado por terceiros, **nunca confirmado como texto do próprio Bradesco** | terceiros (avozdoidoso.com.br etc.) | Baixa-média | Não (valor bate, mas fonte fraca) | Alto | Validar no simulador oficial |
| MIP (`MIP_RATES` genérica) | Tabela genérica compartilhada com Santander/BB | Fórmula/tabela nunca publicada oficialmente; só confirma que existe variação por idade | banco.bradesco (qualitativo) | Alta (existência) / nenhuma (valores) | Não comparável | Médio | Depende de calibração empírica |
| DFI (`DFI_RATE_MENSAL` genérico) | 0,00663%/mês — **estimativa admitida no comentário do código como "ponto médio entre Caixa e Itaú"** | Fórmula nunca publicada; só confirma base = valor do imóvel | banco.bradesco (qualitativo) | Alta (base) / nenhuma (alíquota) | Não comparável, mas o valor do engine é confessadamente uma estimativa, não um dado do Bradesco | Alto | Depende de calibração empírica — prioridade alta por ser estimativa explícita |
| Credimóvel/CGI (não modelado no engine) | — | LTV 60%, prazo 240 meses, taxa 1,59% a.m. fixa, **sem seguro obrigatório** (dispensa confirmada oficialmente) | banco.bradesco (oficial) | Alta | N/A (produto ausente) | — | Fora do escopo desta calibração |
| Tarifa de avaliação PJ | Não modelada | **R$ 2.800 vs R$ 3.100 — conflito entre 2 páginas oficiais do próprio Bradesco** | banco.bradesco (2 URLs distintas) | Média (conflito não resolvido mesmo em fonte oficial) | N/A (não modelado) | — | Não bloqueia o engine hoje (não modelado), mas registrar para quando tarifas passarem a ser exibidas |

---

## 4. Santander

> Pesquisa mais fraca dos 5 bancos: `santander.com.br` bloqueou fetch direto (HTTP 403) na quase totalidade das tentativas — a maior parte dos dados abaixo vem de snippets de busca ou fontes de terceiros, não de leitura direta da página oficial.

| Parâmetro | Valor atual do engine | Valor na biblioteca | Fonte | Confiança | Divergência | Impacto | Ação recomendada |
|---|---|---|---|---|---|---|---|
| Taxa base | 12,49% a.a. | 11,69%–11,79% a.a. "padrão" (não oficial) / 6,99% a.a. bonificado (campanha, não oficial) | spimovel.com.br, myside.com.br | Média-baixa | Sim — base do engine (12,49%) é mais alta que qualquer "padrão" achado na biblioteca | Crítico | Validar no simulador oficial |
| Taxa correntista | 11,69% a.a. | 11,69%–11,79% a.a. "padrão" — **biblioteca não confirma que esse valor seja o de correntista especificamente**, pode ser o valor sem relacionamento | idem | Média-baixa | Parcial (número bate, rótulo pode não bater) | Crítico | Validar no simulador oficial |
| LTV aquisição | 80% | 80% (fonte antiga) vs **90%** (mudança reportada maio/2026, não confirmada oficialmente) | portas.com.br, Portal Tela, Let's Money (não oficiais) vs larya.com.br (80%, não oficial) | Baixa (conflito não resolvido em nenhum lado) | Sim | Crítico | Validar no simulador oficial — prioridade alta (10 p.p. de diferença) |
| Prazo máximo (aquisição) | 420 meses | 420 meses, mas só fonte não oficial | spimovel.com.br | Média | Não | Alto | Validar no simulador oficial (confirmar oficialmente) |
| Idade + prazo | 966 meses (80a6m) | 80 anos **ou** 80 anos e 6 meses — duas variantes conflitantes, nenhuma oficial | larya.com.br + outro agregado | Baixa | Não (valor bate com uma das variantes) | Alto | Validar no simulador oficial |
| Comprometimento de renda | 30% (genérico) | 30%, citado como regra genérica de mercado, **não confirmado como regra própria e documentada do Santander** | agregado de busca | Baixa | Não verificável | Alto | Depende de calibração empírica |
| MIP (`MIP_RATES` genérica) | Tabela genérica compartilhada | Fórmula qualitativa descrita (faixa etária × saldo devedor), sem tabela numérica; seguradora não confirmada (HDI 2018 vs "SH/AM" 2023, não resolvido) | cms.santander.com.br (PDFs não lidos em texto) | Baixa (conteúdo não extraído) | Não comparável | Médio | Depende de calibração empírica |
| DFI (`DFI_RATE_MENSAL` genérico) | 0,00663%/mês (estimativa admitida) | Fórmula qualitativa descrita (valor do imóvel × índice), sem alíquota numérica | idem | Baixa | Não comparável | Alto | Depende de calibração empírica |
| CGI (Usecasa/Useimóvel, não modelado) | — | LTV 60%, prazo 12–240 meses, taxa 1,05–1,69% a.m. (Usecasa PF); Useimóvel (PJ) 1,39–1,5% a.m. | agregados de busca (não oficiais) | Média | N/A | — | Fora do escopo desta calibração |
| Terreno isolado (não modelado — bloqueado para todos exceto Caixa) | Bloqueado (regra transversal do engine) | Indício (não oficial) de que o **Santander não oferece esse produto** | agregado de busca | Baixa-média | Não (o bloqueio atual coincidentemente está correto) | — | Manter bloqueio |

**Nota geral Santander:** por causa do bloqueio de acesso direto, este banco deveria ser o primeiro candidato a uma nova rodada de pesquisa com uma ferramenta de fetch mais robusta (ex.: navegador headless) antes de qualquer decisão de calibração — grande parte do "não confirmado oficialmente" aqui pode simplesmente ser resultado da dificuldade técnica de acesso, não de real ausência de dado público.

---

## 5. Banco do Brasil

| Parâmetro | Valor atual do engine | Valor na biblioteca | Fonte | Confiança | Divergência | Impacto | Ação recomendada |
|---|---|---|---|---|---|---|---|
| Taxa base | 11,74% a.a. | "a partir de 11,60% a.a." (oficial, sem discriminar relacionamento) | bb.com.br (oficial) | Alta (mas sem discriminação) | Parcial (valor do engine não tem contraparte exata) | Crítico | Validar no simulador oficial |
| Taxa correntista | 11,60% a.a. | 11,60% a.a. — **bate exatamente** com o valor oficial "a partir de" | bb.com.br (oficial) | Alta | Não | Crítico | Manter |
| LTV aquisição | 80% | 80%, oficial, convergente entre manual 2019 e página 2026 | bb.com.br + manual oficial | Alta | Não | Crítico | Manter |
| LTV diferenciado por SAC/PRICE (linhas FGTS/PMCMV) | Não implementado (`maxLtvPrice` só existe para Caixa) | **90% SAC / 80% PRICE**, oficial, tabela do manual | Manual BB 2019 | Média (histórico) | Sim (ausência) | Alto | Substituir — mas só aplicável às linhas FGTS/PMCMV, não à linha SBPE padrão |
| `aceitaMcmv` | **false** | BB tem PMCMV próprio (linhas 524/586), tabela de taxa por faixa de renda publicada | Manual BB 2019 + bb.com.br | Média-alta | **Sim — contradição relevante** | Alto | Substituir — habilitar PMCMV/Pró-Cotista do BB com a tabela já publicada |
| Pró-Cotista BB (não modelado) | — | 9,0% a.a. + TR (demais clientes) / 8,8% funcionário BB | Manual 2019 + busca 2026 | Média | N/A (ausente) | — | Substituir (adicionar produto) |
| Prazo máximo (aquisição) | 420 meses | 420 meses, oficial | bb.com.br | Alta | Não | Alto | Manter |
| Prazo Pró-Cotista (se implementado) | — | 360 meses (manual 2019) **vs** 420 meses (página 2026) — conflito de datas | Manual 2019 + página oficial 2026 | Alta (mais recente) | N/A (produto ausente) | — | Validar no simulador oficial antes de implementar |
| Idade + prazo | 966 meses (80a6m), regra genérica | **80 anos, 5 meses e 29 dias — confirmado oficialmente, mas só para linhas FGTS.** Para linhas SBPE (a maioria do volume), não há regra explícita no manual — só um gatilho de 75 anos para questionário de risco complementar em operações grandes | Manual BB 2019 (oficial) | Alta (FGTS) / não encontrado (SBPE) | Não (valor bate para FGTS por coincidência de arredondamento) | Alto | Manter para uso geral, mas **atenção**: para SBPE o valor de 80a6m é herdado da regra genérica de mercado, não confirmado pelo BB |
| Comprometimento de renda | 30% (genérico) | **Não encontrado em nenhuma fonte oficial do BB** (nem manual 2019, nem página 2026) — só existe 25% para o convênio de nicho POUPEX, não generalizável | bb.com.br + manual | Baixa (POUPEX não generalizável) | Não verificável | Alto | Depende de calibração empírica |
| MIP (`MIP_RATES` genérica) | Tabela genérica compartilhada | Confirmado que é calculado sobre valor do financiamento (não do imóvel); fórmula/tabela por idade não publicada | Manual BB 2019 + FAQ 2026 | Alta (base de cálculo) / nenhuma (valores) | Não comparável | Médio | Depende de calibração empírica |
| DFI (`DFI_RATE_MENSAL` genérico) | 0,00663%/mês (estimativa admitida) | Confirmado que é calculado sobre valor de avaliação (mercado); fórmula não publicada | Manual BB 2019 + FAQ 2026 | Alta (base) / nenhuma (alíquota) | Não comparável | Alto | Depende de calibração empírica |
| Tarifa de administração | R$ 25/mês hardcoded só para Caixa; **não aplicado ao BB** | **R$ 25,00/mês, oficial, tabela de tarifas vigente 29/06/2026 — coincide exatamente com o valor hardcoded da Caixa** | bb.com.br/docs/pub/trf/tarifasPF.pdf (oficial, alta confiança) | Alta | Sim (BB não recebe essa tarifa hoje, mas deveria) | Baixo | Substituir — ligar `overrides.taxaAdmin` ao cálculo e usar R$25 como padrão do BB também |
| Tarifa de avaliação | Não modelada | R$ 1.311,84 (tradicional) / R$ 1.246,67 (EGI) — tabela oficial mais recente e confiável de toda a pesquisa | bb.com.br/docs/pub/trf/tarifasPF.pdf | Alta | N/A (não modelado) | — | Parâmetro que pode ser adicionado com alta confiança se o Fonti passar a exibir custo total |
| IOF (aquisição) | Não modelado | Isento — **confirmado explicitamente no manual oficial do BB**, a confirmação mais direta entre os 5 bancos | Manual BB 2019 | Alta | N/A | — | Parâmetro que pode ser adicionado com alta confiança |

---

## 6. Inter

| Parâmetro | Valor atual do engine | Valor na biblioteca | Fonte | Confiança | Divergência | Impacto | Ação recomendada |
|---|---|---|---|---|---|---|---|
| Taxa base/correntista (iguais) | **9,50% a.a.** | **9,00% a.a. + TR é a taxa oficial do Pró-Cotista (FGTS)**, produto de nicho; o produto residencial padrão ("Taxa Bonificada") não tem taxa numérica oficial confirmada — só 13,76% a.a. (não oficial) e desconto de 0,3 p.p. sobre uma base não divulgada | inter.co (Pró-Cotista, oficial) vs larya.com.br (padrão, não oficial) | Alta (Pró-Cotista) / baixa (padrão) | **Sim — suspeita concreta de o motor usar a taxa do produto errado** | **Crítico** | **Validar no simulador oficial com urgência** |
| LTV aquisição | 80% | 75% (comercial, oficial) / 70–75% (residencial, não oficial, divergente) | inter.co (oficial, comercial) + agregadores | Média | Sim (residencial do engine em 80% não bate com nenhuma fonte, oficial ou não) | Crítico | Validar no simulador oficial |
| Prazo máximo (aquisição) | **420 meses** | **360 meses** (30 anos), única fonte encontrada, não oficial | larya.com.br, aprovajacredito.com.br | Média | **Sim — diferença de 5 anos** | Alto | Validar no simulador oficial |
| Idade + prazo | 966 meses (80a6m), regra genérica | Não encontrado em fonte pública específica do Inter (só regra genérica de mercado citada por terceiros) | larya.com.br (não oficial) | Baixa | Não verificável | Alto | Depende de calibração empírica |
| Comprometimento de renda | 30% (genérico) | 30%, oficial, blog do próprio Inter cita base legal (Lei 8.692/1993) | blog.inter.co | Alta | Não | Alto | Manter |
| MIP (`INTER_MIP_SOMPO`) | Tabela por idade, 10 faixas — **fonte: nov/2024, quase 2 anos antes desta pesquisa** | Confirmado "calculado com base na faixa etária" (oficial), mas **seguradora (Sompo) não foi encontrada pela pesquisa pública** — o código já sabe mais que a biblioteca neste ponto | blog.inter.co (qualitativo) + comentário do código (Sompo, mais específico) | Alta (existência) / interno (valores, desatualizados) | Não comparável, mas dado do engine está desatualizado (~2 anos) | Médio | Validar no simulador oficial (revalidar tabela, não descartar a informação da seguradora) |
| DFI (`INTER_DFI_RATE`) | 0,00858%/mês, verificado empiricamente | Confirmado "alíquota da seguradora × valor avaliado" (oficial, qualitativo) | blog.inter.co | Alta (base) / interna (alíquota, verificada) | Não | Médio | Manter (já calibrado contra caso real) |
| `aceitaMcmv`/Pró-Cotista | false / não implementado | Pró-Cotista confirmado como produto próprio do Inter (9% a.a. + TR, oficial, teto renda R$12 mil, imóvel R$300k–2,25mi) | inter.co (oficial) | Alta | Sim (ausência) | Alto | Substituir — implementar Pró-Cotista do Inter como produto próprio (**isso também resolveria a suspeita da taxa base, separando os dois produtos**) |
| Terreno isolado (bloqueado para todos exceto Caixa) | Bloqueado | **Confirmado que o Inter não oferece este produto** (fonte não oficial, mas explícita e consistente) | larya.com.br | Média | Não (bloqueio atual está correto) | — | Manter bloqueio |
| Construcasa (construção, não modelado) | Bloqueado (só Caixa opera construção no engine) | LTV até 80% da obra, prazo 240 meses, **isento de IOF confirmado oficialmente** (único caso do gênero entre os 5 bancos) | inter.co (oficial) | Alta | N/A (produto ausente) | — | Fora do escopo desta calibração |

---

## 7. Daycoval

> Não incluído nos 5 bancos da biblioteca técnica (produto de nicho — CGI/Home Equity, não SBPE). Todos os valores vêm de calibração empírica registrada no código.

| Parâmetro | Valor atual do engine | Valor na biblioteca | Fonte | Confiança | Divergência | Impacto | Ação recomendada |
|---|---|---|---|---|---|---|---|
| Taxa (CGI, efetiva) | 13,94% a.a. | não pesquisado | "simulador jun/2026" (comentário do código) | Interna | N/A | Crítico | Validar no simulador oficial (revalidação periódica) |
| LTV | 60% | não pesquisado — mas **consistente com o padrão de CGI de 55–60% encontrado nos 5 bancos pesquisados** (Itaú, Santander, Bradesco, BB, Inter) | comentário do código + inferência cruzada da biblioteca | Interna + convergência indireta | Não (convergente por analogia) | Crítico | Manter |
| Prazo máximo | 360 meses (30 anos) | não pesquisado | comentário do código | Interna | N/A | Alto | Validar no simulador oficial |
| Teto de imóvel | R$ 1.000.000 | não pesquisado | comentário do código | Interna | N/A | Médio | Manter |
| MIP (flat, sem variação por idade) | 0,023%/mês s/ saldo devedor | não pesquisado | "verificado: R$46,00 em R$200.000" | Interna, verificado | N/A | Médio | Manter |
| DFI | 0,004%/mês s/ valor estimado | não pesquisado | "verificado: R$20,00/R$500k e R$12,00/R$300k" | Interna, 2 pontos verificados | N/A | Baixo | Manter |

---

## Erros de regra (bloqueiam a estreia)

Itens onde há suspeita concreta — não apenas lacuna — de que a simulação hoje produz um resultado materialmente incorreto, ou onde uma funcionalidade de configuração está silenciosamente quebrada:

1. **Inter — taxa base pode ser a do produto errado.** `taxaAnualBase: 0.0950` bate com o Pró-Cotista/FGTS oficial (9,00% a.a. + TR), não com o produto residencial padrão do Inter. Se confirmado, toda simulação Inter fora do perfil FGTS está usando uma taxa artificialmente baixa. **Bloqueante até validação.**
2. **Inter — prazo máximo pode estar superestimado.** Engine usa 420 meses; única fonte encontrada (não oficial, mas específica) aponta 360 meses. Diferença de 5 anos afeta diretamente o valor da parcela ofertada. **Bloqueante até validação.**
3. **Override de `taxaAdmin` não é lido por nenhuma função de cálculo.** O campo é editável na tela Configurações > Bancos para qualquer banco, mas não tem efeito algum na simulação — incluindo a Caixa, cujo valor real (R$25/mês) está hardcoded separadamente. Isso não muda o resultado numérico da Caixa (o valor hardcoded já é o real), mas **qualquer tentativa de configurar essa tarifa para outro banco pelo painel falha silenciosamente** — risco operacional de confiança na ferramenta de configuração, não só de cálculo.

Nenhum destes 3 itens deve ser considerado resolvido antes da estreia sem validação direta no simulador oficial correspondente (itens 1–2) ou correção do encanamento de override (item 3).

---

## Parâmetros públicos que podem ser atualizados imediatamente

Casos em que a biblioteca já traz um dado oficial (ou oficial + convergente) suficientemente confiável para substituir o valor atual sem precisar de nova coleta:

| Banco | Parâmetro | Ação |
|---|---|---|
| Banco do Brasil | Tarifa de administração mensal | Aplicar R$ 25,00/mês (idêntico ao valor já usado na Caixa) — só falta ligar o override ao cálculo |
| Banco do Brasil | `aceitaMcmv` / Pró-Cotista | Habilitar como produto próprio, com tabela de taxa por faixa de renda já publicada no manual oficial |
| Banco do Brasil | LTV diferenciado SAC/PRICE nas linhas FGTS/PMCMV | Adicionar 90%/80%, aplicável apenas a essas linhas (não à linha SBPE padrão) |
| Bradesco | Comprometimento de renda PRICE | Adicionar `comprometimentoMaxPrice: 0.15`, condicionado à habilitação de PRICE (ver seção 3 abaixo) |
| Inter | Pró-Cotista como produto próprio | Implementar com taxa 9,00% a.a. + TR, separando-o do produto residencial padrão (resolve também o item 1 da seção anterior) |

---

## Parâmetros que exigem comparação com simuladores oficiais

Casos onde a biblioteca tem indício, mas não uma fonte oficial fechada e sem conflito — não devem ser codificados só com o que já foi pesquisado:

- Taxas de juros de aquisição residencial dos **7 bancos** (maior lacuna transversal de todo o levantamento — nenhum banco tem tabela pública fixa e vigente).
- LTV de aquisição residencial do **Itaú** (80% vs 90%) e do **Santander** (80% vs 90%, mudança reportada em maio/2026 não confirmada).
- `suportaPrice` para **Bradesco** e **Banco do Brasil** — habilitar exige confirmar taxa/LTV/comprometimento específicos de PRICE nesses bancos, não só a existência do produto.
- Regra de idade + prazo para **Santander**, **Bradesco** e **Inter** (hoje herdam a regra genérica de 80 anos e 6 meses sem confirmação própria).
- Prazo máximo do **Inter** (360 vs 420) e taxa base do **Inter** (ver seção de erros de regra).
- Conflitos internos já identificados: prazo do Pró-Cotista do BB (360 vs 420, mesma instituição) e do EGI do BB (238 vs 240 meses).
- Todo o levantamento do **Santander**, dado o bloqueio de acesso direto às páginas oficiais durante a pesquisa — recomenda-se nova coleta com ferramenta de fetch mais robusta antes de validar qualquer parâmetro específico.

---

## Parâmetros que provavelmente nunca serão públicos

Dados de natureza atuarial/comercialmente sensível que nenhum dos 7 bancos publica, e que não há expectativa de encontrar em fonte pública futura — só descobríveis rodando simulações reais e comparando o valor final da parcela:

- **Tabela de prêmio MIP por idade**, exata, de qualquer banco (o que existe hoje no engine para Itaú/Inter/Caixa/Daycoval veio de acesso direto a simuladores reais com CPF, não de fonte pública — e mesmo assim, partes dessas tabelas são interpoladas/estimadas, não 100% verificadas ponto a ponto).
- **Fórmula exata do DFI** (alíquota sobre valor do imóvel) de qualquer banco — todos os 7 bancos hoje usam valores calibrados empiricamente ou estimados (`DFI_RATE_MENSAL` genérico é uma média assumida, não um dado de banco real).
- **Nome exato e vigente da seguradora parceira de MIP/DFI** em vários bancos (Santander tem 2 documentos conflitantes de datas diferentes; BB e Bradesco têm menção ambígua a mais de uma seguradora possível).
- **Spread exato de taxa por relacionamento/score de crédito** (todos os bancos mencionam qualitativamente que existe, nenhum publica a tabela).
- **CET completo** (taxa + seguros + tarifas combinados) fora dos exemplos ilustrativos pontuais que alguns bancos publicam.

Estes parâmetros devem ser tratados como **calibração empírica permanente**, não como pendência de pesquisa — não há ação de "buscar mais" que resolva, só comparação sistemática contra resultado real de simulação.

---

## Ordem de execução da calibração (banco a banco)

1. **Caixa** — banco de referência: já tem a base mais completa e calibrada empiricamente no código (MCMV, Pró-Cotista, MIP/DFI com pontos verificados), e é o operador padrão de terreno/construção no motor. Começar por ela estabelece o padrão de qualidade e o processo de validação (rodar simulador oficial, comparar parcela) a ser repetido nos demais bancos. Ação principal: revalidar taxa (item mais volátil) e confirmar se o teto SFH de R$2,25M segue vigente.
2. **Itaú** — segundo banco mais bem calibrado (MIP/DFI já extraídos de simulador oficial recente, jun/2026). Ação principal: resolver o conflito de LTV (80% vs 90%) e completar a tabela MIP para as idades 18–43 (hoje interpoladas).
3. **Inter** — prioridade alta fora de ordem de "qualidade de calibração" porque há **suspeita concreta de erro de regra** (taxa e prazo possivelmente errados) com risco direto a clientes reais. Resolver antes de qualquer nova simulação Inter ser usada operacionalmente.
4. **Bradesco** — boa cobertura documental pública, mas taxa dispersa entre fontes e PRICE ausente apesar de confirmado oficialmente. Ação principal: validar taxa no simulador oficial e decidir se habilita PRICE com o comprometimento de renda de 15% já confirmado.
5. **Banco do Brasil** — maior quantidade de "parâmetros públicos que podem ser atualizados imediatamente" (tarifa, MCMV, LTV por sistema) — bom retorno rápido de calibração. Ação principal: implementar Pró-Cotista/PMCMV e resolver os 2 conflitos internos de prazo (Pró-Cotista e EGI).
6. **Santander** — pesquisa pública mais fraca do grupo (bloqueio técnico de acesso). Antes de qualquer calibração fina, repetir a coleta de dados com uma ferramenta de fetch mais robusta; só depois comparar contra simulador oficial.
7. **Daycoval** — menor prioridade: produto de nicho (CGI), já com dados calibrados empiricamente e sem contraparte na biblioteca para cruzar. Ação: apenas revalidação periódica de taxa.

---

## Papel dos simuladores Excel na calibração

A partir desta revisão, o projeto passou a contar com uma pasta de simuladores oficiais em Excel usados por correspondentes bancários (`_projeto/simuladores bancos/`), analisada e documentada em `docs/calibracao-simuladores/casos-ancora.md` e `docs/calibracao-simuladores/casos-ancora/*.json`. Para evitar qualquer ambiguidade futura sobre o papel desses arquivos:

- **Os simuladores Excel são apenas uma ferramenta de calibração.** Servem para validar regras, validar valores, gerar casos-âncora de comparação, e calibrar continuamente os parâmetros já existentes em `constantes.ts`. Eles não são consultados em runtime, não são abertos por nenhum código de produção, e não devem ser tratados como uma fonte que "sempre vai existir" — o dia em que um banco deixar de fornecer planilha e passar a operar só por simulador web, a calibração simplesmente passa a vir de lá, sem qualquer mudança na arquitetura do Fonti.
- **O motor oficial do Fonti continuará sendo próprio.** Ele não terá nenhuma dependência de arquivo externo, de biblioteca de leitura de Excel, nem de qualquer simulador de terceiro — nem em produção, nem em desenvolvimento. Isso já era verdade antes desta análise e continua sendo depois dela.
- **A taxa de juros continuará podendo ser informada manualmente pelo analista** quando variar conforme campanha, relacionamento, gerente do banco ou o simulador web do momento — os overrides já existentes na tela Configurações > Bancos (`taxa_anual`, `ltv_maximo`, `prazo_maximo`, `seguro_mip`, `seguro_dfi`) são o mecanismo correto para isso e não são substituídos por nada relacionado às planilhas Excel. Nenhum dos 5 bancos com planilha analisada tinha uma tabela de taxa fixa e vigente sem depender de negociação — reforçando a conclusão já registrada na seção "Parâmetros que exigem comparação com simuladores oficiais" deste documento.

Ver `casos-ancora.md` para o inventário completo, o modelo de dados dos casos-âncora, a proposta (não implementada) de mecanismo de comparação automática entre simulação oficial e simulação Fonti, e a recomendação técnica sobre o que vale a pena incorporar como parâmetro permanente vs. o que deve continuar sendo confirmado manualmente pelo analista.
