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

Desde `feat/alinhamento-permissoes-servidor`, existe um passo adicional entre
"é dashboard.ver?" e "existe override?": **a ação é `ACOES_NAO_CONFIGURAVEIS`
(`src/lib/auth/modulos.ts`)?** Se for, o resultado é sempre
`PERMISSOES_PADRAO`, ignorando qualquer override — essas são as ações que
passaram a ter RLS/API fixa nessa branch (ver seção "Resolvido" abaixo). Sem
isso, um override salvo antes da ação virar fixa (ou gravado por engano)
continuaria sendo obedecido pela interface mesmo com o servidor recusando a
chamada real.

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
diretamente) ainda está sujeito só às regras de banco/API existentes.

**Atualização (`feat/alinhamento-permissoes-servidor`)**: essa regra de
banco/API, para várias ações (RH, Pessoas, Processos, criação de Leads,
Biblioteca, Financeiro), foi alinhada à matriz oficial — ver seção
"Alinhamento servidor" abaixo. Isso fecha a maior parte da lacuna original,
mas **não muda o princípio**: overrides por empresa continuam sendo só
interface, nunca consultados por RLS/API (decisão arquitetural, não
lacuna) — ver "Ainda pendente" na mesma seção.

## Alinhamento servidor — `feat/alinhamento-permissoes-servidor`

As seis dívidas técnicas originalmente listadas nesta seção foram tratadas
nesta branch. Classificação final:

### Resolvido

1. **Processos (Negócios) alinhados à matriz** — `processos_insert` passou a
   aceitar `comercial` e `gestor` (mantendo os legados `analista`,
   `consultor`, `gerente`); `processos_update` passou a incluir `gestor` na
   condição gerencial (a condição do dono via `operacional_id` continua
   igual). `WITH CHECK` explícito adicionado (antes implícito).

2. **Bug `gerente` × `gestor` corrigido em todo o sistema** — não só
   Biblioteca/Financeiro (escopo original), mas **mais de 50 ocorrências**
   encontradas na investigação: sub-tabelas de Processos (tarefas,
   compradores, vendedores, conta_mov, custas), Configurações avançadas
   (metas, comissões padrão), cadastros-base (fases, bancos, produtos),
   usuários/convites, documentos de processo, solicitações operacionais,
   conversas, checklist dinâmico, fase status, o RPC `relatorio_por_equipe`,
   páginas/componentes da interface (Operacional, Pessoas, 4 páginas de
   Biblioteca, `VisaoTabela`), rotas de API de Biblioteca e merge de
   Pessoas, e o formulário de convite (`ConviteFormDrawer`, que nem sequer
   oferecia os 5 perfis ativos como opção). `gerente` mantido como fallback
   em todo lugar — 0 usuários reais com esse perfil hoje, mas não removido
   nesta branch (decisão explícita).

   Exceção deliberada: `comunicacao_atualizar_relacionamento()` **não foi
   alterada** — a investigação encontrou que essa função bloqueia não só
   `gestor`, mas também `comercial`/`operacional`/`juridico`/`apoio`
   (allowlist antiga só com `admin/gerente/analista/consultor`) — um bug
   mais amplo e de natureza diferente do padrão "adicionar gestor" desta
   branch. Ver "Ainda pendente" abaixo.

3. **RH protegido por perfil na RLS** — as 9 tabelas de RH (departamentos,
   regras/faixas de comissão, cargos, funcionários — inclui `salario_base`
   —, funcionário_empresas, ponto, férias, ausências) tinham `FOR ALL` só
   por `empresa_id`. Agora: leitura (`rh.ver`) exige `admin`/`gestor`;
   escrita (`rh.editar`) exige `admin`. Este era o achado de maior risco
   (dado de salário) e foi corrigido primeiro (Commit 1 da branch).

4. **Pessoas protegida por perfil na RLS** — `pessoas_empresa`/
   `pessoa_telefones_empresa` também eram `FOR ALL` só por `empresa_id`.
   Agora: leitura exige `pessoas.ver` (todos os perfis ativos exceto
   `apoio`); escrita exige `pessoas.editar` (matriz corrigida — ver seção
   acima); exclusão exige `pessoas.merge`/`pessoas.excluir`. A investigação
   também corrigiu um botão "Editar" sem guard em `pessoas/[id]/page.tsx`.

5. **Criação de Leads protegida por perfil** — `POST /api/leads` agora
   checa `podeExecutarPadrao(perfil, 'leads.criar')` antes de qualquer
   efeito colateral (criação de pessoa, inserção do lead).

6. **Ações administrativas fixas** — sem mudança, já eram e continuam
   restritas a `admin` nas rotas de API, independente da tela
   (`configuravel: false`).

7. **Catálogo e resolver respeitam ações fixas do servidor** (não estava na
   lista original, adicionado durante esta branch) — `pessoas.ver/editar/
   merge/excluir`, `rh.ver/editar`, `processos.criar/editar` e
   `leads.criar` viraram `configuravel: false` no catálogo, e
   `resolverPermissao` passou a **ignorar qualquer override** salvo para
   essas ações (inclusive linhas antigas, de antes desta branch — ver
   "Overrides antigos ineficazes" abaixo). Sem isso, a tela continuaria
   prometendo uma concessão/revogação que o servidor não obedece.

### Ainda pendente (dívida técnica nova, não implementada)

- **Autorização dinâmica server-side por empresa**: overrides de
  `perfil_permissoes` continuam sendo só uma camada de interface — nunca
  consultados por RLS/API. Um admin pode conceder algo pela tela que o
  servidor recusa, ou revogar algo que o servidor continua aceitando numa
  chamada direta. Corrigir isso exige desenho próprio (função SQL segura,
  multiempresa, cache, revogação, testes) — fase futura específica, fora
  do escopo desta branch.

- **Escopo de campo editável em Processos pelo `operacional_id`**:
  confirmado por investigação que, hoje, o responsável designado de um
  processo pode alterar praticamente qualquer coluna (banco, modalidade,
  valores, taxa, prazo, indexador, assessoria, dados de imóvel/consórcio,
  fases, checklist) sem nenhum controle de campo na aplicação além da RLS
  a nível de linha. Não foi ampliado nem restringido nesta branch.

- **Criação de Lead via bot WhatsApp sem check de perfil**: o fluxo `*fonti
  cria cliente` usa `verificarUsuarioInterno` (telefone + `ativo`, sem
  checar `perfil`) — hoje um funcionário `apoio`, que não tem `leads.criar`
  na matriz, consegue criar lead pelo WhatsApp mesmo assim. Estruturalmente
  diferente da rota HTTP interativa (sem sessão, sem `auth.uid()`) —
  decisão de estender ou não fica para depois.

- **`comunicacao_atualizar_relacionamento()` bloqueia perfis ativos além de
  `gestor`**: `comercial`, `operacional`, `juridico` e `apoio` também
  recebem `USUARIO_SEM_PERMISSAO` hoje (allowlist antiga:
  `admin/gerente/analista/consultor`), apesar do comentário da função
  indicar que a intenção é só excluir o perfil `cliente` (login externo).
  Não corrigido nesta branch — o fix correto (trocar por uma exclusão de
  `cliente`, não uma allowlist) é mais amplo que o padrão "adicionar
  gestor" usado no resto desta entrega.

- **`documentos` não reatribuído no merge de Pessoa**
  (`src/app/api/pessoas/[id]/merge/route.ts`): o merge reatribui
  `pessoa_telefones`, `leads`, `conversas`, `processo_compradores` e
  `processo_vendedores` antes de excluir a pessoa perdedora, mas não
  reatribui `documentos` — possível lacuna de integridade de dados, achada
  como efeito colateral da investigação, não relacionada a perfil.

- **`usuarios_update_rbac` — divergência de schema preexistente,
  pendente de diagnóstico específico**: a migration `181` previa incluir
  `gestor` na policy `usuarios_update_rbac` (criada originalmente em
  `20260415_002_auth_rbac.sql`, que deveria permitir admin/gerente/gestor
  editarem o cadastro de outro usuário). Durante a implantação em
  produção, confirmou-se que essa policy **não existe** no schema real —
  a tabela `usuarios` só tem `usuarios_select`, `usuarios_insert` e
  `usuarios_update` (esta última, de `20260415_001_base_config.sql`, só
  permite `id = auth.uid()` ou `perfil = 'admin'`, sem `gerente`/`gestor`
  em nenhum momento da sua história). Não foi criada nem substituída
  nesta entrega — **não considerar este item resolvido pelo PR #18**.
  Precisa de diagnóstico futuro específico: qual policy/fluxo hoje
  realmente governa atualização de perfil, função, status ou dados
  administrativos de um usuário por outro (perfil gerencial), já que
  `usuarios_update_rbac` nunca esteve ativa.

- **`processo_documentos` vs. `documentos` — referência a estrutura
  legada substituída, pendente de alinhamento com a arquitetura
  documental atual**: a migration `181` previa incluir `gestor` na policy
  `membro_exclui_proprio_ou_gestor` da tabela `processo_documentos`
  (criada em `20260415_010_documentos.sql`). Durante a implantação,
  confirmou-se que essa tabela **não existe** em produção — a
  arquitetura de documentos já foi substituída por um modelo genérico
  (tabela `documentos`, com campo `dominio`, usada por exemplo pelo bot
  do WhatsApp). A alteração prevista não era aplicável ao schema atual;
  nenhuma policy foi criada artificialmente para reproduzir o modelo
  antigo. Precisa de diagnóstico futuro específico: como documentos
  ligados a Pessoas, Leads e Negócios são autorizados hoje para
  visualização, edição e exclusão na arquitetura `documentos` atual —
  isso não foi verificado nesta entrega.

### Overrides antigos ineficazes

Como o PR #12 (Perfis de Acesso) já estava em produção antes desta branch,
pode haver linhas em `perfil_permissoes` para ações que só agora viraram
`configuravel: false`. Essas linhas **não são apagadas automaticamente** —
o resolver simplesmente passa a ignorá-las (ver seção "Fluxo de resolução").
Consulta somente-leitura para identificá-las, caso se queira uma limpeza
manual (exige autorização separada, não faz parte desta branch):

```sql
SELECT empresa_id, perfil, acao, permitido
FROM perfil_permissoes
WHERE acao IN (
  'pessoas.ver', 'pessoas.editar', 'pessoas.merge', 'pessoas.excluir',
  'rh.ver', 'rh.editar', 'processos.criar', 'processos.editar', 'leads.criar'
)
ORDER BY empresa_id, perfil, acao;
```

### Status da implantação (produção)

Migrations `20260721_177` a `183` **aplicadas em produção**:

- **5 aplicadas integralmente**: `177` (RH), `178` (Pessoas), `179`
  (Biblioteca/Financeiro), `182` (Checklist/Fases/RPC), `183` (Processos —
  matriz oficial).
- **2 aplicadas com uma pendência documental cada** (ver itens
  correspondentes em "Ainda pendente" acima — nenhuma delas é uma falha da
  migration em si, ambas são divergência de schema preexistente):
  - `180` (Configurações/cadastros-base) — pendência: `usuarios_update_rbac`.
  - `181` (Processos/operação) — pendência: `processo_documentos`.

PR #18 (alinhamento de permissões) mergeado no commit `c4a2087`, deploy
concluído sem erro.

Durante a implantação, um segundo achado foi identificado e corrigido à
parte (PR #19, commit `33070ea`, deploy sem erro): a validação de formato
de `SUPABASE_SERVICE_ROLE_KEY` (introduzida nos PRs #16/#17) exigia
formato JWT (`eyJ...`, 100+ caracteres) — isso estava incorreto para o
formato atual de chave usado por este projeto (`sb_secret_...`, mais
curto). A validação disparava um falso positivo no log a cada cold start,
sem nenhum impacto funcional real (confirmado: o bot do WhatsApp não
sofreu nenhuma interrupção durante o alarme). Corrigido para aceitar
ambos os formatos.

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

**Migrations de `feat/alinhamento-permissoes-servidor` (177 a 183)**: cada
uma só recria policies/função já existentes (`DROP POLICY`/
`CREATE OR REPLACE FUNCTION`) — nenhuma cria ou remove tabela. Rollback de
cada uma: `DROP POLICY` da versão nova + `CREATE POLICY` com o texto
anterior exato, documentado como comentário no topo do próprio arquivo de
migration (ex.: `20260721_177_rh_rls_perfil.sql` documenta a policy `FOR
ALL` original de cada tabela de RH). Aplicar/reverter uma migration desta
lista não depende das outras — cada uma isola um domínio (RH, Pessoas,
Biblioteca+Financeiro, Configurações+cadastros, Processos+operação,
Checklist+Fases+RPC, matriz de Processos).

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
| `supabase/migrations/20260721_177_rh_rls_perfil.sql` | RLS de RH por perfil (9 tabelas) |
| `supabase/migrations/20260721_178_pessoas_rls_perfil.sql` | RLS de Pessoas por perfil |
| `supabase/migrations/20260721_179_gestor_biblioteca_financeiro.sql` | Bug gerente/gestor — Biblioteca e Financeiro |
| `supabase/migrations/20260721_180_gestor_config_cadastros.sql` | Bug gerente/gestor — Configurações avançadas e cadastros-base |
| `supabase/migrations/20260721_181_gestor_processos_operacao.sql` | Bug gerente/gestor — sub-tabelas de Processos e operação |
| `supabase/migrations/20260721_182_gestor_checklist_fases_rpc.sql` | Bug gerente/gestor — Checklist, Fases e relatório de equipe |
| `supabase/migrations/20260721_183_processos_rls_matriz.sql` | RLS de Processos alinhada à matriz oficial |
| `src/lib/auth/__tests__/migrations-gestor.test.ts` | Testes estáticos sobre o conteúdo das migrations acima |
