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

## Pegadinhas de arquitetura (auditoria completa do Fonti — 2026-09-17)

Auditoria via 5 revisões paralelas (webhook/roteamento, máquina de pendências, motor de
simulação, captação de lead/documentos, consórcio/custas) + implementação da feature MCMV.
Achados corrigidos nos PRs #302 (MCMV), #303 (críticos) e #304 (importantes/menores) —
conhecimento que qualquer mudança futura no bot precisa respeitar pra não reintroduzir os
mesmos problemas.

### MCMV mencionado explicitamente restringe a simulação só à Caixa/MCMV

Quando o texto cita MCMV (sigla, variações de digitação PMCMV/MCMVV/MDMV, ou "minha casa
minha vida"/"minha casa mv" — `detectarMcmvMencionado()`, `normalizador-captacao.ts`), o
campo `mcmv_mencionado` fica `true` e `resolverBancos()` (`motor-simulacao.ts`) força
`bancosIds = ['caixa']`, com o resultado filtrado só pra `programa.includes('MCMV')` —
nenhum outro banco/programa da Caixa (SBPE, Pró-Cotista) aparece. **Sem renda informada, o
sistema NUNCA processa isso direto** — abre pendência pedindo a renda antes (Etapa 3.5 em
`workflow-consulta.ts`/`workflow-captacao.ts`, e equivalente em `processarRespostaPendente`),
porque sem renda não dá pra saber a faixa. Qualquer novo caminho de cálculo que ignore essa
flag (ex.: um modo de simulação futuro) vai repetir o bug real corrigido no PR #302:
`calcularCapacidadeMaxima` e `autoDerivarEntradaFinanciado` calculavam com a taxa SBPE
genérica da Caixa mesmo com MCMV pedido, porque não checavam `dados.mcmv_mencionado`.

### Timeout obrigatório em TODO `fetch` novo à Uazapi

Achado real em produção (2026-09-16, corrigido no PR #297 só pra `uazapi-helpers.ts`, depois
reencontrado reimplementado SEM timeout em mais 4 lugares no PR #303: `enviarMensagemUazapi`/
`baixarMidiaUazapi` do webhook, `enviarUazapi` em `enviarMensagemHumano.ts`, queries de config
do `*custas`). Sem `AbortSignal.timeout(...)`, se a Uazapi aceitar a conexão mas nunca
responder, a function trava até o teto de duração da Vercel (60s) matar sem enviar resposta
nenhuma — e o evento fica preso em `fonti_events` como "processando", descartando qualquer
retry futuro da mesma mensagem (idempotência). **Qualquer novo `fetch`/query à Uazapi ou ao
Supabase num caminho que responde ao operador/cliente precisa de timeout explícito** (15-30s
pra fetch via `signal: AbortSignal.timeout(...)`, 10s pra query via `.abortSignal(...)`) —
nunca copiar um `fetch` existente sem conferir se ele já tem isso.

### `fonti_marcas` sem checar `sessao_real` — reusar `obterMarcaInicio()`, nunca reimplementar a query

Regra já documentada acima (`fonti_marcas.iniciado_at`) foi reintroduzida 3x no PR #303 em
lugares que reimplementaram a query do zero em vez de reusar `obterMarcaInicio()`
(`fonti-comandos.ts`, agora exportada): `workflow-captacao.ts` (duas vezes — janela de busca
de documento e resolução de `pessoa_id` da sessão) e o webhook (decisão de tratar mídia solta
como sessão real). Uma delas ainda arriscava **deletar** a marca de ambiguidade de `*fonti
salva` antes dela ser resolvida. **Sempre importar/reusar `obterMarcaInicio()` pra ler
`fonti_marcas`, nunca fazer `.from('fonti_marcas').select(...)` direto** — se a query mudar,
muda num lugar só.

### Telefone: sempre `variantesTelefoneBR()` (`telefone.ts`), nunca normalização manual

Além da regra de resolução de conversa via RPC canônica (já documentada acima), qualquer
código que precise gerar as variantes de um número (com/sem "9", com/sem DDI 55) pra
`.in('contato_telefone', [...])` deve usar `variantesTelefoneBR()` — achado real: 2 pontos
(`workflow-captacao.ts`, webhook) reimplementavam isso cobrindo só DDI 55, sem o caso real
documentado (dígito "9" divergente). Uma normalização incompleta falha silenciosamente: não
dá erro, só deixa de encontrar a conversa/documento certo.

### Pendências (`*simula`/`*consorcio`/`*custas`): concorrência de mensagens simultâneas

Três mecanismos distintos, cada um com sua proteção — não misturar o padrão de um com outro:
- **`*simula`**: `texto_acumulado` (reprocessa o texto INTEIRO da sessão a cada mensagem) usa
  `acumularTextoSimulaPendente()` (RPC `acumular_texto_simula_pendente`, migration 312) — leitura+
  concatenação+escrita atômica num único UPDATE. Nunca voltar a fazer SELECT+concatenar em JS+UPDATE
  (perdia mensagens em requests concorrentes). Depois do debounce, `pendente` é reatribuído pra
  `pendenteRelido` dentro de `processarRespostaPendente` — qualquer novo `salvarSimulaPendente`
  adicionado à função deve vir DEPOIS dessa reatribuição pra não reverter o texto acumulado.
- **`*consorcio`/`*custas`**: Q&A passo-a-passo (sem merge de texto) usa guard de concorrência
  otimista — `salvarConsorcioPendente`/`salvarCustasPendente` recebem `pendenteAnterior` (o
  estado lido no início do processamento) e o UPDATE só aplica se `consorcio_pendente`/
  `custas_pendente` na linha ainda for exatamente esse snapshot; retornam `false` se perderam
  a corrida. Qualquer novo `avancarPara`/step function precisa passar `pendenteAnterior` e
  checar o retorno (resincronizar com `buscarConsorcioPendente`/`buscarCustasPendente` se `false`).

### `mergeCapturados` (`simula-pendente.ts`): todo campo novo de `DadosCaptacaoNormalizados` precisa entrar numa lista

Três categorias, escolher a certa é o que evita bug:
- **Escalar comum** (`camposEscalares`): novo valor não-null sempre vence.
- **Booleano sticky** (`camposBooleanos`): OR lógico — uma vez `true`, fica `true` até a
  pendência resolver (ex.: `mcmv_mencionado`, `tipo_amortizacao_ambas`). Um campo aqui que
  devia ser escalar comum (ou vice-versa) já causou bug real (prazo_maximo resetado).
- **Sempre-fresco** (ex.: `conflito_valores`/`conflito_valores_descricao`): reflete só o
  parse mais recente do texto acumulado inteiro, nem escalar nem sticky — atribuição direta
  fora das duas listas. Um campo que fica de fora de TODAS as três (não documentado antes)
  fica congelado no valor da primeira captura e nunca reflete correções do operador.

### Lead duplicado: `leads_pessoa_aberto_unico` (migration 311)

Criar Lead sempre passa por `buscarLeadAbertoPorPessoa` (SELECT) + `INSERT` — não é atômico.
Duas mensagens `*cria cliente` quase simultâneas pra mesma Pessoa podiam duplicar Lead antes
do PR #304. Agora há um índice único parcial replicando o predicado de "lead aberto"
(`deleted_at is null AND status_analise NOT IN (...)` — mesma lista do `buscarLeadAbertoPorPessoa`).
Se a lista de status "fechados" mudar num lugar, tem que mudar nos dois (a query E o índice).
Código trata o conflito (`error.code === '23505'`) reaproveitando o Lead da corrida em vez de
falhar — qualquer novo caminho de criação de Lead deveria fazer o mesmo.

### Excluir Pessoa é soft delete — toda busca em `pessoas` precisa de `deleted_at IS NULL`

`DELETE /api/pessoas/[id]` só preenche `pessoas.deleted_at` (não apaga a linha nem os leads
vinculados). Qualquer leitura de `pessoas` (ou de `pessoa_telefones` que devolva a pessoa) no bot
tem que filtrar `.is('deleted_at', null)` — em join, `pessoas!inner(...)` + `.is('pessoas.deleted_at', null)`.
Achado real (2026-09-21): `*fonti salva joao` listava "JOAO" e "joao" já excluídos porque
`buscarEntidade` (nome, CPF, telefone fromMe) e a busca por nome via referência de processo em
`fonti-comandos.ts` não filtravam. O padrão certo já existe em `src/lib/pessoa.ts`; conferir lá
antes de escrever uma query nova.

### `*fonti salva`: documento pertence à Pessoa, lead/processo é só vínculo opcional

`vincularDocumentosRecentesPorTelefone` (`fonti-comandos.ts`) antes devolvia 0 quando a pessoa-alvo
não tinha lead (`if (!entidadeId) return`), e nem chegava a trocar o `documentos.pessoa_id`
provisório (criado pelo telefone da conversa) pela pessoa escolhida. Resultado real (2026-09-21):
`*salva joao` só salvava no cliente em etapa Lead; nos demais respondia "nenhum documento". Agora,
sem lead/processo, só o dono do documento é trocado (e apenas de documentos SEM nenhum vínculo,
pra não roubar documento já atribuído a um negócio). Qualquer novo caminho de vínculo de
documento deve tratar "sem lead" como caso válido.

### Consulta com coluna/valor de enum inexistente falha em silêncio (`*fonti processo`)

O supabase-js não lança exceção quando o PostgREST rejeita a query: devolve `data = null` e o
código do bot trata como "nenhum resultado". `*fonti processo` respondia "não tem processos aptos"
pra todo cliente (2026-09-21) por dois erros: `.not.in.()` com `'concluido'`/`'arquivado'` que não
existem no enum `status_processo` (só em_analise, aprovado, pendente, reprovado, cancelado) e
`select('banco')` numa tabela que só tem `banco_id`. Regras: tipar listas de status com
`StatusProcesso` (`@/types/processos`), pedir o banco via `banco:bancos!banco_id(nome)` e, em
qualquer consulta nova do bot, olhar o `error` do retorno em vez de só `data`. Testar a query
contra o banco real (não só com mock) antes de considerar validada.

### Lead pode ter nome diferente da Pessoa — `*fonti salva [nome]` busca nos dois

`*cria cliente` feito a partir do WhatsApp do próprio operador reaproveita a pessoa provisória do
telefone dele (ex.: "Bruno Fontinhas Assessoria"), então o lead "ENOQUE FRANCISCO..." fica ligado a
uma pessoa com outro nome. Achado real (2026-09-21, na frente da equipe): `*salva enoque` respondia
"não encontrei". `buscarEntidade` agora busca também em `leads.nome` (embed `pessoa:pessoas!pessoa_id!inner`
— `leads` tem MAIS de uma relação com `pessoas`, sem o `!pessoa_id` o PostgREST recusa). Causa de raiz
ainda em aberto: `*cria cliente` não deveria reaproveitar a pessoa do telefone do operador.

### Pessoa da sessão `*fonti inicio` NUNCA pode ser a pessoa do telefone do operador

No fluxo `*fonti inicio` → mídia solta → `*cria cliente`, o `telefone_conversa` é o do PRÓPRIO
operador. A migration 279 fez `obter_ou_criar_pessoa_sessao_fonti` reaproveitar qualquer pessoa com
esse telefone — ou seja, a pessoa do comercial. Efeitos reais (2026-09-21): o lead do cliente ficava
ligado à pessoa do operador (`*salva enoque` não achava), o PRÓXIMO cliente do mesmo comercial caía
em `buscarLeadAbertoPorPessoa` e ATUALIZAVA o lead anterior, e pessoa provisória do operador era
RENOMEADA pro cliente (telefone do Marcio virou "MARIA LUCIA...", 75 documentos). Migration 314:
telefone de usuário interno ativo → sempre pessoa provisória NOVA por sessão, sem gravar o telefone
do operador nela. Guard equivalente em `workflow-captacao.ts` (Prioridade 4). Qualquer novo código que
"reaproveite pessoa por telefone" precisa antes descartar telefones de `usuarios`.

## REGRA INEGOCIÁVEL — `*cria cliente` e `*salva`: cliente certo e documento no cliente certo, na hora

Cada comercial, ao criar cliente (`*cria cliente`) ou salvar documentos (`*salva fulano`), precisa ter
o resultado correto IMEDIATO: o lead do cliente certo e CADA documento no cliente certo. Errar aqui
contamina dados de vários clientes sem dar erro nenhum (incidente 2026-09-21, na frente da equipe:
142 documentos com dono diferente do lead vinculado; 74 dentro de pessoas de operador).

**Invariantes — qualquer mudança em `workflow-captacao.ts`, `fonti-comandos.ts`, no handler de mídia
solta do webhook ou em `obter_ou_criar_pessoa_sessao_fonti` tem que preservá-los:**
1. **Pessoa de um usuário interno (comercial) NUNCA é pessoa de cliente.** O telefone do operador
   (`usuarios.telefone_whatsapp`/`telefone`) não pode ser reaproveitado como "pessoa da sessão", nem
   adotado por lead, nem renomeado. Ver migration 314 e o guard na Prioridade 4 de `workflow-captacao.ts`.
2. **O DONO do documento (`documentos.pessoa_id`) é a pessoa do cliente**, não só o vínculo
   (`documento_vinculos`) com lead/processo. `*cria cliente` (troca o dono ao vincular ao lead) e
   `*salva` (`vincularDocumentosRecentesPorTelefone`) fazem os dois; um caminho novo que só cria o
   vínculo está errado. Teste: `cria-cliente-dono-do-documento.test.ts`.
3. **Um cliente novo nunca pode cair no lead de outro**: `buscarLeadAbertoPorPessoa` só é seguro se a
   pessoa for realmente do cliente (ver 1). Nunca resolver pessoa por telefone do remetente.
4. **`*salva fulano` tem que achar o cliente pelo nome da pessoa OU do lead**, ignorando excluídos.
5. **A resposta do bot diz onde o documento ficou** (lead + etapa, processos do cliente).

**Como conferir depois de mexer** (rodar contra o banco real, não só mock): a auditoria
`supabase/2026-09-21_diagnostico_pessoas_de_operador.sql` deve mostrar operadores sem leads e sem
documentos NOVOS; e nenhum documento com dono diferente da pessoa do lead a que está vinculado
(exceto participantes de processo: cônjuge, vendedor). Teste de ponta a ponta com 2 clientes seguidos
pelo mesmo comercial (`*inicio` + documentos + `*cria cliente`, duas vezes): dois leads, duas pessoas.

## Solicitações: painéis mostram "Para mim" + "Que pedi", de qualquer módulo

Decisão (2026-09-21): a pessoa vê TODAS as solicitações dela nas telas iniciais de Captação e Negócios
e no módulo Solicitações, independente de onde o negócio está (lead, negócio ou sem vínculo).
- **Para mim** = `responsavel_id` é o usuário (inclui a que ele pediu pra si). **Que pedi** = `solicitante_id`
  é o usuário e o responsável é OUTRA pessoa (nunca duplica com "Para mim").
- Fonte única: `useMinhasSolicitacoes` + `SolicitacoesPainel` (Captação e Negócios) e o filtro `quePedi` de
  `useSolicitacoesFila` (módulo). Não criar consulta própria de solicitações num painel novo — foi assim que
  as telas divergiram (Captação só lead, Negócios lead+processo, nenhuma olhava `solicitante_id`).
- Painéis precisam de Realtime (`solicitacoes_operacionais`) invalidando as chaves `['solicitacoes']`,
  `['leads','dashboard']` e `['negocios','dashboard']`; só `staleTime` deixava o painel 2-3 min desatualizado.
- Contador do menu lateral e "Minhas pendências" contam só "Para mim" (o que a pessoa precisa fazer);
  "Que pedi" é acompanhamento. A RLS de `solicitacoes_operacionais` já permite ao comercial ler o que ele pediu.

## Busca de Pessoa por papel: Vendedor ignora carteira comercial, Comprador/Cliente não

`GET /api/pessoas` (usado por `PessoaBuscaCombobox`) e as buscas diretas em `pessoas` replicam
manualmente a restrição de carteira comercial da RLS (migration 20260724_186/20260801_228):
comercial só vê Pessoa com lead onde ele é `responsavel_id`. Essa regra protege dado de CLIENTE
de outro comercial — mas **Vendedor** (dono do imóvel na ponta vendedora) não é cliente de
ninguém; pode ter sido cadastrado por outro comercial ou não ter lead nenhum. Achado real
(2026-09-22): busca de vendedor sempre vazia pra quem não era `responsavel_id` do lead da pessoa
— tanto a busca (silenciosa, sem erro) quanto o pré-preenchimento do vendedor já vinculado ao
Lead/Processo, e o usuário acabava recriando a pessoa (risco de duplicidade de cadastro).

**Regra**: qualquer busca/lookup de Pessoa no papel de Vendedor passa `papel=vendedor` pra
`/api/pessoas` (`<PessoaBuscaCombobox papel="vendedor" ... />`) — isso ignora a restrição de
carteira, mantendo o scope de empresa e a permissão `pessoas.ver`. Comprador/Cliente/Cônjuge/
Coparticipante continuam restritos à carteira (papel padrão, sem passar o prop) — é o caso que a
regra protege de verdade. Pontos corrigidos: `NovoProcessoModal.tsx` (busca + pré-preenchimento),
`AbaVendedores.tsx` (processos), `BlocoVendedor` em `AbaCredito.tsx`. Qualquer SELECT direto em
`pessoas` (fora da API) pra achar um vendedor está sujeito à mesma RLS e vai falhar do mesmo jeito
— sempre passar pela API com `papel=vendedor`, nunca reimplementar a query direto no componente.

## Formulário de edição não pode resetar por refetch em segundo plano

Padrão perigoso: `useEffect(() => { if (aberto) form.reset(paraForm(entidade)) }, [aberto, entidade])`.
Toda query do projeto usa `staleTime: 0` + `refetchOnWindowFocus: true` por padrão (`providers.tsx`)
— qualquer refetch em segundo plano (voltar o foco na aba, alt-tab, um print de tela, uma
invalidação de cache de QUALQUER lugar do sistema que bata na queryKey) troca a referência do
objeto `entidade`, mesmo sem o dado ter mudado de verdade. Com `entidade` nas deps do efeito, o
form.reset() dispara de novo e **apaga tudo que o usuário tinha digitado**, sem aviso — ele clica
Salvar num formulário que voltou sozinho aos valores antigos, a validação de campo obrigatório
barra, e nada é gravado (achado real, 2026-09-22: modal "Dados do Negócio" do processo —
taxa_juros/sistema_amortizacao/prazo/dia ficavam `null` no banco mesmo aparecendo preenchidos no
print do usuário logo antes; mesma causa também em `LeadEditarModal.tsx`).

**Regra**: o reset só pode acontecer quando o modal/drawer ABRE, nunca por refetch enquanto já
está aberto. Padrão certo: tirar a entidade das deps do efeito e ler o valor mais recente por uma
ref (`const entidadeRef = useRef(entidade); entidadeRef.current = entidade`), deps do efeito só
`[aberto]`. Ver `EditarProcessoDrawer.tsx` e `LeadEditarModal.tsx`. Qualquer modal novo de edição
(não de criação) que resete form a partir de uma entidade vinda de `useQuery` precisa seguir esse
padrão — `AbaOportunidade.tsx` já fazia certo por acidente (deps `[lead.id]`, não `[lead]`).

## UPDATE bloqueado pela RLS não gera erro — sempre checar linhas afetadas

O PostgREST não lança erro quando a RLS filtra a linha de um UPDATE pra fora do que o
usuário pode ver/alterar — devolve sucesso com 0 linhas afetadas, silenciosamente. Um
`mutationFn` que só faz `if (error) throw error` (sem checar `data`/count) reporta
"sucesso" pro usuário mesmo quando NADA foi gravado. Achado real (2026-09-22): RLS de
`processos_update` (migration 20260721_183) não incluía `comercial_id` — só
operacional/gerente/gestor/admin podiam editar. O modal "Dados do Negócio"
(EditarProcessoDrawer.tsx) é mostrado e usável por qualquer perfil, inclusive comercial,
mas o UPDATE do comercial (dono do negócio) batia na RLS e o toast de sucesso mentia;
taxa_juros/sistema_amortizacao/prazo/etc continuavam `null` mesmo depois de "salvar"
repetidas vezes. Corrigido em dois níveis (migration 20260922_315 + código):
1. RLS: `processos_update` agora inclui `u.id = processos.comercial_id`.
2. Defesa em profundidade: `updateProcessoOuFalha()` (`useProcessos.ts`) faz
   `.select('id')` no update e lança erro claro se vier vazio — qualquer UPDATE direto
   em `processos` deve usar esse helper, nunca `if (error) throw` sozinho. Mesmo
   princípio vale pra outras tabelas com RLS restritiva por dono/responsável.

## `+ Nova` conversa precisa definir `atendente_id`, senão o criador não a enxerga

A RLS de SELECT em `conversas` (`empresa_conversas_select`, migration 20260801_230) só
libera ver a conversa pra: admin/gerente/gestor, o `atendente_id` dela, o atendente da
instância vinculada, um `conversa_participantes`, ou uma conversa sem atendente **E**
sem instância. `useIniciarConversa` (botão "+ Nova" em Conversas) criava a conversa via
`obter_ou_criar_conversa` sem passar `p_atendente_id` — com uma instância vinculada
(comum) e sem atendente, NENHUMA dessas condições batia pro usuário que acabou de criar
(perfil comercial/operacional, não dono da instância): a conversa existia, recebia
mensagens do WhatsApp normalmente, aparecia pra admin — mas sumia da lista de quem
clicou em "+ Nova" (achado real, 2026-09-22). Corrigido: `p_atendente_id` = usuário que
cria. A RPC só define isso na criação (`ON CONFLICT` não sobrescreve o dono de uma
conversa já existente). Qualquer novo caminho que insira em `conversas` direto (fora
dessa RPC) precisa pensar na mesma regra de visibilidade.
