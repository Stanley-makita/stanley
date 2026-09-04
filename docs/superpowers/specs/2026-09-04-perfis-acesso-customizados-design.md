# Perfis de Acesso Customizados — Design

Data: 2026-09-04

## Objetivo

Hoje `Configurações → Perfis de Acesso` só permite editar a matriz de
permissões dos 7 perfis fixos (Administrador, Gestor, Comercial, Operacional,
Jurídico, Apoio, Assistente). O pedido é poder **criar perfis novos pela
tela**, com nome próprio (ex: "Externo", pensado para parceiros/indicadores
externos), nascendo com a matriz em branco (nenhum acesso, igual ao
Assistente hoje) para o admin liberar módulo por módulo manualmente.

## Não-objetivos

- Não altera nenhum dos 7 perfis fixos nem as regras de RLS/hardcode
  associadas a eles (`comercial`, `gestor`, `apoio`, `gerente`, `admin` como
  literais continuam existindo exatamente como hoje).
- Não resolve a dívida técnica pré-existente e já documentada em
  `docs/permissoes.md` (rotas server-side que ainda não consultam
  `perfil_permissoes`) — perfis customizados herdam a mesma limitação
  conhecida, sem tentativa de correção aqui.
- Não modela expiração de acesso, múltiplos "comportamentos base" (ex:
  ownership como Comercial) nem qualquer campo além de nome — confirmado
  com o usuário que todo perfil customizado nasce em branco, sem bypass
  especial.
- Não permite exclusão definitiva de um perfil customizado — só desativação
  (soft-delete), para não quebrar usuários já vinculados.

## Modelo de dados

### Tabela nova `perfis_acesso`

```sql
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
```

RLS: SELECT liberado para qualquer usuário ativo da própria empresa
(necessário para os dropdowns de cadastro/convite); INSERT/UPDATE restritos
a `admin` da própria empresa — mesmo padrão já usado em `perfil_permissoes`.
Não existe DELETE via RLS (desativação é um UPDATE em `ativo`).

### Tabela nova `perfil_customizado_permissoes`

Espelha `perfil_permissoes`, mas chaveada pelo id do perfil customizado em
vez do enum:

```sql
CREATE TABLE perfil_customizado_permissoes (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  perfil_customizado_id UUID        NOT NULL REFERENCES perfis_acesso(id) ON DELETE CASCADE,
  acao                  TEXT        NOT NULL,
  permitido             BOOLEAN     NOT NULL DEFAULT false,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (perfil_customizado_id, acao)
);
```

RLS via join em `perfis_acesso` (mesma empresa do usuário logado para
SELECT; INSERT/UPDATE/DELETE só se o admin logado pertence à mesma empresa
do perfil). Ausência de linha para uma ação = `false` (nunca existe
fallback "padrão do sistema" para perfil customizado — o próprio conceito é
nascer em branco).

### Enum `usuario_perfil`

Ganha **um único valor novo**: `'customizado'`. Todo usuário/convite com
perfil customizado usa esse valor no enum — o nome real fica em
`perfis_acesso.nome`. Nenhum perfil novo exige `ALTER TYPE` de novo.

```sql
ALTER TYPE usuario_perfil ADD VALUE IF NOT EXISTS 'customizado';
```

> Nota de execução: `ALTER TYPE ... ADD VALUE` não pode ser usado no mesmo
> bloco de transação em que o valor novo é referenciado (restrição do
> Postgres). Por isso este `ALTER TYPE` vai em migration própria, isolada,
> antes de qualquer outra migration desta feature que use o literal
> `'customizado'`.

### `usuarios` e `convites`

Ambas ganham coluna nova:

```sql
ALTER TABLE usuarios  ADD COLUMN perfil_customizado_id UUID REFERENCES perfis_acesso(id);
ALTER TABLE convites  ADD COLUMN perfil_customizado_id UUID REFERENCES perfis_acesso(id);
```

Só é preenchida quando `perfil = 'customizado'`. Não há CHECK constraint
cruzando as duas colunas (mantém simples; a UI é responsável por manter a
combinação coerente, mesmo padrão de confiança já usado em outras colunas
condicionais do schema).

## Backend / resolução de permissão

### `usuario_atual_pode(p_acao)` (função SQL, usada em RLS)

Ganha um branch novo antes da consulta atual a `perfil_permissoes`:

```sql
IF v_perfil = 'customizado' THEN
  SELECT perfil_customizado_id INTO v_perfil_customizado_id
    FROM usuarios WHERE id = v_usuario_id;

  SELECT permitido INTO v_permitido
    FROM perfil_customizado_permissoes
   WHERE perfil_customizado_id = v_perfil_customizado_id AND acao = p_acao
   LIMIT 1;

  RETURN COALESCE(v_permitido, false);
END IF;
```

Isso substitui, só para `'customizado'`, tanto a consulta a
`perfil_permissoes` quanto o `CASE` de fallback final — perfil customizado
nunca herda `leads.ver_todas`/`leads.redistribuir` por acidente. A checagem
de exceção individual (`usuario_permissoes`) continua rodando **antes**
deste branch, prioridade inalterada.

### `PERMISSOES_PADRAO` (`src/lib/auth/permissions.ts`)

Ganha a chave `customizado: []` no record (só para satisfazer o tipo
`Record<UsuarioPerfil, Acao[]>` — nunca é consultada de fato, porque o
resolvedor intercepta `'customizado'` antes, ver abaixo).

### `resolverPermissao` (`src/hooks/auth/permissaoResolver.ts`)

Hoje a chave do mapa de overrides é `${perfil}:${acao}` — colidiria entre
dois perfis customizados diferentes, já que ambos têm `perfil ===
'customizado'`. Assinatura muda para aceitar o id do perfil customizado:

```ts
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

### `usePerfilPermissoes` (`src/hooks/auth/usePerfilPermissoes.ts`)

Quando `usuario.perfil === 'customizado'`, a query de overrides passa a
buscar em `perfil_customizado_permissoes` (filtrando por
`usuario.perfil_customizado_id`) em vez de `perfil_permissoes`, montando o
mapa com a mesma chave `customizado:${perfil_customizado_id}:${acao}` usada
acima. `pode(acao)` passa `usuario.perfil_customizado_id` como novo
argumento de `resolverPermissao`.

## Interface

### `Configurações → Perfis de Acesso` (`PerfisPermissoesConfig.tsx`)

- O `Select` de perfil (hoje só `PERFIS_ATIVOS`) ganha um `SelectGroup`
  separado listando os perfis customizados **ativos** da empresa (via novo
  hook `usePerfisCustomizados()`), abaixo de um separador visual.
- Botão novo **"+ Criar novo perfil"** ao lado do seletor, abre um
  `Dialog` simples (campo texto "Nome do perfil") → `INSERT` em
  `perfis_acesso` → seleciona o novo perfil automaticamente → matriz
  carrega vazia (todas as ações `false`, já que não há linha em
  `perfil_customizado_permissoes` ainda).
- Quando o perfil selecionado é customizado: botão **"Restaurar padrão"**
  fica oculto (não existe "padrão do sistema" para restaurar — o piso já é
  tudo desmarcado); em vez dele aparecem **"Renomear"** e **"Desativar"**
  (com confirmação, `window.confirm` mesmo padrão já usado na tela).
  Desativar seta `ativo=false` em `perfis_acesso` — usuários já vinculados
  continuam funcionando normalmente (a leitura da matriz não depende de
  `ativo`), só some do dropdown de novos cadastros/convites e do seletor
  desta tela (mantendo acessível só se já havia um usuário nele — reabrir
  perfil inativo aqui não é objetivo desta entrega; se precisar, o admin
  reativa manualmente antes).
- `handleSalvar`/`handleRestaurar` (`usePerfilPermissoesAdmin.ts`) ganham
  variantes ou branch condicional para escrever em
  `perfil_customizado_permissoes` (upsert por `perfil_customizado_id+acao`)
  em vez de `perfil_permissoes` quando o perfil selecionado é customizado.

### `UsuarioFormDrawer.tsx` e `ConviteFormDrawer.tsx`

O `Select` de "Perfil de acesso" (hoje `PERFIS_ATIVOS.map(...)`) ganha o
mesmo `SelectGroup` de perfis customizados ativos. Selecionar um customizado
grava `perfil: 'customizado'` e `perfil_customizado_id: <id>` no
formulário; selecionar um dos 7 fixos zera `perfil_customizado_id` para
`null`. Validação (`zod`) do campo `perfil_customizado_id` fica
condicional: obrigatório só quando `perfil === 'customizado'`.

### Exibição do nome do perfil (`PerfilBadge.tsx`, `UsuariosLista.tsx`)

`PerfilBadge` ganha uma prop opcional `nomeCustomizado?: string`: quando
`perfil === 'customizado'`, exibe esse nome (com uma cor fixa neutra em
`PERFIL_CORES`, já que não há como prever quantos perfis customizados vão
existir) em vez de consultar `PERFIL_LABELS`. As queries que hoje buscam
`usuarios`/lista para exibir o badge passam a fazer join com
`perfis_acesso(nome)` e repassam esse nome para o componente.

## Casos de borda

- **Perfil customizado sem nenhuma permissão marcada**: comportamento
  esperado, não é um estado de erro — é literalmente o estado inicial.
- **Renomear um perfil customizado em uso**: só muda `perfis_acesso.nome`;
  como o enum do usuário continua `'customizado'` e a ligação é por
  `perfil_customizado_id`, nada mais precisa ser tocado.
- **Dois perfis customizados com o mesmo nome**: bloqueado por
  `UNIQUE(empresa_id, nome)` — a UI mostra o erro do banco como toast.
- **Rotas server-side que não olham `perfil_permissoes`** hoje também não
  vão olhar `perfil_customizado_permissoes` — mesma dívida técnica
  preexistente, não expandida nem resolvida aqui.

## Migrations (numeração a partir de 280)

1. `20260904_280_perfil_customizado_enum.sql` — só o `ALTER TYPE ... ADD
   VALUE 'customizado'`, isolado.
2. `20260904_281_perfis_acesso.sql` — tabelas `perfis_acesso` e
   `perfil_customizado_permissoes` + RLS.
3. `20260904_282_usuarios_convites_perfil_customizado.sql` — colunas
   `perfil_customizado_id` em `usuarios`/`convites`.
4. `20260904_283_usuario_atual_pode_perfil_customizado.sql` — `CREATE OR
   REPLACE FUNCTION usuario_atual_pode` com o branch novo.

## Testes

- Unitário: `resolverPermissao` com perfil `'customizado'` — sem override
  (false), com override específico do perfil customizado (respeita), com
  override de outro perfil customizado (não vaza entre os dois).
- Unitário/integração SQL (mesmo padrão de
  `src/lib/auth/__tests__/permissions.test.ts` e
  `migrations-gestor.test.ts`, se houver harness de SQL): `usuario_atual_pode`
  com perfil customizado, com e sem linha em
  `perfil_customizado_permissoes`.
- Manual: criar perfil "Externo" pela tela → matriz em branco → marcar 2-3
  ações → salvar → convidar/cadastrar um usuário com esse perfil → validar
  que ele só enxerga o que foi marcado, nada mais (sem `leads.ver_todas`
  nem `leads.redistribuir` por default).
