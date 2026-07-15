# Protocolo de Segurança e Recuperação do Fonti

> Documento de diagnóstico e política. Não altera código, não altera infraestrutura.
> Criado em 2026-07-15, no dia seguinte a um incidente de ~3h de recuperação envolvendo
> duas instâncias de WhatsApp e risco de corrupção de dados de conversas/documentos/clientes.

---

## Princípio central

Git protege o código. Não protege, sozinho: banco de dados, migrations já executadas,
configurações, variáveis de ambiente, webhooks, tokens, instâncias WhatsApp, filas,
documentos e histórico de conversas. Hoje, **todos esses componentes fora do código
não têm nenhuma rede de segurança** — é o que este protocolo endereça.

---

## Parte 1 — Diagnóstico do estado atual

### 1. Estratégia de branches
Não existe estratégia formal. `git branch -a` mostra `main` e uma única branch de feature
(`feature/item-4-multiplas-analises-credito`, aparentemente obsoleta/não mergeada). O log
de commits recente (últimos ~20 commits, incluindo os fixes do incidente de ontem) foi
feito **inteiramente sobre `main`**.

### 2. Alterações diretas na branch principal?
Sim. Confirmado pelo histórico: `git log` mostra commits de correção de bugs críticos
(`fix(pessoa)`, `fix(bot)`) direto em `main`, sem branch intermediária, sem PR, sem review.
Isso inclui os commits do incidente de ontem — a correção em produção foi feita na mesma
branch que está *deployada continuamente*.

### 3. Ambiente separado de homologação?
Não existe. Não há `.vercel/`, não há segunda URL de Supabase configurada em lugar
nenhum, nenhuma menção a "staging"/"homolog" no código (só uma ocorrência incidental em
`docs/arquitetura-documental-fonti.md`, não é um ambiente real). `.env.local` aponta para
um único projeto Supabase e uma única instância Uazapi.

### 4. Produção e teste compartilham banco, webhooks, tokens ou instâncias?
Sim, totalmente. Não existe segundo banco. As "duas instâncias de WhatsApp" do incidente
de ontem eram duas instâncias **reais de produção** (números de equipe) rodando contra o
**mesmo banco de produção** — não havia ambiente de teste isolado onde testar com uma
segunda instância sem risco. Isso é a causa estrutural do incidente, não um detalhe.

### 5. Como são feitos os backups do banco hoje?
Não há backup próprio no projeto (nenhum script, nenhum cron, nenhuma menção em `scripts/`).
A única rede de segurança é o que o **Supabase gerencia por padrão no plano do projeto**
(Point-in-Time Recovery / backups diários automáticos da plataforma, se o plano contratado
incluir — não verificável a partir do repositório, precisa ser checado no Dashboard →
Settings → Database → Backups).

### 6. Existe backup automático?
Não gerenciado pelo time — depende inteiramente da política padrão do Supabase para o
plano atual. Nenhum backup adicional (dump manual, export agendado, cópia de Storage) é
feito pelo projeto.

### 7. Existe política de retenção?
Não. Não há retenção definida além da que o Supabase aplicar por padrão do plano.

### 8. Já foi testada uma restauração real?
Não há evidência de nenhum teste de restauração no histórico do projeto.

### 9. Como as migrations são executadas?
Manualmente, via **Supabase Dashboard → SQL Editor**, colando o conteúdo dos arquivos
`supabase/migrations/*.sql` em ordem (documentado explicitamente em `SETUP.md`). Não há
Supabase CLI configurado (nenhum `supabase/config.toml`, nenhum `supabase link`, nenhum
`supabase db push`), não há execução automatizada, não há registro formal de "quais
migrations já rodaram em produção" fora da convenção do nome do arquivo (prefixo de data
+ número sequencial). Há **175 arquivos de migration** hoje.

### 10. Existe forma de reverter migrations?
Não. Nenhuma migration tem arquivo `.down.sql` ou equivalente. Reversão, quando possível,
teria que ser escrita manualmente e ad-hoc a partir do entendimento de cada migration.

### 11. Quais migrations atuais são irreversíveis?
Duas contêm `DROP TABLE`/`DROP COLUMN` destrutivos:
- `20260601_065_parceiros_full.sql` — `DROP TABLE processo_corretores CASCADE` e
  `ALTER TABLE processos DROP COLUMN imobiliaria_id` (dados anteriores perdidos
  permanentemente).
- `20260701_148_aposentar_tabelas_antigas.sql` — dropa `documentos_clientes`,
  `processo_documentos`, `documento_processo_vinculos` inteiras. Esta é a mais bem
  documentada do projeto: tem um comentário `⚠️ DESTRUTIVA` explicando que só deveria
  rodar após validação manual completa de todos os fluxos migrados — é o único exemplo
  no projeto do padrão de cautela que este protocolo quer generalizar.

Qualquer `ALTER COLUMN ... TYPE`, `DROP DEFAULT`, ou migration que reescreve dados
existentes (não apenas adiciona) também é, na prática, irreversível sem backup prévio —
não foram todas auditadas individualmente aqui, mas o padrão de risco é o mesmo.

### 12. Existe feature flag no projeto?
Não. Busca por "feature flag" no código-fonte não retornou nenhum resultado. Toda
funcionalidade nova vai direto ao ar para 100% dos usuários assim que o commit é
deployado.

### 13. Quais funcionalidades críticas deveriam possuir feature flag?
Com base no que hoje é crítico e sensível a mudança (ver "Áreas críticas" abaixo):
processamento de mensagens do bot WhatsApp (`processarMensagem`/`state-machine`),
qualquer mudança em `buscarOuCriarPessoa` (já causou duplicação de Pessoa duas vezes),
o motor de simulação, qualquer novo canal/instância WhatsApp antes de ficar 100% estável,
e futuras automações de mensageria (régua de comunicação, já mapeada em sessão anterior).

### 14. Como os tokens das instâncias WhatsApp são resolvidos?
Cadeia de fallback em `src/app/api/bot/whatsapp/webhook/route.ts`: o token vem do
`payload.token` enviado pela Uazapi a cada webhook; se ausente, cai para
`process.env.UAZAPI_INSTANCE_TOKEN` (uma única variável de ambiente, singular). O token
é então usado para buscar a linha correspondente na tabela `instancias` (`token TEXT
UNIQUE`); se não encontrar por token exato, há uma **segunda tentativa de fallback por
número de telefone do owner** (`route.ts:241-251`). Essa cadeia de fallbacks (token do
payload → env var global → busca por telefone) é exatamente o tipo de ambiguidade que já
causou o bug de "detecção de eco" descrito no incidente anterior (comparava contra
qualquer instância ativa, não só a que recebeu o webhook — corrigido, mas o padrão de
fallback permanece na resolução de instância).

### 15. Existe risco de duas instâncias processarem o mesmo evento?
Sim, estruturalmente. Não há nenhum lock, fila ou deduplicação por `messageid` antes de
`processarMensagem` ser chamado — cada webhook recebido é processado imediatamente e de
forma independente. Se a Uazapi reenviar um webhook (retry de rede, timeout) ou se duas
instâncias reportarem o mesmo evento por má configuração de roteamento (como ocorreu no
incidente), não há nada no código que detecte ou bloqueie o reprocessamento.

### 16. Existe idempotência nos webhooks?
Não encontrada. Busca por `messageid`/idempotência no corpo do handler mostra que o
`messageid` é usado apenas para nomear/baixar mídia (`baixarMidiaUazapi`) e como metadata
ao salvar a mensagem — nunca como chave de deduplicação antes de processar. `webhook_logs`
(tabela existente no banco) registra apenas webhooks de **leads externos/parceiros**, não
os webhooks de WhatsApp.

### 17. Existe isolamento entre dados de teste e dados reais?
Não. Sem ambiente de homologação (pergunta 3), qualquer teste manual com uma instância
WhatsApp real toca o banco de produção, cria Pessoas/Leads/Conversas reais, e pode
disparar automações reais (e-mails, mensagens). O incidente de ontem é evidência direta
disso.

### 18. Como o Vercel está organizado entre preview/homologação/produção?
Não verificável a partir do repositório local (não há `.vercel/project.json` versionado —
o link do projeto é feito fora do controle de versão, como é padrão da Vercel). O que se
sabe por `vercel.json`: só há um cron configurado (`/api/leads/followup/notificar`, diário
às 9h), sem diferenciação por ambiente. Pelo padrão de "deploy automático a cada push no
main" (registrado em memória de sessões anteriores), cada push em `main` vai
**diretamente para o domínio de produção** `fonti.app.br` — não há evidência de um
ambiente de preview sendo usado deliberadamente como homologação antes do merge.

### 19. Existe registro de qual versão do código está em produção?
Não formalmente. Não há tags Git (`git tag` não foi verificado, mas nenhuma menção a
versionamento semântico em `package.json`, que está fixo em `"version": "0.1.0"` desde o
início do projeto). A única rastreabilidade é o commit SHA que a Vercel associa ao deploy
— útil, mas não há processo humano de "isso é a versão X, testada e estável".

### 20. Existe procedimento documentado de rollback?
Não. Nenhum arquivo no repositório descreve um procedimento de rollback (nem de código,
nem de banco). A recuperação do incidente de ontem foi feita ad-hoc, por investigação
manual, levando ~3 horas.

---

## Parte 2 — Riscos encontrados (síntese)

Do mais grave para o menos grave:

1. **Sem ambiente de homologação real** — toda alteração e todo teste manual acontece
   contra dados e instâncias reais de produção. É a causa raiz estrutural do incidente de
   ontem e do risco de qualquer incidente futuro semelhante.
2. **Sem backup sob controle do time** — dependência total do padrão do Supabase, sem
   verificação do plano/retenção, sem teste de restauração. Se o Supabase não cobrir o
   caso (ex: erro humano detectado 3 dias depois), não há rede de segurança.
3. **Migrations manuais, irreversíveis, sem registro formal** — 175 arquivos aplicados à
   mão via SQL Editor, ao menos 2 destrutivos, sem `down.sql`, sem tabela de controle de
   versão do schema além da convenção de nome de arquivo.
4. **Desenvolvimento direto em `main` com deploy automático** — qualquer commit,
   inclusive um em investigação/experimental, vai para produção assim que dá push.
5. **Sem feature flags** — não há como desligar uma funcionalidade nova sem reverter
   código e re-deployar.
6. **Sem idempotência/deduplicação nos webhooks do WhatsApp** — reprocessamento duplo é
   possível e não é detectado.
7. **Cadeia de fallback ambígua na resolução de instância/token** — já foi fonte de bug
   real (detecção de eco cruzada entre instâncias); o padrão de fallback continua
   presente na resolução de instância mesmo após a correção pontual.
8. **Sem procedimento de rollback documentado** — cada incidente é resolvido do zero,
   por investigação manual (3h no caso de ontem).
9. **Sem versionamento/tags** — impossível apontar com certeza "qual código está rodando
   em produção agora" além do SHA do commit.
10. **Sem CI** — não há `.github/workflows` nem qualquer pipeline automatizado rodando
    `npm run test`/`typecheck` antes do deploy; a Vercel builda e publica com base
    apenas em `next build` ter sucesso, o que não cobre testes nem type errors não
    bloqueantes de build.

---

## Parte 3 — Arquitetura mínima de segurança (proposta, não implementada)

Meta: **o menor conjunto de mudanças de processo e infraestrutura que elimina os riscos
1–3 acima**, sem exigir reescrever a stack. Nesta ordem de prioridade:

1. **Segundo projeto Supabase (homologação)**, com seu próprio banco, aplicando as
   mesmas 175 migrations, com dados fictícios.
2. **Segunda instância Uazapi dedicada a testes**, nunca usada com números reais de
   cliente, apontando para o webhook do ambiente de homologação.
3. **Segundo deployment Vercel** (ou uso disciplinado do Preview Deployment nativo da
   Vercel por branch) apontando para o Supabase e a instância de homologação — nunca
   para produção.
4. **Rotina de backup**: confirmar/ajustar o plano do Supabase para PITR adequado, e
   adicionar um `pg_dump` agendado (ex: via GitHub Actions ou cron externo) como segunda
   camada, independente da plataforma.
5. **Branch protection em `main`**: `main` passa a representar "o que está em produção",
   nunca recebe commit direto — mesmo trabalhando sozinho, o hábito de sempre passar por
   uma branch de feature já cria o ponto de checkpoint necessário para rollback rápido
   (`git revert`/trocar branch), em vez de precisar reconstruir o estado anterior manualmente.

Isso é infraestrutura, portanto tem custo (2º projeto Supabase pode exigir plano pago,
2ª instância Uazapi tem custo de número) — dimensionar antes de decidir.

---

## Parte 4 — Política de branches e commits

- `main` = sempre o que está em produção. Nenhum commit direto (nem do próprio usuário)
  fora de hotfixes de emergência documentados como tal.
- Toda alteração de risco (ver "Áreas críticas") nasce em `feature/<escopo-curto>` ou
  `fix/<escopo-curto>`.
- Commits pequenos e semanticamente isolados — um commit = uma mudança de comportamento
  compreensível sozinha. Evitar o padrão observado no incidente de ontem de múltiplos
  fixes encadeados e debug temporário misturados na mesma sequência de commits sem
  isolamento claro entre "investigação" e "correção definitiva".
- Migration em commit separado da lógica de aplicação que a usa (permite reverter/auditar
  cada um independentemente).
- Merge para `main` só depois do checklist de "antes de publicar" (Parte 8).

## Parte 5 — Política de versões e tags

Não usar contagem de commits nem cadência fixa de tempo como gatilho. Um ponto de versão
é criado **quando um marco operacional estável é atingido** — por exemplo: "fluxo de
`*inicio` → documentos → `*cria cliente` voltou a funcionar de ponta a ponta e foi
validado manualmente" (exatamente o marco que fechou o incidente de ontem seria, sob esta
política, o momento de criar uma tag).

- Tag Git leve por marco: `v0.<n>.0-estavel` ou `v0.<n>.0` seguindo o `0.1.0` já presente
  em `package.json` — sobe o `minor` a cada marco estável, `patch` para hotfix pontual
  sobre um marco já taggeado.
- `package.json.version` passa a ser atualizado junto com a tag (hoje está congelado em
  `0.1.0` desde o início — não reflete nada).
- Changelog simples (`CHANGELOG.md` na raiz ou em `docs/`): uma entrada por tag, 3-5
  linhas descrevendo o que mudou e por quê — não um changelog automatizado de commits,
  um resumo humano do marco.
- Identificação da versão publicada: expor a tag/SHA atual em algum lugar acessível (ex:
  rodapé de uma tela interna, ou endpoint `/api/status`) para saber, olhando o sistema
  rodando, qual versão está ativa — hoje isso não existe.

## Parte 6 — Política de backup

- **Frequência**: diária, automática (via plano Supabase confirmado + `pg_dump` agendado
  como segunda camada).
- **Retenção**: mínimo 7 dias de backups diários + 1 backup semanal retido por 4 semanas.
  Ajustar para cima se o plano Supabase permitir sem custo adicional.
- **Backup antes de migration**: obrigatório para qualquer migration que altere ou remova
  dados existentes (viu-se que isso já é reconhecido informalmente — migration 148 tem o
  comentário `⚠️ DESTRUTIVA` — mas não é uma prática sistemática).
- **Backup antes de alteração crítica**: mesmo sem migration, qualquer mudança em área
  crítica (Parte 9) que toque dados existentes merece um snapshot prévio.
- **Identificação versão código ↔ versão banco**: cada backup nomeado/anotado com o SHA
  do commit ou a tag vigente no momento (`backup_2026-07-15_v0.5.0_a1b2c3d.sql`), para
  saber exatamente que par código+schema aquele backup representa.
- **Teste periódico de restauração**: pelo menos uma vez, restaurar um backup real em um
  banco descartável e confirmar que a aplicação sobe contra ele — nunca foi feito até
  hoje.
- **Documentos/Storage**: os buckets do Supabase Storage (`documentos`, `logos`) também
  precisam de proteção — hoje não há menção a backup de Storage em lugar nenhum;
  documentos de cliente (RG, comprovantes, contratos) são tão críticos quanto o banco
  relacional.
- **Procedimento de recuperação**: documentar passo a passo (mesmo que curto) o "como
  restaurar" — hoje, se um backup existir, ninguém tem um roteiro escrito de como usá-lo
  sob pressão.

## Parte 7 — Política de migrations

- Migration = arquivo único, idempotente onde possível (`IF NOT EXISTS`/`IF EXISTS`, já é
  o padrão observado no projeto — manter).
- Migration destrutiva (`DROP TABLE`, `DROP COLUMN`, `ALTER ... TYPE` com perda de
  precisão, rewrite de dados) exige: comentário `⚠️ DESTRUTIVA` no topo do arquivo (já
  existe um exemplo real disso — generalizar a prática), backup imediatamente anterior, e
  execução primeiro em homologação.
- Sempre que viável, escrever também a migration inversa (mesmo que não seja
  automaticamente aplicável, documentar manualmente "para reverter, rodar X").
- Nenhuma migration nova aplicada direto em produção sem antes ter rodado com sucesso em
  homologação (pressupõe a Parte 3 — segundo projeto Supabase).
- Manter a convenção de nome já usada (`YYYYMMDD_NNN_descricao.sql`) — funciona bem como
  registro de ordem, só falta o par (backup + ambiente de teste) ao redor dela.

## Parte 8 — Separação de ambientes

### Produção
- Banco de produção (Supabase atual).
- Instâncias WhatsApp reais/oficiais (números reais de atendimento).
- Webhooks oficiais apontando para `fonti.app.br`.
- Dados reais de clientes.
- Variáveis de ambiente próprias (as já existentes em produção na Vercel).

### Homologação
- Banco separado (novo projeto Supabase, migrations replicadas).
- Instância WhatsApp dedicada a teste (número descartável/de teste, nunca um número real
  de atendimento — é precisamente o que faltou ontem).
- Webhook separado apontando para o deployment de homologação.
- Dados fictícios ou anonimizados (nunca clonar dados reais de cliente sem anonimizar —
  CPF, telefone, documentos de identidade são dados sensíveis).
- Variáveis de ambiente próprias (`.env.homolog` ou equivalente, nunca compartilhando
  `UAZAPI_INSTANCE_TOKEN`/`SUPABASE_SERVICE_ROLE_KEY` com produção).

**Regra dura**: nenhum processo (webhook, cron, chamada manual) de um ambiente deve
conseguir escrever no banco ou instância do outro. Isso elimina por construção o cenário
do incidente de ontem.

## Parte 9 — Estratégia de feature flags

Não existe hoje nenhum mecanismo — precisa ser decidido (não implementado agora) entre:
tabela simples no Supabase (`feature_flags` com `chave`, `ativo`, `empresa_id`) lida no
boot da rota/handler, ou variável de ambiente por deployment (mais simples, porém exige
redeploy para alternar). Dado o tamanho do projeto, uma tabela simples é provavelmente
suficiente e evita redeploy para ligar/desligar algo sob incidente.

Funcionalidades que deveriam nascer atrás de flag: qualquer mudança no core do bot
(`processarMensagem`, `state-machine`, `fonti-comandos`), qualquer mudança em
`buscarOuCriarPessoa`/resolução de Pessoa por telefone, qualquer nova automação de
mensageria proativa (régua de comunicação), e qualquer alteração na cadeia de resolução
de instância/token do webhook.

## Parte 10 — Procedimento de rollback

Para código: `git revert` do(s) commit(s) do marco quebrado, ou redeploy manual na Vercel
apontando para a tag/SHA da última versão estável conhecida (usa a Parte 5 — só funciona
se houver tags).

Para banco: restaurar o backup mais recente anterior à migration problemática (usa a
Parte 6) — só é rápido se o backup existir e já tiver sido testado ao menos uma vez.

Para feature específica: desligar via feature flag (Parte 9) antes de decidir se
reverte código — resposta mais rápida que um deploy.

Este procedimento deveria ter existido ontem; sua ausência é a razão direta da
recuperação ter levado ~3h em vez de minutos.

## Parte 11 — Procedimento para incidentes

1. Identificar e comunicar (mesmo que só para si mesmo, por escrito) o sintoma
   observado e o horário de início.
2. Verificar se dá para isolar via feature flag antes de mexer em código/banco.
3. Se envolver dado de cliente em risco: parar a fonte do problema primeiro (ex:
   desativar a instância WhatsApp problemática) antes de investigar a causa.
4. Rollback de código (Parte 10) se a causa for uma alteração recente e identificável.
5. Restaurar backup apenas se dados já tiverem sido corrompidos e não houver forma de
   corrigir com um script de reparo direcionado (restaurar é a opção mais cara/lenta).
6. Depois de resolvido: registrar o que aconteceu, causa raiz, e o que este protocolo
   deveria ter impedido — alimentar de volta na lista de "áreas críticas"/gatilhos de
   flag se for o caso.

## Parte 12 — Checklist obrigatório antes de alterações críticas (Regra dos Cinco Pontos Seguros)

Nenhuma alteração em área crítica começa sem:

- [ ] Código atual commitado (nada solto no working directory).
- [ ] Branch exclusiva criada para a alteração.
- [ ] Testes atuais (`npm run test`) e typecheck (`tsc --noEmit`, hoje não é um script
      nomeado em `package.json` — precisaria ser adicionado) passando antes de começar.
- [ ] Backup realizado, se a alteração tocar dados existentes.
- [ ] Plano de rollback descrito por escrito (mesmo que 2 linhas).

## Parte 13 — Checklist obrigatório antes de publicar em produção

- [ ] Testes automatizados passando (`npm run test`).
- [ ] Typecheck limpo.
- [ ] Testes manuais dos fluxos afetados (em homologação, não em produção).
- [ ] Teste de regressão dos fluxos críticos vizinhos (ver Parte 14).
- [ ] Backup imediatamente anterior à publicação.
- [ ] Plano de rollback confirmado e acessível.
- [ ] Ativação controlada (feature flag ligada gradualmente, se aplicável).
- [ ] Monitoramento ativo nos primeiros minutos/horas após a publicação (acompanhar
      `npx vercel logs` como já é feito hoje — ver memória de sessão anterior sobre
      retenção curta de logs).
- [ ] Criação de tag/versão estável após confirmação de que o marco está sólido.

## Parte 14 — Áreas consideradas críticas

WhatsApp (webhook, envio, instâncias) · conversas · documentos · criação de Pessoa ·
Captação · Negócios/Processos e mudança de etapa · autenticação · banco de dados e RLS ·
migrations · motor de simulação · integrações externas (Clicksign, SMTP, Anthropic,
OpenAI) · webhooks (todos, não só WhatsApp) · jobs e crons · qualquer cenário com
múltiplas instâncias WhatsApp simultâneas.

---

## Parte 15 — Arquivos e configurações que precisariam ser criados/alterados

(Listado para dimensionamento — nada disto foi criado nesta sessão.)

- Segundo projeto Supabase + `.env.homolog` (ou seção equivalente documentada).
- `CHANGELOG.md`.
- Script de backup (`scripts/backup-db.mjs` ou equivalente) + agendamento.
- Script/checklist de teste de restauração.
- Tabela `feature_flags` (migration nova) + helper de leitura (`src/lib/featureFlags.ts`).
- `package.json`: adicionar script `typecheck` (`tsc --noEmit`) — hoje não existe como
  comando nomeado, só é validado implicitamente pelo `next build`.
- Endpoint/label de versão publicada (ex: `/api/status` ou rodapé admin).
- `docs/procedimento-rollback.md` e `docs/procedimento-incidente.md` (versões
  operacionais, passo a passo, dos procedimentos descritos nas Partes 10-11).
- Regra de branch protection em `main` (configuração no GitHub, fora do código).

## Parte 16 — Plano de implantação em pequenos passos

Ordem sugerida (cada passo é validável isoladamente antes do próximo):

1. Criar tag da versão estável atual (marco: "incidente de ontem resolvido e validado").
2. Adicionar script `typecheck` ao `package.json`.
3. Escrever `docs/procedimento-rollback.md` e `docs/procedimento-incidente.md` a partir
   do que já está descrito aqui (formalizar, não inventar).
4. Confirmar no Supabase Dashboard o plano/retenção de backup atual — só depois decidir
   se `pg_dump` agendado adicional é necessário.
5. Testar uma restauração de backup em banco descartável — primeira vez que isso
   acontece no projeto.
6. Criar o segundo projeto Supabase de homologação + aplicar as 175 migrations lá.
7. Criar instância Uazapi de teste dedicada, nunca usada com número real.
8. Configurar segundo deployment/branch na Vercel apontando para homologação.
9. Adotar a disciplina de branch (Parte 4) a partir da próxima alteração de risco —
   não retroativo.
10. Introduzir `feature_flags` só quando a próxima funcionalidade de alto risco
    (ex: régua de comunicação) começar a ser desenhada — não como exercício isolado.

## Parte 17 — Critérios objetivos de aceite

O protocolo está "em vigor" quando, verificavelmente:

- Existe uma tag Git correspondente a um marco estável (não `0.1.0` genérico).
- Existe um segundo ambiente (Supabase + Vercel + instância WhatsApp) isolado de
  produção, comprovadamente incapaz de escrever em dados/instâncias reais.
- Uma restauração de backup já foi executada com sucesso ao menos uma vez, documentada.
- `npm run test` e um script de typecheck existem e passam antes de qualquer merge em
  `main`.
- `docs/procedimento-rollback.md` existe e foi seguido (não só escrito) em pelo menos um
  incidente real ou simulado.
- Nenhum commit novo em área crítica (Parte 14) chega em `main` sem ter passado por
  branch exclusiva + checklist da Parte 12.
