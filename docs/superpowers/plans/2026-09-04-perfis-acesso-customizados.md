# Perfis de Acesso Customizados — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que o admin crie perfis de acesso novos ("Externo", etc.) pela tela `Configurações → Perfis de Acesso`, com nome próprio e matriz de permissões em branco (nenhum acesso até ser marcado manualmente), sem alterar nenhum dos 7 perfis fixos existentes nem o RLS deles.

**Architecture:** Adiciona um único valor novo (`'customizado'`) ao enum `usuario_perfil` do Postgres, mais duas tabelas novas (`perfis_acesso` para o nome/empresa do perfil, `perfil_customizado_permissoes` para a matriz) e uma coluna `perfil_customizado_id` em `usuarios`/`convites`. Todo perfil customizado usa o mesmo valor de enum — o nome real vive na tabela nova — então os 7 perfis fixos e as regras hardcoded de RLS que os citam (`comercial`, `gestor`, `apoio`, `gerente`, `admin`) nunca são tocados.

**Tech Stack:** Next.js 14 (App Router), Supabase (Postgres + RLS), React Query, react-hook-form + zod, Tailwind, shadcn/ui, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-04-perfis-acesso-customizados-design.md`

## Global Constraints

- Enum ganha **só um valor novo** (`'customizado'`) — nunca um valor por perfil criado pela tela.
- `ALTER TYPE ... ADD VALUE` vai em migration isolada, própria, porque o Postgres não permite usar o valor novo no mesmo bloco de transação em que ele é criado.
- Nenhuma mudança de comportamento para `perfil <> 'customizado'` — os 7 perfis fixos e as RLS policies que citam seus nomes literais continuam idênticos.
- Perfil customizado nasce sempre com a matriz 100% em branco (`false` para toda ação) — nunca herda nada de `PERMISSOES_PADRAO`.
- Numeração de migration a partir de `280` (última existente: `20260901_279_fix_pessoa_sessao_fonti_dedupe_telefone.sql`).
- Rodar `npx tsc --noEmit` limpo ao final de cada task que toca TypeScript.
- Rodar `npm run test` (vitest) limpo ao final de cada task que toca lógica testável.

---

## Task 1: Migration — enum `usuario_perfil` ganha `'customizado'`

**Files:**
- Create: `supabase/migrations/20260904_280_perfil_customizado_enum.sql`

**Interfaces:**
- Produces: valor de enum `'customizado'` disponível para uso em migrations subsequentes desta feature (Tasks 2-4) e no código TypeScript (Task 5+).

- [ ] **Step 1: Escrever a migration**

```sql
-- Perfis de Acesso Customizados — Task 1/4.
--
-- Adiciona um único valor novo ao enum usuario_perfil: 'customizado'. Todo
-- perfil criado pela tela (Configurações > Perfis de Acesso > "+ Criar novo
-- perfil") usa este mesmo valor — o nome real do perfil vive na tabela nova
-- perfis_acesso (migration 281), não no enum. Isso evita precisar de uma
-- migration de schema a cada perfil novo criado pelo admin.
--
-- Isolada em migration própria: ALTER TYPE ... ADD VALUE não pode ser usado
-- no mesmo bloco de transação em que o valor novo é referenciado (restrição
-- do Postgres) — as migrations 281-283 já podem usar 'customizado' livremente
-- porque rodam depois, em transações separadas.

ALTER TYPE usuario_perfil ADD VALUE IF NOT EXISTS 'customizado';
```

- [ ] **Step 2: Rodar a migration no Supabase**

Executar o SQL acima no SQL Editor do Supabase (ou `supabase db push` se o
usuário usar CLI local). **Não prosseguir para a Task 2 antes de confirmar
que esta migration rodou com sucesso** — as próximas migrations desta
feature usam o literal `'customizado'` e falham se o enum ainda não o tiver.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260904_280_perfil_customizado_enum.sql
git commit -m "feat: enum usuario_perfil ganha valor 'customizado' (perfis de acesso customizados)"
```

---

## Task 2: Migration — tabelas `perfis_acesso` e `perfil_customizado_permissoes`

**Files:**
- Create: `supabase/migrations/20260904_281_perfis_acesso.sql`

**Interfaces:**
- Consumes: enum `usuario_perfil` com valor `'customizado'` (Task 1).
- Produces: tabelas `perfis_acesso(id, empresa_id, nome, ativo, created_by, created_at, updated_at)` e `perfil_customizado_permissoes(id, perfil_customizado_id, acao, permitido, updated_at)`, usadas por Tasks 3-4 (SQL) e Task 9+ (hooks TS).

- [ ] **Step 1: Escrever a migration**

```sql
-- Perfis de Acesso Customizados — Task 2/4.
--
-- perfis_acesso: perfis criados pelo admin pela tela (nome + empresa).
-- perfil_customizado_permissoes: matriz de permissões de cada perfil
-- customizado, espelhando o formato de perfil_permissoes (que serve só os 7
-- perfis fixos) mas chaveada pelo id do perfil em vez do enum — evita
-- colisão entre dois perfis customizados diferentes, já que ambos usam o
-- mesmo valor de enum ('customizado').
--
-- Ausência de linha em perfil_customizado_permissoes para uma ação = false,
-- sempre — não existe "padrão do sistema" para um perfil customizado
-- restaurar (diferente de perfil_permissoes, que tem PERMISSOES_PADRAO como
-- fallback no código).

CREATE TABLE perfis_acesso (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  UUID        NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nome        TEXT        NOT NULL,
  ativo       BOOLEAN     NOT NULL DEFAULT true,
  created_by  UUID        REFERENCES usuarios(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, nome)
);

CREATE INDEX idx_perfis_acesso_empresa ON perfis_acesso(empresa_id);

ALTER TABLE perfis_acesso ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pa_select" ON perfis_acesso
  FOR SELECT USING (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() AND ativo = true)
  );

CREATE POLICY "pa_insert" ON perfis_acesso
  FOR INSERT WITH CHECK (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() AND ativo = true)
    AND (SELECT perfil FROM usuarios WHERE auth_user_id = auth.uid() AND ativo = true) = 'admin'
  );

CREATE POLICY "pa_update" ON perfis_acesso
  FOR UPDATE USING (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() AND ativo = true)
    AND (SELECT perfil FROM usuarios WHERE auth_user_id = auth.uid() AND ativo = true) = 'admin'
  )
  WITH CHECK (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() AND ativo = true)
  );

COMMENT ON TABLE perfis_acesso IS
  'Perfis de acesso criados pelo admin pela tela (além dos 7 fixos). Nome vive aqui; o enum usuarios.perfil usa sempre "customizado".';

CREATE TABLE perfil_customizado_permissoes (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  perfil_customizado_id UUID        NOT NULL REFERENCES perfis_acesso(id) ON DELETE CASCADE,
  acao                  TEXT        NOT NULL,
  permitido             BOOLEAN     NOT NULL DEFAULT false,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (perfil_customizado_id, acao)
);

CREATE INDEX idx_perfil_customizado_permissoes_perfil ON perfil_customizado_permissoes(perfil_customizado_id);

ALTER TABLE perfil_customizado_permissoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pcp_select" ON perfil_customizado_permissoes
  FOR SELECT USING (
    perfil_customizado_id IN (
      SELECT id FROM perfis_acesso
       WHERE empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() AND ativo = true)
    )
  );

CREATE POLICY "pcp_insert" ON perfil_customizado_permissoes
  FOR INSERT WITH CHECK (
    (SELECT perfil FROM usuarios WHERE auth_user_id = auth.uid() AND ativo = true) = 'admin'
    AND perfil_customizado_id IN (
      SELECT id FROM perfis_acesso
       WHERE empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() AND ativo = true)
    )
  );

CREATE POLICY "pcp_update" ON perfil_customizado_permissoes
  FOR UPDATE USING (
    (SELECT perfil FROM usuarios WHERE auth_user_id = auth.uid() AND ativo = true) = 'admin'
    AND perfil_customizado_id IN (
      SELECT id FROM perfis_acesso
       WHERE empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() AND ativo = true)
    )
  )
  WITH CHECK (
    perfil_customizado_id IN (
      SELECT id FROM perfis_acesso
       WHERE empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() AND ativo = true)
    )
  );

CREATE POLICY "pcp_delete" ON perfil_customizado_permissoes
  FOR DELETE USING (
    (SELECT perfil FROM usuarios WHERE auth_user_id = auth.uid() AND ativo = true) = 'admin'
    AND perfil_customizado_id IN (
      SELECT id FROM perfis_acesso
       WHERE empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() AND ativo = true)
    )
  );

COMMENT ON TABLE perfil_customizado_permissoes IS
  'Matriz de permissões de cada perfil customizado. Ausência de linha para uma ação = false (nunca existe fallback "padrão do sistema" aqui).';
```

- [ ] **Step 2: Rodar a migration no Supabase**

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260904_281_perfis_acesso.sql
git commit -m "feat: tabelas perfis_acesso e perfil_customizado_permissoes"
```

---

## Task 3: Migration — `perfil_customizado_id` em `usuarios` e `convites`

**Files:**
- Create: `supabase/migrations/20260904_282_usuarios_convites_perfil_customizado.sql`

**Interfaces:**
- Consumes: `perfis_acesso(id)` (Task 2).
- Produces: coluna `usuarios.perfil_customizado_id` e `convites.perfil_customizado_id`, usadas por Task 4 (SQL) e Tasks 10-13 (TS/UI).

- [ ] **Step 1: Escrever a migration**

```sql
-- Perfis de Acesso Customizados — Task 3/4.
--
-- Só é preenchida quando perfil = 'customizado'. Sem CHECK cruzando as duas
-- colunas de propósito (mantém simples; a UI garante a combinação coerente,
-- mesmo padrão de confiança já usado em outras colunas condicionais deste
-- schema).

ALTER TABLE usuarios ADD COLUMN perfil_customizado_id UUID REFERENCES perfis_acesso(id);
ALTER TABLE convites ADD COLUMN perfil_customizado_id UUID REFERENCES perfis_acesso(id);
```

- [ ] **Step 2: Rodar a migration no Supabase**

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260904_282_usuarios_convites_perfil_customizado.sql
git commit -m "feat: coluna perfil_customizado_id em usuarios e convites"
```

---

## Task 4: Migration — `usuario_atual_pode()` resolve perfil customizado

**Files:**
- Create: `supabase/migrations/20260904_283_usuario_atual_pode_perfil_customizado.sql`
- Test: `src/lib/auth/__tests__/migration-283-perfil-customizado.test.ts`

**Interfaces:**
- Consumes: `perfil_customizado_permissoes` (Task 2), `usuarios.perfil_customizado_id` (Task 3).
- Produces: função SQL `usuario_atual_pode(p_acao text)` atualizada — usada pelas RLS policies existentes de todo o sistema, nenhuma mudança de assinatura.

- [ ] **Step 1: Escrever a migration**

```sql
-- Perfis de Acesso Customizados — Task 4/4.
--
-- Ganha um branch novo para v_perfil = 'customizado': resolve o id do
-- perfil customizado do usuário e consulta perfil_customizado_permissoes em
-- vez de perfil_permissoes. Ausência de linha = false, sempre — perfil
-- customizado nunca cai no CASE de fallback final (que é só para os 7
-- perfis fixos), então nunca herda leads.ver_todas/leads.redistribuir por
-- acidente. A checagem de exceção individual (usuario_permissoes) continua
-- rodando antes deste branch, prioridade inalterada.

CREATE OR REPLACE FUNCTION usuario_atual_pode(p_acao text) RETURNS boolean AS $$
DECLARE
  v_usuario_id              uuid := usuario_atual_id();
  v_perfil                  usuario_perfil := usuario_atual_perfil();
  v_empresa_id               uuid := usuario_atual_empresa_id();
  v_permitido                boolean;
  v_perfil_customizado_id    uuid;
BEGIN
  IF v_perfil = 'admin' THEN
    RETURN true;
  END IF;

  SELECT permitido INTO v_permitido
    FROM usuario_permissoes
   WHERE usuario_id = v_usuario_id AND acao = p_acao
   LIMIT 1;
  IF FOUND THEN
    RETURN v_permitido;
  END IF;

  IF v_perfil = 'customizado' THEN
    SELECT perfil_customizado_id INTO v_perfil_customizado_id
      FROM usuarios WHERE id = v_usuario_id;

    SELECT permitido INTO v_permitido
      FROM perfil_customizado_permissoes
     WHERE perfil_customizado_id = v_perfil_customizado_id AND acao = p_acao
     LIMIT 1;

    RETURN COALESCE(v_permitido, false);
  END IF;

  SELECT permitido INTO v_permitido
    FROM perfil_permissoes
   WHERE empresa_id = v_empresa_id AND perfil = v_perfil AND acao = p_acao
   LIMIT 1;
  IF FOUND THEN
    RETURN v_permitido;
  END IF;

  RETURN CASE p_acao
    WHEN 'leads.ver_todas'    THEN v_perfil <> 'comercial'
    WHEN 'leads.redistribuir' THEN v_perfil IN ('gestor', 'gerente', 'apoio', 'comercial')
    ELSE false
  END;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;
```

- [ ] **Step 2: Escrever o teste estático da migration (mesmo padrão de `migrations-gestor.test.ts`)**

```typescript
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const MIGRATIONS_DIR = path.resolve(__dirname, '../../../../supabase/migrations')

function lerMigration(nome: string): string {
  return fs.readFileSync(path.join(MIGRATIONS_DIR, nome), 'utf-8')
}

describe('migration 283 — usuario_atual_pode resolve perfil customizado', () => {
  const conteudo = lerMigration('20260904_283_usuario_atual_pode_perfil_customizado.sql')

  it('adiciona o branch para perfil customizado antes da consulta a perfil_permissoes', () => {
    const idxBranchCustomizado = conteudo.indexOf("v_perfil = 'customizado'")
    const idxConsultaPerfilPermissoes = conteudo.indexOf('FROM perfil_permissoes')
    expect(idxBranchCustomizado).toBeGreaterThan(-1)
    expect(idxConsultaPerfilPermissoes).toBeGreaterThan(-1)
    expect(idxBranchCustomizado).toBeLessThan(idxConsultaPerfilPermissoes)
  })

  it('consulta perfil_customizado_permissoes, não perfil_permissoes, dentro do branch customizado', () => {
    const inicio = conteudo.indexOf("v_perfil = 'customizado'")
    const fimBranch = conteudo.indexOf('END IF;', inicio)
    const trechoBranch = conteudo.slice(inicio, fimBranch)
    expect(trechoBranch).toMatch(/FROM perfil_customizado_permissoes/)
    expect(trechoBranch).not.toMatch(/FROM perfil_permissoes/)
  })

  it('retorna COALESCE(..., false) no branch customizado — nunca cai no CASE de fallback dos 7 perfis fixos', () => {
    const inicio = conteudo.indexOf("v_perfil = 'customizado'")
    const fimBranch = conteudo.indexOf('END IF;', inicio)
    const trechoBranch = conteudo.slice(inicio, fimBranch)
    expect(trechoBranch).toMatch(/COALESCE\(v_permitido, false\)/)
  })

  it('não altera o CASE de fallback final dos 7 perfis fixos', () => {
    expect(conteudo).toMatch(/WHEN 'leads\.ver_todas'\s+THEN v_perfil <> 'comercial'/)
    expect(conteudo).toMatch(/WHEN 'leads\.redistribuir' THEN v_perfil IN \('gestor', 'gerente', 'apoio', 'comercial'\)/)
  })
})
```

- [ ] **Step 3: Rodar o teste**

Run: `npx vitest run src/lib/auth/__tests__/migration-283-perfil-customizado.test.ts`
Expected: PASS (4 testes)

- [ ] **Step 4: Rodar a migration no Supabase**

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260904_283_usuario_atual_pode_perfil_customizado.sql src/lib/auth/__tests__/migration-283-perfil-customizado.test.ts
git commit -m "feat: usuario_atual_pode resolve permissões de perfil customizado"
```

---

## Task 5: Tipos TypeScript — enum e entidades novas

**Files:**
- Modify: `src/types/auth.ts`
- Modify: `src/types/supabase.ts`
- Modify: `src/types/configuracoes.ts`

**Interfaces:**
- Produces: `UsuarioPerfil` (em `@/types/auth` e via `@/types/configuracoes`) incluindo `'customizado'`; interface `PerfilAcesso` nova; `Usuario`/`Convite`/`SessaoUsuario` com `perfil_customizado_id: string | null`.

- [ ] **Step 1: `src/types/auth.ts` — enum, novo tipo `PerfilAcesso`, colunas novas**

Substituir o topo do arquivo (linhas 1-39):

```typescript
export type UsuarioPerfil =
  | 'admin' | 'gerente' | 'analista' | 'consultor' | 'cliente'
  | 'gestor' | 'comercial' | 'operacional' | 'juridico' | 'apoio' | 'assistente'
  | 'customizado'

/** Perfil de acesso criado pelo admin pela tela (além dos 7 fixos). */
export interface PerfilAcesso {
  id: string
  empresa_id: string
  nome: string
  ativo: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface Usuario {
  id: string
  empresa_id: string
  auth_user_id: string
  nome: string
  email: string
  perfil: UsuarioPerfil
  perfil_customizado_id: string | null
  cargo_id: string | null
  ativo: boolean
  notificar_leads_aprovados_pendentes: boolean
  ultimo_acesso: string | null
  created_at: string
  updated_at: string
}

export interface Convite {
  id: string
  empresa_id: string
  email: string
  perfil: UsuarioPerfil
  perfil_customizado_id: string | null
  token: string
  criado_por: string
  aceito_em: string | null
  expira_em: string
  created_at: string
}

export interface SessaoUsuario {
  id: string
  empresa_id: string
  perfil: UsuarioPerfil
  perfil_customizado_id: string | null
  nome: string
  email: string
  ativo: boolean
}
```

(O resto do arquivo — `Acao` — permanece inalterado.)

- [ ] **Step 2: `src/types/supabase.ts` — enum e coluna nova em `usuarios`**

Editar a linha 33 (dentro de `usuarios.Row`), adicionando logo abaixo:

```typescript
          perfil: Database['public']['Enums']['usuario_perfil']
          perfil_customizado_id: string | null
```

Editar a linha 132 (Enums):

```typescript
      usuario_perfil: 'admin' | 'gestor' | 'comercial' | 'operacional' | 'juridico' | 'apoio' | 'assistente' | 'gerente' | 'analista' | 'consultor' | 'cliente' | 'customizado'
```

`usuarios.Insert`/`Update` já são derivados de `Row` via `Omit`/`Partial` (linhas 45-54) — como `perfil_customizado_id` não está na lista de campos opcionais do `Omit`, ele fica obrigatório no `Insert`. Ajustar para opcional (nullable na criação, igual a `cargo_id`):

```typescript
        Insert: Omit<Database['public']['Tables']['usuarios']['Row'], 'created_at' | 'updated_at' | 'telefone' | 'telefone_whatsapp' | 'avatar_url' | 'token_telefonia' | 'ultimo_acesso' | 'motivo_exclusao' | 'deleted_at' | 'perfil_customizado_id'> & {
          telefone?: string | null
          telefone_whatsapp?: string | null
          avatar_url?: string | null
          token_telefonia?: string | null
          ultimo_acesso?: string | null
          motivo_exclusao?: string | null
          deleted_at?: string | null
          perfil_customizado_id?: string | null
        }
```

- [ ] **Step 3: `src/types/configuracoes.ts` — fallback de label/cor para `'customizado'`**

`PERFIL_LABELS` e `PERFIL_CORES` são `Record<UsuarioPerfil, string>` — como `UsuarioPerfil` agora inclui `'customizado'`, o TypeScript exige uma entrada para essa chave (senão `tsc` quebra). Adicionar em ambos os records (logo abaixo do bloco `// legado`):

```typescript
export const PERFIL_LABELS: Record<UsuarioPerfil, string> = {
  admin:       'Administrador',
  gestor:      'Gestor',
  comercial:   'Comercial',
  operacional: 'Operacional',
  juridico:    'Jurídico',
  apoio:       'Apoio',
  assistente:  'Assistente',
  // legado
  gerente:     'Gerente',
  analista:    'Analista',
  consultor:   'Consultor',
  cliente:     'Cliente',
  // perfil customizado — o nome real vem de perfis_acesso.nome; este label só
  // aparece se, por algum motivo, o nome customizado não puder ser resolvido
  customizado: 'Personalizado',
}

export const PERFIL_CORES: Record<UsuarioPerfil, string> = {
  admin:       'bg-fonti-primary text-white',
  gestor:      'bg-fonti-accent text-fonti-primary',
  comercial:   'bg-blue-100 text-blue-800',
  operacional: 'bg-indigo-100 text-indigo-800',
  juridico:    'bg-purple-100 text-purple-800',
  apoio:       'bg-teal-100 text-teal-800',
  assistente:  'bg-amber-100 text-amber-800',
  // legado
  gerente:     'bg-fonti-accent text-fonti-primary',
  analista:    'bg-blue-100 text-blue-800',
  consultor:   'bg-purple-100 text-purple-800',
  cliente:     'bg-gray-100 text-gray-700',
  // perfil customizado — cor neutra fixa (não há como prever quantos perfis
  // customizados vão existir para dar uma cor própria a cada um)
  customizado: 'bg-slate-100 text-slate-700',
}
```

- [ ] **Step 4: Rodar `tsc`**

Run: `npx tsc --noEmit`
Expected: podem aparecer erros nos arquivos que ainda serão ajustados nas próximas tasks (`permissions.ts`, componentes que usam `Usuario`/`Convite`) — confirmar que os erros restantes são só nesses arquivos, não em `types/auth.ts`, `types/supabase.ts` ou `types/configuracoes.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/types/auth.ts src/types/supabase.ts src/types/configuracoes.ts
git commit -m "feat: tipos para perfil de acesso customizado"
```

---

## Task 6: `PERMISSOES_PADRAO` ganha entrada `customizado: []`

**Files:**
- Modify: `src/lib/auth/permissions.ts`
- Test: `src/lib/auth/__tests__/permissions.test.ts`

**Interfaces:**
- Consumes: `UsuarioPerfil` com `'customizado'` (Task 5).
- Produces: `PERMISSOES_PADRAO.customizado` (sempre `[]`, nunca consultada de fato — o resolvedor da Task 7 intercepta `'customizado'` antes).

- [ ] **Step 1: Escrever o teste**

Adicionar ao final de `src/lib/auth/__tests__/permissions.test.ts`:

```typescript
describe('PERMISSOES_PADRAO.customizado', () => {
  it('é sempre vazio — perfil customizado nunca herda nada da matriz oficial', () => {
    expect(PERMISSOES_PADRAO.customizado).toEqual([])
  })

  it('podeExecutarPadrao nunca libera nada para customizado, mesmo ações públicas de outros perfis', () => {
    expect(podeExecutarPadrao('customizado', 'dashboard.ver')).toBe(false)
    expect(podeExecutarPadrao('customizado', 'leads.ver')).toBe(false)
  })
})
```

- [ ] **Step 2: Rodar o teste para confirmar que falha**

Run: `npx vitest run src/lib/auth/__tests__/permissions.test.ts`
Expected: FAIL — `PERMISSOES_PADRAO.customizado` é `undefined`, `Property 'customizado' is missing` no `tsc`.

- [ ] **Step 3: Implementar**

Em `src/lib/auth/permissions.ts`, adicionar ao final do objeto `PERMISSOES_PADRAO` (depois de `cliente: []`, antes do `}` de fechamento):

```typescript
  // Perfil customizado: nasce sempre em branco. Nunca é consultado de fato
  // por podeExecutarPadrao/resolverPermissao — perfil==='customizado' é
  // interceptado antes e resolvido via perfil_customizado_permissoes (ver
  // resolverPermissao em permissaoResolver.ts) — esta entrada existe só para
  // satisfazer o tipo Record<UsuarioPerfil, Acao[]>.
  customizado: [],
```

- [ ] **Step 4: Rodar o teste para confirmar que passa**

Run: `npx vitest run src/lib/auth/__tests__/permissions.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/permissions.ts src/lib/auth/__tests__/permissions.test.ts
git commit -m "feat: PERMISSOES_PADRAO.customizado sempre vazio"
```

---

## Task 7: `resolverPermissao` — suporte a perfil customizado sem colisão entre perfis

**Files:**
- Modify: `src/hooks/auth/permissaoResolver.ts`
- Test: `src/hooks/auth/__tests__/usePerfilPermissoes.test.ts`

**Interfaces:**
- Consumes: `PERMISSOES_PADRAO.customizado` (Task 6).
- Produces: `resolverPermissao(perfil, acao, overrides, overridesUsuario?, perfilCustomizadoId?)` — quinto parâmetro novo, opcional; chave de override para perfil customizado no formato `` `customizado:${perfilCustomizadoId}:${acao}` ``. Usado por Task 8 (`usePerfilPermissoes`) e Task 11 (`PerfisPermissoesConfig`).

- [ ] **Step 1: Escrever os testes**

Adicionar ao final de `src/hooks/auth/__tests__/usePerfilPermissoes.test.ts`:

```typescript
describe('resolverPermissao — perfil customizado', () => {
  it('sem override, qualquer ação é false (nasce em branco, sem fallback de padrão)', () => {
    const overrides = construirMapaOverrides([])
    expect(resolverPermissao('customizado', 'leads.ver', overrides, undefined, 'perfil-a')).toBe(false)
    expect(resolverPermissao('customizado', 'dashboard.ver', overrides, undefined, 'perfil-a')).toBe(true) // dashboard.ver é sempre true, ver resolverPermissao
  })

  it('sem perfilCustomizadoId, qualquer ação é false (não há como resolver a matriz)', () => {
    const overrides = construirMapaOverrides([
      { perfil: 'customizado', acao: 'leads.ver', permitido: true } as never,
    ])
    expect(resolverPermissao('customizado', 'leads.ver', overrides, undefined, undefined)).toBe(false)
    expect(resolverPermissao('customizado', 'leads.ver', overrides, undefined, null)).toBe(false)
  })

  it('override do perfil customizado específico é respeitado', () => {
    const overrides = new Map<string, boolean>([['customizado:perfil-a:leads.ver', true]])
    expect(resolverPermissao('customizado', 'leads.ver', overrides, undefined, 'perfil-a')).toBe(true)
  })

  it('override de um perfil customizado não vaza para outro perfil customizado diferente', () => {
    const overrides = new Map<string, boolean>([['customizado:perfil-a:leads.ver', true]])
    expect(resolverPermissao('customizado', 'leads.ver', overrides, undefined, 'perfil-b')).toBe(false)
  })

  it('exceção individual do usuário ainda tem prioridade sobre o override do perfil customizado', () => {
    const overrides = new Map<string, boolean>([['customizado:perfil-a:leads.ver', true]])
    const overridesUsuario = new Map<string, boolean>([['leads.ver', false]])
    expect(resolverPermissao('customizado', 'leads.ver', overrides, overridesUsuario, 'perfil-a')).toBe(false)
  })
})
```

- [ ] **Step 2: Rodar os testes para confirmar que falham**

Run: `npx vitest run src/hooks/auth/__tests__/usePerfilPermissoes.test.ts`
Expected: FAIL — `resolverPermissao` ainda não aceita o 5º parâmetro nem trata `'customizado'` de forma especial (o comportamento atual cairia em `podeExecutarPadrao('customizado', acao)`, que agora retorna sempre `false` pela Task 6 — então o teste de "override é respeitado" falha).

- [ ] **Step 3: Implementar**

Substituir a função `resolverPermissao` em `src/hooks/auth/permissaoResolver.ts` (linhas 67-83):

```typescript
export function resolverPermissao(
  perfil: UsuarioPerfil,
  acao: Acao,
  overrides: Map<string, boolean>,
  overridesUsuario?: Map<string, boolean>,
  perfilCustomizadoId?: string | null,
): boolean {
  if (perfil === 'admin') return true
  if (acao === 'dashboard.ver') return true
  if (ACOES_NAO_CONFIGURAVEIS.has(acao)) return podeExecutarPadrao(perfil, acao)

  if (overridesUsuario?.has(acao)) return overridesUsuario.get(acao)!

  if (perfil === 'customizado') {
    if (!perfilCustomizadoId) return false
    return overrides.get(`customizado:${perfilCustomizadoId}:${acao}`) ?? false
  }

  const chave = `${perfil}:${acao}`
  if (overrides.has(chave)) return overrides.get(chave)!

  return podeExecutarPadrao(perfil, acao)
}
```

Atualizar o comentário da função (linhas 37-66) acrescentando uma nota sobre o
caso `'customizado'`:

```typescript
/**
 * [...comentário existente inalterado até o passo 3...]
 *
 * Caso especial `perfil === 'customizado'`: a chave de override muda de
 * `${perfil}:${acao}` para `customizado:${perfilCustomizadoId}:${acao}` —
 * necessário porque todo perfil customizado compartilha o mesmo valor de
 * enum ('customizado'), então a chave simples colidiria entre dois perfis
 * customizados diferentes. Sem perfilCustomizadoId, ou sem override
 * encontrado, o resultado é sempre false — não existe "padrão do sistema"
 * para perfil customizado (PERMISSOES_PADRAO.customizado é sempre []).
 */
```

- [ ] **Step 4: Rodar os testes para confirmar que passam**

Run: `npx vitest run src/hooks/auth/__tests__/usePerfilPermissoes.test.ts`
Expected: PASS (todos, incluindo os pré-existentes — a assinatura ganhou um parâmetro opcional no final, então nenhuma chamada antiga quebra)

- [ ] **Step 5: Rodar `tsc`**

Run: `npx tsc --noEmit`

- [ ] **Step 6: Commit**

```bash
git add src/hooks/auth/permissaoResolver.ts src/hooks/auth/__tests__/usePerfilPermissoes.test.ts
git commit -m "feat: resolverPermissao suporta perfil customizado sem colisão entre perfis"
```

---

## Task 8: `usePerfilPermissoes` busca overrides de perfil customizado quando aplicável

**Files:**
- Modify: `src/hooks/auth/usePerfilPermissoes.ts`

**Interfaces:**
- Consumes: `resolverPermissao(..., perfilCustomizadoId?)` (Task 7); `usuario.perfil_customizado_id` (precisa existir em `SessaoUsuario`, Task 5 — só populado de verdade depois da Task 10).
- Produces: `pode(acao)` continua com a mesma assinatura pública; passa a resolver corretamente para usuários com `perfil === 'customizado'`.

- [ ] **Step 1: Implementar**

Substituir `src/hooks/auth/usePerfilPermissoes.ts` inteiro:

```typescript
'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import { type Acao } from '@/types/auth'
import {
  resolverPermissao, construirMapaOverrides, construirMapaOverridesUsuario,
  type OverrideRow, type UsuarioOverrideRow,
} from './permissaoResolver'

export type { OverrideRow, UsuarioOverrideRow }
export { resolverPermissao, construirMapaOverrides, construirMapaOverridesUsuario }

export function usePerfilPermissoes() {
  const { usuario } = useAuth()
  const ehCustomizado = usuario?.perfil === 'customizado'

  // Perfis fixos: overrides de perfil_permissoes (só roda quando NÃO é
  // customizado — evita ir a uma tabela que não tem nada útil pra esse caso).
  const query = useQuery({
    queryKey: ['perfil-permissoes', usuario?.empresa_id],
    queryFn: async (): Promise<OverrideRow[]> => {
      const { data, error } = await supabase
        .from('perfil_permissoes')
        .select('perfil, acao, permitido')
        .eq('empresa_id', usuario!.empresa_id)
      if (error) throw error
      return data ?? []
    },
    enabled: !!usuario && !ehCustomizado,
    staleTime: 60_000,
  })

  // Perfil customizado: overrides de perfil_customizado_permissoes, remapeados
  // para o mesmo formato de chave `customizado:${id}:${acao}` que
  // resolverPermissao espera (ver permissaoResolver.ts).
  const queryCustomizado = useQuery({
    queryKey: ['perfil-customizado-permissoes', usuario?.perfil_customizado_id],
    queryFn: async (): Promise<OverrideRow[]> => {
      const { data, error } = await supabase
        .from('perfil_customizado_permissoes')
        .select('acao, permitido')
        .eq('perfil_customizado_id', usuario!.perfil_customizado_id!)
      if (error) throw error
      return (data ?? []).map((row) => ({
        perfil: `customizado:${usuario!.perfil_customizado_id}`,
        acao: row.acao,
        permitido: row.permitido,
      }))
    },
    enabled: !!usuario && ehCustomizado && !!usuario.perfil_customizado_id,
    staleTime: 60_000,
  })

  // Exceções individuais do próprio usuário logado — camada acima do
  // override de perfil (ver resolverPermissao). Escopada só ao próprio id,
  // então o mapa não carrega exceções de outras pessoas da empresa.
  const queryIndividual = useQuery({
    queryKey: ['usuario-permissoes', usuario?.id],
    queryFn: async (): Promise<UsuarioOverrideRow[]> => {
      const { data, error } = await supabase
        .from('usuario_permissoes')
        .select('acao, permitido')
        .eq('usuario_id', usuario!.id)
      if (error) throw error
      return data ?? []
    },
    enabled: !!usuario,
    staleTime: 60_000,
  })

  const overrides = construirMapaOverrides(ehCustomizado ? (queryCustomizado.data ?? []) : (query.data ?? []))
  const overridesUsuario = construirMapaOverridesUsuario(queryIndividual.data ?? [])

  function pode(acao: Acao): boolean {
    if (!usuario) return false
    return resolverPermissao(usuario.perfil, acao, overrides, overridesUsuario, usuario.perfil_customizado_id)
  }

  return {
    pode,
    carregando: query.isLoading || queryCustomizado.isLoading || queryIndividual.isLoading,
    erro: query.error ?? queryCustomizado.error ?? queryIndividual.error,
  }
}
```

Nota: a chave de override construída aqui é `customizado:${id}` (não
`customizado:${id}:${acao}`) porque `construirMapaOverrides` (em
`permissaoResolver.ts`) já concatena `${row.perfil}:${row.acao}` — o
resultado final bate com o formato `customizado:${id}:${acao}` esperado por
`resolverPermissao`.

- [ ] **Step 2: Rodar `tsc`**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/hooks/auth/usePerfilPermissoes.ts
git commit -m "feat: usePerfilPermissoes resolve overrides de perfil customizado"
```

---

## Task 9: Hooks de CRUD de perfis customizados + planejamento de salvamento da matriz

**Files:**
- Create: `src/app/(protected)/configuracoes/_hooks/usePerfisCustomizados.ts`
- Modify: `src/app/(protected)/configuracoes/_hooks/permissoesMatrizHelpers.ts`
- Test: `src/app/(protected)/configuracoes/_hooks/__tests__/permissoesMatrizHelpers.test.ts` (criar se não existir)

**Interfaces:**
- Consumes: `PerfilAcesso` (Task 5); tabelas `perfis_acesso`/`perfil_customizado_permissoes` (Task 2).
- Produces: `usePerfisCustomizados()`, `useCriarPerfilCustomizado()`, `useRenomearPerfilCustomizado()`, `useDesativarPerfilCustomizado()`, `useOverridesPerfilCustomizado(perfilCustomizadoId)`, `useSalvarPlanoCustomizado()` — usados por Task 11 (`PerfisPermissoesConfig`) e Tasks 12-13 (`UsuarioFormDrawer`/`ConviteFormDrawer`, só a leitura). `planejarSalvamentoCustomizado(pendentes, overridesExistentes)` — função pura nova em `permissoesMatrizHelpers.ts`.

- [ ] **Step 1: Escrever o teste de `planejarSalvamentoCustomizado`**

Verificar primeiro se já existe `src/app/(protected)/configuracoes/_hooks/__tests__/permissoesMatrizHelpers.test.ts`; se não existir, criar. Adicionar:

```typescript
import { describe, it, expect } from 'vitest'
import { planejarSalvamentoCustomizado } from '../permissoesMatrizHelpers'

describe('planejarSalvamentoCustomizado', () => {
  it('marcar uma ação como true gera upsert', () => {
    const plano = planejarSalvamentoCustomizado({ 'leads.ver': true }, new Set())
    expect(plano.upserts).toEqual([{ acao: 'leads.ver', permitido: true }])
    expect(plano.deletes).toEqual([])
  })

  it('desmarcar uma ação que não tinha linha no banco não gera nem upsert nem delete', () => {
    const plano = planejarSalvamentoCustomizado({ 'leads.ver': false }, new Set())
    expect(plano.upserts).toEqual([])
    expect(plano.deletes).toEqual([])
  })

  it('desmarcar uma ação que JÁ tinha linha no banco gera delete (evita linha redundante false)', () => {
    const plano = planejarSalvamentoCustomizado({ 'leads.ver': false }, new Set(['leads.ver']))
    expect(plano.upserts).toEqual([])
    expect(plano.deletes).toEqual(['leads.ver'])
  })

  it('marcar de novo uma ação que já tinha linha true gera upsert (idempotente)', () => {
    const plano = planejarSalvamentoCustomizado({ 'leads.ver': true }, new Set(['leads.ver']))
    expect(plano.upserts).toEqual([{ acao: 'leads.ver', permitido: true }])
  })
})
```

- [ ] **Step 2: Rodar o teste para confirmar que falha**

Run: `npx vitest run src/app/\(protected\)/configuracoes/_hooks/__tests__/permissoesMatrizHelpers.test.ts`
Expected: FAIL — `planejarSalvamentoCustomizado` não existe.

- [ ] **Step 3: Implementar `planejarSalvamentoCustomizado`**

Adicionar ao final de `src/app/(protected)/configuracoes/_hooks/permissoesMatrizHelpers.ts`:

```typescript
export interface PlanoDeSalvamentoCustomizado {
  upserts: { acao: Acao; permitido: boolean }[]
  deletes: Acao[]
}

/**
 * Equivalente a planejarSalvamento, mas para perfil customizado — sem
 * PERMISSOES_PADRAO como referência de "padrão", porque perfil customizado
 * não tem padrão do sistema (nasce sempre em branco). Regra: true sempre
 * upsert; false só gera delete se já existia uma linha no banco (evita
 * escrever uma linha redundante quando nunca existiu override).
 */
export function planejarSalvamentoCustomizado(
  pendentes: Partial<Record<Acao, boolean>>,
  acoesComLinhaNoBanco: Set<Acao>,
): PlanoDeSalvamentoCustomizado {
  const upserts: { acao: Acao; permitido: boolean }[] = []
  const deletes: Acao[] = []

  for (const [acaoStr, permitido] of Object.entries(pendentes)) {
    const acao = acaoStr as Acao
    if (permitido) {
      upserts.push({ acao, permitido: true })
    } else if (acoesComLinhaNoBanco.has(acao)) {
      deletes.push(acao)
    }
  }

  return { upserts, deletes }
}
```

- [ ] **Step 4: Rodar o teste para confirmar que passa**

Run: `npx vitest run src/app/\(protected\)/configuracoes/_hooks/__tests__/permissoesMatrizHelpers.test.ts`
Expected: PASS

- [ ] **Step 5: Criar os hooks de CRUD**

Criar `src/app/(protected)/configuracoes/_hooks/usePerfisCustomizados.ts`:

```typescript
'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/auth/useAuth'
import { type Acao, type PerfilAcesso } from '@/types/auth'

/** Todos os perfis customizados da empresa (ativos e inativos) — a UI decide o que filtrar. */
export function usePerfisCustomizados() {
  const { usuario } = useAuth()

  return useQuery({
    queryKey: ['perfis-acesso', usuario?.empresa_id],
    queryFn: async (): Promise<PerfilAcesso[]> => {
      const { data, error } = await supabase
        .from('perfis_acesso')
        .select('*')
        .eq('empresa_id', usuario!.empresa_id)
        .order('nome')
      if (error) throw error
      return data ?? []
    },
    enabled: !!usuario,
    staleTime: 60_000,
  })
}

export function useCriarPerfilCustomizado() {
  const { usuario } = useAuth()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (nome: string): Promise<PerfilAcesso> => {
      const { data, error } = await supabase
        .from('perfis_acesso')
        .insert({ empresa_id: usuario!.empresa_id, nome, created_by: usuario!.id })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['perfis-acesso', usuario?.empresa_id] }),
  })
}

export function useRenomearPerfilCustomizado() {
  const { usuario } = useAuth()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, nome }: { id: string; nome: string }) => {
      const { error } = await supabase.from('perfis_acesso').update({ nome }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['perfis-acesso', usuario?.empresa_id] }),
  })
}

export function useDesativarPerfilCustomizado() {
  const { usuario } = useAuth()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('perfis_acesso').update({ ativo: false }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['perfis-acesso', usuario?.empresa_id] }),
  })
}

/** Matriz atual (linhas cruas) de um perfil customizado — usado pela tela de edição da matriz. */
export function useOverridesPerfilCustomizado(perfilCustomizadoId: string | null) {
  return useQuery({
    queryKey: ['perfil-customizado-permissoes', 'admin', perfilCustomizadoId],
    queryFn: async (): Promise<{ acao: Acao; permitido: boolean }[]> => {
      const { data, error } = await supabase
        .from('perfil_customizado_permissoes')
        .select('acao, permitido')
        .eq('perfil_customizado_id', perfilCustomizadoId!)
      if (error) throw error
      return data ?? []
    },
    enabled: !!perfilCustomizadoId,
    staleTime: 60_000,
  })
}

export function useSalvarPlanoCustomizado() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({
      perfilCustomizadoId, upserts, deletes,
    }: { perfilCustomizadoId: string; upserts: { acao: Acao; permitido: boolean }[]; deletes: Acao[] }) => {
      if (upserts.length > 0) {
        const { error } = await supabase
          .from('perfil_customizado_permissoes')
          .upsert(
            upserts.map((o) => ({
              perfil_customizado_id: perfilCustomizadoId,
              acao: o.acao,
              permitido: o.permitido,
              updated_at: new Date().toISOString(),
            })),
            { onConflict: 'perfil_customizado_id,acao' },
          )
        if (error) throw error
      }

      if (deletes.length > 0) {
        const { error } = await supabase
          .from('perfil_customizado_permissoes')
          .delete()
          .eq('perfil_customizado_id', perfilCustomizadoId)
          .in('acao', deletes)
        if (error) throw error
      }
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['perfil-customizado-permissoes', 'admin', variables.perfilCustomizadoId] })
      qc.invalidateQueries({ queryKey: ['perfil-customizado-permissoes', variables.perfilCustomizadoId] })
    },
  })
}
```

- [ ] **Step 6: Rodar `tsc`**

Run: `npx tsc --noEmit`

- [ ] **Step 7: Commit**

```bash
git add src/app/\(protected\)/configuracoes/_hooks/usePerfisCustomizados.ts src/app/\(protected\)/configuracoes/_hooks/permissoesMatrizHelpers.ts "src/app/(protected)/configuracoes/_hooks/__tests__/permissoesMatrizHelpers.test.ts"
git commit -m "feat: hooks de CRUD de perfis customizados e planejamento de salvamento da matriz"
```

---

## Task 10: `AuthContext`/`layout.tsx` passam a carregar `perfil_customizado_id`

**Files:**
- Modify: `src/contexts/AuthContext.tsx`
- Modify: `src/app/(protected)/layout.tsx`

**Interfaces:**
- Consumes: `SessaoUsuario.perfil_customizado_id` (Task 5).
- Produces: `useAuth().usuario.perfil_customizado_id` populado de verdade — necessário para `usePerfilPermissoes` (Task 8) resolver as próprias permissões de um usuário logado com perfil customizado.

- [ ] **Step 1: `src/contexts/AuthContext.tsx` — ampliar o select**

Trocar (linha ~56):

```typescript
      .select('id, empresa_id, perfil, nome, email, ativo')
```

por:

```typescript
      .select('id, empresa_id, perfil, perfil_customizado_id, nome, email, ativo')
```

- [ ] **Step 2: `src/app/(protected)/layout.tsx` — ampliar o select**

Trocar (linha 15):

```typescript
    .select('id, empresa_id, perfil, nome, email, ativo')
```

por:

```typescript
    .select('id, empresa_id, perfil, perfil_customizado_id, nome, email, ativo')
```

- [ ] **Step 3: Rodar `tsc`**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add src/contexts/AuthContext.tsx "src/app/(protected)/layout.tsx"
git commit -m "feat: carregar perfil_customizado_id na sessão do usuário logado"
```

---

## Task 11: Tela `Perfis de Acesso` — criar/renomear/desativar perfil customizado + editar matriz

**Files:**
- Modify: `src/app/(protected)/configuracoes/_components/perfis/PerfisPermissoesConfig.tsx`

**Interfaces:**
- Consumes: `usePerfisCustomizados`, `useCriarPerfilCustomizado`, `useRenomearPerfilCustomizado`, `useDesativarPerfilCustomizado`, `useOverridesPerfilCustomizado`, `useSalvarPlanoCustomizado` (Task 9); `planejarSalvamentoCustomizado` (Task 9); `resolverPermissao(..., perfilCustomizadoId)` (Task 7).
- Produces: fluxo completo de criação/edição de perfil customizado pela tela, ponta a ponta.

- [ ] **Step 1: Implementar**

O arquivo atual renderiza a matriz como uma `<table>` (não cards), tem
estado `isLoading`/`configuracaoIndisponivel` controlando o que aparece, e
já tem um `Dialog` de confirmação de "Restaurar padrão" no final. Preservar
essa estrutura — só adicionar: estado de seleção que aceita perfil fixo OU
customizado, os botões "Criar novo perfil"/"Renomear"/"Desativar", os 2
dialogs novos, e o branch de leitura/gravação da matriz customizada.

Substituir `src/app/(protected)/configuracoes/_components/perfis/PerfisPermissoesConfig.tsx` inteiro:

```typescript
'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel, SelectSeparator,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import { RotateCcw, Save, ShieldCheck, Lock, ShieldAlert, Plus, Pencil, PowerOff } from 'lucide-react'
import { useAuth } from '@/hooks/auth/useAuth'
import { PERFIS_ATIVOS, PERFIL_LABELS } from '@/types/configuracoes'
import { type Acao, type UsuarioPerfil } from '@/types/auth'
import { MODULOS, type ModuloDef, type AcaoModuloDef } from '@/lib/auth/modulos'
import { construirMapaOverrides, resolverPermissao } from '@/hooks/auth/permissaoResolver'
import {
  useOverridesEmpresa, useSalvarPlano, useRestaurarPadrao,
} from '../../_hooks/usePerfilPermissoesAdmin'
import { aplicarToggle, planejarSalvamento, planejarSalvamentoCustomizado } from '../../_hooks/permissoesMatrizHelpers'
import {
  usePerfisCustomizados, useCriarPerfilCustomizado, useRenomearPerfilCustomizado,
  useDesativarPerfilCustomizado, useOverridesPerfilCustomizado, useSalvarPlanoCustomizado,
} from '../../_hooks/usePerfisCustomizados'

const PERFIS_EDITAVEIS = PERFIS_ATIVOS.filter((p) => p !== 'admin')

/** Seleção do dropdown: um dos 7 perfis fixos, ou o id de um perfil customizado. */
type SelecaoPerfil = { tipo: 'fixo'; perfil: UsuarioPerfil } | { tipo: 'customizado'; id: string }

export function PerfisPermissoesConfig() {
  const { usuario } = useAuth()

  // Subseção exclusiva de Admin — checagem fixa, não reaproveita usuarios.convidar
  // nem cria uma ação nova. Gestor continua acessando o resto de Configurações
  // normalmente (matriz já concede configuracoes.ver a ele); só esta tela é bloqueada.
  if (usuario?.perfil !== 'admin') {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
        <ShieldAlert className="h-8 w-8 text-gray-300" />
        <p className="text-sm text-gray-500">Esta seção é exclusiva para o perfil Administrador.</p>
      </div>
    )
  }

  return <PerfisPermissoesConfigInner />
}

function PerfisPermissoesConfigInner() {
  const [selecao, setSelecao] = useState<SelecaoPerfil>({ tipo: 'fixo', perfil: PERFIS_EDITAVEIS[0] })
  const [pendentes, setPendentes] = useState<Partial<Record<Acao, boolean>>>({})
  const [confirmandoRestaurar, setConfirmandoRestaurar] = useState(false)
  const [confirmandoDesativar, setConfirmandoDesativar] = useState(false)
  const [dialogCriar, setDialogCriar] = useState(false)
  const [dialogRenomear, setDialogRenomear] = useState(false)
  const [nomeNovoPerfil, setNomeNovoPerfil] = useState('')

  const { data: rows = [], isLoading, error: erroCarregarOverrides } = useOverridesEmpresa()
  const salvar = useSalvarPlano()
  const restaurar = useRestaurarPadrao()

  const { data: perfisCustomizados = [] } = usePerfisCustomizados()
  const perfisCustomizadosAtivos = perfisCustomizados.filter((p) => p.ativo)
  const criarPerfil = useCriarPerfilCustomizado()
  const renomearPerfil = useRenomearPerfilCustomizado()
  const desativarPerfil = useDesativarPerfilCustomizado()
  const salvarCustomizado = useSalvarPlanoCustomizado()

  const perfilCustomizadoIdSelecionado = selecao.tipo === 'customizado' ? selecao.id : null
  const perfilCustomizadoSelecionado = perfisCustomizados.find((p) => p.id === perfilCustomizadoIdSelecionado) ?? null
  const { data: rowsCustomizado = [] } = useOverridesPerfilCustomizado(perfilCustomizadoIdSelecionado)

  // Se a tabela perfil_permissoes ainda não existir (migration não aplicada), a busca
  // falha — Sidebar/RouteGuard continuam funcionando normalmente (caem no padrão do
  // código), mas esta tela precisa avisar em vez de parecer que está tudo normal e só
  // falhar de forma confusa quando o admin tentar salvar.
  const configuracaoIndisponivel = !!erroCarregarOverrides

  const isAdminSelecionado = selecao.tipo === 'fixo' && selecao.perfil === 'admin'
  const overridesMap = useMemo(() => construirMapaOverrides(rows), [rows])
  const overridesCustomizadoMap = useMemo(
    () => construirMapaOverrides(rowsCustomizado.map((r) => ({ perfil: `customizado:${perfilCustomizadoIdSelecionado}`, acao: r.acao, permitido: r.permitido }))),
    [rowsCustomizado, perfilCustomizadoIdSelecionado],
  )
  const acoesComLinhaNoBanco = useMemo(() => new Set(rowsCustomizado.map((r) => r.acao)), [rowsCustomizado])

  function valorEfetivo(acao: Acao): boolean {
    if (isAdminSelecionado) return true
    if (acao in pendentes) return pendentes[acao]!
    if (selecao.tipo === 'customizado') {
      return resolverPermissao('customizado', acao, overridesCustomizadoMap, undefined, selecao.id)
    }
    return resolverPermissao(selecao.perfil, acao, overridesMap)
  }

  function confirmarTrocaSeNecessario(): boolean {
    if (Object.keys(pendentes).length === 0) return true
    return window.confirm('Você tem alterações não salvas. Trocar de perfil descarta essas alterações. Continuar?')
  }

  function trocarPerfilFixo(perfil: UsuarioPerfil) {
    if (!confirmarTrocaSeNecessario()) return
    setSelecao({ tipo: 'fixo', perfil })
    setPendentes({})
  }

  function trocarPerfilCustomizado(id: string) {
    if (!confirmarTrocaSeNecessario()) return
    setSelecao({ tipo: 'customizado', id })
    setPendentes({})
  }

  function onSelectChange(valor: string) {
    const customizado = perfisCustomizados.find((p) => p.id === valor)
    if (customizado) {
      trocarPerfilCustomizado(customizado.id)
    } else {
      trocarPerfilFixo(valor as UsuarioPerfil)
    }
  }

  function toggle(modulo: ModuloDef, acaoDef: AcaoModuloDef) {
    if (isAdminSelecionado) return
    setPendentes((prev) => aplicarToggle(modulo, acaoDef, valorEfetivo, prev))
  }

  async function handleSalvar() {
    try {
      if (selecao.tipo === 'customizado') {
        const plano = planejarSalvamentoCustomizado(pendentes, acoesComLinhaNoBanco)
        await salvarCustomizado.mutateAsync({ perfilCustomizadoId: selecao.id, upserts: plano.upserts, deletes: plano.deletes })
        setPendentes({})
        toast.success(`Permissões de ${perfilCustomizadoSelecionado?.nome} salvas.`)
      } else {
        const plano = planejarSalvamento(pendentes, selecao.perfil, overridesMap)
        await salvar.mutateAsync({ perfil: selecao.perfil, upserts: plano.upserts, deletes: plano.deletes })
        setPendentes({})
        toast.success(`Permissões de ${PERFIL_LABELS[selecao.perfil]} salvas.`)
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao salvar permissões.')
    }
  }

  async function handleRestaurar() {
    if (selecao.tipo !== 'fixo') return
    try {
      await restaurar.mutateAsync(selecao.perfil)
      setPendentes({})
      setConfirmandoRestaurar(false)
      toast.success(`Permissões de ${PERFIL_LABELS[selecao.perfil]} restauradas para o padrão.`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao restaurar padrão.')
    }
  }

  async function handleCriarPerfil() {
    const nome = nomeNovoPerfil.trim()
    if (!nome) return
    try {
      const novo = await criarPerfil.mutateAsync(nome)
      setDialogCriar(false)
      setNomeNovoPerfil('')
      setSelecao({ tipo: 'customizado', id: novo.id })
      setPendentes({})
      toast.success(`Perfil "${nome}" criado.`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao criar perfil.')
    }
  }

  async function handleRenomearPerfil() {
    if (selecao.tipo !== 'customizado') return
    const nome = nomeNovoPerfil.trim()
    if (!nome) return
    try {
      await renomearPerfil.mutateAsync({ id: selecao.id, nome })
      setDialogRenomear(false)
      setNomeNovoPerfil('')
      toast.success('Perfil renomeado.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao renomear perfil.')
    }
  }

  async function handleDesativarPerfil() {
    if (selecao.tipo !== 'customizado') return
    try {
      await desativarPerfil.mutateAsync(selecao.id)
      setConfirmandoDesativar(false)
      setSelecao({ tipo: 'fixo', perfil: PERFIS_EDITAVEIS[0] })
      setPendentes({})
      toast.success('Perfil desativado.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao desativar perfil.')
    }
  }

  const haAlteracoes = Object.keys(pendentes).length > 0
  const valorSelectAtual = selecao.tipo === 'fixo' ? selecao.perfil : selecao.id

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <label className="text-sm text-gray-600 shrink-0">Perfil</label>
        <Select value={valorSelectAtual} onValueChange={onSelectChange}>
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {PERFIS_ATIVOS.map((p) => (
                <SelectItem key={p} value={p}>{PERFIL_LABELS[p]}</SelectItem>
              ))}
            </SelectGroup>
            {perfisCustomizadosAtivos.length > 0 && (
              <>
                <SelectSeparator />
                <SelectGroup>
                  <SelectLabel>Perfis customizados</SelectLabel>
                  {perfisCustomizadosAtivos.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                  ))}
                </SelectGroup>
              </>
            )}
          </SelectContent>
        </Select>

        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { setNomeNovoPerfil(''); setDialogCriar(true) }}>
          <Plus className="h-3.5 w-3.5" />
          Criar novo perfil
        </Button>

        {selecao.tipo === 'customizado' && (
          <>
            <Button
              size="sm" variant="outline" className="gap-1.5"
              onClick={() => { setNomeNovoPerfil(perfilCustomizadoSelecionado?.nome ?? ''); setDialogRenomear(true) }}
            >
              <Pencil className="h-3.5 w-3.5" />
              Renomear
            </Button>
            <Button
              size="sm" variant="outline" className="gap-1.5 text-red-600 hover:text-red-700"
              onClick={() => setConfirmandoDesativar(true)}
            >
              <PowerOff className="h-3.5 w-3.5" />
              Desativar
            </Button>
          </>
        )}

        <div className="ml-auto flex items-center gap-2">
          {selecao.tipo === 'fixo' && !isAdminSelecionado && (
            <Button
              variant="outline" size="sm"
              onClick={() => setConfirmandoRestaurar(true)}
              disabled={restaurar.isPending || configuracaoIndisponivel}
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
              Restaurar padrão
            </Button>
          )}
          {!isAdminSelecionado && (
            <Button
              size="sm"
              onClick={handleSalvar}
              disabled={!haAlteracoes || salvar.isPending || salvarCustomizado.isPending || configuracaoIndisponivel}
            >
              <Save className="h-3.5 w-3.5 mr-1.5" />
              Salvar alterações
            </Button>
          )}
        </div>
      </div>

      {configuracaoIndisponivel && (
        <p className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
          A configuração de Perfis de Acesso ainda não está disponível nesta empresa (a migration da tabela de permissões
          ainda não foi aplicada). O sistema continua funcionando normalmente com as permissões padrão — assim que a
          migration for aplicada, esta tela passa a permitir personalizar por perfil.
        </p>
      )}

      {isAdminSelecionado && !configuracaoIndisponivel && (
        <p className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
          Admin sempre possui acesso total — não é editável nesta tela.
        </p>
      )}

      {selecao.tipo === 'customizado' && !isAdminSelecionado && !configuracaoIndisponivel && (
        <p className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
          Perfil customizado — nasce sem nenhum acesso. Marque abaixo o que este perfil deve ver/fazer.
        </p>
      )}

      {isLoading ? (
        <p className="text-sm text-gray-400">Carregando...</p>
      ) : (
        <div className="rounded-xl border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs text-gray-500">
                <th className="px-4 py-2 font-medium">Módulo</th>
                <th className="px-4 py-2 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {MODULOS.map((modulo) => (
                <tr key={modulo.key}>
                  <td className="px-4 py-3 align-top text-gray-700 font-medium whitespace-nowrap">
                    {modulo.label}
                    {modulo.travado && (
                      <span className="ml-1.5 inline-flex items-center gap-1 text-[10px] text-gray-400 font-normal">
                        <Lock className="h-3 w-3" /> sempre visível
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-x-5 gap-y-2">
                      {modulo.acoes.map((acaoDef) => {
                        const bloqueado = modulo.travado || isAdminSelecionado || acaoDef.configuravel === false
                        const marcado = modulo.travado ? true : valorEfetivo(acaoDef.acao)
                        return (
                          <label
                            key={acaoDef.acao}
                            title={acaoDef.motivoBloqueio}
                            className={`flex items-center gap-1.5 text-xs ${bloqueado ? 'text-gray-400' : 'text-gray-700 cursor-pointer'}`}
                          >
                            <Checkbox
                              checked={marcado}
                              disabled={bloqueado}
                              onCheckedChange={() => toggle(modulo, acaoDef)}
                            />
                            {acaoDef.label}
                            {acaoDef.configuravel === false && (
                              <Lock className="h-3 w-3 text-gray-300" />
                            )}
                          </label>
                        )
                      })}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={dialogCriar} onOpenChange={setDialogCriar}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Criar novo perfil de acesso</DialogTitle>
            <DialogDescription>O perfil nasce sem nenhum acesso — você marca manualmente o que ele pode fazer, logo em seguida.</DialogDescription>
          </DialogHeader>
          <Input placeholder="Ex: Externo" value={nomeNovoPerfil} onChange={(e) => setNomeNovoPerfil(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogCriar(false)}>Cancelar</Button>
            <Button onClick={handleCriarPerfil} disabled={!nomeNovoPerfil.trim() || criarPerfil.isPending}>Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogRenomear} onOpenChange={setDialogRenomear}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Renomear perfil</DialogTitle>
          </DialogHeader>
          <Input placeholder="Nome do perfil" value={nomeNovoPerfil} onChange={(e) => setNomeNovoPerfil(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogRenomear(false)}>Cancelar</Button>
            <Button onClick={handleRenomearPerfil} disabled={!nomeNovoPerfil.trim() || renomearPerfil.isPending}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmandoDesativar} onOpenChange={setConfirmandoDesativar}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Desativar perfil "{perfilCustomizadoSelecionado?.nome}"?</DialogTitle>
            <DialogDescription>
              Usuários já vinculados a este perfil continuam funcionando normalmente. O perfil só some da lista para novos cadastros/convites.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmandoDesativar(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDesativarPerfil} disabled={desativarPerfil.isPending}>Desativar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmandoRestaurar} onOpenChange={setConfirmandoRestaurar}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Restaurar padrão de {selecao.tipo === 'fixo' ? PERFIL_LABELS[selecao.perfil] : ''}</DialogTitle>
            <DialogDescription>
              Isso apaga todas as personalizações feitas para este perfil nesta empresa — volta a usar a matriz padrão
              do sistema. Outros perfis e outras empresas não são afetados. Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmandoRestaurar(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleRestaurar} disabled={restaurar.isPending}>
              Restaurar padrão
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
```

- [ ] **Step 2: Rodar `tsc`**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Testar manualmente no navegador**

Rodar `npm run dev`, acessar `Configurações → Perfis de Acesso` como admin:
1. Clicar "+ Criar novo perfil", digitar "Externo", confirmar → perfil aparece selecionado, matriz toda desmarcada.
2. Marcar "Ver" em Captação → salvar → recarregar a página → confirmar que o checkbox continua marcado.
3. Renomear o perfil para "Parceiro Externo" → confirmar que o nome atualiza no dropdown.
4. Trocar para outro perfil fixo (ex: Comercial) → confirmar que "Restaurar padrão" volta a aparecer e a matriz mostra os valores do Comercial (não os do perfil customizado).
5. Voltar para "Parceiro Externo" → Desativar → confirmar que some do dropdown.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(protected)/configuracoes/_components/perfis/PerfisPermissoesConfig.tsx"
git commit -m "feat: criar/renomear/desativar perfil customizado e editar sua matriz na tela Perfis de Acesso"
```

---

## Task 12: `UsuarioFormDrawer` — cadastro/edição de usuário aceita perfil customizado

**Files:**
- Modify: `src/app/(protected)/configuracoes/_components/usuarios/UsuarioFormDrawer.tsx`
- Modify: `src/app/(protected)/configuracoes/_hooks/useUsuarios.ts`

**Interfaces:**
- Consumes: `usePerfisCustomizados` (Task 9).
- Produces: seletor de perfil no formulário de usuário lista perfis customizados ativos; `useCriarUsuario`/`useAtualizarUsuario` aceitam `perfil_customizado_id`.

- [ ] **Step 1: `useUsuarios.ts` — aceitar `perfil_customizado_id` nas mutations**

Em `src/app/(protected)/configuracoes/_hooks/useUsuarios.ts`, no payload de `useCriarUsuario` (linha ~33-42), adicionar campo:

```typescript
    mutationFn: async (payload: {
      nome: string
      email: string
      senha: string
      perfil: UsuarioPerfil
      perfil_customizado_id: string | null
      tipo_usuario: UsuarioTipo
      funcao: string | null
      cargo_id: string | null
      ativo: boolean
    }) => {
```

E no payload de `useAtualizarUsuario` (linha ~60-70):

```typescript
    mutationFn: async (payload: {
      id: string
      nome?: string
      perfil?: UsuarioPerfil
      perfil_customizado_id?: string | null
      tipo_usuario?: UsuarioTipo
      funcao?: string | null
      cargo_id?: string | null
      ativo?: boolean
      telefone_whatsapp?: string | null
      email?: string
    }) => {
```

(As rotas `/api/admin/usuarios` e `/api/admin/usuarios/[id]` já fazem `INSERT`/`UPDATE` genérico repassando o body — confirmar isso na Task 14; se alguma dessas rotas filtrar campos explicitamente por allowlist, ela também precisa aceitar `perfil_customizado_id`.)

- [ ] **Step 2: `UsuarioFormDrawer.tsx` — seletor com grupo de perfis customizados**

Adicionar o import do hook, logo abaixo dos imports existentes:

```typescript
import { usePerfisCustomizados } from '../../_hooks/usePerfisCustomizados'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel, SelectSeparator,
} from '@/components/ui/select'
```

(substituindo o import de `Select`/`SelectContent`/`SelectItem`/`SelectTrigger`/`SelectValue` já existente na linha 13-15 por essa versão ampliada com `SelectGroup`/`SelectLabel`/`SelectSeparator`.)

Dentro do componente, logo após a linha `const { data: cargos = [] } = useCargos()`:

```typescript
  const { data: perfisCustomizados = [] } = usePerfisCustomizados()
  const perfisCustomizadosAtivos = perfisCustomizados.filter((p) => p.ativo)
```

No `useEffect` de reset do form em modo edição (linha ~114-125), trocar a linha do `perfil`:

```typescript
          perfil: usuario.perfil === 'customizado'
            ? (usuario.perfil_customizado_id ?? 'comercial')
            : (PERFIS_ATIVOS.includes(usuario.perfil) ? usuario.perfil : 'comercial' as UsuarioPerfil),
```

(O campo `perfil` do formulário passa a guardar ou um valor do enum, ou o
uuid de um perfil customizado — resolvido de volta em `onSubmit`, ver Step
3. Isso mantém o restante do formulário — validação zod, `field.value` —
igual, só muda o *significado* do valor quando ele bate com um id de perfil
customizado.)

O `SelectContent` do campo `perfil` (linha 287-291) passa a ser:

```typescript
                      <SelectContent>
                        <SelectGroup>
                          {PERFIS_ATIVOS.map((p) => (
                            <SelectItem key={p} value={p}>{PERFIL_LABELS[p]}</SelectItem>
                          ))}
                        </SelectGroup>
                        {perfisCustomizadosAtivos.length > 0 && (
                          <>
                            <SelectSeparator />
                            <SelectGroup>
                              <SelectLabel>Perfis customizados</SelectLabel>
                              {perfisCustomizadosAtivos.map((p) => (
                                <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                              ))}
                            </SelectGroup>
                          </>
                        )}
                      </SelectContent>
```

- [ ] **Step 3: `onSubmit` — traduzir o valor do select de volta para `perfil`+`perfil_customizado_id`**

No início de `onSubmit` (logo após `const cargoSelecionado = ...`), adicionar:

```typescript
    const perfilCustomizadoEscolhido = perfisCustomizados.find((p) => p.id === data.perfil)
    const perfilFinal: UsuarioPerfil = perfilCustomizadoEscolhido ? 'customizado' : data.perfil
    const perfilCustomizadoIdFinal = perfilCustomizadoEscolhido ? perfilCustomizadoEscolhido.id : null
```

E trocar `perfil: data.perfil` por `perfil: perfilFinal, perfil_customizado_id: perfilCustomizadoIdFinal` nas duas chamadas (`atualizarUsuario.mutateAsync` e `criarUsuario.mutateAsync`).

- [ ] **Step 4: Rodar `tsc`**

Run: `npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add "src/app/(protected)/configuracoes/_components/usuarios/UsuarioFormDrawer.tsx" "src/app/(protected)/configuracoes/_hooks/useUsuarios.ts"
git commit -m "feat: cadastro/edição de usuário aceita perfil customizado"
```

---

## Task 13: Rotas de API `admin/usuarios` aceitam `perfil_customizado_id`

**Files:**
- Modify: `src/app/api/admin/usuarios/route.ts` (POST)
- Modify: `src/app/api/admin/usuarios/[id]/route.ts` (PUT)

**Interfaces:**
- Consumes: payload de `useCriarUsuario`/`useAtualizarUsuario` (Task 12), agora incluindo `perfil_customizado_id`.
- Produces: `INSERT`/`UPDATE` de `usuarios` persistindo `perfil_customizado_id`.

- [ ] **Step 1: Ler as rotas atuais**

Antes de editar, ler `src/app/api/admin/usuarios/route.ts` e
`src/app/api/admin/usuarios/[id]/route.ts` para confirmar como o body é
repassado ao `insert`/`update` do Supabase — se for um spread genérico do
body (`.insert({ ...body, empresa_id })` ou similar), `perfil_customizado_id`
já passa automaticamente e este Task vira só uma validação (Step 2, sem
alteração de código). Se houver uma allowlist explícita de campos
(`{ nome: body.nome, perfil: body.perfil, ... }`), adicionar
`perfil_customizado_id: body.perfil_customizado_id ?? null` a essa lista em
ambas as rotas.

- [ ] **Step 2: Rodar `tsc`**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Testar manualmente**

Criar um usuário novo pela tela com o perfil customizado "Externo" (criado na
Task 11) → confirmar no Supabase (Table Editor) que a linha em `usuarios` tem
`perfil='customizado'` e `perfil_customizado_id` preenchido com o id certo.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/admin/usuarios/route.ts "src/app/api/admin/usuarios/[id]/route.ts"
git commit -m "feat: rotas admin/usuarios persistem perfil_customizado_id"
```

(Se o Step 1 confirmar que nenhuma mudança de código foi necessária —
spread genérico já cobre o campo novo — pular o commit deste Task e seguir
direto para o Task 14, deixando uma nota no relatório final do Task.)

---

## Task 14: `ConviteFormDrawer` — convite aceita perfil customizado

**Files:**
- Modify: `src/components/auth/ConviteFormDrawer.tsx`
- Modify: `src/hooks/auth/useConvites.ts`

**Interfaces:**
- Consumes: `usePerfisCustomizados` (Task 9).
- Produces: seletor de perfil do convite lista perfis customizados ativos; `useCriarConvite` grava `perfil_customizado_id`.

- [ ] **Step 1: `useConvites.ts` — `useCriarConvite` aceita `perfil_customizado_id`**

Em `src/hooks/auth/useConvites.ts`, trocar a interface `CriarConviteInput` (linha 25-28):

```typescript
interface CriarConviteInput {
  email: string
  perfil: UsuarioPerfil
  perfil_customizado_id: string | null
}
```

E no `insert` (linha 42-49), adicionar `perfil_customizado_id: input.perfil_customizado_id`:

```typescript
      const { data, error } = await supabase
        .from('convites')
        .insert({
          email: input.email,
          perfil: input.perfil,
          perfil_customizado_id: input.perfil_customizado_id,
          empresa_id: usuario.empresa_id,
          criado_por: usuario.id,
        })
        .select()
        .single()
```

- [ ] **Step 2: `ConviteFormDrawer.tsx` — seletor com grupo de perfis customizados**

Trocar o schema (linha 21-30) — o campo `perfil` passa a aceitar tanto os
enums fixos quanto um uuid de perfil customizado (validação de formato fica
solta, `min(1)`, igual ao padrão já usado em `UsuarioFormDrawer`):

```typescript
const schema = z.object({
  email: z.string().email('E-mail inválido'),
  perfil: z.string().min(1, 'Selecione um perfil'),
})
```

Adicionar o import do hook e dos componentes de Select ampliados:

```typescript
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel, SelectSeparator,
} from '@/components/ui/select'
import { usePerfisCustomizados } from '@/app/(protected)/configuracoes/_hooks/usePerfisCustomizados'
```

Dentro do componente `ConviteFormDrawer`, logo após `const criarConvite = useCriarConvite()`:

```typescript
  const { data: perfisCustomizados = [] } = usePerfisCustomizados()
  const perfisCustomizadosAtivos = perfisCustomizados.filter((p) => p.ativo)
```

Trocar o `SelectContent` do campo `perfil` (linha 91-98):

```typescript
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="gestor">Gestor</SelectItem>
                        <SelectItem value="comercial">Comercial</SelectItem>
                        <SelectItem value="operacional">Operacional</SelectItem>
                        <SelectItem value="juridico">Jurídico</SelectItem>
                        <SelectItem value="apoio">Apoio</SelectItem>
                      </SelectGroup>
                      {perfisCustomizadosAtivos.length > 0 && (
                        <>
                          <SelectSeparator />
                          <SelectGroup>
                            <SelectLabel>Perfis customizados</SelectLabel>
                            {perfisCustomizadosAtivos.map((p) => (
                              <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>
                            ))}
                          </SelectGroup>
                        </>
                      )}
                    </SelectContent>
```

Trocar `onSubmit`:

```typescript
  async function onSubmit(data: FormData) {
    const perfilCustomizadoEscolhido = perfisCustomizados.find((p) => p.id === data.perfil)
    await criarConvite.mutateAsync({
      email: data.email,
      perfil: perfilCustomizadoEscolhido ? 'customizado' : (data.perfil as UsuarioPerfil),
      perfil_customizado_id: perfilCustomizadoEscolhido ? perfilCustomizadoEscolhido.id : null,
    })
    form.reset()
    setAberto(false)
  }
```

(Adicionar `import { type UsuarioPerfil } from '@/types/auth'` no topo, se
ainda não importado.)

- [ ] **Step 3: Rodar `tsc`**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add src/components/auth/ConviteFormDrawer.tsx src/hooks/auth/useConvites.ts
git commit -m "feat: convite de novo membro aceita perfil customizado"
```

---

## Task 15: Exibição do nome do perfil customizado nos badges

**Files:**
- Modify: `src/components/auth/UsuarioPerfilBadge.tsx`
- Modify: `src/app/(protected)/configuracoes/equipe/page.tsx`
- Modify: `src/app/(protected)/configuracoes/_components/usuarios/UsuariosLista.tsx`

**Interfaces:**
- Consumes: `usePerfisCustomizados` (Task 9).
- Produces: badges de perfil mostram o nome real do perfil customizado (não o literal `'customizado'` nem `undefined`) em toda tela que hoje exibe perfil de usuário/convite.

- [ ] **Step 1: `UsuarioPerfilBadge.tsx` — aceitar nome customizado + fallback seguro**

Substituir o arquivo inteiro:

```typescript
import { type UsuarioPerfil } from '@/types/auth'
import { Badge } from '@/components/ui/badge'

const CORES: Record<UsuarioPerfil, string> = {
  admin:       'bg-fonti-primary text-white',
  gerente:     'bg-fonti-accent text-fonti-primary',
  gestor:      'bg-fonti-accent text-fonti-primary',
  analista:    'bg-blue-100 text-blue-800',
  comercial:   'bg-green-100 text-green-800',
  operacional: 'bg-orange-100 text-orange-800',
  juridico:    'bg-purple-100 text-purple-800',
  apoio:       'bg-gray-100 text-gray-700',
  assistente:  'bg-amber-100 text-amber-800',
  consultor:   'bg-gray-100 text-gray-700',
  cliente:     'bg-purple-100 text-purple-800',
  customizado: 'bg-slate-100 text-slate-700',
}

const LABELS: Record<UsuarioPerfil, string> = {
  admin:       'Admin',
  gerente:     'Gerente',
  gestor:      'Gestor',
  analista:    'Analista',
  comercial:   'Comercial',
  operacional: 'Operacional',
  juridico:    'Jurídico',
  apoio:       'Apoio',
  assistente:  'Assistente',
  consultor:   'Consultor',
  cliente:     'Cliente',
  customizado: 'Personalizado',
}

interface Props {
  perfil: UsuarioPerfil
  /** Nome real do perfil customizado — obrigatório para exibir corretamente quando perfil === 'customizado'; sem ele, cai no label genérico "Personalizado". */
  nomeCustomizado?: string | null
}

export function UsuarioPerfilBadge({ perfil, nomeCustomizado }: Props) {
  const label = perfil === 'customizado' && nomeCustomizado ? nomeCustomizado : LABELS[perfil]
  return (
    <Badge className={`text-xs font-medium ${CORES[perfil]}`}>
      {label}
    </Badge>
  )
}
```

- [ ] **Step 2: `equipe/page.tsx` — resolver e passar o nome customizado**

Adicionar o import:

```typescript
import { usePerfisCustomizados } from '@/app/(protected)/configuracoes/_hooks/usePerfisCustomizados'
```

Dentro do componente de página (junto às outras chamadas de hook, próximo a
`useUsuariosEquipe()`/`useConvites()`):

```typescript
  const { data: perfisCustomizados = [] } = usePerfisCustomizados()
  const nomePerfilCustomizado = (id: string | null) => perfisCustomizados.find((p) => p.id === id)?.nome ?? null
```

Trocar as duas linhas de uso do badge:

```typescript
                        <UsuarioPerfilBadge perfil={u.perfil} nomeCustomizado={nomePerfilCustomizado(u.perfil_customizado_id)} />
```

```typescript
                        <UsuarioPerfilBadge perfil={c.perfil} nomeCustomizado={nomePerfilCustomizado(c.perfil_customizado_id)} />
```

- [ ] **Step 3: `UsuariosLista.tsx` — trocar o badge inline pelo componente compartilhado**

Hoje este arquivo não usa `UsuarioPerfilBadge` — renderiza o badge inline
direto com `PERFIL_LABELS`/`PERFIL_CORES` (linhas 134-138). Trocar para
reaproveitar o componente compartilhado (evita manter um 3º lugar com a
mesma lógica de fallback):

Adicionar o import:

```typescript
import { UsuarioPerfilBadge } from '@/components/auth/UsuarioPerfilBadge'
import { usePerfisCustomizados } from '../../_hooks/usePerfisCustomizados'
```

Dentro do componente `UsuariosLista`, junto às outras chamadas de hook:

```typescript
  const { data: perfisCustomizados = [] } = usePerfisCustomizados()
```

Trocar o bloco (linhas 134-138):

```typescript
                {/* Perfil */}
                <div className="min-w-0">
                  <Badge className={cn('text-[11px] font-medium', PERFIL_CORES[u.perfil] ?? 'bg-gray-100 text-gray-600')}>
                    {PERFIL_LABELS[u.perfil] ?? u.perfil}
                  </Badge>
                </div>
```

por:

```typescript
                {/* Perfil */}
                <div className="min-w-0">
                  <UsuarioPerfilBadge
                    perfil={u.perfil}
                    nomeCustomizado={perfisCustomizados.find((p) => p.id === u.perfil_customizado_id)?.nome}
                  />
                </div>
```

(`PERFIL_CORES`/`PERFIL_LABELS` continuam importados no topo do arquivo —
usados em outro lugar do componente — não remover o import se ainda houver
uso; conferir com `tsc`/lint no Step 4.)

- [ ] **Step 4: Rodar `tsc`**

Run: `npx tsc --noEmit`

- [ ] **Step 5: Testar manualmente no navegador**

Com o usuário "Externo" criado nas tasks anteriores: abrir
`Configurações → Equipe` e `Configurações → Usuários` (as duas telas) →
confirmar que o badge de perfil mostra "Externo" (ou o nome escolhido), não
"customizado" nem vazio.

- [ ] **Step 6: Commit**

```bash
git add src/components/auth/UsuarioPerfilBadge.tsx "src/app/(protected)/configuracoes/equipe/page.tsx" "src/app/(protected)/configuracoes/_components/usuarios/UsuariosLista.tsx"
git commit -m "feat: badges de perfil exibem o nome do perfil customizado"
```

---

## Task 16: Verificação final ponta a ponta

**Files:** nenhum (só validação)

- [ ] **Step 1: Suíte completa**

Run: `npx tsc --noEmit && npm run test`
Expected: ambos limpos.

- [ ] **Step 2: QA manual completo (fluxo real do caso de uso "Externo")**

1. Como admin, `Configurações → Perfis de Acesso` → criar perfil "Externo".
2. Marcar só `leads.ver` e `leads.criar` (Captação) na matriz → salvar.
3. `Configurações → Usuários` → criar um usuário novo com perfil "Externo".
4. Logar como esse usuário (ou usar sessão incógnita) → confirmar:
   - Só enxerga o módulo Captação na Sidebar (mais Dashboard, que é sempre visível).
   - Consegue ver e criar leads.
   - **Não** consegue ver todos os leads da equipe (`leads.ver_todas` deve ser `false` — sem o bypass que perfis fixos como Comercial/Gestor têm).
   - Não consegue acessar Configurações, Negócios, RH, Financeiro, etc.
5. Voltar como admin → editar o perfil "Externo", desmarcar `leads.criar` → salvar → confirmar que o usuário Externo perde a permissão de criar lead (sem precisar deslogar — `usePerfilPermissoes` já revalida via React Query).
6. Enviar um convite novo com o perfil "Externo" → confirmar que o convite é criado com o perfil certo (Table Editor: `convites.perfil='customizado'`, `perfil_customizado_id` preenchido).
7. Desativar o perfil "Externo" → confirmar que ele some do seletor de novo usuário/convite, mas o usuário já criado continua ativo e com as mesmas permissões.

- [ ] **Step 3: Reportar ao usuário**

Resumir o que foi testado e pedir para o usuário validar o fluxo em produção
(criar o perfil "Externo" de verdade e testar com um usuário real, já que o
caso de uso concreto era parceiro/indicador externo).
