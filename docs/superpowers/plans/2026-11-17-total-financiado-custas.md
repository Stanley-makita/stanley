# Valor total financiado (financiamento + custas) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar o "Valor total financiado" (financiamento + custas financiadas) na Oportunidade da Captação, nos Dados do Negócio, no Resumo do Negócio e como dica em Financeiro → Emissões, sem mudar nenhum valor gravado.

**Architecture:** Uma função pura `totalFinanciado()` em `src/lib/oportunidade/tipoEDespesas.ts` é a única fonte da conta; um componente de exibição `QuadroTotalFinanciado` é reaproveitado nos dois formulários; Emissões busca as custas dos processos listados numa query à parte (o snapshot e a RPC `emissoes_mes_preview` não têm essas colunas — sem migration).

**Tech Stack:** Next.js / React, react-hook-form, TanStack Query, supabase-js, vitest, lucide-react.

**Spec:** `docs/superpowers/specs/2026-11-17-total-financiado-custas-design.md`

## Global Constraints

- Nada é gravado somado: `processos.valor_financiado` e `leads.valor_pretendido` continuam sendo só o financiamento do imóvel.
- Entrada/recursos próprios, comissão, relatórios de produção, Negócios → Emissões, formulários dos bancos e simulador não mudam.
- Total só existe quando `financiar_despesas_cartorariais === true` **e** valor de custas > 0 **e** financiamento informado; senão nada aparece.
- Sem migration. Liberação: testar com `npm run dev:teste` (Supabase de staging) antes do merge.
- Textos: "Valor total financiado", "Custas financiadas".

## Review Focus

- Custas marcadas como "Vai financiar" e depois desmarcadas no mesmo formulário (sem salvar) → o quadro some na hora (o form zera o valor só no save; o cálculo tem que olhar o booleano também). Teste na Task 1 (`financiar=false` com valor preenchido → null).
- Financiamento vazio (lead novo) com custas preenchidas → não mostra total (não somar custas sozinhas). Teste na Task 1.
- E-mail de Confirmar Valores mantém o mesmo total de antes após trocar a conta pela função (sem somar duas vezes). Teste na Task 1 (`total = financiamento + custas`) + revisão da troca na Task 1 Step 5.
- Emissões com mês sem nenhum negócio com custas → nenhuma query quebrada/ícone; lista vazia de ids não dispara consulta. Coberto no hook da Task 3 (`enabled: ids.length > 0`).
- Valor de custas 0 → tratado como "sem custas" (nada aparece). Teste na Task 1.

---

### Task 1: Função `totalFinanciado` + e-mail usando ela

**Files:**
- Modify: `src/lib/oportunidade/tipoEDespesas.ts`
- Modify: `src/app/api/processos/[id]/emails/confirmacao-valores/preview/route.ts:139-144,160-162`
- Test: `src/lib/oportunidade/__tests__/tipoEDespesas.test.ts`

**Interfaces:**
- Produces: `totalFinanciado(financiamento: number | null | undefined, financiarCustas: boolean | null | undefined, valorCustas: number | null | undefined): { custas: number; total: number } | null` — `null` quando `financiarCustas !== true`, `valorCustas` nulo/≤0 ou `financiamento` nulo.

- [ ] **Step 1: Write the failing test** — novo `describe('valor total financiado')` em `tipoEDespesas.test.ts`:
  - `totalFinanciado(481000, true, 34570.77)` → `{ custas: 34570.77, total: 515570.77 }`
  - `totalFinanciado(481000, false, 34570)` → `null`
  - `totalFinanciado(481000, null, 34570)` → `null`
  - `totalFinanciado(481000, true, null)` → `null`; `totalFinanciado(481000, true, 0)` → `null`
  - `totalFinanciado(null, true, 34570)` → `null`
  - soma sem erro de ponto flutuante: `totalFinanciado(0.1, true, 0.2)?.total` → `0.3` (arredondar a centavos)
- [ ] **Step 2: Run** `npx vitest run src/lib/oportunidade` — Expected: FAIL (`totalFinanciado` não exportada).
- [ ] **Step 3: Implement** `totalFinanciado` em `tipoEDespesas.ts` (arredondar com `Math.round(x * 100) / 100`), com comentário curto da regra: custas são pagas ao comprador, não mexem na entrada, entram no total devido ao banco; comissão segue sem custas (decisão 17/11/2026).
- [ ] **Step 4: Run** `npx vitest run src/lib/oportunidade` — Expected: PASS.
- [ ] **Step 5: Trocar a conta do e-mail** em `preview/route.ts`: `const t = totalFinanciado(valor_financiado, financiar_despesas_cartorariais, valor_despesas_financiadas)`; `despesas_financiadas: t?.custas ?? null`; `valor_total_financiado: t?.total ?? valorFinanciado`. Rodar `npx vitest run src/app/api/processos src/lib/email` — Expected: PASS.
- [ ] **Step 6: Commit** — `feat(oportunidade): totalFinanciado() — financiamento + custas numa conta só`

### Task 2: Quadro "Valor total financiado" na Oportunidade, Dados do Negócio e Resumo

**Files:**
- Create: `src/components/oportunidade/QuadroTotalFinanciado.tsx`
- Modify: `src/components/leads/LeadDetalhe/AbaOportunidade.tsx` (logo abaixo do `CampoDespesasFinanciadas`, ~linha 458)
- Modify: `src/components/processos/EditarProcessoDrawer.tsx` (logo depois do bloco "Entrada (calculada automaticamente)", ~linha 435)
- Modify: `src/app/(protected)/processos/[id]/page.tsx` (depois do `<Campo label="Despesas financiadas" …>`, ~linha 963)
- Test: nenhum de componente — o projeto roda vitest em `environment: 'node'` sem @testing-library; toda a lógica
  está em `totalFinanciado` (testada na Task 1). Verificação visual na Task 4.

**Interfaces:**
- Consumes: `totalFinanciado` (Task 1).
- Produces: `QuadroTotalFinanciado({ financiamento, financiarCustas, valorCustas }: { financiamento: number | null | undefined; financiarCustas: boolean | null | undefined; valorCustas: number | null | undefined })` — renderiza `null` quando `totalFinanciado` é null; senão 3 linhas: "Valor Financiado", "Custas financiadas" (+), "Valor total financiado".

- [ ] **Step 1: Implement** o componente no visual do bloco de Entrada do drawer (`rounded-lg border border-gray-200 p-4`, linha final destacada `bg-gray-50 font-semibold`), formatação `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`, rodapé `text-[11px] text-gray-400`: "Custas pagas ao comprador — não alteram a entrada." Nenhuma conta dentro do componente além de chamar `totalFinanciado`.
- [ ] **Step 2: Usar o componente** com valores vindos de `form.watch(...)`: na Oportunidade `valor_pretendido` / `financiar_despesas_cartorariais` / `valor_despesas_financiadas`; no drawer `valor_financiado` / os mesmos dois campos. No Resumo do Negócio, linha `<Campo label="Valor total financiado" …>` só quando `totalFinanciado(...)` não é null (não usa o quadro).
- [ ] **Step 3: Verify** `npx tsc --noEmit -p .` sem erros.
- [ ] **Step 4: Commit** — `feat(oportunidade): quadro "Valor total financiado" na Captação, Dados e Resumo do Negócio`

### Task 3: Ícone com dica em Financeiro → Emissões

**Files:**
- Modify: `src/hooks/financeiro/useFechamentoProcessos.ts` (novo hook)
- Modify: `src/components/financeiro/VisaoEmissoes.tsx:126-129`
- Test: `src/hooks/financeiro/__tests__/custasDosProcessos.test.ts` (só a função de montar a dica)

**Interfaces:**
- Consumes: `totalFinanciado` (Task 1).
- Produces:
  - `useCustasDosProcessos(processoIds: string[]): UseQueryResult<Map<string, { financiar: boolean | null; valor: number | null }>>` — `supabase.from('processos').select('id, financiar_despesas_cartorariais, valor_despesas_financiadas').in('id', ids)`, queryKey `['financeiro', 'custas_processos', ...ids ordenados]`, `enabled: ids.length > 0`, checa `error`.
  - `dicaCustasFinanciadas(financiamento: number | null, financiar: boolean | null, valor: number | null): string | null` em `src/lib/oportunidade/tipoEDespesas.ts` → `"Custas financiadas: R$ 53.000,00 · Total financiado: R$ 901.000,00"` ou null.

- [ ] **Step 1: Write the failing test** para `dicaCustasFinanciadas`: `(848000, true, 53000)` → `'Custas financiadas: R$ 53.000,00 · Total financiado: R$ 901.000,00'`; `(848000, false, 53000)` → `null`. (Atenção: `Intl` pt-BR usa espaço não separável depois de "R$" — comparar com `.replace(/\s/g, ' ')` ou gerar o esperado com o mesmo formatador.)
- [ ] **Step 2: Run** `npx vitest run src/lib/oportunidade` — Expected: FAIL.
- [ ] **Step 3: Implement** `dicaCustasFinanciadas` e `useCustasDosProcessos`.
- [ ] **Step 4: Run** `npx vitest run src/lib/oportunidade` — Expected: PASS.
- [ ] **Step 5: Ícone na linha** de `VisaoEmissoes.tsx`: depois do valor, `<Info className="ml-1 inline h-3.5 w-3.5 text-amber-600" />` dentro de `<span title={dica} aria-label={dica}>` quando `dica` não é null. Total do rodapé e KPI "Total emitido" inalterados.
- [ ] **Step 6: Verify** `npx tsc --noEmit -p .` e `npx vitest run` (suíte inteira) — Expected: tudo PASS.
- [ ] **Step 7: Commit** — `feat(emissoes): ícone com custas financiadas e total na linha do negócio`

### Task 4: Teste no staging e PR

- [ ] **Step 1:** `npm run dev:teste`; num lead de staging: "Vai financiar" + valor → quadro aparece com a soma certa; "Não vai financiar" → some; Entrada do negócio não muda ao mudar as custas.
- [ ] **Step 2:** Converter o lead em negócio → Dados do Negócio e Resumo mostram o total; marcar custas só no negócio (outro negócio sem custas) → total aparece.
- [ ] **Step 3:** Financeiro → Emissões do mês com um negócio emitido com custas → ícone com dica; total do rodapé igual ao de antes.
- [ ] **Step 4:** Atualizar a seção de despesas financiadas no `CLAUDE.md` (regra: valor gravado = só financiamento; total é calculado por `totalFinanciado()`; comissão sem custas até haver opção por banco). Commit, push, PR para `main` (sem merge até o usuário aprovar o staging).
