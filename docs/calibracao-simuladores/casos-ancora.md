# Casos-Âncora — Infraestrutura de Calibração do Motor de Simulação

> Análise da pasta `_projeto/simuladores bancos/` (simuladores oficiais em Excel + normativos em PDF usados por correspondentes bancários) para servir de fonte de validação e calibração contínua do motor próprio do Fonti.

Data: 2026-07-06.

---

## 0. Princípio inegociável

**As planilhas desta pasta NÃO fazem parte da arquitetura do Fonti e nunca devem fazer.** Elas servem exclusivamente para:

1. Validar regras (LTV, prazo, idade+prazo, comprometimento de renda).
2. Validar valores (taxas, MIP, DFI, tarifas) contra o que o motor próprio calcula.
3. Gerar casos reais de comparação ("casos-âncora").
4. Calibrar continuamente os parâmetros do motor próprio (`constantes.ts`).

**O motor de simulação do Fonti (`src/lib/simuladorFinanciamento/`) permanece 100% independente dessas planilhas.** Nenhum código de produção lê, abre, importa ou depende da existência desses arquivos `.xlsm`/`.xlsx`/`.pdf`. O objetivo declarado é que, mesmo que todos os bancos parem de fornecer simulador em Excel amanhã e passem a operar só por simulador web, o Fonti continue funcionando sem nenhuma mudança de arquitetura — porque ele nunca dependeu desses arquivos para calcular, só os usou (fora do runtime, manualmente, por um analista/desenvolvedor) para calibrar os números que já vivem em `constantes.ts`.

Esta pasta não foi alterada nesta tarefa — todos os arquivos originais permanecem exatamente como estavam. Arquivos de trabalho temporários gerados durante a análise (dumps de texto) foram removidos ao final.

---

## 1. Inventário da pasta analisada

```
_projeto/simuladores bancos/
├── BRADESCO.xlsm                                                    → simulador oficial Bradesco
├── DAYCOVAL.xlsx                                                    → simulador oficial Daycoval (CGI + Aquisição)
├── Simulador Imóvel Residencial DESTRAVADO - CI Bonificado - ...    → simulador oficial Santander (confirmado pelo conteúdo interno)
├── simulador itau.xlsm                                              → simulador oficial Itaú
├── SIMULAÇÃO INTER.xlsx                                              → simulador oficial Inter
├── codigo_modulo_simulador.txt                                       → NÃO é planilha de banco — dump de código-fonte de um CRM anterior ("Lovable"), motor de simulação próprio antigo. Histórico, fora do escopo desta análise (não é fonte de calibração bancária).
└── Juros caixa imobiliario/
    ├── taxas caixa.pdf        → tabela de taxas oficial Caixa (normativo MO 30769, SBPE/Recursos Livres)
    └── MO43000269.pdf         → manual operacional Caixa (crédito imobiliário, regras gerais)
```

**Nenhuma planilha da Caixa e do Banco do Brasil foi encontrada nesta pasta** — só os 2 PDFs normativos da Caixa. Isso significa que, dos 7 bancos que o motor Fonti hoje simula (Caixa, Itaú, Bradesco, Santander, BB, Inter, Daycoval), só 5 têm simulador Excel disponível para calibração direta (Itaú, Bradesco, Santander, Inter, Daycoval); a Caixa tem só normativo (sem caso numérico pronto) e o **BB não tem nenhuma fonte nesta pasta**.

---

## 2. O que foi encontrado em cada planilha

### Itaú (`simulador itau.xlsm`)

Simulador completo com 11 abas. Cobre Aquisição (Isolado/Repasse), Portabilidade, e possui matriz de políticas por produto × carteira (SFH/CH) × novo/usado × residencial/comercial. Campos de entrada cobrem 2 proponentes, segmento de relacionamento (Uniclass/Personnalité/Private/Agências), seguradora (Itaú/Tokio Marine), incorporação de ITBI, e mais de um cenário de prazo simultâneo. A aba `CALCULOS` tem a fórmula completa mês a mês (SAC e PRICE em blocos de colunas separados) e a aba `VALIDADE` tem a matriz de políticas (taxa mínima, prazo mín/máx, LTV máximo 90%, comprometimento de renda máximo 45%, valor mínimo de crédito/imóvel, tarifa de avaliação, regra idade+prazo) e as tábuas completas de MIP por seguradora e por período do contrato (antes/depois da renovação decenal).

**Achado mais importante**: a planilha estava salva com um caso real completo e coerente (cliente "Henrique Justo Mengue", ver seção 4) — é o caso-âncora mais confiável de todo o levantamento, porque **é literalmente a fonte original** dos valores `ITAU_MIP_P1[44]` e `ITAU_DFI_RATE` já presentes em `constantes.ts`. Além disso, a planilha tem os valores reais de MIP para as idades 18-43 que hoje estão marcadas como **estimadas/interpoladas** no código — uma oportunidade concreta de melhorar a precisão sem precisar de nenhuma nova coleta de dados (ver seção 8).

### Bradesco (`BRADESCO.xlsm`)

Simulador único cobrindo Residencial, Comercial, Lote, Construção, Crédito Associativo e as 3 carteiras PJ, com SAC e PRICE. Campos de entrada incluem tipo de pessoa (PF/PJ), segmento (Prime/Exclusive/Classic/Principal/Private), tipo de imóvel, e (para construção) mês de entrega/carência. A aba `Parâmetros` tem tabelas por carteira × segmento com taxa, LTV SAC/PRICE, prazo mín/máx, tarifa de avaliação fixa por produto, e uma tabela de MIP por idade em faixas de 3 anos (`Base de Dados`). CET é calculado via TIR/XIRR sobre o fluxo de caixa completo.

**Achado mais importante**: a planilha estava salva com um caso real completo de produto **comercial** (o motor Fonti hoje só modela aquisição residencial genérica para o Bradesco) — ver seção 4. Revela também que o comprometimento de renda máximo varia por segmento de relacionamento (15% para PRIVATE), não é um valor único de 30% como o motor usa hoje para todos os bancos/segmentos.

### Santander (`Simulador Imóvel Residencial DESTRAVADO - CI Bonificado - 2022.03.14.xlsm`)

Confirmado como Santander pelo conteúdo interno (título "CRÉDITO IMOBILIÁRIO SANTANDER" na aba `Preenchimento`, menções a Zurich Santander). Cobre Aquisição e Portabilidade, com 4 ofertas de taxa (Sem Relacionamento, CI Bonificado, Plano Saúde/Leilão, FOPA TJSP&PE) e 2 regimes de prestação (Variáveis/SAC, Fixas/PRICE). Tem 3 seguradoras com tábuas de MIP/DFI próprias (Zurich Santander, Zurich F1-Private, Tókio Marine/HDI).

**Limitação importante**: a aba de entrada estava **vazia** (sem cenário preenchido), então não há caso-âncora numérico pronto — só a estrutura de parâmetros (taxas por segmento/oferta, LTV, MIP/DFI, comprometimento de renda) é aproveitável. Além disso, a planilha está rotulada **"V. Mar/2022"** — mais de 4 anos desatualizada. Ver seção 6 para o que fazer a respeito.

### Inter (`SIMULAÇÃO INTER.xlsx`)

8 abas, com uma hierarquia clara: `SAC`/`Price` são versões condensadas, `Simulador SAC M`/`Simulador PRICE M` são as versões completas/oficiais, e `Simulador Backup` é uma variante. A planilha tem um caso real completo (ver seção 4) datado de 07/11/2024, que é a fonte confirmada de `INTER_MIP_SOMPO`/`INTER_DFI_RATE` já no código.

**Achado mais importante**: o Inter usa **seguradoras diferentes por produto** — a carteira SFH/aquisição usa Sompo SuperHab SFH (já no código), mas o Home Equity/CGI do Inter usa **Liberty CI 112020**, uma tábua de MIP mais cara e um DFI mais que o dobro (0,018% vs 0,008558%). O motor Fonti hoje não modela o CGI do Inter como produto separado, então isso não é um bug atual — é uma informação a guardar para quando (se) esse produto for implementado.

### Daycoval (`DAYCOVAL.xlsx`)

6 abas cobrindo 4 produtos diferentes: CGI (Home Equity), "CGI e Fin" (mesma aba com dropdown para CGI/Aquisição/TCC/Aquisição TCC), e Aquisição tradicional (SAC Fixa). Dois casos numéricos completos e um parcial foram encontrados (ver seção 4).

**Achado mais importante**: o Daycoval tem um produto de **aquisição tradicional pleno** (LTV até 70% residencial), não só CGI — o motor Fonti hoje modela o Daycoval exclusivamente como CGI (`programa: 'CGI'` em `BANCOS_CONFIG`). Também foi encontrada uma tábua de MIP por idade muito granular numa área da planilha que **não é usada pela fórmula viva** (o cálculo real usa taxa flat, igual ao motor Fonti já faz) — ou seja, o comportamento atual do motor está mais alinhado com a planilha real do que pareceria à primeira vista.

### Caixa (PDFs `taxas caixa.pdf` + `MO43000269.pdf`)

Não são simuladores interativos — são normativo e tabela de taxas oficiais (MO 30769 e o manual operacional geral). Confirmam seções já citadas no código (`3.1.2` para lote urbanizado, `3.1`/`3.2` para LTV/comprometimento de renda — este último, na prática, vem do MO 30769/`taxas caixa.pdf`, não do MO43000269 como o comentário do código sugere; vale corrigir a referência interna numa fase futura). Não há caso numérico de cliente pronto.

---

## 3. Modelo de Casos-Âncora

Cada caso-âncora é um registro estruturado com os seguintes campos (ver os arquivos JSON em `casos-ancora/` para o schema completo já implementado):

| Campo | Descrição |
|---|---|
| `banco` | Identificador do banco (`itau`, `bradesco`, `santander`, `bb`, `inter`, `daycoval`, `caixa`) |
| `produto` | `aquisicao`, `cgi_home_equity`, `construcao`, `terreno`, etc. |
| `modalidade` | `residencial` ou `comercial` |
| `sistema_amortizacao` | `SAC` ou `PRICE` |
| `valor_imovel` | Valor do imóvel (ou de avaliação, quando maior — ver campo específico no Itaú) |
| `valor_financiado` | Valor efetivamente financiado |
| `entrada` | Valor de entrada |
| `prazo_meses` | Prazo em meses |
| `taxa_utilizada` | Taxa efetivamente aplicada na simulação (nem sempre é a taxa "de tabela" — pode ser negociada) |
| `idade` / `data_nascimento` | Idade ou data de nascimento do proponente principal |
| `renda` | Renda mensal considerada |
| `relacionamento` | Segmento/relacionamento (correntista, Uniclass, PRIVATE, etc.) |
| `data_simulacao` | Quando a simulação foi feita (para saber se a taxa ainda é válida) |
| `origem` | `Excel`, `Site` ou `Manual` |
| `parcela_oficial` | 1ª e última parcela segundo a fonte oficial |
| `cet_oficial` | CET anual segundo a fonte oficial |
| `mip_oficial` / `dfi_oficial` | Valores/alíquotas de seguro segundo a fonte oficial |
| `tarifa` | Tarifas aplicadas (avaliação, administração, TSA/TAC) |
| `observacoes` | Qualquer nota relevante (produto não modelado, taxa desatualizada, seguradora diferente, etc.) |

Nos arquivos JSON reais, esses campos aparecem dentro de um objeto `resultado_oficial` (agrupando parcela/CET/MIP/DFI/tarifa) para deixar claro que são o "lado oficial" da comparação — cada caso também já reserva os campos `resultado_fonti` (hoje `null`) e `comparacao` (hoje `null`), a serem preenchidos quando alguém rodar o mesmo input pelo motor Fonti e aplicar o mecanismo de comparação descrito na seção 7.

---

## 4. Casos-âncora extraídos (resumo)

| ID | Banco | Produto | Modalidade | Sistema | Valor imóvel | Financiado | Prazo | Taxa | Parcela oficial (1ª) | Fonte |
|---|---|---|---|---|---|---|---|---|---|---|
| `itau-henrique-mengue-001` | Itaú | Aquisição | Residencial | SAC | R$ 1.495.000 | R$ 1.054.500* | 396m | 13,00% a.a. | R$ 14.430,81 | Excel |
| `bradesco-comercial-price-001` | Bradesco | Aquisição | **Comercial** | PRICE | R$ 1.500.000 | R$ 750.000 | 240m | 13,99% a.a. | R$ 9.086,46 | Excel |
| `inter-sfh-sompo-001` | Inter | Aquisição | Residencial | SAC | R$ 1.690.000 | R$ 1.340.000 | 420m | 9,50% a.a. | — (só MIP/DFI confirmados) | Excel |
| `daycoval-cgi-sac-fixa-001` | Daycoval | CGI | Residencial | PRICE | R$ 500.000 | R$ 200.000 | — | — | — (só MIP/DFI confirmados) | Excel |
| `daycoval-aquisicao-sac-fixa-001` | Daycoval | Aquisição (não modelado hoje) | Residencial | SAC | R$ 300.000 | R$ 125.000 | — | — | — (só MIP/DFI confirmados) | Excel |
| — | Santander | — | — | — | — | — | — | — | **sem caso pronto** | — |
| — | Caixa | — | — | — | — | — | — | — | **sem caso pronto** | — |
| — | BB | — | — | — | — | — | — | — | **sem fonte nesta pasta** | — |

`*` inclui 5% de ITBI incorporado sobre o valor financiado base de R$ 990.000.

Dados completos, incluindo tabelas de parâmetros de referência mesmo para os casos sem cenário numérico pronto, estão em `docs/calibracao-simuladores/casos-ancora/*.json`.

---

## 5. Estrutura de arquivos criada

```
docs/calibracao-simuladores/casos-ancora/
├── itau-casos.json         → 1 caso completo + parâmetros de referência (LTV, prazo, MIP/DFI, políticas)
├── bradesco-casos.json     → 1 caso completo (comercial/PRICE) + parâmetros de referência
├── inter-casos.json        → 1 caso completo (SFH/Sompo) + nota sobre CGI/Liberty não modelado
├── daycoval-casos.json     → 3 casos (2 completos, 1 parcial) + parâmetros de referência
├── santander-casos.json    → 0 casos (planilha vazia) + parâmetros de referência + ação recomendada
└── caixa-casos.json        → 0 casos (só normativo, sem simulador) + parâmetros de referência + ação recomendada
```

Todos seguem o mesmo formato de topo: `{ banco, ultima_atualizacao, status, fontes_analisadas, casos: [...], parametros_referencia: {...} }`. O campo `status` é `"caso_ancora_disponivel"` ou `"sem_caso_ancora_pronto"`. **Não existe arquivo para o Banco do Brasil** — nenhuma fonte foi encontrada nesta pasta; se uma planilha do BB aparecer no futuro, criar `bb-casos.json` seguindo o mesmo formato.

Esses arquivos são **dados**, não código — nada no motor de simulação os lê. Servem para uso manual (analista/desenvolvedor consultando durante uma calibração) e, futuramente, para alimentar um script de comparação automática (rodado sob demanda, nunca em produção — ver seção 7).

---

## 6. Sobre taxas desatualizadas e variáveis

A planilha do Santander está datada de março/2022; a do Inter, de novembro/2024. Isso é esperado e não é um defeito da infraestrutura de calibração — é a natureza do dado: **taxa de juros muda com frequência, por campanha, por relacionamento, por gerente, e por simulador web em tempo real.** Por isso:

- Casos-âncora antigos continuam válidos para validar **regras estruturais** (fórmula de SAC/PRICE, base de cálculo do MIP/DFI, regra de idade+prazo, LTV, comprometimento de renda) — essas regras mudam raramente.
- Casos-âncora antigos **não devem ser usados** para validar a taxa de juros atual — isso exige uma nova coleta (nova simulação no simulador vigente, Excel ou web).
- O motor Fonti já reflete essa realidade: a taxa de juros é sempre editável por override (tela Configurações > Bancos) e o analista pode informá-la manualmente quando ela variar por campanha/relacionamento/gerente — isso não muda com esta tarefa, e a seção 9 do `plano-calibracao.md` foi atualizada para deixar esse ponto explícito (ver mudança na seção 9 deste documento abaixo).

---

## 7. Mecanismo de comparação automática (proposta — não implementado)

**Importante**: esta seção é uma proposta de design, não uma implementação. Nenhum código foi criado para executar esta comparação — isso ficaria para uma sprint futura, dedicada e explicitamente aprovada, respeitando a regra desta sprint de não iniciar novas funcionalidades.

### 7.1 Entrada

Um caso-âncora (`resultado_oficial`, de um dos arquivos JSON) + o mesmo conjunto de parâmetros de entrada rodado através do motor Fonti (`resultado_fonti`, hoje sempre `null` nos arquivos — a ser preenchido manualmente ou por um script leve rodado sob demanda, nunca automaticamente/em produção).

### 7.2 Comparação campo a campo

Para cada caso com `resultado_fonti` preenchido, comparar:

| Campo | Como comparar |
|---|---|
| Parcela (1ª e última) | Diferença absoluta e percentual |
| CET | Diferença em pontos percentuais |
| Renda mínima necessária | Diferença percentual |
| MIP | Diferença percentual da alíquota e do valor em R$ |
| DFI | Diferença percentual da alíquota e do valor em R$ |
| Tarifa | Diferença absoluta em R$ |
| Prazo (efetivo, após regra de idade) | Diferença em meses |
| LTV (calculado) | Diferença em pontos percentuais |
| Elegibilidade | Igual/diferente (booleano) — se um lado aprova e o outro rejeita, é sempre `erro_de_regra`, independente de qualquer tolerância numérica |

### 7.3 Saída proposta

Um relatório por caso, no mesmo formato dos arquivos de caso (preenchendo o campo `comparacao`), por exemplo:

```json
"comparacao": {
  "data_comparacao": "2026-08-01",
  "campos": {
    "primeira_parcela": { "oficial": 14430.81, "fonti": 14522.10, "diferenca_pct": 0.63, "classificacao": "diferenca_aceitavel" },
    "mip_primeira_parcela": { "oficial": 403.77, "fonti": 351.35, "diferenca_pct": -12.98, "classificacao": "divergencia_de_seguro" }
  },
  "classificacao_geral": "divergencia_de_seguro"
}
```

---

## 8. Classificação automática de diferenças (proposta)

Regras de classificação sugeridas, em ordem de prioridade (a primeira que bater vence):

| Classificação | Critério proposto |
|---|---|
| **erro_de_regra** | Elegibilidade diverge (um lado aprova, outro rejeita) OU a diferença de parcela excede 15% OU a diferença de LTV calculado excede 5 p.p. — indica que uma regra estrutural (não só um número) está errada no motor Fonti |
| **divergencia_de_taxa** | Diferença de parcela entre 3% e 15% E a taxa de juros usada em cada lado é diferente (comparar `taxaAnual` do Fonti vs `taxa_utilizada` do caso) — provavelmente a taxa do motor está desatualizada, não é bug de fórmula |
| **divergencia_de_seguro** | Diferença de MIP ou DFI (isolada, com o resto batendo) acima de 5% — indica tabela/alíquota de seguro desatualizada ou estratégia errada |
| **divergencia_de_tarifa** | Diferença isolada em tarifa (avaliação, administração, TAC/TSA) — geralmente de baixo impacto na parcela total |
| **arredondamento** | Diferença de parcela ou de qualquer campo monetário abaixo de R$ 1,00 ou 0,1% — provavelmente truncamento/arredondamento em casas decimais diferentes entre as duas fórmulas |
| **diferenca_aceitavel** | Diferença de parcela entre 0,1% e 3%, sem nenhuma das condições acima — dentro da margem esperada de um motor próprio que não reproduz a planilha do banco bit a bit |

Estes limiares (15%, 5 p.p., 3%, 5%, 1,00/0,1%) são **um ponto de partida proposto**, não valores validados — devem ser calibrados com o tempo, à medida que mais casos-âncora forem comparados e o time observar o que realmente costuma variar por ruído vs. o que realmente indica erro.

---

## 9. Atualização do plano de calibração

O arquivo `docs/calibracao-simuladores/plano-calibracao.md` foi atualizado (ver seção nova "Papel dos simuladores Excel na calibração") para deixar explícito que:

- Os simuladores Excel desta pasta são **apenas uma ferramenta de calibração**, nunca uma dependência de runtime.
- O motor oficial do Fonti (`src/lib/simuladorFinanciamento/`) continuará sendo **próprio e independente**, inclusive de simuladores web dos bancos.
- A **taxa de juros continuará podendo ser informada manualmente pelo analista** quando variar por campanha, relacionamento, gerente ou simulador web — os overrides já existentes na tela Configurações > Bancos (`taxa_anual`, `ltv_maximo`, `prazo_maximo`, `seguro_mip`, `seguro_dfi`) continuam sendo o mecanismo correto para isso, e nada nesta tarefa muda esse comportamento.

---

## 10. Recomendação técnica final

### O que vale a pena incorporar ao Fonti como parâmetro permanente

1. **Tabela real de MIP do Itaú para idades 18-43** (`VALIDADE!AH11:AI36` na planilha) — hoje `ITAU_MIP_P1` tem essas idades marcadas como "estimadas com base na progressão observada". A planilha tem os valores reais e exatos. É uma correção de baixo risco e alto ganho de precisão (não requer nenhuma nova coleta, o dado já está em mãos) — recomendo que seja o primeiro item a migrar, numa tarefa dedicada de calibração (não nesta sprint, que é só de levantamento).
2. **Confirmação formal de que o DFI do Daycoval é flat** (não varia por idade) — a tábua granular existe na planilha mas está desativada na fórmula viva. Vale um comentário no código confirmando isso explicitamente (hoje o comentário já é `DAYCOVAL_MIP_RATE`/`DAYCOVAL_DFI_RATE` "verificado", mas sem essa nota específica de que a tabela por idade é vestigial).
3. **Regra de comprometimento de renda por segmento do Bradesco** (30% padrão / 15% PRIVATE) — hoje o motor usa 30% fixo para todos os segmentos e bancos. Isso é uma regra estrutural (já confirmada oficialmente, ver `plano-calibracao.md`), não uma taxa variável — boa candidata a virar critério configurável na Fase de calibração de Bradesco.
4. **Correção da citação interna do código**: o comentário sobre "seção 3.1/3.2" do comprometimento de renda/LTV da Caixa deveria referenciar o `taxas caixa.pdf` (MO 30769), não o `MO43000269.pdf` — os PDFs confirmam que o MO43000269 delega esses parâmetros numéricos a outro manual.

### O que deve continuar sendo obtido manualmente pelo analista, no momento da simulação

1. **Taxa de juros de qualquer banco/produto.** Confirmado por toda a pesquisa (`plano-calibracao.md`) e reforçado aqui: nenhum banco publica uma tabela de taxa fixa e vigente sem depender de negociação/relacionamento/campanha/simulador em tempo real. O override manual já existente (`taxa_anual` na tela de Bancos) é a ferramenta certa — não há nenhuma tabela de "taxa oficial" nas planilhas que justifique fixar um valor permanente no código além do que já está lá como estimativa.
2. **Seguradora específica quando o banco oferece mais de uma** (Itaú: Itaú Seguros/Tokio Marine; Santander: Zurich/Zurich F1-Private/HDI; Inter: Sompo para SFH ou Liberty para CGI; Daycoval: Excelsior/Zurich). As alíquotas de MIP/DFI mudam conforme a seguradora escolhida — fixar uma delas como "padrão" no motor é uma aproximação aceitável para o caso mais comum, mas o sistema não deveria fingir que só existe uma opção. Nenhuma mudança de código recomendada agora; só registrar que essa variação existe e é real.
3. **Segmento de relacionamento específico do cliente** (Uniclass/Personnalité/Private, Prime/Exclusive/Classic/Principal, correntista/não-correntista) — impacta taxa, LTV e comprometimento de renda de forma diferente em cada banco, e a combinação exata (banco × segmento × produto) não está sempre disponível publicamente com números atuais (ver o caso do Itaú, cuja aba TAXAS está estruturada para isso mas hoje tem um valor único). Continuar como informação que o analista confirma manualmente com o gerente/correspondente antes de fechar uma proposta real, mesmo que o motor Fonti já produza uma boa estimativa inicial sem ela.
4. **Produtos ainda não modelados** (Bradesco comercial/PJ/construção com regras próprias; Daycoval aquisição tradicional; Santander/Inter/BB Home Equity ou CGI com tabela própria) — não modelar apressadamente com base só nesta pesquisa; cada um exigiria uma calibração dedicada (mais casos-âncora, validação contra simulador oficial atual) antes de virar produto operacional no Fonti, conforme o processo já descrito em `plano-calibracao.md`.

Nenhuma dessas recomendações foi implementada nesta tarefa — são pontos de partida para as próximas fases de calibração, a serem priorizados e aprovados separadamente.
