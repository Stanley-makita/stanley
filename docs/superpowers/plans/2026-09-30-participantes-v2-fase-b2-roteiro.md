# Participantes V2 — Fase B2 (troca de escrita): roteiro

**Spec:** `docs/superpowers/specs/2026-09-28-participantes-v2-design.md` (seções 1–4 e 6, itens 4–6).
**Estado de partida (2026-09-30):** Fase A em produção (#353, migrations 324–327): o modelo novo
(`participacoes`, `pessoa_relacionamentos`) é preenchido **só** pela sincronização a partir das tabelas
antigas. Fase B1 em produção (#354, migration 328): listas, busca, documentos, bot e relatórios já
**leem** do modelo novo.

## Atualização (2026-09-30, fim do dia) — B2b revista

Com a tela aprovada pelo usuário, a B2b virou **"tela de participantes sobre o modelo atual"**
(`2026-09-30-participantes-v2-fase-b2b-tela-participantes.md`): a aba Pessoa do Lead ganhou uma
sub-aba por participante, gravando pelos caminhos antigos (`lead_coparticipantes`, ponteiros de
cônjuge nas Pessoas) com a sincronização ligada; "compõe renda" manual ficou em
`participacoes.compoe_renda_manual` (migration 331), respeitado pela sync e herdado pelo negócio.
**Negócios mantém o visual** (decisão do usuário) e o **vendedor do Lead continua na aba Crédito**.
Nova ordem das etapas:

- **B2c — virada** (o que esta página chamava de B2b): desligar a sincronização, `leads.pessoa_id`
  derivado, travar as tabelas antigas, trocar os escritores restantes (tabela abaixo, menos a aba
  Pessoa, que já está pronta). Só banco e escritores; nada visível muda.
- **B2d — recursos novos**: OCR "De quem é este documento?", certidão de casamento → relacionamento,
  "Mover para participante", resposta do `*salva` por participante, "Tornar principal".
- **B3 — limpeza**, como antes.

## Por que a B2 é dividida

A sincronização da Fase A (`pv2_gravar_participacoes`) **reconstrói** as participações de uma proposta a
partir das tabelas antigas a cada edição. Então nenhuma tela pode gravar direto no modelo novo enquanto
ela estiver ligada — a próxima edição pela tela antiga apagaria a gravação. E a spec proíbe sincronizar
nos dois sentidos (duas fontes de verdade). Consequência: **tudo que grava "quem participa" troca num
único deploy** (código + migration que desliga a sincronização). Para esse deploy ser o menor possível,
tudo o que pode mudar antes, com a sincronização ligada, muda antes.

| Etapa | O que faz | Seguro com a sincronização ligada? | Publicação |
|---|---|---|---|
| **B2a** — dados pessoais e comunicação | E-mail/telefone/estado civil digitados nas linhas antigas passam a ir para a Pessoa (preenchimento, nunca sobrescreve). Leitores de e-mail/telefone (Clicksign, e-mail de confirmação, formulários) e a comunicação com comprador passam a usar Pessoa/participação. | Sim | PR próprio + migrations 329/330 |
| **B2b** — virada de escrita | Tela única de participantes (Lead e Negócio), "Casado(a) com", rotas `/api/participacoes` e `/api/relacionamentos`, conversão lead → negócio e criação de negócio por participações, contratos por participações. Migration que desliga a sincronização, deixa `leads.pessoa_id` derivado e faz as tabelas antigas **rejeitarem escrita**. | Não — é a virada | **Um deploy** (código + migration), fora do horário |
| **B2c** — recursos novos sobre o modelo novo | OCR "De quem é este documento?", certidão de casamento → relacionamento, "Mover para participante", resposta do `*salva` por participante. | Depende da B2b | PRs pequenos depois da virada |
| **B3** — limpeza (+30 dias) | Colunas/tabelas antigas → `_legado` → `DROP`; remove `fn_sincronizar_pessoa_conjuge`, código morto e as cópias em `atualizar_telefone_pessoa`/`fn_sincronizar_lead_pessoa`. | — | Plano próprio |

O plano detalhado da **B2a** está em `2026-09-30-participantes-v2-fase-b2a-dados-pessoais-e-comunicacao.md`.
Os planos detalhados da B2b e B2c são escritos quando a etapa anterior estiver em produção: a B2b começa
por um protótipo da tela de participantes para o usuário aprovar (é a maior mudança visível do projeto).

## B2b — escopo e decisões (para o plano detalhado)

**Quem grava "quem participa" hoje e passa para o modelo novo** (levantamento de 2026-09-30):

| Onde | Grava hoje | Passa a gravar |
|---|---|---|
| `AbaCredito.tsx` (Lead) | `lead_coparticipantes`, `lead_vendedores` (insert/delete) | `ParticipantesProposta` → `/api/participacoes` |
| `/api/leads/[id]/vincular-conjuge` + bloco cônjuge da `AbaPessoa.tsx` | `leads/pessoas.conjuge_pessoa_id`, campos `conjuge_*` | "Casado(a) com" → `/api/relacionamentos`; cônjuge incluído como `conjuge_anuente` |
| `LeadEditarModal.tsx` / `useEditarLead.ts` | `leads.conjuge_*`, espelho em `processo_compradores/vendedores` | só dados do lead; espelhos removidos |
| `CompletarDadosPessoaDrawer.tsx`, página `pessoas/[id]` | `pessoas.conjuge_*`, `regime_casamento`, `data_casamento`, espelhos | Pessoa (dados próprios) + `/api/relacionamentos` |
| `AbaCompradores`/`AbaVendedores` do Negócio + `useProcessoCompradores`/`useProcessoVendedores` | `processo_compradores/vendedores` (+ cônjuge do vendedor em campos soltos) | `ParticipantesProposta` (mesmo componente do Lead) |
| `NovoProcessoModal.tsx` (4 caminhos), `NovoProcessoRapidoModal.tsx` | `processo_compradores/vendedores` | participações do processo, copiadas das do lead com checkbox por participante |
| `contratos/documentos/resolver-pessoa` | cria Pessoa provisória + linha antiga | cria Pessoa provisória + participação |
| `/api/pessoas/[id]/merge` + RPC `merge_pessoas` | reaponta `processo_compradores/vendedores` | reaponta `participacoes`/`pessoa_relacionamentos` (conflito de UNIQUE = mesma pessoa já está: apaga a duplicada) |
| Criação de lead (`/api/leads`, `/api/leads/webhook`, indicação de parceiro, `workflow-captacao` / `*cria cliente`) | `leads.pessoa_id` | **sem mudança no código**: trigger `AFTER INSERT ON leads` cria a participação titular a partir de `NEW.pessoa_id` |
| `AbaContrato.tsx`, `AbaCustas.tsx`, `ContratoConstrutor` (modelos por template) | leem `processo_compradores/vendedores` + `pessoas.conjuge_nome` | `carregarParticipantes` + `montarCompradores/montarVendedores` (cônjuge pelo Relacionamento) |

**Decisões já tomadas para a B2b (divergências da spec marcadas):**
1. *Divergência:* a spec pede "RPC de criação de lead com titular". Os 5 caminhos que criam lead já gravam
   `leads.pessoa_id`; um trigger `AFTER INSERT ON leads` que cria a participação titular dá o mesmo
   resultado sem tocar no bot nem nos webhooks (menos risco na virada). Depois da criação, `leads.pessoa_id`
   só muda pela participação (trigger `BEFORE UPDATE` rejeita escrita direta, como na spec).
2. A migration da virada: (a) remove os triggers `trg_pv2_*` da 327; (b) cria `trg_participacao_titular_lead`
   (mantém `leads.pessoa_id` = titular); (c) torna `lead_coparticipantes`, `lead_vendedores`,
   `processo_compradores`, `processo_vendedores` e as colunas `conjuge_*`/`vendedor_*` de `leads`/`pessoas`
   **somente leitura** por trigger `BEFORE INSERT/UPDATE/DELETE` que lança erro — um escritor esquecido falha
   com erro visível em vez de divergir em silêncio; (d) cria as RPCs atômicas de escrita (adicionar/remover
   participante, tornar titular, definir cônjuge) chamadas pelas rotas de servidor.
3. Ordem do deploy da virada: migration e código no mesmo intervalo, fora do horário comercial; entre a
   migration e o deploy terminar, a tela antiga recebe o erro da trava (não corrompe nada).
4. Critério de pronto da B2b: `grep` por `from('lead_coparticipantes'|'lead_vendedores'|'processo_compradores'|'processo_vendedores')`
   e por escrita de `conjuge_*` em `src/` só encontra código morto marcado para a B3; teste de ponta a ponta
   Heitor + Afrânio + Maria (spec, seção Testes) e o teste "2 clientes seguidos do mesmo comercial" do CLAUDE.md.

## B3 — cuidado registrado agora

`comunicacao_relacionamentos.processo_comprador_id` tem `ON DELETE CASCADE` para `processo_compradores`.
Antes de apagar `processo_compradores` na B3, zerar essa coluna (ou trocar a FK), senão o histórico de
comunicação com clientes é apagado junto. A B2a já grava `participacao_id` nessas linhas.
