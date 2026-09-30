# Participantes V2 — Fase B2b (tela de participantes no Lead) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Na aba **Pessoa** do Lead, uma sub-aba por participante de compra (Principal, coparticipantes, cônjuge), cada uma com o formulário completo da Pessoa, "Compõe renda" por participante, "+ Participante" e "Casado(a) com" — o caso Heitor + Afrânio + Maria funcionando na tela.

**Architecture (decisão de 2026-09-30, revisa o roteiro):** a tela nova grava pelos **mesmos caminhos que já existem e estão provados** — `lead_coparticipantes` (incluir/remover participante), `pessoas.conjuge_pessoa_id` + estado civil/regime/data (casamento) e `pessoas` (dados de cada um) — e a sincronização da Fase A mantém `participacoes`/`pessoa_relacionamentos`. O único dado que não tinha lugar no modelo antigo, **"compõe renda" definido à mão**, ganha a coluna `participacoes.compoe_renda_manual`, que a sincronização passa a respeitar (e que o negócio herda do lead na conversão). Assim a tela vai ao ar **sem a virada de escrita**; desligar a sincronização e travar as tabelas antigas vira uma etapa só de banco depois (roteiro atualizado na Task 7). **Negócios não muda visualmente** (decisão do usuário): os cards Compradores/Vendedores já leem participações (B1) e continuam gravando pelo caminho atual. Vendedor do Lead continua no bloco Vendedor da aba Crédito.

**Tech Stack:** Next.js 14, supabase-js 2.103, React Query, Vitest, PostgreSQL (SQL rodado pelo usuário).

**Spec:** `docs/superpowers/specs/2026-09-28-participantes-v2-design.md` §2 (tela), §1 (compõe renda por participação, operador nunca participa). Protótipo aprovado: https://claude.ai/artifact/62D48Yy7QSnDd5WksXRqpf (tela 1).

## Global Constraints

- Worktree `.claude/worktrees/participantes-v2`, branch `feat/participantes-v2-fase-b2b` (de `main` @ 52eff3f). Nunca `git stash`; push/PR só na entrega.
- **Nenhuma escrita nova direta** em `participacoes`/`pessoa_relacionamentos` pelo cliente. A única escrita nova no modelo novo é `compoe_renda`/`compoe_renda_manual`, **só pela rota de servidor** `PATCH /api/participacoes/[id]`.
- Pessoa de usuário interno nunca vira participante (a sync já filtra; a rota de busca não precisa mudar isso).
- Formulário de edição reseta só por `id + updated_at` (regra do CLAUDE.md, PRs #337/#346) — a extração não pode quebrar isso; ao trocar de sub-aba o formulário é outra instância (`key={pessoaId}`).
- Toda query em `pessoas` filtra `deleted_at IS NULL`; toda consulta olha `error`; UPDATE com RLS restritiva confere linhas afetadas.
- Migration: `supabase/migrations/20261005_331_participantes_v2_compoe_renda_manual.sql` (o usuário roda antes do merge).
- Testes: `node ../../../node_modules/vitest/vitest.mjs run --dir src --exclude ".claude/**" --exclude "output/**" <arquivo>`. Falhas pré-existentes: `src/app/api/leads/[id]/atualizar-cliente/__tests__/route.test.ts`, `src/lib/simuladorFinanciamento/__tests__/criteria-migracao-fase4-caixa.test.ts`, `src/lib/workflows/__tests__/mensagem-imovel-acima-teto.test.ts`, `src/lib/workflows/__tests__/prazo-idade-renda-maxima.test.ts`.
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Trocar de sub-aba com edição não salva** → a edição da aba anterior não vaza para a outra pessoa (instâncias separadas por `key`) e o usuário é avisado antes de perder o que digitou.
2. **Participante que também é titular de outro lead** (Afrânio com lead próprio) → editar os dados dele na aba do Heitor atualiza a Pessoa e o espelho do lead DELE (mesma pessoa), nunca o lead do Heitor.
3. **"Casado(a) com" alguém que já é casado com outra pessoa** → o casamento antigo dessa pessoa é encerrado só se o usuário confirmar; nunca em silêncio.
4. **Compõe renda desmarcado à mão e a sincronização rodando de novo** (qualquer edição) → o valor manual é mantido; ao converter em negócio, o negócio herda.
5. **Busca de participante por comercial** → encontra Pessoa de fora da carteira (spec: permitido) e mostra "também é cliente de <comercial>"; nunca devolve Pessoa excluída.

---

### Task 1: Migration 331 — "compõe renda" manual respeitado pela sincronização

**Files:**
- Create: `supabase/migrations/20261005_331_participantes_v2_compoe_renda_manual.sql`

**Interfaces:**
- Produces: coluna `participacoes.compoe_renda_manual boolean null`; `pv2_gravar_participacoes` (mesma assinatura da 326) preserva o manual em UPDATE e, em participação de **processo** nova, herda o manual da participação da mesma Pessoa no lead do processo.

- [ ] **Step 1: Escrever a migration**

Copiar a definição vigente de `pv2_gravar_participacoes` de `supabase/migrations/20261002_326_participantes_v2_funcoes_sync.sql` e alterar SÓ os dois `INSERT ... ON CONFLICT`:

```sql
-- ============================================================
-- Migration 331: Participantes V2 — B2b: "compõe renda" definido à mão
-- A sincronização (326) recalcula compoe_renda a cada edição pelas regras antigas
-- (coparticipante = sim; cônjuge = tem renda). Na tela de participantes o usuário marca/desmarca
-- por pessoa: esse valor fica em compoe_renda_manual e vence a regra. Participação de NEGÓCIO
-- nova herda o manual da mesma Pessoa no lead do negócio (conversão lead → negócio).
-- ============================================================
BEGIN;

ALTER TABLE participacoes ADD COLUMN IF NOT EXISTS compoe_renda_manual BOOLEAN;

CREATE OR REPLACE FUNCTION pv2_gravar_participacoes(
  p_lead_id uuid, p_processo_id uuid, p_empresa_id uuid,
  p_pessoas uuid[], p_papeis text[], p_renda boolean[], p_ordens int[]
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
-- corpo idêntico ao da 326 até o bloco IF p_lead_id IS NOT NULL (inclusive DELETE e rebaixamento)
...
  IF p_lead_id IS NOT NULL THEN
    INSERT INTO participacoes (empresa_id, lead_id, pessoa_id, papel, compoe_renda, ordem)
    SELECT p_empresa_id, p_lead_id, d.pessoa_id, d.papel, d.compoe_renda, d.ordem FROM pg_temp.pv2_desejadas d
    ON CONFLICT (lead_id, pessoa_id) WHERE lead_id IS NOT NULL
    DO UPDATE SET papel = EXCLUDED.papel,
                  compoe_renda = coalesce(participacoes.compoe_renda_manual, EXCLUDED.compoe_renda),
                  ordem = EXCLUDED.ordem
    WHERE (participacoes.papel, participacoes.compoe_renda, participacoes.ordem)
          IS DISTINCT FROM (EXCLUDED.papel, coalesce(participacoes.compoe_renda_manual, EXCLUDED.compoe_renda), EXCLUDED.ordem);
  ELSE
    INSERT INTO participacoes (empresa_id, processo_id, pessoa_id, papel, compoe_renda, ordem, compoe_renda_manual)
    SELECT p_empresa_id, p_processo_id, d.pessoa_id, d.papel,
           coalesce(h.manual, d.compoe_renda), d.ordem, h.manual
    FROM pg_temp.pv2_desejadas d
    LEFT JOIN LATERAL (
      SELECT lp.compoe_renda_manual AS manual
      FROM processos pr JOIN participacoes lp ON lp.lead_id = pr.lead_id AND lp.pessoa_id = d.pessoa_id
      WHERE pr.id = p_processo_id AND lp.compoe_renda_manual IS NOT NULL
      LIMIT 1
    ) h ON true
    ON CONFLICT (processo_id, pessoa_id) WHERE processo_id IS NOT NULL
    DO UPDATE SET papel = EXCLUDED.papel,
                  compoe_renda = coalesce(participacoes.compoe_renda_manual, EXCLUDED.compoe_renda),
                  ordem = EXCLUDED.ordem
    WHERE (participacoes.papel, participacoes.compoe_renda, participacoes.ordem)
          IS DISTINCT FROM (EXCLUDED.papel, coalesce(participacoes.compoe_renda_manual, EXCLUDED.compoe_renda), EXCLUDED.ordem);
  END IF;
END $$;

COMMIT;
```

(O `...` acima é para este documento: no arquivo real vai o corpo completo, copiado da 326, com só os dois blocos `INSERT` trocados. `REVOKE/GRANT` da função não mudam com `CREATE OR REPLACE`.)

- [ ] **Step 2: Revisão estática**

`diff` do corpo da função na 331 contra a 326 → diferenças só nos dois `INSERT ... ON CONFLICT`. Conferir que `EXCLUDED.compoe_renda` no ramo de processo já é `coalesce(h.manual, d.compoe_renda)`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20261005_331_participantes_v2_compoe_renda_manual.sql
git commit -m "feat(participantes): compõe renda definido à mão, respeitado pela sincronização (V2 B2b, migration 331)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Rotas de servidor — compõe renda, casamento e busca de participante

**Files:**
- Create: `src/app/api/participacoes/[id]/route.ts` (PATCH)
- Create: `src/app/api/pessoas/[id]/conjuge/route.ts` (POST)
- Modify: `src/app/api/pessoas/route.ts` (papel `participante`)
- Create: `src/lib/participantes/casamento.ts` + `src/lib/participantes/__tests__/casamento.test.ts`
- Test: `src/app/api/participacoes/[id]/__tests__/route.test.ts`

**Interfaces:**
- `PATCH /api/participacoes/[id]` body `{ compoe_renda: boolean }` → `200 { ok: true }`; 401 sem sessão; 403 sem `leads.editar` (lead) / `processos.editar` (processo); 404 se a participação não é visível pelo JWT do usuário (RLS decide a carteira).
- `planoCasamento(atual: { conjugeAtualDe: Record<string, string | null> }, pessoaId: string, conjugeId: string | null): { encerrar: string[]; ligar: [string, string] | null }` — puro: quem precisa ter o ponteiro zerado e quem liga com quem.
- `POST /api/pessoas/[id]/conjuge` body `{ conjuge_pessoa_id: string | null, estado_civil?: 'casado' | 'uniao_estavel', regime_casamento?: string | null, data_casamento?: string | null, confirmar_encerrar?: boolean }` → grava os ponteiros `pessoas.conjuge_pessoa_id` dos dois lados + estado civil/regime/data nos dois (a sync da Fase A cria/encerra o Relacionamento). `409 { encerra: [{ id, nome }] }` quando o escolhido já é casado com outra pessoa e `confirmar_encerrar` não veio.
- `GET /api/pessoas?q=&papel=participante` → ignora a carteira (como `vendedor`), filtra `deleted_at IS NULL`, e cada item ganha `cliente_de: string | null` (nome do responsável do lead aberto da pessoa quando é outro usuário).

- [ ] **Step 1: Teste puro do plano de casamento (vai falhar)**

`src/lib/participantes/__tests__/casamento.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { planoCasamento } from '../casamento'

describe('planoCasamento', () => {
  it('liga os dois quando ninguém é casado', () => {
    expect(planoCasamento({ conjugeAtualDe: { a: null, m: null } }, 'a', 'm')).toEqual({ encerrar: [], ligar: ['a', 'm'] })
  })
  it('já casados entre si: nada a encerrar', () => {
    expect(planoCasamento({ conjugeAtualDe: { a: 'm', m: 'a' } }, 'a', 'm')).toEqual({ encerrar: [], ligar: ['a', 'm'] })
  })
  it('escolhido casado com outra pessoa: encerra esse casamento (os dois lados)', () => {
    expect(planoCasamento({ conjugeAtualDe: { a: null, m: 'x', x: 'm' } }, 'a', 'm')).toEqual({ encerrar: ['m', 'x'], ligar: ['a', 'm'] })
  })
  it('a pessoa já era casada com outra: encerra o antigo', () => {
    expect(planoCasamento({ conjugeAtualDe: { a: 'y', y: 'a', m: null } }, 'a', 'm')).toEqual({ encerrar: ['a', 'y'], ligar: ['a', 'm'] })
  })
  it('desvincular: zera os dois lados, não liga ninguém', () => {
    expect(planoCasamento({ conjugeAtualDe: { a: 'm', m: 'a' } }, 'a', null)).toEqual({ encerrar: ['a', 'm'], ligar: null })
  })
  it('nunca casa a pessoa com ela mesma', () => {
    expect(() => planoCasamento({ conjugeAtualDe: { a: null } }, 'a', 'a')).toThrow('mesma pessoa')
  })
})
```

- [ ] **Step 2: Implementar `casamento.ts`**

```ts
/** Quem precisa ter o ponteiro de cônjuge zerado e quem liga com quem. Puro (testável). */
export function planoCasamento(
  atual: { conjugeAtualDe: Record<string, string | null> },
  pessoaId: string,
  conjugeId: string | null,
): { encerrar: string[]; ligar: [string, string] | null } {
  if (conjugeId === pessoaId) throw new Error('Não é possível casar a pessoa com ela mesma pessoa.')
  const encerrar = new Set<string>()
  const conj = (id: string) => atual.conjugeAtualDe[id] ?? null
  const antigoDaPessoa = conj(pessoaId)
  if (antigoDaPessoa && antigoDaPessoa !== conjugeId) { encerrar.add(pessoaId); encerrar.add(antigoDaPessoa) }
  if (conjugeId) {
    const antigoDoConjuge = conj(conjugeId)
    if (antigoDoConjuge && antigoDoConjuge !== pessoaId) { encerrar.add(conjugeId); encerrar.add(antigoDoConjuge) }
    return { encerrar: Array.from(encerrar), ligar: [pessoaId, conjugeId] }
  }
  if (antigoDaPessoa) { encerrar.add(pessoaId); encerrar.add(antigoDaPessoa) }
  return { encerrar: Array.from(encerrar), ligar: null }
}
```

Run o teste → PASS.

- [ ] **Step 3: Rota do casamento**

`src/app/api/pessoas/[id]/conjuge/route.ts` — padrão das rotas existentes (`resolveUsuario` pelo Bearer + `podeServidor(..., 'pessoas.editar')` + visibilidade com `clienteDoUsuario(token)`):

```ts
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase/admin'
import { podeServidor } from '@/lib/auth/resolverPermissaoServidor'
import { clienteDoUsuario } from '@/lib/documentos/vinculosServidor'
import { planoCasamento } from '@/lib/participantes/casamento'
import type { UsuarioPerfil } from '@/types/auth'

const REGIMES = ['comunhao_parcial', 'comunhao_total', 'separacao_total', 'participacao_final']

// Casamento pela tela de participantes: grava os ponteiros antigos (pessoas.conjuge_pessoa_id) e
// estado civil/regime/data NOS DOIS lados; a sincronização da Fase A (fn_pv2_pessoas) cria ou
// encerra o Relacionamento. Encerrar o casamento de OUTRA pessoa exige confirmação explícita.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '').trim() ?? ''
  const { data: { user } } = await supabase.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const { data: usuario } = await supabase.from('usuarios').select('id, empresa_id, perfil').eq('auth_user_id', user.id).single()
  if (!usuario) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  if (!(await podeServidor(usuario.id, usuario.perfil as UsuarioPerfil, usuario.empresa_id, 'pessoas.editar'))) {
    return NextResponse.json({ error: 'Sem permissão para editar pessoas' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({})) as {
    conjuge_pessoa_id?: string | null; estado_civil?: string; regime_casamento?: string | null
    data_casamento?: string | null; confirmar_encerrar?: boolean
  }
  const pessoaId = params.id
  const conjugeId = body.conjuge_pessoa_id ?? null
  const estadoCivil = body.estado_civil === 'uniao_estavel' ? 'uniao_estavel' : 'casado'
  const regime = body.regime_casamento && REGIMES.includes(body.regime_casamento) ? body.regime_casamento : null

  // Visibilidade: as duas Pessoas têm que ser visíveis pelo JWT do usuário (RLS de carteira + participação).
  const ids = [pessoaId, ...(conjugeId ? [conjugeId] : [])]
  const { data: visiveis, error: eVis } = await clienteDoUsuario(token).from('pessoas')
    .select('id').in('id', ids).is('deleted_at', null)
  if (eVis) return NextResponse.json({ error: 'Erro ao verificar acesso.' }, { status: 500 })
  if ((visiveis ?? []).length !== ids.length) return NextResponse.json({ error: 'Pessoa não encontrada.' }, { status: 404 })

  // Estado atual dos ponteiros (das duas pessoas e dos cônjuges atuais delas).
  const { data: atuais, error: eAt } = await supabase.from('pessoas')
    .select('id, nome, conjuge_pessoa_id').eq('empresa_id', usuario.empresa_id).in('id', ids).is('deleted_at', null)
  if (eAt || !atuais || atuais.length !== ids.length) return NextResponse.json({ error: 'Pessoa não encontrada.' }, { status: 404 })
  const conjugeAtualDe: Record<string, string | null> = {}
  for (const p of atuais) conjugeAtualDe[p.id] = p.conjuge_pessoa_id
  const outros = atuais.map(p => p.conjuge_pessoa_id).filter((x): x is string => !!x && !ids.includes(x))
  if (outros.length) {
    const { data: ex } = await supabase.from('pessoas').select('id, nome, conjuge_pessoa_id').in('id', outros)
    for (const p of ex ?? []) conjugeAtualDe[p.id] = p.conjuge_pessoa_id
  }

  let plano: ReturnType<typeof planoCasamento>
  try { plano = planoCasamento({ conjugeAtualDe }, pessoaId, conjugeId) }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 422 }) }

  // Encerrar casamento de terceiros (além do próprio desvínculo) exige confirmação.
  const terceiros = plano.encerrar.filter(id => id !== pessoaId && id !== conjugeAtualDe[pessoaId])
  if (terceiros.length && !body.confirmar_encerrar) {
    const { data: nomes } = await supabase.from('pessoas').select('id, nome').in('id', terceiros)
    return NextResponse.json({ error: 'confirmar_encerrar', encerra: nomes ?? [] }, { status: 409 })
  }

  for (const id of plano.encerrar) {
    const { error } = await supabase.from('pessoas').update({ conjuge_pessoa_id: null }).eq('id', id).eq('empresa_id', usuario.empresa_id)
    if (error) return NextResponse.json({ error: 'Erro ao atualizar o casamento.' }, { status: 500 })
  }
  if (plano.ligar) {
    const [a, b] = plano.ligar
    for (const [de, para] of [[a, b], [b, a]] as const) {
      const { data, error } = await supabase.from('pessoas')
        .update({ conjuge_pessoa_id: para, estado_civil: estadoCivil, regime_casamento: regime, data_casamento: body.data_casamento || null })
        .eq('id', de).eq('empresa_id', usuario.empresa_id).select('id')
      if (error || !data?.length) return NextResponse.json({ error: 'Erro ao gravar o casamento.' }, { status: 500 })
    }
  }
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: Rota do compõe renda (teste primeiro)**

`src/app/api/participacoes/[id]/__tests__/route.test.ts` — fake do `supabaseAdmin` e de `clienteDoUsuario` (mock de `@/lib/documentos/vinculosServidor`) e de `podeServidor` (mock de `@/lib/auth/resolverPermissaoServidor`); casos: 401 sem token; 403 sem permissão; 404 quando `clienteDoUsuario(...).from('participacoes')...maybeSingle()` devolve `null`; 200 grava `{ compoe_renda: true, compoe_renda_manual: true }` na participação (verificar o `update` recebido pelo fake); 422 quando `compoe_renda` não é booleano.

`src/app/api/participacoes/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase/admin'
import { podeServidor } from '@/lib/auth/resolverPermissaoServidor'
import { clienteDoUsuario } from '@/lib/documentos/vinculosServidor'
import type { UsuarioPerfil } from '@/types/auth'

// Única escrita direta no modelo novo durante a B2b: "compõe renda" definido à mão.
// compoe_renda_manual é respeitado pela sincronização (migration 331).
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '').trim() ?? ''
  if (!token) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const { data: { user } } = await supabase.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const { data: usuario } = await supabase.from('usuarios').select('id, empresa_id, perfil').eq('auth_user_id', user.id).single()
  if (!usuario) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await request.json().catch(() => ({})) as { compoe_renda?: unknown }
  if (typeof body.compoe_renda !== 'boolean') return NextResponse.json({ error: 'compoe_renda inválido' }, { status: 422 })

  // Visível pelo JWT do usuário = dentro da carteira dele (RLS de participacoes → lead/processo).
  const { data: part, error } = await clienteDoUsuario(token).from('participacoes')
    .select('id, lead_id, processo_id').eq('id', params.id).maybeSingle()
  if (error) return NextResponse.json({ error: 'Erro ao carregar o participante.' }, { status: 500 })
  if (!part) return NextResponse.json({ error: 'Participante não encontrado.' }, { status: 404 })

  const acao = part.lead_id ? 'leads.editar' : 'processos.editar'
  if (!(await podeServidor(usuario.id, usuario.perfil as UsuarioPerfil, usuario.empresa_id, acao))) {
    return NextResponse.json({ error: 'Sem permissão para editar esta proposta.' }, { status: 403 })
  }

  const { data: atualizado, error: eUp } = await supabase.from('participacoes')
    .update({ compoe_renda: body.compoe_renda, compoe_renda_manual: body.compoe_renda })
    .eq('id', part.id).eq('empresa_id', usuario.empresa_id).select('id')
  if (eUp || !atualizado?.length) return NextResponse.json({ error: 'Não foi possível salvar.' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
```

(Nota: a verificação de permissão vem depois da visibilidade porque precisa saber se é lead ou processo; 404 antes de 403 não vaza nada — a participação invisível já é 404.) Rodar o teste → PASS.

- [ ] **Step 5: Busca de participante**

Em `src/app/api/pessoas/route.ts`:
- `buildQuery` ganha `.is('deleted_at', null)` (corrige de carona: a listagem devolvia Pessoa excluída);
- a condição da carteira passa a ser `if (usuario.perfil === 'comercial' && papel !== 'vendedor' && papel !== 'participante')`;
- depois da consulta, quando `papel === 'participante'` e há resultados, anexar `cliente_de`:

```ts
  let resultado = data ?? []
  if (papel === 'participante' && resultado.length > 0) {
    const { data: leadsAbertos } = await supabase.from('leads')
      .select('pessoa_id, responsavel:usuarios!responsavel_id(id, nome)')
      .in('pessoa_id', resultado.map(p => p.id))
      .is('deleted_at', null).is('perdido_em', null).is('convertido_em', null)
    const donoDe = new Map<string, string>()
    for (const l of leadsAbertos ?? []) {
      const r = Array.isArray(l.responsavel) ? l.responsavel[0] : l.responsavel
      if (r && r.id !== usuario.id && l.pessoa_id) donoDe.set(l.pessoa_id, r.nome)
    }
    resultado = resultado.map(p => ({ ...p, cliente_de: donoDe.get(p.id) ?? null }))
  }
  return NextResponse.json({ data: resultado, total: count ?? 0, page, pageSize })
```

(comentário acima da condição de carteira: participante segue a decisão da spec — "Pessoa de outra carteira: permite adicionar, com aviso".)

- [ ] **Step 6: Verificar e commitar**

Run: testes de `src/lib/participantes` e `src/app/api/participacoes` → PASS; `tsc` → sem erros.

```bash
git add src/lib/participantes/casamento.ts src/lib/participantes/__tests__/casamento.test.ts "src/app/api/participacoes" "src/app/api/pessoas/[id]/conjuge" src/app/api/pessoas/route.ts
git commit -m "feat(participantes): rotas de compõe renda, casamento e busca de participante (V2 B2b)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Hooks da tela

**Files:**
- Modify: `src/hooks/participantes/useParticipantes.ts` (acrescenta `compoe_renda_manual` não é necessário; acrescenta relacionamentos vigentes)
- Create: `src/hooks/participantes/useMutacoesParticipantes.ts`

**Interfaces:**
- `useRelacionamentosDe(pessoaIds: string[])` → `{ data: Array<{ pessoa_a_id, pessoa_b_id, tipo, regime_bens, data_inicio }> }` (vigentes; query key `['relacionamentos', ...ids.sort()]`).
- `useAlterarCompoeRenda(leadId)` → `mutate({ participacaoId, compoe })` → `PATCH /api/participacoes/[id]`; invalida `['leads', leadId]`.
- `useAdicionarParticipante(leadId)` → `mutate({ pessoaId } | { nome, cpf })` → cria Pessoa (se `nome`) com `tipo: 'cliente'` e insere `lead_coparticipantes` (mesmo caminho da aba Crédito); confere `error` de cada passo; invalida `['leads', leadId]`.
- `useRemoverParticipante(leadId)` → `mutate(pessoaId)` → `delete` em `lead_coparticipantes` por `lead_id` + `pessoa_id` com `.select('id')` e erro se vazio.
- `useDefinirConjuge()` → `mutate({ pessoaId, conjugeId, estadoCivil, regime, data, confirmarEncerrar })` → `POST /api/pessoas/[id]/conjuge`; em 409 devolve `{ precisaConfirmar: nomes }` em vez de lançar.

- [ ] **Step 1: Implementar** (código segue exatamente os contratos acima; `fetch` com `Authorization: Bearer <session.access_token>`, igual aos hooks de contratos).
- [ ] **Step 2: `tsc` sem erros; commit** `feat(participantes): hooks da tela de participantes (V2 B2b)`.

---

### Task 4: Formulário da Pessoa extraído da aba

**Files:**
- Create: `src/components/pessoas/FormularioPessoa.tsx` (conteúdo de `AbaPessoa.tsx` com `pessoaId` por prop)
- Modify: `src/components/leads/LeadDetalhe/AbaPessoa.tsx` (vira o contêiner das sub-abas — Task 5)

**Interfaces:**
- `FormularioPessoa({ pessoaId, participantesDaProposta, onAlterado })`:
  - `pessoaId: string`
  - `participantesDaProposta: Array<{ pessoaId: string; nome: string }>` (opções do "Casado(a) com")
  - `onAlterado?: () => void` (invalida participantes/renda depois de salvar)

- [ ] **Step 1: Extrair**

Mover para `FormularioPessoa.tsx` tudo de `AbaPessoa.tsx` (helpers, tipos, `VAZIO`, `L`, `Secao`, query `pessoa-completa`, efeito de reset por `id|updated_at`, `salvar`, JSX), trocando `const pessoaId = lead.pessoa_id` pela prop. O espelho em `leads` (`.eq('pessoa_id', pessoaId)`) continua: ele só atinge leads onde **esta** Pessoa é titular (Review Focus 2).

- [ ] **Step 2: Bloco "Estado Civil" → "Casado(a) com"**

Dentro da seção "Estado Civil", no lugar do box verde `conjugeVinculado` e dos campos soltos `conjuge_*` (nome, CPF, nascimento, telefone, profissão, rendas):
- `<select>` "Casado(a) com" com: os `participantesDaProposta` (exceto a própria pessoa), o cônjuge atual se não estiver na proposta (nome vindo de `conjuge_pessoa`), "Buscar pessoa…" (abre o mesmo modal de busca da Task 5, papel participante) e "Nova pessoa…" (nome + CPF opcional, cria a Pessoa pelo hook).
- "Data do casamento/união" e "Regime de bens" continuam (campos `data_casamento`/`regime_casamento` do form).
- Ao escolher: `useDefinirConjuge` com o estado civil, regime e data atuais do form; em `precisaConfirmar`, `window.confirm("X já é casado(a) com Y. Encerrar esse casamento?")` e reenviar com `confirmarEncerrar: true`.
- Escolhido fora da proposta **e** a pessoa desta aba não é a titular → perguntar "Incluir <nome> na proposta como cônjuge?" (`window.confirm`); sim → `useAdicionarParticipante({ pessoaId: conjugeId })`. (Cônjuge da titular entra sozinho pela sincronização.)
- No `salvar`, os campos `conjuge_*` soltos deixam de ir no payload **quando há `conjuge_pessoa_id`** (o cônjuge é editado na própria aba); sem cônjuge vinculado o comportamento antigo segue (campos soltos continuam gravados, a sync cria a Pessoa — dado legado).

- [ ] **Step 3: `tsc` sem erros; commit** `refactor(participantes): formulário da Pessoa reutilizável + Casado(a) com (V2 B2b)`.

---

### Task 5: Aba Pessoa com sub-abas por participante

**Files:**
- Modify: `src/components/leads/LeadDetalhe/AbaPessoa.tsx` (contêiner)
- Create: `src/components/participantes/AdicionarParticipanteModal.tsx`
- Create: `src/lib/participantes/rotulos.ts` + `src/lib/participantes/__tests__/rotulos.test.ts`

**Interfaces:**
- `rotuloParticipante(p: { papel, pessoaId, nome }, todos, relacionamentos): string` — `'Principal'` (titular); `'Cônjuge de <1º nome>'` quando há relacionamento vigente com outro participante; `'Coparticipante'`; `'Cônjuge'` (conjuge_anuente sem par na proposta).

- [ ] **Step 1: Teste dos rótulos (vai falhar)** — casos: titular → "Principal"; coparticipante casado com outro coparticipante → "Cônjuge de Afrânio"; conjuge_anuente casado com a titular → "Cônjuge de Heitor"; coparticipante sem relacionamento → "Coparticipante".
- [ ] **Step 2: Implementar `rotulos.ts`** → PASS.
- [ ] **Step 3: Contêiner**

`AbaPessoa({ lead })`:
- sem `lead.pessoa_id` → mensagem atual.
- `useParticipantes({ tipo: 'lead', id: lead.id })` filtrado a `PAPEIS_COMPRA`, titular primeiro; `useRelacionamentosDe(ids)`.
- estado `selecionada` (pessoaId; padrão = titular); barra de sub-abas (`role="tablist"`, botões `min-h-[44px]`, rolagem horizontal no celular: `overflow-x-auto`), cada uma `"<1º nome> · <rótulo>"`, + botão "+ Participante" (abre `AdicionarParticipanteModal`).
- cabeçalho da pessoa selecionada: nome, rótulo, checkbox **Compõe renda** (`useAlterarCompoeRenda`), botão **Remover da proposta** só para `coparticipante` (confirmação; `useRemoverParticipante`) — titular e cônjuge da titular não têm remover (texto: "o cônjuge da titular sai ao desvincular o casamento").
- `<FormularioPessoa key={selecionada} pessoaId={selecionada} participantesDaProposta={...} onAlterado={invalidar} />`.
- rodapé: renda composta (`rendaComposta` de `src/lib/participantes/renda.ts`) com os nomes de quem compõe.
- troca de sub-aba com edição pendente: `FormularioPessoa` expõe `onSujoChange(bool)`; o contêiner pergunta "Descartar alterações de <nome>?" antes de trocar.

- [ ] **Step 4: Modal "+ Participante"**

Busca `GET /api/pessoas?q=<termo>&papel=participante` (debounce 250 ms, mínimo 2 letras); lista nome + CPF mascarado + aviso "Também é cliente de <cliente_de>" quando vier; exclui quem já participa; "Criar pessoa nova" (nome obrigatório, CPF opcional validado com `cpfValido`); confirma → `useAdicionarParticipante`; seleciona a sub-aba nova ao terminar.

- [ ] **Step 5: `tsc`, suíte, commit** `feat(participantes): aba Pessoa do lead com uma sub-aba por participante (V2 B2b)`.

---

### Task 6: Compõe renda na aba Crédito e conferência

**Files:**
- Modify: `src/components/leads/LeadDetalhe/AbaCredito.tsx` (quadro de renda: mostrar "manual" quando o compõe renda foi definido na aba Pessoa; o bloco de coparticipantes da Crédito passa a só listar e apontar para a aba Pessoa — "Participantes agora são gerenciados na aba Pessoa")

- [ ] **Step 1:** Remover os controles de incluir/criar/remover coparticipante da `AbaCredito` (mantém a lista, com link "Gerenciar na aba Pessoa") — uma única forma de incluir participante.
- [ ] **Step 2:** `tsc` + suíte; commit `refactor(participantes): coparticipantes gerenciados só na aba Pessoa (V2 B2b)`.

---

### Task 7: Roteiro, CLAUDE.md e entrega

- [ ] **Step 1:** Atualizar `docs/superpowers/plans/2026-09-30-participantes-v2-fase-b2-roteiro.md`: B2b = "tela de participantes sobre o modelo atual (feito)"; **B2c = virada** (desligar sincronização, `leads.pessoa_id` derivado, travar tabelas antigas, trocar os escritores restantes); **B2d** = OCR "De quem é este documento?", certidão, mover para participante. Registrar: Negócio mantém o visual (decisão do usuário); vendedor do Lead fica na aba Crédito.
- [ ] **Step 2:** CLAUDE.md, seção dos Participantes: "Aba Pessoa do Lead = uma sub-aba por participante (`FormularioPessoa` por `pessoaId`); incluir/remover participante grava `lead_coparticipantes`; casamento por `POST /api/pessoas/[id]/conjuge`; compõe renda manual só por `PATCH /api/participacoes/[id]` (`compoe_renda_manual`, migration 331) — a sync respeita e o negócio herda."
- [ ] **Step 3:** Suíte completa + `tsc`; copiar a 331 para a raiz; PR com a ordem: rodar 331 → merge.
