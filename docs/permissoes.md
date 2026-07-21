# Perfis de Acesso — arquitetura e limitações

Sistema configurável para definir, por perfil, quais módulos aparecem no menu,
quais rotas podem ser acessadas diretamente por URL, e quais ações
(ver/criar/editar/excluir, entre outras) cada perfil pode executar na
interface — sem precisar editar código para mudar essas regras.

## Fluxo de resolução

```
Admin?
→ sim: acesso total (garantido em código — src/lib/auth/permissaoResolver.ts,
        função resolverPermissao — nunca depende da tabela de overrides)
→ não: é a ação dashboard.ver?
   → sim: sempre true, também garantido em código — mesma proteção do admin,
           evita que um override incorreto bloqueie justamente a rota para
           onde o RouteGuard redireciona ao negar acesso (loop sem saída)
   → não: existe override configurado para (empresa, perfil, ação)?
      → sim: usa o valor do override (tabela perfil_permissoes)
      → não: usa PERMISSOES_PADRAO (matriz oficial em código,
              src/lib/auth/permissions.ts)
```

A tabela `perfil_permissoes` é uma camada de **sobreposição**, não a fonte de
verdade — ela só guarda as **diferenças** em relação à matriz padrão. Isso
significa:

- **Tabela vazia** (recém-criada, ou uma falha de rede/consulta ao buscá-la):
  o sistema se comporta exatamente como `PERMISSOES_PADRAO` descreve. Nunca
  bloqueia ninguém por causa de um problema de infraestrutura.
- **Empresa nova**: nasce sem nenhuma linha em `perfil_permissoes` e já
  funciona corretamente com a matriz padrão, sem precisar de nenhum seed ou
  trigger de inicialização.
- **Restaurar padrão** (botão na tela de configuração): apaga só os overrides
  daquele perfil naquela empresa (`DELETE ... WHERE empresa_id=X AND
  perfil=Y`) — volta a cair 100% em `PERMISSOES_PADRAO`.

## Exemplo de personalização por empresa

> Por padrão, o perfil Comercial não vê a Biblioteca (`biblioteca.ver=false`
> em `PERMISSOES_PADRAO`). Uma empresa específica decide liberar esse acesso
> para o time comercial dela: o admin dessa empresa vai em Configurações >
> Perfis de Acesso, seleciona "Comercial", marca "Ver" em Biblioteca e salva.
> Isso grava **uma linha** em `perfil_permissoes` só para essa empresa — as
> demais empresas continuam usando o padrão (Biblioteca oculta para
> Comercial), sem nenhuma mudança.

## Correção de matriz — `pessoas.editar` para Comercial e Operacional

Na branch `feat/alinhamento-permissoes-servidor` (alinhamento de RLS/API à
matriz), a investigação necessária para restringir a RLS de `pessoas`
revelou que **Comercial e Operacional já editam dados de Pessoa como parte
rotineira e esperada do fluxo diário real da empresa** — na aba "Pessoa"
de um Lead, e ao criar/editar Compradores/Vendedores dentro de um
Processo — sem nenhum check de perfil existir hoje nesses caminhos.

A matriz original desta documentação (`comercial`/`operacional`: só
`pessoas.ver`) não refletia esse uso real. **Esta é uma correção
permanente da matriz oficial, decorrente da validação do processo real da
empresa — não uma conveniência técnica para destravar a migration de
RLS.** `PERMISSOES_PADRAO.comercial` e `.operacional` passam a incluir
`pessoas.editar` (não `pessoas.merge`/`pessoas.excluir`, sem evidência de
uso nesses perfis). A RLS de `pessoas` (mesma branch) é escrita já
refletindo essa matriz corrigida.

## Limitações desta primeira versão

Esta entrega controla:
- o que aparece na Sidebar (`src/components/layout/Sidebar.tsx`);
- acesso direto por URL a cada módulo (`RouteGuard`, dentro de `ProtectedShell`);
- botões/ações já ligados a `usePermissao().pode(acao)` (~17 arquivos).

Esta entrega **não** é a única camada de segurança do sistema, e **não**
substitui:
- as políticas de RLS do Supabase;
- os checks fixos de perfil que já existem em rotas de API server-side.

Onde já existir uma regra de RLS/API restringindo por perfil, essa regra
**continua sendo a autorização definitiva** — a configuração de Perfis de
Acesso desta entrega só controla a interface e a navegação por cima dela.
Um usuário determinado a burlar a interface (chamando a API/Supabase
diretamente) ainda está sujeito só às regras de banco/API existentes, que
esta entrega não altera.

## Dívidas técnicas encontradas (não corrigidas nesta entrega)

Registradas durante a investigação, para uma branch futura própria
(`feat/alinhamento-permissoes-servidor`):

1. **Processos (Negócios) incompatíveis com a matriz oficial** — a RLS
   `processos_insert` só aceita `perfil IN ('analista','consultor','gerente','admin')`;
   a matriz oficial também concede `processos.criar` a `comercial` e
   `gestor`, que hoje são rejeitados pelo banco ao tentar criar um novo
   processo. A RLS `processos_update` já permite qualquer perfil que seja o
   `operacional_id` (responsável) do processo específico editá-lo, mas só
   `gerente`/`admin` (sem `gestor`) podem editar processos de outra pessoa.

2. **Bug `gerente` × `gestor`** — vários pontos do sistema ainda checam o
   perfil legado `gerente` em vez do perfil ativo `gestor`, então usuários
   `gestor` não recebem os poderes de gestor nessas superfícies:
   - RLS `bk_docs_write`, `bk_categorias_write`, `bk_docs_select_publicado`
     (Biblioteca);
   - RLS `comissoes_insert`, `comissoes_update`, `fin_lanc_insert`,
     `fin_lanc_update`, `fin_lanc_delete` (Financeiro);
   - API `base-conhecimento/*` (`['admin','gerente'].includes(perfil)`).

   A Sidebar (Commit 3 desta entrega) já não tem mais esse bug, já que passou
   a usar `pode(modulo.acaoVer)` em vez do antigo `isGestor` — mas a correção
   de API/RLS continua pendente, separada, porque tem impacto direto em dados
   (Biblioteca, Financeiro) e requer confirmar antes se existem usuários reais
   com o perfil legado `gerente` em produção (`SELECT perfil, count(*) FROM
   usuarios WHERE deleted_at IS NULL GROUP BY perfil;`).

3. **RH sem proteção por perfil na RLS** — as tabelas `rh_cargos`,
   `rh_funcionarios` (inclui `salario_base`) e afins têm RLS restrita só por
   `empresa_id`, sem checar perfil. Hoje, qualquer usuário ativo da empresa
   que fizesse a chamada direto ao Supabase já conseguiria ler/escrever esses
   dados — a única proteção real hoje é a Sidebar não mostrar o link. Este é
   o achado de maior risco (dados de salário) e deveria ser priorizado na
   branch futura.

4. **Pessoas sem proteção por perfil na RLS** — mesma situação (`pessoas_empresa`
   só verifica `empresa_id`).

5. **Criação de Leads sem check de perfil** — `/api/leads` (rota server-side)
   não verifica perfil algum; qualquer usuário ativo consegue criar um lead,
   mesmo que a RLS direta de `leads` (não usada nesse caminho) exija
   `admin/gerente/analista/consultor`.

6. **Ações administrativas fixas** — `usuarios.convidar`, `usuarios.desativar`
   e `instancias.gerenciar` continuam sempre restritas a `admin` nas rotas de
   API, independente do que for configurado na tela (por isso aparecem
   desabilitadas no catálogo, com `configuravel: false`).

## Comportamento antes da migration ser aplicada

O código e a migration podem, por erro operacional, ser publicados fora de
ordem. O comportamento esperado (e verificado) para cada caso:

- **Aplicação publicada antes da migration** (tabela `perfil_permissoes` ainda
  não existe): a consulta a essa tabela falha (erro do PostgREST, relação
  inexistente). Em `usePerfilPermissoes`/`usePermissao` — usados por Sidebar,
  RouteGuard e todos os botões ligados a `pode(acao)` — o erro não é
  propagado: `query.data` fica `undefined`, o mapa de overrides fica vazio, e
  `resolverPermissao` cai direto no fallback do código (`PERMISSOES_PADRAO`).
  Sidebar, RouteGuard e os botões continuam funcionando normalmente, sem loop
  e sem tela quebrada — só não há personalização por empresa ainda.
- **Tela "Perfis de Acesso"**: detecta esse mesmo erro (`error` do
  `useOverridesEmpresa`) e mostra um aviso explícito — "a configuração de
  Perfis de Acesso ainda não está disponível nesta empresa" — com os botões
  "Salvar alterações"/"Restaurar padrão" desabilitados, em vez de deixar o
  admin tentar salvar e descobrir o problema só depois, ou (pior) mostrar
  sucesso indevido.
- **Migration aplicada antes da publicação do código**: sem nenhum efeito —
  a tabela nova, vazia, não é lida por nenhum código ainda em produção.
  Seguro aplicar a migration a qualquer momento antes do deploy.

## Ordem segura de publicação

1. Aplicar a migration `20260720_176_perfil_permissoes.sql` (cria só a tabela
   vazia + RLS — nenhum efeito no comportamento até o código novo existir).
2. Validar no painel do Supabase que a tabela e as 4 policies (`pp_select`,
   `pp_insert`, `pp_update`, `pp_delete`) foram criadas corretamente.
3. Publicar a aplicação (deploy do código desta branch).
4. Testar com um usuário `admin`: Sidebar completa, acesso a Configurações >
   Perfis de Acesso, matriz visível.
5. Testar com um perfil restrito (ex.: `operacional` ou `apoio`): Sidebar
   mostra só o esperado, acesso direto por URL a um módulo restrito é
   bloqueado.
6. Só depois de 1–5 confirmados, começar a configurar overrides reais para
   personalizar por empresa.

## Rollback

- Rollback da aplicação (reverter o deploy) volta ao comportamento anterior
  a esta entrega — instantâneo, mesmo padrão já usado nas entregas
  anteriores deste projeto.
- A tabela `perfil_permissoes` pode permanecer no banco sem nenhum efeito
  colateral, mesmo depois de reverter o deploy — nenhum código antigo a
  referencia, e ela não altera nenhuma tabela existente.
- `DROP TABLE perfil_permissoes` é **último recurso** e nunca deve ser
  executado automaticamente/como parte de um rollback padrão — só se
  explicitamente decidido depois, sem pressa (nada depende da tabela deixar
  de existir).

## Arquivos principais

| Arquivo | Papel |
|---|---|
| `src/types/auth.ts` | Tipo `Acao` (catálogo de ações) |
| `src/lib/auth/permissions.ts` | `PERMISSOES_PADRAO` (matriz oficial) |
| `src/lib/auth/modulos.ts` | Catálogo único de módulos/rotas/ações, com metadados `configuravel`/`motivoBloqueio`/`tipoControle` |
| `src/hooks/auth/permissaoResolver.ts` | `resolverPermissao` — função pura de resolução (admin/override/padrão) |
| `src/hooks/auth/usePerfilPermissoes.ts` | Hook que busca overrides da empresa e expõe `pode(acao)` |
| `src/hooks/auth/usePermissao.ts` | Wrapper fino, assinatura pública inalterada |
| `src/components/layout/Sidebar.tsx` | Menu — usa `pode(modulo.acaoVer)` |
| `src/components/layout/RouteGuard.tsx` | Bloqueio de rota, dentro de `ProtectedShell` |
| `src/app/(protected)/configuracoes/_components/perfis/PerfisPermissoesConfig.tsx` | Tela de configuração (admin-only) |
| `src/app/(protected)/configuracoes/_hooks/permissoesMatrizHelpers.ts` | `aplicarToggle` (dependência Ver↔demais ações) e `planejarSalvamento` (evita persistir override redundante) — funções puras, testadas isoladamente |
| `src/app/(protected)/configuracoes/_hooks/usePerfilPermissoesAdmin.ts` | `useOverridesEmpresa`, `useSalvarPlano`, `useRestaurarPadrao` |
| `supabase/migrations/20260720_176_perfil_permissoes.sql` | Tabela de overrides + RLS |
