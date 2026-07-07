# Auditoria Técnica — Arquitetura do Motor Agnóstico (Pré-Fase 4: Caixa)

> Auditoria somente-leitura. Nenhum arquivo de código foi alterado. Objetivo: verificar se a arquitetura construída nas Fases 1–3 está pronta para absorver a Caixa (o banco mais complexo do sistema) antes de iniciar a Fase 4.

Data: 2026-07-06. Arquivos auditados: `engine.ts`, `criteria.ts`, `criteria-resolver.ts`, `constantes.ts`, `tipos.ts`, os 4 arquivos de teste (`amortizacao.test.ts`, `criteria-migracao.test.ts`, `criteria-migracao-fase2.test.ts`, `criteria-migracao-fase3-itau.test.ts`) e os 4 documentos de arquitetura/migração já produzidos.

---

## Resumo executivo

A arquitetura está **sólida e comprovadamente segura** — 6 dos 7 bancos (Bradesco, Santander, BB, Inter, Daycoval, Itaú) já rodam 100% pelo caminho de critérios, com zero `cfg.id === '<banco>'` dentro da lógica de cálculo desses bancos, e as 3 fases já concluídas seguiram uma disciplina de baseline→migração→prova de equivalência que funcionou mesmo quando algo deu errado no meio do caminho (o incidente da Fase 2 foi detectado e corrigido pelo próprio processo, não escondido).

O vocabulário de critérios (`SimulationCriteria`) já cobre, sem precisar de nenhum tipo novo, as duas estratégias de seguro que a Caixa precisa (`teto-idade` para SBPE, `flat` para MCMV/Pró-Cotista subsidiado) e os dois ajustes de LTV/renda que só ela usa (`penalidadeImovelUsado`, `comprometimentoRenda.price`) — **ambos já implementados e testados**, mesmo sem nenhum banco migrado até agora precisar deles de fato. Isso é o sinal mais forte de que o design foi bem antecipado.

Existe, no entanto, **uma peça genuinamente não construída**: o mecanismo para um banco produzir *múltiplos* resultados de simulação a partir de um único critério base (Pró-Cotista + MCMV + SBPE, o caso `programasEspeciais`). O tipo existe em `criteria.ts` desde a Fase 1, mas nenhuma linha de código o consome ainda — é a única parte da arquitetura que continua sendo "promessa de design" em vez de "capacidade testada". Isso não é um defeito: é exatamente o que as 3 fases anteriores decidiram adiar de propósito para a Fase 4, porque nenhum dos 6 bancos já migrados precisava disso.

**Não encontrei nenhum risco estrutural que exija corrigir a arquitetura antes de migrar a Caixa.** Encontrei um design a implementar (não a corrigir), uma duplicação mecânica de baixo risco a considerar, e um comentário desatualizado a corrigir. Nada disso bloqueia a Fase 4.

---

## 1. O engine realmente ficou agnóstico?

**Para os 6 bancos migrados: sim, completamente.** Busquei por `cfg.id ===`, `bancoId ===`, `if` e `switch` por banco em todo `engine.ts` e `criteria-resolver.ts`. O resultado:

| Local | O que ainda existe | Afeta bancos migrados? |
|---|---|---|
| `simularComCriterios` | Zero `cfg.id`. Todo dispatch é por **capacidade do critério** (`criteria.seguro.mip.tipo === 'periodo-e-idade'`), não por identidade do banco. | Não — é o núcleo agnóstico, funciona para todos os 6. |
| `criteria-resolver.ts` | `bancoId === 'inter'`, `'daycoval'`, `'itau'` — mas isso é o **local certo** para esse tipo de decisão: é aqui que o conhecimento "que banco é esse" vive de propósito, para que o motor de cálculo (`engine.ts`) nunca precise saber. | Não é um problema — é a separação de responsabilidades funcionando como desenhado (ver arquitetura-motor-agnostico.md, seção 12, risco 2, que já previa isso). |
| `simularBancoComTaxa` (função legada) | Ainda tem `cfg.id === 'caixa'` em 3 pontos (penalidade de LTV de imóvel usado, dispatch de MIP, dispatch da função de cálculo). | **Só a Caixa** passa por essa função hoje — os outros 6 bancos são interceptados antes, no `if (ehBancoComCriterios(cfg.id))`. |
| `simularBanco` | `if (bancoId === 'caixa')` para escolher taxa/programa entre Pró-Cotista/MCMV/SBPE antes de chamar `simularBancoComTaxa`. | Só a Caixa. |
| `simularCaixaDuplo` | Função inteira dedicada, só chamada para `'caixa'`. | Só a Caixa. |
| `simularTodosBancos` | `if (id !== 'caixa' && (op === 'lote_urbanizado' \|\| ...))` e `if (id === 'caixa') simularCaixaDuplo(...) else simularBanco(...)` — bancoId usado na orquestração de nível mais alto. | Afeta a ROTA de todos os bancos (decide se um banco pode operar uma modalidade), mas não a matemática interna deles. |

**Conclusão**: o objetivo "engine agnóstico" foi atingido para todo banco que já foi migrado. O que resta de `if`/`cfg.id` está 100% concentrado no que ainda não foi migrado (Caixa) — não é resíduo espalhado, é a fronteira exata e esperada da próxima fase. Isso é evidência de que a extração foi feita com disciplina, não que ela "meio que" funcionou.

---

## 2. O `SimulationCriteria` representa tudo que o motor precisa?

**Para os 6 bancos migrados, sim — nenhum parâmetro escondido.** Toda regra de negócio desses bancos (taxa, LTV, prazo, idade+prazo, comprometimento de renda, seguro MIP/DFI, ITBI, método de conversão de taxa) vem do critério, não de constante lida diretamente dentro do cálculo.

**Para a Caixa, o tipo já cobre a maior parte, sem precisar de extensão**, porque já foi desenhado pensando nela desde a Fase 1:

| Necessidade da Caixa | Já existe no tipo? | Já é consumido em algum lugar? |
|---|---|---|
| MIP por teto de idade (SBPE) | Sim — `EstrategiaSeguroMip` tipo `'teto-idade'` | **Sim** — usado pelo Inter hoje, mesma forma de dado que `CAIXA_MIP_RATES` |
| MIP flat subsidiado (MCMV/Pró-Cotista) | Sim — tipo `'flat'` | **Sim** — usado pelo Daycoval e por qualquer override de banco de dados |
| LTV reduzido para imóvel usado (−10pp) | Sim — `CriteriosLtv.penalidadeImovelUsado` | **Sim** — já lido em `simularComCriterios`, só nunca foi exercitado porque nenhum banco migrado até agora tinha esse campo preenchido |
| LTV diferente para PRICE (70% vs 80%) | Sim — `CriteriosLtv.price` | **Sim** — já lido, mesma situação acima |
| Comprometimento de renda menor em PRICE (25%) | Sim — `CriteriosComprometimentoRenda.price` | **Sim** — já lido |
| Tarifa de administração mensal fixa (R$25) | Sim — `SimulationCriteria.tarifaAdministracaoMensal` | **Não.** Campo existe e é preenchido com `0` para os 6 bancos migrados, mas **nenhuma função de cálculo lê esse campo** — `CAIXA_TA_MENSAL` continua hardcoded dentro de `calcularSACCaixa`/`calcularPRICECaixa`. |
| Múltiplos programas por banco (Pró-Cotista + MCMV + SBPE) | Sim — `SimulationCriteria.programasEspeciais?: ProgramaEspecial[]` | **Não.** Nenhuma função em `engine.ts` lê ou processa esse campo. Ele existe desde a Fase 1, sempre `undefined`. |

**Existe alguma regra que deveria estar em critérios e ainda está no código?** Duas, e ambas já mapeadas:

1. **Tarifa mensal fixa da Caixa** — está hardcoded em vez de vir do critério (`tarifaAdministracaoMensal` já existe e está pronto para receber, só falta a função de cálculo ler). Risco: baixo, mudança mecânica.
2. **A lógica de "qual programa da Caixa se aplica" (Pró-Cotista por valor de imóvel + FGTS, MCMV por faixa de renda, SBPE sempre)** — está toda dentro de `simularBanco`/`simularCaixaDuplo`, não expressa como `programasEspeciais`. Essa é a peça de verdade nova da Fase 4 (ver seção 5).

Não encontrei nenhum parâmetro "escondido" além desses dois — ou seja, o gap não é "o tipo está incompleto e vamos descobrir isso no meio da Fase 4", é "o tipo já prevê exatamente essas duas coisas, só falta implementar o consumo".

---

## 3. Existe duplicação de lógica?

Sim, três tipos concretos, cada um com risco diferente:

### 3.1 Três famílias de função de cálculo (SAC × 3, PRICE × 3)

`calcularSAC`/`calcularPRICE` (genérica), `calcularSACCaixa`/`calcularPRICECaixa` (Caixa, com tarifa fixa e zeragem de seguro na última parcela), `calcularSACPeriodoIdade`/`calcularPRICEPeriodoIdade` (Itaú, com pré-pagamento e MIP mês a mês). As diferenças entre elas já são inteiramente descritíveis pelos flags que `CriteriosSeguro` já tem (`incluirNaUltimaParcela`, `prePagamentoNoMesZero`) e pelo novo campo `tarifaAdministracaoMensal` — mas **esses flags não são lidos por nenhuma função hoje**; a diferença de comportamento é obtida escolhendo qual função chamar, não lendo o flag dentro de uma função só. Isso foi uma decisão deliberada e documentada na Fase 3 (risco 1 do respectivo relatório): unificar de verdade custaria mais risco do que valeria no momento. Reafirmo essa avaliação — **não é bug, é dívida técnica consciente e rastreada**.

### 3.2 `getCaixaMipRate` duplica exatamente a lógica já generalizada de `'teto-idade'`

```ts
// getCaixaMipRate (ainda hardcoded em engine.ts)
for (const faixa of CAIXA_MIP_RATES) {
  if (idadeAnos <= faixa.maxAge) return faixa.taxa
}
return CAIXA_MIP_RATES[last].taxa

// resolverTaxaMip, case 'teto-idade' (já genérico, já usado pelo Inter)
for (const faixa of estrategia.faixas) {
  if (idadeAnos <= faixa.tetoIdade) return faixa.taxa
}
return estrategia.faixas[last].taxa
```

É o mesmo algoritmo, byte a byte, só com o nome do campo diferente (`maxAge` vs `tetoIdade`) — exatamente o mesmo padrão que `estrategiaMipInter()` já resolveu para o Inter, traduzindo `INTER_MIP_SOMPO` para `'teto-idade'`. **Esta é a duplicação mais barata de eliminar na Fase 4**: basta uma função `estrategiaMipCaixaSbpe()` idêntica à `estrategiaMipInter()`, e `getCaixaMipRate` pode ser removida.

### 3.3 Verificações de elegibilidade repetidas entre `simularComCriterios` e `simularBancoComTaxa`

As duas funções fazem, quase palavra por palavra, as mesmas 5 checagens (PRICE sem suporte, idade máxima, prazo mínimo, financiamento negativo, LTV excedido, teto de imóvel). Isso já era esperado e foi documentado como risco em todas as 3 fases anteriores — a duplicação só desaparece quando `simularBancoComTaxa` deixar de ter qualquer banco para atender (ou seja, depois da Fase 4). Não é um problema novo encontrado nesta auditoria, é a mesma dívida já rastreada, ainda dentro do prazo esperado para ser resolvida.

**Não encontrei nenhuma duplicação nova ou inesperada** além dessas três, todas já conhecidas ou triviais de generalizar.

---

## 4. Existe alguma especialização que deveria virar estratégia parametrizada?

| Especialização | Já é estratégia parametrizada? | Observação |
|---|---|---|
| Cálculo de MIP | **Sim**, via `EstrategiaSeguroMip` (4 variantes) — cobre todos os casos observados até hoje, incluindo os dois que a Caixa precisa. | Nenhuma mudança de tipo necessária. |
| Cálculo de DFI | **Sim**, via `CriteriosDfi` (base + taxa). | Caixa usa `'valor-imovel'`, já suportado. |
| Cálculo de prazo (idade + prazo) | **Sim**, via `limiteIdadePrazoMeses` + `idadeMaximaAbsoluta`, ambos por critério desde a Fase 1. | Nenhuma mudança necessária. |
| Cálculo de taxa (mensal a partir de anual) | **Sim**, via `metodoConversaoTaxa`. | Caixa usa o método padrão, já suportado. |
| Cálculo de LTV | **Sim**, via `CriteriosLtv` completo (sac/price/correntista/penalidade). | Cobre os dois casos da Caixa (penalidade de usado, LTV diferente em PRICE). |
| ITBI | **Sim**, via `CriteriosItbi`, mas só o Itaú usa. | Não é necessidade da Caixa. |
| Tarifas | **Parcialmente.** O tipo (`tarifaAdministracaoMensal`) existe, mas **nenhuma função de cálculo o lê** — é a única especialização "no papel, não em código" que a Caixa precisa. | Gap real, mas pequeno e mecânico (adicionar um parâmetro a uma função já generalizada uma vez na Fase 3). |
| Arredondamentos (DFI truncado em 2 casas no Itaú) | **Não é uma estratégia parametrizada** — está hardcoded dentro de `calcularSACPeriodoIdade`/`calcularPRICEPeriodoIdade` (`Math.trunc(dfiMensal * 100) / 100`). | A Caixa não trunca DFI hoje (usa valor cheio), então isso não bloqueia a Fase 4 — mas se outro banco no futuro precisar de outra regra de arredondamento, aí sim viraria uma dívida real. Registrar como observação, não como bloqueio. |
| Primeira/última parcela | **Sim**, via `incluirNaUltimaParcela`/`prePagamentoNoMesZero` — só não são lidos dinamicamente (ver seção 3.1). | Mesma dívida já rastreada. |
| Amortização (SAC/PRICE) | **Sim**, via `amortizacoesSuportadas`. | Nenhuma mudança necessária. |
| **Programas especiais (múltiplos resultados por banco)** | **Não.** É a única especialização do tipo `SimulationCriteria` que não tem nenhuma implementação — nem parcial, nem parametrizada de fato. | **Este é o item que precisa de trabalho de design antes/durante a Fase 4**, não só de preenchimento de resolver como nas fases anteriores. |

---

## 5. A Caixa entrará naturalmente ou precisará de exceções?

**Resposta direta: a maior parte entra naturalmente. Uma parte exige desenho novo (não uma exceção "suja", mas trabalho real).**

### O que entra naturalmente (mesmo padrão das Fases 1–3)

- MIP do SBPE → estratégia `'teto-idade'` (mesmo padrão do Inter).
- MIP do MCMV/Pró-Cotista → estratégia `'flat'`, com um valor diferente por chamada (mesmo padrão de override que já existe).
- DFI, LTV, prazo, idade+prazo, comprometimento de renda → todos os campos já existem e já são lidos por `simularComCriterios`.

### O que exige desenho novo, e por quê

**1. Um banco → múltiplos resultados.** Toda a arquitetura de critérios foi construída em torno de "1 critério → 1 `ResultadoBanco`" (`resolverCriterios` retorna um objeto, `simularComCriterios` retorna um resultado). A Caixa quebra essa suposição: um mesmo cliente pode ver 3 linhas de resultado (Pró-Cotista, MCMV, SBPE) na mesma simulação. Isso não é uma falha do desenho — é uma dimensão que nenhum dos 6 bancos anteriores tinha, e por isso ninguém precisou resolver até agora. A solução mais natural, dado o que já existe:
   - `resolverCriterios` (ou uma função irmã) passaria a retornar `SimulationCriteria[]` para a Caixa (um item por programa elegível), em vez de um único objeto.
   - Uma função pequena "aplica programa especial sobre o critério base" (`{...base, taxaAnual: programa.taxaAnual, programa: programa.nome, seguro: {...base.seguro, mip: programa.mipOverride ?? base.seguro.mip}}`) — hoje inexistente, mas trivial de escrever porque `ProgramaEspecial` já tem exatamente os 3 campos que precisam sobrepor a base (taxa, nome, mip).
   - O chamador (`simularTodosBancos` ou um wrapper específico) precisaria iterar sobre esse array e chamar `simularComCriterios` uma vez por item — hoje só `simularCaixaDuplo` faz algo parecido, de forma hardcoded.

**2. Regra de exclusividade entre faixas do MCMV.** As faixas do MCMV são cumulativas por renda (≤3.200, ≤5.000, ≤9.600, ≤13.000), e a regra atual pega **só a primeira que bate** (`faixaMcmv[0]`), não todas as que tecnicamente cabem. Se cada faixa virar um `ProgramaEspecial` independente com `elegivel: (input) => input.rendaMensal <= faixa.rendaMax && input.valorImovel <= faixa.tetoImovel`, um cliente de renda R$ 2.000 bateria em **todas as 4 faixas simultaneamente** (todas têm `rendaMax` ≥ 2.000), produzindo 4 resultados MCMV em vez de 1. É uma armadilha real, mas fácil de evitar **se soubermos que ela existe antes de escrever o código** — por isso está sendo registrada aqui, não é um risco estrutural da arquitetura, é um detalhe de implementação a não esquecer.

**Nenhuma dessas duas exigências me parece uma "exceção" no sentido negativo (gambiarra) — são extensões coerentes do modelo já existente**, usando os mesmos tipos (`ProgramaEspecial`) já desenhados há 3 fases. A diferença em relação às Fases 1–3 é que, lá, "migrar o banco" era essencialmente "preencher `resolverCriterios` corretamente". Aqui, "migrar o banco" também vai exigir escrever a função de composição banco→programas, que não existe ainda em nenhuma forma.

---

## 6. Oportunidades simples de melhoria antes da Fase 4

Todas as sugestões abaixo são estruturais (organização/clareza de código), nenhuma altera comportamento. Nenhuma é obrigatória.

1. **Corrigir o comentário de topo de `criteria.ts` (linhas 1–18).** Ainda diz "só é populado e consumido de fato para os bancos genéricos (Bradesco, Santander, Banco do Brasil)... Caixa, Itaú, Inter e Daycoval continuam no caminho hardcoded" — desatualizado desde a Fase 2 (Inter/Daycoval) e a Fase 3 (Itaú). Um leitor novo do arquivo seria ativamente enganado sobre o estado atual. Correção trivial, sem risco.
2. **Eliminar `getCaixaMipRate` migrando o SBPE da Caixa para a estratégia `'teto-idade'` já existente**, exatamente como já foi feito para o Inter — pode ser feito como o primeiro passo da própria Fase 4 (não precisa ser uma tarefa separada), já que é o mesmo padrão comprovado duas vezes.
3. **Nenhuma mudança recomendada na estrutura de tipos (`criteria.ts`)** — os campos que a Caixa precisa já existem. Resistir à tentação de "melhorar" o tipo antes de usá-lo de verdade; melhor descobrir na prática, durante a Fase 4, se algo realmente falta.
4. **Escrever a função de composição "programa especial → critério" e decidir a regra de exclusividade do MCMV *antes* de tocar em `criteria-resolver.ts`** — ou seja, tratar isso como uma decisão de design a fechar no início da Fase 4, não como um detalhe a resolver durante a implementação. Isso não é uma mudança de código agora (a auditoria não deve gerá-la), é uma recomendação de sequenciamento de trabalho.

Nada aqui é urgente o suficiente para atrasar a Fase 4 — são ajustes que cabem dentro dela ou são só higiene de comentário.

---

## 7. Qualidade da arquitetura

| Critério | Nota | Justificativa |
|---|---|---|
| Desacoplamento | **Boa** | Excelente para os 6 bancos já migrados (zero `cfg.id` no cálculo); ainda não é "Excelente" no arquivo como um todo porque a Caixa (por desenho, não por acidente) ainda depende de `bancoId` na orquestração. |
| Extensibilidade | **Boa** | Provado 3 vezes que adicionar um banco ao caminho de critérios é mecânico para casos simples e tratável (não trivial, mas previsível) para casos com função de cálculo própria. O vocabulário de tipos já antecipa as duas necessidades reais da Caixa (seguro, LTV/renda). O que falta (múltiplos programas) impede nota "Excelente" só porque ainda não foi exercitado nem uma vez. |
| Facilidade de manutenção | **Boa** | Separação de responsabilidades clara (`criteria.ts` = contrato, `criteria-resolver.ts` = conhecimento de banco, `engine.ts` = matemática). Documentação por fase é um ponto forte real, não decorativo — os relatórios das Fases 1–3 são precisos o suficiente para esta auditoria ter sido possível sem reler todo o histórico de commits. Descontos por: comentário desatualizado (item 6.1) e duplicação ainda presente (seção 3). |
| Facilidade de calibração | **Excelente** | Este era o objetivo declarado de todo o programa de trabalho (biblioteca de bancos, casos-âncora, plano de calibração) e está claramente atingido — há hoje mais estrutura para calibrar o motor do Fonti do que a maioria dos sistemas financeiros internos costuma ter. |
| Clareza | **Boa** | Comentários extensos e datados/referenciados a documentos são um padrão consistente e valioso. A coexistência temporária de 2 caminhos de código (critérios + legado) para 1 banco é compreensível dado o estágio da migração, mas exige atenção de quem for mexer no arquivo sem ler os comentários primeiro. |
| Risco de regressão | **Excelente** | As 3 fases usaram a mesma disciplina (baseline antes de qualquer mudança, comparação byte a byte, suíte completa rodada a cada passo) e essa disciplina **funcionou na prática** — o incidente da Fase 2 (remoção prematura de código morto contaminando o baseline) foi pego pelo próprio processo antes de virar um bug em produção, não depois. Isso é evidência de processo maduro, não de sorte. |

**Nota geral da arquitetura: 8/10.**

Os 2 pontos que faltam para "9-10" não são falhas — são a Fase 4 em si (múltiplos programas por banco) e um acúmulo pequeno e conhecido de dívida técnica que só se paga depois que todos os bancos estiverem migrados (remoção final de `simularBancoComTaxa`).

---

## 8. Riscos para o futuro

| Cenário futuro | Risco com a arquitetura atual | Mitigação já existente |
|---|---|---|
| **Novo banco simples** (sem função de cálculo própria, MIP/DFI já cobertos pelas 4 estratégias existentes) | **Baixo.** Já provado 5 vezes (Bradesco, Santander, BB, Inter, Daycoval). | Padrão replicável: estender `BancoComCriteriosId`, preencher `resolverCriterios`. |
| **Novo banco com função de cálculo própria** (comportamento matemático diferente, tipo Itaú) | **Médio-baixo.** Já provado 1 vez; exige generalizar funções específicas, não só configurar. | O padrão da Fase 3 (renomear e parametrizar em vez de reescrever) é reaproveitável. |
| **Novo banco com múltiplos programas** (tipo Caixa) | **Médio**, até a Fase 4 ser concluída — depois dela, deixa de ser risco (vira o mesmo padrão comprovado). | Nenhuma ainda — é exatamente o que a Fase 4 vai construir. |
| **Nova seguradora / nova tábua de MIP** | **Baixo.** As 4 estratégias (`faixa-etaria`, `teto-idade`, `flat`, `periodo-e-idade`) cobrem todo padrão de tábua observado nas 7 planilhas analisadas em `casos-ancora.md`. Uma tábua genuinamente nova de formato diferente exigiria uma 5ª estratégia, mas nenhum banco pesquisado até agora tem uma. | Vocabulário de tipos comprovadamente extensível (union type discriminada). |
| **Nova modalidade (comercial/terreno/construção) para um banco que não seja a Caixa** | **Médio.** Hoje a exclusividade da Caixa nessas modalidades está hardcoded em `simularTodosBancos` (`id !== 'caixa'`), não em `modalidadesSuportadas`. Habilitar outro banco exigiria mexer nessa checagem central, não só no critério do banco. | Nenhuma ainda — `modalidadesSuportadas` existe no tipo mas não é lido; ver seção 2. Não é urgente hoje porque nenhum outro banco tem esses produtos calibrados (ver `plano-calibracao.md`), mas vale planejar antes de precisar. |
| **Overrides de banco de dados (Configurações > Bancos) para os campos novos** (tarifa, LTV/renda PRICE, penalidade de usado) | **Baixo-médio.** A tela hoje só edita `taxa_anual`, `ltv_maximo`, `prazo_maximo`, `seguro_mip`, `seguro_dfi`, `taxa_admin` (este último já identificado como não-funcional em `mapa-parametros-engine.md`, antes mesmo desta migração). Os campos novos da Fase 3/4 (ITBI, tarifa mensal, LTV/renda específicos de PRICE) não têm caminho de configuração via UI ainda. | Fora do escopo desta migração (é evolução de produto, não de arquitetura) — já registrado como pendência em `mapa-parametros-engine.md`. |

Nenhum desses riscos é "a arquitetura vai quebrar" — todos são "trabalho que ainda não foi feito porque ainda não foi necessário", o que é a postura correta para não construir generalidade especulativa demais cedo.

---

## 9. Checklist de prontidão para a Fase 4

| Item | Status |
|---|---|
| Engine agnóstico para os 6 bancos já migrados | ✅ Confirmado |
| Tipos de critério suficientes para MIP/DFI/LTV/renda da Caixa | ✅ Confirmado, sem necessidade de novo tipo |
| Padrão de migração replicável (baseline → migração → prova de equivalência) | ✅ Comprovado 3 vezes, inclusive resistindo a um incidente real |
| Suíte de testes de regressão como rede de segurança | ✅ 130 testes, 4 arquivos, cobrindo os 6 bancos migrados + caso-âncora real do Itaú |
| Mecanismo de múltiplos resultados por banco (`programasEspeciais`) | ❌ Não implementado — é o trabalho real da Fase 4 |
| Wiring de `tarifaAdministracaoMensal` numa função de cálculo | ❌ Não implementado — mudança pequena, mesmo padrão da Fase 3 |
| Regra de exclusividade entre faixas do MCMV | ⚠️ Não desenhada ainda — precisa ser decidida no início da Fase 4, antes de codificar |
| Comentário de topo de `criteria.ts` atualizado | ⚠️ Desatualizado, correção trivial recomendada |
| Duplicação `getCaixaMipRate` vs `'teto-idade'` | ⚠️ Oportunidade de simplificação, não bloqueante |
| Casos-âncora da Caixa disponíveis para validação | ⚠️ `casos-ancora/caixa-casos.json` está vazio (só normativo em PDF, sem simulador Excel) — recomenda-se obter ao menos 1 simulação real (web ou correspondente) antes de finalizar a Fase 4, para ter uma prova de equivalência externa como as outras 3 fases tiveram |

---

## 10. Recomendação final

**B) Sim, mas recomenda-se realizar pequenos ajustes antes.**

Não é uma reserva grande: a arquitetura está madura, o padrão de migração é sólido e comprovado, e nenhum dos achados desta auditoria exige refatorar o que já foi construído. A ressalva é inteiramente sobre **sequenciamento de trabalho dentro da própria Fase 4**, não sobre corrigir as Fases 1–3:

1. Fechar o desenho de "programa especial → critério" e a regra de exclusividade do MCMV **antes** de escrever o `resolverCriterios` da Caixa (não durante).
2. Aproveitar a Fase 4 para também resolver o wiring de `tarifaAdministracaoMensal` e a migração de `getCaixaMipRate` para `'teto-idade'` — ambos pequenos, ambos com padrão já provado.
3. Corrigir o comentário desatualizado de `criteria.ts` (2 minutos de trabalho, zero risco).
4. Se possível, obter ao menos uma simulação real da Caixa (simulador web ou correspondente) para ter um caso-âncora de comparação — hoje `caixa-casos.json` está vazio, e as outras 3 fases se beneficiaram muito de ter um número real para validar contra, não só snapshots sintéticos.

Nenhum desses itens é um retrabalho da arquitetura existente — são preparações pontuais que reduzem o risco da fase mais complexa da migração. A arquitetura, no que já foi construído e testado, está pronta.
