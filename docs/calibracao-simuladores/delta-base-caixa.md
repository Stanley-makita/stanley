# Delta — Base de Critérios Caixa (v1 → v2)

> Comparação entre a base anterior (`base-criterios-caixa.md`/`.json`,
> construída a partir de `MO43000269`, `MO30769` e `MO30341047` — documentos
> que na época cobriam SBPE/Recursos Livres, elegibilidade geral e um
> formulário de cliente) e a base atual (v2), construída do zero a partir dos
> documentos atualizados na pasta do projeto: `MO43000271` (sucessor do
> MO43000269), `MO30769` (inalterado), `MO30824` v040 (novo — FGTS/PMCMV/
> Pró-Cotista/Classe Média), `MO43062` (novo — risco de crédito e renda) e o
> Anexo IV "Uso do FGTS" (novo).
>
> **Contexto importante**: `MO43000269` não existe mais no projeto — foi
> fisicamente substituído por `271.pdf` (MO43000271). Não foi possível
> comparar os dois documentos byte a byte; a comparação abaixo é entre o que
> a v1 **registrou como extraído** do MO43000269 e o que a v2 encontrou no
> MO43000271 e nos 3 documentos novos.

---

## 1. Regras novas (não existiam na v1)

| # | Regra | Documento de origem | Categoria |
|---|---|---|---|
| 1 | Toda a **base normativa MCMV/Pró-Cotista/Classe Média** (faixas de renda × porte de município, taxas por faixa, fórmulas de desconto, hierarquização de propostas) | MO30824 (v040) | Produtos / Regras financeiras / Programas especiais |
| 2 | **Alíquotas concretas de MIP/DFI/DFC** por faixa etária, para operações FGTS/PMCMV | MO30824 (v040) §13 | Regras financeiras (fecha parcialmente uma lacuna da v1) |
| 3 | Manual dedicado de **análise de risco de crédito e apuração de renda** (comprovação por tipo de documento, prazos de validade, fórmulas de conversão de renda) | MO43062 | Elegibilidade |
| 4 | **Validação cruzada CLT+FGTS**: usa o maior valor entre (depósito FGTS × 12,5) e contracheque | MO43000271 §3.7.13.2.5 | Regras financeiras / Renda |
| 5 | Exigência de **comprovante de DARF** para pró-labore acima de 8,5 salários-mínimos | MO43062 (changelog) | Elegibilidade / Renda |
| 6 | Restrição: **CCA e família até 3º grau** impedidos de contratar no próprio estabelecimento | MO43000271 §3.3.1.2 | Restrições |
| 7 | Imóvel impeditivo: **alienação superveniente** (Lei 14.711/2023) | MO43000271 §3.3.3.7 | Elegibilidade / Restrições |
| 8 | **Tarifa/Comissão de leiloeiro**, até 5% do VF, para imóveis retomados por credores FGTS | MO43000271 §4.6.2.4.12 + MO30824 §10 | Regras financeiras |
| 9 | **Validade do Laudo de Avaliação**: 720 dias (CAIXA/AMV e FAR/PAR) vs. 180 dias (demais imóveis) | MO43000271 §4.6.8.3 | Operacional |
| 10 | **Última parcela do cronograma de obra** não pode ser inferior a 5% | MO43000271 §3.6.10.3 | Regras financeiras |
| 11 | Regras completas de **impedimento e exceção de uso do FGTS** (antes só parcialmente conhecidas via referências cruzadas) — interstício de 3 anos sobre o imóvel, tabela de contaminação por regime de bens do casal, exceção de localização para quem não é proprietário em lugar nenhum | Anexo IV — Uso do FGTS | Elegibilidade |
| 12 | **Restrições de crédito por score/cadastro** (SERASA/SCPC, CADIN, SCR) com suas respectivas exceções (Consignado, Cheque Especial de conta salário) | MO43062 §3.5 | Restrições |
| 13 | **Consignado PAB (Auxílio Brasil)** impede novas contratações comerciais, exceto cartão | MO43062 §3.8.8 | Restrições |
| 14 | **Validade e limite de solicitações de avaliação de crédito** (30 dias/10 solicitações comercial; 180 dias/41 solicitações habitacional) | MO43062 §3.8 | Operacional |

---

## 2. Regras removidas / desconsideradas

| # | Regra (v1) | Motivo da remoção |
|---|---|---|
| 1 | Citação a `MO43000269` como documento vigente | Documento não existe mais no projeto; substituído por `MO43000271`. Toda referência a seções do MO43000269 na v1 foi descontinuada — a numeração de seções mudou parcialmente na v271 (ex.: MIP/DFI que era §3.18.3.6 permanece igual, mas outras seções foram renumeradas) |
| 2 | Conteúdo do arquivo `30824.pdf` (v036) | **Superado pela v040** (`MO30824040.pdf`) — mesmo manual, versão mais antiga. Registrado no delta interno (seção 8 da base v2), mas desconsiderado como fonte de verdade |
| 3 | Vedação de Interveniente Quitante para liquidação de Home Equity de outra instituição financeira | **Invertida** na versão vigente (ver seção 3 — regra alterada, não simplesmente removida) |

Nenhuma outra regra da v1 foi invalidada — a maior parte foi **reconfirmada** (ver seção 4).

---

## 3. Regras alteradas (mesma regra, valor ou sentido diferente)

| # | Regra | v1 (antiga) | v2 (atual) | Documento | Prevalece |
|---|---|---|---|---|---|
| 1 | Interveniente Quitante — Home Equity de outra IF | **Vedado** | **Permitido** | MO43000271 §3.7.10.4/3.7.10.6 (changelog explícito do próprio documento) | v2 — documento mais recente, mudança declarada |
| 2 | Antecipação de recursos de obra — parcela intermediária | Entendida como permitida dentro do limite de 20% | **Não é mais permitida** para contratos assinados a partir de 02/01/2023 | MO43000271 §3.6.8.3 | v2 |
| 3 | Carência — antecipação da fase de amortização | Não documentada explicitamente | **Não é mais possível** para construção individual/PF vinculada a empreendimento em obra | MO43000271 §3.7.7.2.8 (changelog) | v2 |
| 4 | Financiamento máximo — Programa Classe Média | Não existia na v1 (documento ausente) | v036: R$400.000 → **v040: R$480.000** | MO30824 (interno à própria v2) | v040 dentro da v2 |
| 5 | Fórmula do PRICE | Descrita como equação algébrica explícita (via MO43000269) | Descrita textualmente, sem repetir a equação, no MO43000271 | MO43000271 §3.18.3 | **Não resolvido** — ver seção 6, ponto 4 |

---

## 4. Regras reconfirmadas sem mudança

- Todas as **taxas, LTV, prazos e comprometimento de renda do SBPE/Recursos Livres** (`MO30769`) — documento fisicamente inalterado, conteúdo idêntico byte a byte à leitura anterior.
- `taxaAnualBase = 0.1149`, `taxaAnualCorrentista = 0.1119`, `maxLtv = 0.80`/`maxLtvPrice = 0.70`, `comprometimentoMaxPrice = 0.25`/SAC `0.30`, `maxValorImovel = 2.250.000`, `prazoMaximoMeses = 420` — todos batem com o código atual, exatamente como na v1.
- Base de cálculo de MIP (saldo devedor) e DFI/DFC (valor da garantia).
- Lista de imóveis impeditivos, suspensão de IPCA/Pré-fixada/Poupança em Aquisição/Construção, teto de R$2.250.000 do SFH.
- DFI não aplicável a Lote Urbanizado (formulário 30.844, inalterado).
- Redutor de 0,5% para cotista FGTS com ≥3 anos — **e agora corroborado por 2 documentos independentes** (antes só 1).
- Regras da Cessão de Direitos Creditórios do FGTS Futuro (renda ≤ R$2.640, comprometimento 20-30%, prazo 120 meses) — **e agora corroboradas por 2 documentos independentes**.
- Taxa Pró-Cotista de 8,66%/9,0121% a.a. — **agora com fonte primária confirmada** (`MO30824`), antes vinha só de calibração externa.

---

## 5. Conflitos resolvidos

| # | Conflito | Como foi resolvido |
|---|---|---|
| 1 | `MO30824` existia em 2 versões no projeto (v036 e v040) | **v040 prevalece** (versão mais recente por numeração). v036 usado só para documentar as mudanças (seção 8 da base v2) |
| 2 | Comprometimento de renda: 30%/25% por sistema de amortização (MO30769) vs. teto único de 30% redutível por perfil de risco (MO43062) | Interpretado como **complementaridade, não substituição** — o teto de produto é o parâmetro de simulação padrão; o teto de risco é uma camada de score que só pode reduzir ainda mais, nunca ampliar |
| 3 | Interveniente Quitante para Home Equity | Ver seção 3, item 1 — resolvido a favor da versão mais recente |

## 6. Conflitos restantes (não resolvidos nesta rodada)

| # | Conflito/lacuna | Por que não foi resolvido | Próximo passo sugerido |
|---|---|---|---|
| 1 | Fórmula exata do PRICE na versão vigente | Documento antigo (MO43000269) não está mais disponível para comparação byte a byte; o documento novo não repete a equação algébrica | Confirmar a fórmula implementada em `engine.ts` contra um caso-âncora real (não alterar código nesta etapa) |
| 2 | Regra de idade / idade+prazo | Ausente em **5 documentos normativos** (MO43000271, MO30769, MO30824 v036/v040, MO43062, Anexo IV) | Só um simulador real ou um manual de originação/formalização ainda não localizado pode confirmar |
| 3 | Regra "saldo ≥10%" do Pró-Cotista | Citada só em `MO43000271`, ausente em `MO30824 v040` e no Anexo IV | Aguardar um manual específico do Pró-Cotista, se existir |
| 4 | `CAIXA_PRO_COTISTA.maxValorImovel = 350.000` no código vs. **R$500.000** no MO30824 v040 | Discrepância nova, não investigada nesta rodada (fora do escopo — sem alterar código) | Validar se o valor de 350k tinha outra fonte (ex. regra de teto anterior à reforma de 2023) antes de decidir qual prevalece |
| 5 | `MCMV_FAIXAS` (código) vs. matriz completa de faixa×porte de município (MO30824) | A implementação atual é mais simples que a estrutura normativa real | Decidir, numa fase futura de modelagem, se vale a granularidade completa ou uma simplificação deliberada |
| 6 | Alíquotas MIP/DFI para SBPE (produto que o Fonti simula como "Caixa" hoje) | Anexo III continua ausente do projeto — só as alíquotas de FGTS/PMCMV foram encontradas (produto diferente) | Buscar o Anexo III especificamente, ou confirmar via simulador oficial |

---

## 7. O que deve alimentar o futuro `SimulationCriteria` (Fase 4)

Regras com valor numérico concreto, confirmadas por documento normativo, que são candidatas diretas a campos de critério:

- Taxas por nível de relacionamento (Balcão/Bonificação 1/Bonificação 2) — SBPE/Recursos Livres.
- LTV/quota por modalidade × sistema de amortização.
- Prazos mínimo/máximo por modalidade.
- Comprometimento de renda por sistema (30% SAC / 25% PRICE), com a ressalva do teto de risco adicional (ver seção 5, item 2).
- Redutor de -0,5pp para cotista FGTS.
- Regras SAC/PRICE (fórmula, ressalvado o ponto 1 da seção 6).
- Base de cálculo de MIP (saldo devedor) e DFI (valor da garantia), com a exceção de Lote Urbanizado para DFI.
- Tarifa de avaliação (R$750 + remanescente), despesas cartorárias (5% VF), comissão de leiloeiro (5% VF).
- Taxas e tetos do Pró-Cotista (8,66%/9,0121%, quota 60%, prazo 60-420, teto R$500.000).
- Taxa e teto do Programa Classe Média (10%/10,47%, financiamento até R$480.000, renda ≤ R$13.000).
- Faixas de renda × teto de imóvel do MCMV (se a Fase 4 decidir pela granularidade completa).

## 8. O que deve ficar fora do motor por ser apenas operacional

- Fluxo de atendimento do Correspondente CAIXA Aqui, cadastro SIOPI, PLD/FTP (Seção 4 do MO43000271).
- Processo de pesquisas cadastrais (SIRIC/CADIN/CONRES/SIJUR) — o *resultado* (aprovado/reprovado) é critério de elegibilidade; o *processo* de consulta é operacional.
- Hierarquização de propostas do MCMV (fila de orçamento CCFGTS) — afeta se a proposta é aceita no período, não o valor da parcela simulada.
- Formulários de cliente (30.844, 33.377, Anexo II, DAMP) — nenhum contém critério de cálculo, só formalizam autorizações/declarações já cobertas pelas regras de elegibilidade.
- Restrição de CCA/família até 3º grau — é uma regra de compliance/triagem do correspondente, não uma variável de cálculo de parcela do cliente final.
- Validade/limite de solicitações de avaliação de crédito (30/180 dias, 10/41 solicitações) — regra de processo do sistema de risco, não de simulação.

---

## 9. Resumo executivo

A reconstrução desta rodada **ampliou substancialmente** a cobertura da base de conhecimento Caixa: além de atualizar o manual principal (MO43000269 → MO43000271), passou a incluir pela primeira vez os parâmetros financeiros completos de **FGTS/MCMV/Pró-Cotista/Classe Média** (antes um manual inteiro ausente, `MO30824`) e um manual dedicado de **risco de crédito e apuração de renda** (`MO43062`). Isso fechou lacunas importantes (MIP/DFI para FGTS, taxa do Pró-Cotista confirmada por fonte primária) e revelou 2 discrepâncias novas dignas de investigação futura (teto do Pró-Cotista, granularidade do MCMV). A lacuna mais persistente — **regra de idade/idade+prazo** — permanece sem confirmação mesmo após a análise de 5 documentos normativos, incluindo o manual de risco de crédito dedicado, reforçando a hipótese de que essa regra vive num sistema (não num manual textual) ou num documento ainda não disponível no projeto.
