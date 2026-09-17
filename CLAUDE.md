# credifon-crm — Instruções do projeto

## Migrations criadas em worktree

Sempre que uma migration SQL for criada dentro de uma worktree (`.claude/worktrees/<nome>/supabase/migrations/`),
copie o(s) arquivo(s) `.sql` também para `supabase/migrations/` na raiz do repo principal
(mesmo antes do merge da feature/PR).

**Por quê:** o usuário roda as migrations manualmente no Supabase SQL Editor a partir do VSCode,
que tem aberta a pasta raiz do projeto — não a pasta da worktree. Se a migration ficar só na
worktree, ela não aparece no Explorer e o usuário não consegue rodá-la, mesmo depois de eu avisar
que está pendente.

Isso já é um padrão estabelecido (ex: migrations 280-284 da feature de perfis de acesso
customizados foram copiadas assim antes do merge do PR #240). Nunca esquecer de repetir esse passo
ao terminar tasks de plano que envolvem migration em worktree.

## Pegadinhas de arquitetura (bot WhatsApp / *fonti)

Achados reais de bugs em produção (2026-09-15, incidente com 3 comerciais testando
simultaneamente) — conhecimento que qualquer mudança futura no bot precisa respeitar pra não
reintroduzir os mesmos problemas.

### Telefone sempre resolvido via RPC canônica, nunca por busca solta

`garantirConversaOperador()` (`src/lib/conversas/garantirConversaOperador.ts`) chama a RPC
`obter_ou_criar_conversa`, que canonicaliza o telefone (`telefone_canonico_br`, sempre
`55DDNNNNNNNNN` com o "9") e faz `INSERT ... ON CONFLICT` atômico. **Qualquer leitura de estado
por telefone tem que resolver o id da conversa pelo mesmo caminho** (`garantirConversaOperador`),
nunca fazer `ILIKE '%sufixo'` + `ORDER BY updated_at LIMIT 1`. Já existem (e podem voltar a
existir) linhas duplicadas de `conversas` pro mesmo número físico com strings diferentes (ex.:
`44984558938` vs `5544984558938`, criada por um caminho que não canonizava) — uma busca solta
pode pegar a linha errada e o comando some sem erro nenhum. Isso já mordeu `*consorcio`,
`*custas` e `*simula` (`consorcio-pendente.ts`, `custas-pendente.ts`, `simula-pendente.ts`).

### `conversas.status = 'humano'` não significa atendimento humano de verdade

`*fonti inicio` (upload de documentos) grava a conversa do próprio operador com
`status: 'humano'` só como âncora técnica pra vincular documentos — nada a ver com um
atendimento humano real. Um portão em `src/app/api/bot/whatsapp/webhook/route.ts` que pula
processamento de pendências quando a conversa está `'humano'` (pensado pra alguém abrir uma
conversa humana de verdade com o número do operador) já bloqueou sem querer o próprio fluxo do
operador em `*consorcio`/`*custas`/`*simula`. **Regra**: qualquer pendência de workflow interno
(`buscarSimulaPendente`/`buscarCustasPendente`/`buscarConsorcioPendente`) tem que ser checada
**antes** desse portão e ter prioridade se estiver ativa — só cair no portão quando não há
pendência interna aberta.

### `fonti_marcas.iniciado_at` só é janela de busca de documento quando `sessao_real = true`

`fonti_marcas` guarda tanto sessões reais (`*fonti inicio`/`*fonti processo`, `sessao_real =
true`) quanto marcas criadas só pra guardar `candidatos_pendentes` de uma ambiguidade de
`*fonti salva` sem sessão aberta (`sessao_real = false`, ver migration `20260915_308`).
`obterMarcaInicio()` só deve devolver `iniciado_at` como início de janela quando
`sessao_real = true` — senão a busca de documentos em `vincularDocumentosRecentesPorTelefone`
usa como corte o momento em que o comando foi digitado, excluindo os documentos enviados antes
(o fluxo normal). Sempre que criar/atualizar uma linha de `fonti_marcas`, setar `sessao_real`
explicitamente (`true` pra sessão real, `false` pra marca só de ambiguidade).

### Instagram usa `graph.instagram.com`, não `graph.facebook.com`

O app "Fonti Integração" no Meta usa o produto **"API do Instagram com login do Instagram"**
(não Facebook Login) — os tokens gerados nesse fluxo só funcionam em `graph.instagram.com`.
Além disso, o **App Secret certo não é o geral do app** (Configurações do App > Básico), é o
"Chave secreta do app do Instagram" em Casos de uso > API do Instagram > Configuração da API
com login do Instagram (tem ID do app do Instagram próprio também). Usar o host ou o secret
errado falha silenciosamente (401 no webhook, ou busca de nome de perfil sempre retornando
null) — ver `src/app/api/instagram/webhook/route.ts` e
`src/lib/comunicacao/enviarMensagemInstagram.ts`.

## Pegadinhas de arquitetura (simulador de financiamento — `simuladorFinanciamento/`)

Achados reais parametrizando imóvel comercial (Bradesco e Caixa, 2026-09-16) — repetir
o mesmo erro é fácil porque o motor tem dois caminhos paralelos pra Caixa.

### Qualquer ajuste pra Caixa precisa ser feito em `simularBanco` E `simularCaixaDuplo`

`engine.ts` tem DOIS lugares que montam o `SimulationCriteria` da Caixa: `simularBanco`
(chamado isoladamente) e `simularCaixaDuplo` (chamado por `simularTodosBancos`, que é o
caminho REAL usado pelo bot `*fonti`/`*simula`). Um ajuste feito só em `simularBanco` parece
funcionar em teste unitário direto (`simularBanco('caixa', ...)`) mas não tem nenhum efeito
no bot de verdade — testar sempre via `simularTodosBancos`, nunca só `simularBanco`, antes de
considerar um fix da Caixa validado. Achado corrigindo taxa/tarifa do comercial (PR #300):
o fix só em `simularBanco` não aparecia nas respostas reais do WhatsApp.

### Bancos com regra especial por modalidade usam overrides numa CHAVE separada, nunca a do residencial

Bradesco Comercial PF (PR #298) tem taxa/MIP/DFI próprios, DIFERENTES do Bradesco
residencial — implementado como uma segunda entrada no mapa de overrides
(`overridesMap['bradesco_comercial']`, colunas `taxa_anual_comercial`/`mip_comercial`/
`dfi_comercial` na tabela `bancos`), nunca reaproveitando a chave `'bradesco'` do
residencial. Qualquer banco novo com uma modalidade de regra diferente (comercial, CGI,
etc.) deve seguir o mesmo padrão — misturar as duas na mesma chave silenciosamente aplica a
taxa errada numa das duas modalidades.

### `CAIXA_DFI_RATE`/`CAIXA_MIP_RATES` são globais (residencial + comercial) — não recalibrar com 1 dado só

Ajustar essas constantes (constantes.ts) afeta TODAS as modalidades da Caixa de uma vez —
não existe separação residencial/comercial nelas hoje (diferente da taxa, que ganhou
`CAIXA_COMERCIAL_TAXA_ANUAL` própria no PR #300). Uma tentativa de refinar `CAIXA_DFI_RATE`
com um único PDF de simulação comercial quebrou 2 testes de regressão residencial já
calibrados com outros casos-âncora — teve que ser revertida. Só mexer nessas tabelas globais
com dado real suficiente pra confirmar que a mudança vale pras DUAS modalidades, ou criar uma
constante separada tipo `CAIXA_COMERCIAL_TAXA_ANUAL` em vez de sobrescrever a global.
