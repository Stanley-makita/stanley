# Documentos da Pessoa → Lead/Negócio (enviar, trazer, remover) — Design

**Data:** 2026-09-25
**Status:** aprovado em conversa, aguardando revisão do spec escrito

## Objetivo

Documento que ficou só na Pessoa (sem lead nem negócio) precisa ser fácil de achar e de direcionar
para um lead ou negócio, sem reenviar o arquivo. Caso real (2026-09-25): `*salva joao` → "joao do
oculos", que não tem lead aberto — os 2 arquivos ficaram só na Pessoa e não havia como, pelo sistema,
mandá-los depois para um lead/negócio novo.

**Sucesso:** o operador acha os documentos soltos de uma pessoa e, em poucos cliques, coloca-os no
lead/negócio certo, já na pasta certa — e consegue desfazer um envio errado sem perder o documento.

## Decisões tomadas com o usuário

| Decisão | Escolha |
|---|---|
| De onde disparar | **Os dois sentidos**: "Enviar para…" na tela da Pessoa (empurrar) e "Trazer das pessoas" no Lead/Negócio (puxar), com a mesma janela por trás |
| Destinos possíveis | Leads/negócios em que a pessoa participa, com 1 clique, **+ busca livre** "Outro lead/negócio…" (por nome ou #proc-NNN), com aviso quando a pessoa não participa do destino |
| Desfazer | **Sim** — "Remover deste lead/negócio" tira só o vínculo; o documento continua na Pessoa |
| Arquitetura | Janela reaproveitável + **rotas no servidor** (não gravar direto do cliente) |

## Estado atual (base para o design)

- Tela da Pessoa (`src/app/(protected)/pessoas/[id]/page.tsx`) já tem aba Documentos:
  `<AbaDocumentos contexto="pessoa">` lista todo o acervo da pessoa (`documentos.pessoa_id`,
  `dominio='acervo_documental'`), **sem** mostrar vínculos, pastas ou ações de envio.
- Aba Documentos do Lead: vínculos `entidade_tipo='lead'` do lead **+** acervo da pessoa do lead sem
  vínculo com lead/lead_historico (aparece em "Sem pasta"). Mesmo universo no servidor:
  `carregarDocumentosDoLead()` (`src/lib/documentos/contextoLeadServidor.ts`).
- Aba Documentos do Negócio: **só** vínculos `entidade_tipo='processo'`. Não enxerga acervo das pessoas
  participantes.
- Única UI que vincula documento existente: passo "Vincular documentos ao processo" da conversão
  lead → negócio (`NovoProcessoModal.tsx`, `VincularStep`/`handleVincular`), que faz upsert direto do
  cliente em `documento_vinculos`.
- `documento_vinculos`: `UNIQUE (documento_id, entidade_tipo, entidade_id)`, `pasta_id`,
  `vinculado_por`, `vinculado_em`. RLS sem política de DELETE para usuário.
- Pasta sugerida: `inferirPastaSugerida()` (`src/lib/documentos.ts`) — pasta do lead > papel da pessoa
  no processo > tipo documental > nenhuma.
- Documentos **não** têm restrição de carteira na RLS; leads/processos têm (`leads.ver_todas`,
  migrations 186/217/320/321).

## Design

### 1. Telas

**Pessoa → aba Documentos**
- Cada documento mostra **etiquetas de onde está**: "Lead · {fase}", "#proc-NNN", ou "Só na pessoa".
- Filtro rápido **"Só na pessoa"**.
- Seleção múltipla (caixinhas) + botão **"Enviar para…"** → janela de destino:
  - topo: leads e negócios em que a pessoa participa (lead: `pessoa_id` ou `conjuge_pessoa_id`;
    negócio: comprador, cônjuge, vendedor), com fase/banco — 1 clique;
  - embaixo: busca **"Outro lead/negócio…"** (nome do cliente ou número `#proc-NNN`/`57`);
    destino sem a pessoa → aviso "Esta pessoa não participa deste negócio/lead" (não bloqueia).
- Confirmação: toast "N documentos enviados para {destino}".

**Lead e Negócio → aba Documentos**
- Botão **"Trazer das pessoas"** → mesma janela no sentido inverso: lista, agrupados por pessoa, os
  documentos do acervo das pessoas do lead/negócio que **ainda não estão vinculados aqui**, com tipo
  e data; o operador marca e confirma.
  - Negócio: pessoas = compradores (inclui cônjuge/coparticipante) + vendedores.
  - Lead: pessoas = `pessoa_id` + `conjuge_pessoa_id`. Documentos da própria pessoa do lead que não
    têm vínculo com lead nenhum **já aparecem** na aba (em "Sem pasta") e não entram na lista; entram
    os do cônjuge e os que estão vinculados a **outro** lead.
- Ação **"Remover deste lead/negócio"** por documento, com confirmação ("O documento continua na
  pessoa. Remover daqui?"). Só aparece em documento com **vínculo real** com este lead/negócio —
  não em documento de trabalho do negócio (esse continua só com "Excluir") nem no documento da pessoa
  que aparece virtualmente em "Sem pasta" do lead sem vínculo.

**Conversão lead → negócio** — o passo "Vincular documentos ao processo" mantém a tela atual e passa a
gravar pela rota de vínculo (pasta calculada no servidor). Comportamento visível igual ao atual.

**Bot** — resposta do `*salva` "Sem lead aberto — ficou só na pessoa" ganha a dica:
"Para mandar a um lead/negócio: Pessoas → {nome} → Documentos → Enviar para…".

### 2. Regras

**Permissão (checada no servidor, com o usuário da sessão):**
- Lead destino: `leads.editar` (via `podeServidor`) **e** o lead visível pro usuário pela RLS
  (carteira: responsável ou `leads.ver_todas`).
- Negócio destino: `processos.editar` **e** o processo visível pela RLS.
- Mesma regra para remover. A busca "Outro lead/negócio…" roda com o cliente do usuário (RLS) — só
  lista o que ele já enxerga.

**O que pode ser vinculado:** só `documentos.dominio = 'acervo_documental'`, `deleted_at IS NULL`, da
mesma `empresa_id`. `processo_trabalho` nunca entra.

**Efeito nos dados:**
- Enviar/Trazer = `upsert` em `documento_vinculos` (`onConflict: documento_id,entidade_tipo,entidade_id`,
  sem sobrescrever `pasta_id` de vínculo já existente), `vinculado_por` = usuário. **Nunca** altera
  `documentos.pessoa_id` nem copia arquivo.
- Remover = `DELETE` do vínculo `(documento_id, entidade_tipo, entidade_id)` com
  `entidade_tipo IN ('lead','processo')`. Documento e demais vínculos intactos.
- Registro do remover: linha em `lead_historico` (lead) ou `processo_comentarios` (negócio):
  "{usuário} removeu {nome do documento} deste {lead/negócio}" — mesmo padrão do "Atualizar cliente".

**Pasta:** `inferirPastaSugerida()` no servidor, com `pastaDoLeadCodigo` = pasta do vínculo do
documento com o lead de origem (quando houver), compradores/vendedores do processo destino e
`pasta_sugerida_codigo` do tipo. Para destino lead, mesma função (papéis vazios). Sem sugestão → sem
pasta.

### 3. Componentes

| Unidade | Responsabilidade |
|---|---|
| `POST /api/documentos/vinculos` | `{ documento_ids[], entidade_tipo: 'lead'\|'processo', entidade_id }` → valida permissão/visibilidade/domínio/empresa, calcula pasta, upsert; devolve `{ vinculados, ja_existiam }` |
| `DELETE /api/documentos/vinculos` | `{ documento_id, entidade_tipo, entidade_id }` → valida, remove, registra histórico |
| `GET /api/documentos/vinculos/candidatos` | `?entidade_tipo&entidade_id` → acervo das pessoas do lead/negócio ainda não vinculado ali, agrupado por pessoa (alimenta "Trazer das pessoas") |
| `GET /api/documentos/vinculos/destinos` | `?pessoa_id&busca` → leads/negócios da pessoa + resultado da busca livre, com flag `pessoa_participa` |
| `src/lib/documentos/vinculos.ts` | lógica pura/servidor reaproveitada pelas rotas: participantes de lead/negócio, candidatos, pasta |
| `EnviarDocumentosModal` / `TrazerDocumentosModal` | as duas janelas (escolher destino / escolher documentos das pessoas), ambas sobre as mesmas rotas |
| `AbaDocumentos.tsx` | etiquetas/filtro/seleção/"Enviar para…" (contexto pessoa); "Trazer das pessoas" e "Remover" (lead/processo) |
| `NovoProcessoModal.tsx` | `handleVincular` passa a usar a rota `POST` (tela mantida) |

Rotas usam `supabaseAdmin` para gravar e um cliente com o JWT do usuário para as checagens de
visibilidade (RLS), seguindo o padrão Bearer de `resolverUsuarioELead`. Toda query nova checa `error`
(regra do CLAUDE.md: PostgREST falha em silêncio) e UPDATE/DELETE confere linhas afetadas.

### 4. Erros

- Sem permissão/não visível → 403 "Você não pode alterar este lead/negócio"; nada gravado.
- Documento de trabalho, excluído, de outra empresa → ignorado e reportado (`recusados[]`) — os
  demais seguem.
- Remover vínculo que não existe → 404 (UI já não oferece).
- Falha ao gravar histórico do remover → loga, não desfaz a remoção (vínculo é a operação principal).

### 5. Testes

- Rotas: envia/remove certo; 403 sem `*.editar` ou fora da carteira; recusa `processo_trabalho`,
  excluído e outra empresa; upsert repetido não duplica nem troca pasta; remover não apaga documento
  nem outros vínculos; `pessoa_id` do documento nunca muda.
- `vinculos.ts`: participantes de lead (titular + cônjuge) e negócio (compradores + vendedores);
  candidatos excluem o que já está vinculado; pasta sugerida segue `inferirPastaSugerida`.
- Regressão: conversão lead → negócio continua vinculando os mesmos documentos com as mesmas pastas.
- Validação contra o banco real antes do merge (dados de teste: 2 docs do "joao do oculos", #proc-057),
  desfazendo tudo que o teste criar.

### 6. Entrega

Um PR, worktree, **sem migration** (tabela e históricos já existem). Validação final do usuário em
produção com perfil comercial e admin.

## Fora de escopo

- Mover o **dono** do documento para outra Pessoa (ex.: documento da Vitoria gravado no Joao) —
  continua como está; vincular não muda dono.
- Vincular documento de trabalho de um negócio a outro negócio.
- Histórico de vínculo criado (já há `vinculado_por`/`vinculado_em`).
