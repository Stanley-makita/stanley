# Sprint Proteção Imediata do Fonti — Etapa A (Diagnóstico e Plano)

> Nenhum código foi alterado para produzir este documento. Base:
> `docs/protocolo-seguranca-recuperacao.md`. Aguarda validação antes da Etapa B.

---

## 1. Estado atual do Git

```
On branch main
Your branch is up to date with 'origin/main'.

Changes not staged for commit:
  modified:   _projeto (modified content, untracked content)
  modified:   tsconfig.tsbuildinfo

Untracked files:
  docs/protocolo-seguranca-recuperacao.md
```

- **Working directory não está limpo.** Dois pontos a resolver antes de qualquer tag:
  - `_projeto` — aparece como submódulo git com conteúdo modificado/não rastreado. Precisa
    ser investigado (o que mudou lá?) antes de decidir se entra no commit de checkpoint ou
    se é ruído a ignorar/limpar.
  - `tsconfig.tsbuildinfo` — artefato de build do TypeScript incremental. Está sendo
    versionado (não está no `.gitignore`), o que é incomum — normalmente é gerado a cada
    `tsc`/`next build` e não deveria ir para o Git. Recomendo adicioná-lo ao `.gitignore`
    e remover do índice, mas isso é uma decisão a confirmar com você antes de fazer.
  - `docs/protocolo-seguranca-recuperacao.md` está untracked (criado na sessão anterior,
    ainda não commitado).
- **Nenhuma tag existe hoje** (`git tag -l` retornou vazio).
- **Commit atual (`HEAD`)**: `415d279 chore(bot): remove logs de diagnosticos temporarios`
  — é o commit que fechou a sessão maratona do incidente, já em produção segundo a
  memória da sessão anterior ("usuário confirmou 'agora deu'").
- Branch `feature/item-4-multiplas-analises-credito` existe mas parece obsoleta/não
  mergeada — não teve investigação aprofundada nesta etapa (fora de escopo; mencionar
  apenas para você decidir se descarta ou revisita depois).

**Recomendação**: antes de taggear, decidir o destino de `_projeto` e
`tsconfig.tsbuildinfo` — não posso propor a tag corretamente com working directory sujo.

## 2. Estado dos scripts de teste e typecheck

- `npm run test` (vitest): **253 passaram, 13 falharam** — todas as 13 falhas estão em
  **um único arquivo**, `src/lib/simuladorFinanciamento/__tests__/criteria-migracao-fase3-itau.test.ts`,
  por mismatch de snapshot (`totalPago`, `totalSeguros` mudaram de valor).
  - Isso **não é uma regressão do incidente do WhatsApp** — bate com a memória de sessão
    anterior `itau_mip_dfi_double_count_e_tac`: dois bugs de double-count de MIP/DFI do
    Itaú foram corrigidos depois que esses snapshots foram gravados, então os valores
    "esperados" ficaram desatualizados. É dívida de teste da Sprint de Calibração, não um
    bug novo.
  - **Ação recomendada**: atualizar os snapshots (`vitest run -u` nesse arquivo
    especificamente) como parte da Sprint de Calibração — não vou fazer isso aqui, pois
    está fora do escopo desta sprint e pertence ao outro trabalho em andamento. Só
    reporto para não confundir com o restante da checklist de "testes passando".
- `npx tsc --noEmit`: **zero erros**. Typecheck já está limpo hoje.
- **Não existe hoje** nenhum script nomeado `typecheck` nem `validate` em `package.json`
  — só `test`, `test:watch`, `lint`, `build`, `dev`, `start`.

**Proposta de scripts a adicionar** (Etapa B):
```json
"typecheck": "tsc --noEmit",
"validate": "npm run test && npm run typecheck"
```
Sem alterar `tsconfig.json` nem relaxar nenhuma regra — o typecheck já passa como está.

## 3. Versão/tag recomendada

- Marco proposto: **estado atual de `main` (`415d279`)**, correspondente ao fechamento
  do incidente do webhook (*fonti*/documentos/duplicação de Pessoa), já validado em
  produção pelo usuário.
- `package.json.version` está em `0.1.0` desde o início do projeto — nunca foi tocado,
  não reflete marcos.
- **Proposta**: `v0.2.0` como primeira tag real do projeto, marcando "*fonti* estabilizado
  pós-incidente 2026-07-14/15". Fica como base de comparação para o próximo marco.
- **Bloqueio**: só crio a tag depois de (a) você confirmar o destino de `_projeto`/
  `tsconfig.tsbuildinfo`, e (b) decidirmos se os snapshots do Itaú entram nesse commit de
  checkpoint ou ficam para a Sprint de Calibração continuar separadamente (recomendo
  **não** misturar — a tag `v0.2.0` marca o *fonti* estável, não a calibração do Itaú).

## 4. Arquivos documentais a criar

Curtos, executáveis sob pressão (não cópia das 17 partes do protocolo):

| Arquivo | Conteúdo essencial |
|---|---|
| `docs/procedimento-rollback.md` | 3 cenários (código / migration / feature pontual), cada um com passo a passo direto, sem preâmbulo |
| `docs/procedimento-incidente.md` | Sequência de 6 passos da Parte 11 do protocolo, reescrita como checklist acionável |
| `docs/checklist-alteracao-critica.md` | Os 5 Pontos Seguros (Parte 12), como checklist literal `- [ ]` |
| `docs/checklist-publicacao-producao.md` | Os 9 itens da Parte 13, como checklist literal `- [ ]` |
| `CHANGELOG.md` | Novo arquivo na raiz. Primeira entrada: marco `v0.2.0` |

Todos serão escritos na Etapa B, depois de validado este plano.

## 5. Diagnóstico específico da deduplicação (achado importante)

**Correção ao diagnóstico anterior**: já existe um mecanismo de deduplicação por
`messageid` no projeto — não é verdade que não exista nenhum. Ele só cobre uma fração
do tráfego do webhook. Detalhe:

- Tabela `fonti_events` (`supabase/migrations/20260608_077_fonti_events_dedup.sql`):
  `messageid TEXT PRIMARY KEY`, `empresa_id UUID`, `created_at`. Comentário no arquivo:
  *"Tabela leve para deduplicar webhooks fromMe do `*fonti` (Uazapi dispara 2x por
  mensagem)"*.
- Uso real, em `src/app/api/bot/whatsapp/webhook/route.ts:264-275`: só dentro do bloco
  que trata comandos `*fonti` enviados pelo próprio operador (`fromMe && !isGroup` e
  texto batendo no regex de comando). Insere `messageid` antes de processar; se o insert
  falhar por violação de PK (já existe), ignora o webhook como duplicado. Comentário no
  código confirma a intenção: *"DEDUP: Uazapi dispara o mesmo webhook fromMe 2x. Garante
  processamento único via messageid."*
- **O que NÃO está coberto por essa dedup**:
  - O fluxo principal de mensagem do **cliente** (não `fromMe`), a partir da linha ~393
    até o fim do handler — onde vive `buscarOuCriarPessoa`, criação de Conversa,
    inserção em `mensagens`, e todo o `state-machine`/`processarMensagem` do bot. **Zero
    checagem de `messageid` antes de qualquer side effect aqui.**
  - O bloco de mídia enviada pelo operador fora de comando `*fonti` (linhas 334-390,
    "não é `*fonti` — salva mídia enviada pelo operador") — também sem dedup.
  - Mensagens de grupo (linhas 468-527) — sem dedup.
  - **Nenhuma limpeza automática** da tabela `fonti_events` existe de fato: o índice
    `idx_fonti_events_created_at` foi criado com esse propósito no comentário da
    migration, mas não há job/cron/trigger que efetivamente apague linhas com mais de
    24h. A tabela cresce indefinidamente hoje.
- **Risco real e concreto para o cenário do incidente** ("duas instâncias processando o
  mesmo evento"): o padrão observado no incidente envolvia o fluxo de **cliente
  enviando documento após `*inicio`**, que passa pelo caminho **sem dedup** (mídia de
  cliente cai na branch principal, não na branch `*fonti fromMe`). Ou seja: **a proteção
  que existe hoje não cobre o cenário que causou o incidente.**

### Plano técnico proposto (não implementado nesta etapa)

- Generalizar `fonti_events` para cobrir **todo** o corpo do handler, não só o bloco
  `*fonti fromMe`: inserir `(messageid, empresa_id)` **logo no início do `POST`**, assim
  que `messageid` estiver disponível (`payload.message?.messageid`), antes de qualquer
  leitura/escrita de negócio. Se o insert falhar por PK duplicada → retorna `200 ok`
  imediatamente, sem tocar em Pessoa/Conversa/Mensagem/state-machine.
- **Chave de deduplicação**: `messageid` sozinho já é único por mensagem segundo o
  comentário da migration original — mas o incidente envolveu *duas instâncias*, então
  vale confirmar com a Uazapi (ou por teste manual controlado) se `messageid` é único
  globalmente ou só por instância. Se houver qualquer dúvida, a chave composta
  `(messageid, instancia_token)` é mais segura e não tem custo adicional relevante.
- **Mensagens sem `messageid`**: acontece (confirmado no payload — campo opcional). Para
  esses casos, não há como deduplicar por id; a proteção existente (filtro de eco por
  número da própria instância, já corrigido no incidente anterior) continua sendo a
  defesa aplicável. Não bloquear o processamento só por faltar `messageid`.
- **Concorrência entre duas requisições simultâneas**: o modelo atual (insert com PK e
  tratar erro de violação como "já processado") já é seguro contra corrida — é uma
  constraint de banco, não uma checagem em memória. Manter esse padrão ao generalizar.
- **Estados `recebido/processando/processado/falhou`**: a tabela atual é biná­ria
  (existe = já visto). Para o propósito de bloquear reprocessamento, isso é suficiente e
  mais simples — não recomendo adicionar máquina de estados agora (aumenta superfície
  sem necessidade clara); se no futuro for preciso re-tentar processamento que falhou no
  meio, aí sim vale reconsiderar.
- **Retenção**: implementar a limpeza que já estava planejada (comentário da migration)
  — um `DELETE FROM fonti_events WHERE created_at < now() - interval '24 hours'`
  executado pelo cron diário já existente (`vercel.json` →
  `/api/leads/followup/notificar`) ou por uma rota de cron nova e dedicada. Decisão de
  onde plugar isso fica para a Etapa B.
- **Impacto nos fluxos de mídia e comandos** (`*inicio`, `*cria cliente`, `*fonti`,
  `*simula`, documentos): nenhum, desde que o insert de dedup aconteça **antes** de
  qualquer leitura desses fluxos e **depois** da validação do token do webhook (não
  queremos poluir `fonti_events` com tentativas não autenticadas).
- **Eventos de status diferentes de mensagem recebida** (ex: `EventType` de entrega/leitura,
  se a Uazapi mandar isso pro mesmo endpoint): preciso confirmar quais `EventType`
  chegam hoje nesse webhook antes de aplicar a dedup universalmente — se houver eventos
  sem `message.messageid` mas com outro identificador de evento, a chave de dedup
  precisa contemplar isso. Vou verificar os `payload.EventType` observados nos logs
  reais (`npx vercel logs`) como parte da Etapa B, antes de implementar.

## 6. Diagnóstico da resolução de instância

Cadeia atual (mapeada por trecho de código, `route.ts`):

1. **Bloco `*fonti fromMe`** (linha 232): `payload.token || process.env.UAZAPI_INSTANCE_TOKEN`
   → busca em `instancias` por `token` exato (linha 237-239) → se não achar, **fallback
   por sufixo de telefone do `owner`** (linha 242-253, `LIKE '%' || sufixo`).
2. **Bloco mídia de operador fora de `*fonti`** (linha 340): mesma cadeia, duplicada
   independentemente (linhas 344-354) — mesmo padrão, código copiado, não reaproveitado.
3. **Fluxo principal de cliente** (linha 430): `payload.token ?? process.env.UAZAPI_INSTANCE_TOKEN`
   → busca por `token` exato com `.single()` (não `.maybeSingle()` — comportamento
   diferente dos outros dois blocos, ver risco abaixo) → **sem** o fallback por telefone
   aqui. Depois, linha 439: se `instancia` não foi encontrada, cai para
   `process.env.UAZAPI_EMPRESA_ID` (fallback de empresa, não de instância).

**Ambiguidades identificadas**:

- A busca por telefone (`LIKE '%' || sufixo10`) é um fallback impreciso por natureza —
  compara só os últimos 10 dígitos, então dois números de instâncias diferentes que
  coincidam nos últimos 10 dígitos (cenário raro, mas não impossível com prefixos
  internacionais/DDD) colidiriam. Existe **porque o token que chega no payload às vezes
  não bate em formato** com o salvo em `instancias.token` (comentário original: "token
  pode diferir em formato") — ou seja, é compensação para uma inconsistência de dado, não
  uma necessidade de negócio.
- O fluxo principal usa `.single()` em vez de `.maybeSingle()` na consulta de instância
  (linha 431-436) — isso lança erro se a query falhar por qualquer motivo, mas o código
  não trata explicitamente esse erro antes de usar `instancia?.empresa_id` na linha
  seguinte (o `?.` mascara qualquer situação, incluindo erro de rede/query, como
  "instância não encontrada", indo direto pro fallback de `UAZAPI_EMPRESA_ID`). Vale
  confirmar se isso é intencional.
- Três blocos reimplementam a mesma lógica de resolução com pequenas divergências
  (`.single()` vs `.maybeSingle()`, com/sem fallback por telefone) — risco de os três
  divergirem ainda mais ao longo do tempo se corrigidos separadamente (como quase
  aconteceu no incidente: a correção da detecção de eco foi feita em um lugar e o padrão
  de fallback ambíguo permaneceu nos outros).

**Recomendação para a Etapa B** (mudança mínima, sem remover nada ainda):
- Não remover nenhum fallback agora — cada um existe por um motivo observado em produção
  (formato de token divergente). Proposta é **extrair a resolução de instância para uma
  função única** (`resolverInstancia(supabase, { token, ownerPhone })`) usada pelos três
  blocos, preservando exatamente o comportamento atual (mesma ordem de fallback), só
  eliminando a triplicação de código. Isso não é uma mudança de comportamento — é
  pré-requisito para poder testar e depois endurecer a lógica com segurança, sem editar
  três lugares toda vez.
- Antes de qualquer mudança de comportamento (ex: remover o fallback por telefone),
  seria necessário: (a) confirmar em produção, via log, com que frequência esse fallback
  é de fato acionado hoje (`grep` nos logs por "não bateu" — já existe um `console.log`
  para isso na linha 251); (b) só remover se a frequência for zero por um período
  observado. Não farei essa remoção nesta sprint — fica registrada como possível
  próximo passo, fora do escopo desta Etapa B.

## 7. Migrations necessárias (propostas, não criadas)

Uma única migration nova prevista para esta sprint, se você validar o plano da seção 5:

- `supabase/migrations/YYYYMMDD_NNN_fonti_events_generaliza_dedup.sql` — **sem alteração
  de schema** (a tabela `fonti_events` já serve para o uso generalizado). Se a decisão da
  seção 5 for usar chave composta `(messageid, instancia_token)` em vez de `messageid`
  isolado, aí sim seria necessário alterar a PK — a definir depois da confirmação sobre
  unicidade de `messageid` entre instâncias (ver seção 5).
- Nenhuma outra migration é necessária para o escopo desta sprint (nada aqui mexe em
  `processos`, `pessoas`, `conversas`, etc.).

## 8. Riscos

- **Working directory sujo hoje** (`_projeto`, `tsconfig.tsbuildinfo`) pode contaminar o
  commit de checkpoint se não for resolvido antes — risco de a tag `v0.2.0` incluir
  ruído não relacionado ao marco que ela deveria representar.
- **Generalizar a dedup sem confirmar os `EventType` reais** que chegam no webhook pode
  bloquear por engano um tipo de evento legítimo que não tenha `messageid` previsível —
  por isso a Etapa B propõe checar logs reais antes de implementar, não só o payload
  documentado no código.
- **Mudar `.single()` para `.maybeSingle()`** no fluxo principal (se decidirmos unificar
  a função de resolução) muda o comportamento de erro dessa query — precisa de teste
  específico antes de ir para produção, mesmo sendo teoricamente uma correção.
- **Ambiente único**: qualquer teste desta sprint (dedup, resolução de instância) ainda
  vai precisar ser validado contra a instância real, porque não existe homologação
  ainda (fora de escopo desta sprint, por definição) — mitigação: testar em horário de
  baixo tráfego e com plano de rollback pronto antes de cada mudança ir ao ar.

## 9. Plano de rollback (desta sprint especificamente)

- **Commits de documentação** (itens 3, 4, 5 do escopo original — procedimentos, tags,
  branch policy): risco de rollback é baixíssimo (não é código executável). Reverter é
  `git revert` trivial se algo estiver errado no texto.
- **Scripts `typecheck`/`validate`** (item 2): adição pura em `package.json`, não altera
  comportamento de build/deploy existente. Rollback: `git revert` do commit específico.
- **Generalização da dedup no webhook** (item 6): é a única mudança desta sprint que toca
  comportamento em produção. Plano:
  - Commit isolado, só essa mudança.
  - Testar primeiro enviando webhooks de teste manualmente (via curl/Postman com um
    `messageid` fixo, repetido) antes de expor à instância real.
  - Se em produção o comportamento for inesperado (ex: mensagens legítimas sendo
    bloqueadas): reverter o commit e redesployar — a tabela `fonti_events` não precisa
    de rollback de schema, só o código que a usa.
  - Critério de abortar: qualquer mensagem de cliente real não processada dentro de ~1
    minuto de monitoramento ativo pós-deploy.
- **Migration da dedup** (item 7, se necessária): só é destrutiva se mudarmos a PK
  existente. Se for o caso, escrever também o passo manual de reversão (recriar `fonti_events`
  com PK original) antes de aplicar.

## 10. Divisão em commits (proposta para a Etapa B)

Ordem sugerida, cada um testável isoladamente:

1. `chore: adiciona typecheck e validate aos scripts` — só `package.json`.
2. `chore: ignora tsconfig.tsbuildinfo` — `.gitignore` + remoção do índice (depende da
   sua confirmação na seção 1).
3. `docs: adiciona procedimentos de rollback e incidente` — os 4 arquivos da seção 4 +
   `CHANGELOG.md`.
4. `docs: formaliza politica de branches` — dentro de um dos arquivos acima ou um novo
   `docs/politica-branches.md`, a definir no detalhamento da Etapa B.
5. *(tag `v0.2.0` criada aqui, sobre o commit 4, não misturada com código de dedup)*
6. `fix(webhook): generaliza deduplicacao de mensagens por messageid` — único commit que
   toca `route.ts`, isolado dos demais, com teste manual documentado no corpo do commit.
7. *(migration da dedup, se necessária, em commit separado do item 6, para poder reverter
   independentemente)*

Nenhum commit "final" acumulando tudo — cada um acima é meu limite de granularidade
proposto; posso quebrar ainda mais se você preferir.

---

## Perguntas em aberto antes da Etapa B

1. `_projeto` e `tsconfig.tsbuildinfo` — o que fazer com eles antes do commit de
   checkpoint?
2. Confirma `v0.2.0` como nome da tag, ou prefere outro esquema?
3. Confirma que os snapshots do Itaú ficam fora desta sprint (Sprint de Calibração
   trata separadamente)?
4. Autorizo verificar `npx vercel logs` para confirmar quais `EventType` reais chegam no
   webhook antes de generalizar a dedup (seção 5)?
5. Confirma a chave de dedup como `messageid` isolado, ou prefere já ir para
   `(messageid, instancia_token)` por segurança?
