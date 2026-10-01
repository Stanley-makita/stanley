# Participantes V2 — B2c (virada de escrita) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Deixar `participacoes`/`pessoa_relacionamentos` como única fonte de "quem participa" e "casado com", desligar a sincronização da Fase A e travar as tabelas antigas — sem nenhuma mudança visível para a equipe.

**Architecture — em duas etapas para reduzir o risco:**
- **C1 — centralizar (seguro, vai ao ar aos poucos):** todo escritor de "quem participa" passa a chamar o serviço `src/lib/participantes/escritaServidor.ts` (rotas de servidor; nenhum componente grava direto). Na C1 o serviço ainda grava no modelo antigo (`lead_coparticipantes`, `lead_vendedores`, `processo_compradores`, `processo_vendedores`, ponteiros de cônjuge), com a sincronização ligada — comportamento idêntico ao de hoje, testável e publicável em partes.
- **C2 — virar (pequena, um deploy fora do horário):** troca o miolo do serviço para gravar em `participacoes`/`pessoa_relacionamentos` + migration: remove os triggers `trg_pv2_*`, cria `leads.pessoa_id` derivado da participação titular (trigger `AFTER INSERT ON leads` cria a titular a partir de `NEW.pessoa_id`; depois só muda pela participação), torna as tabelas antigas somente leitura (trigger que lança erro), corrige as funções SQL que escrevem nelas (`atualizar_telefone_pessoa`, `fn_sincronizar_lead_pessoa`, `merge_pessoas`, `fn_criar_comrel_cliente_processo`, `fn_sincronizar_pessoa_conjuge`). Escritor esquecido falha com erro visível em vez de divergir.

**Spec:** `docs/superpowers/specs/2026-09-28-participantes-v2-design.md` §1, §6 (Fase B itens 5–6). Roteiro: `2026-09-30-participantes-v2-fase-b2-roteiro.md`.

## Inventário (2026-09-30 22:30) — escritores do modelo antigo

| Grupo | Arquivos | Etapa |
|---|---|---|
| Lead — participantes | `useMutacoesParticipantes.ts` (copart), `ocr-confirmar` (novo participante), `leads/[id]/titular`, `AbaCredito.tsx` (coparticipantes legado, `BlocoVendedor` → `lead_vendedores`, `BlocoParticipantes` → `vincular-conjuge`), `leads/[id]/vincular-conjuge` | C1-a |
| Casamento | `casamentoServidor.ts`, `lib/pessoa.ts` (`resolverPessoaConjuge`), `FormularioPessoa`/`CompletarDadosPessoaDrawer`/página da Pessoa/`useEditarLead`/`LeadEditarModal` (campos soltos `conjuge_*`) | C1-b |
| Negócio — compradores/vendedores | `useProcessoCompradores.ts`, `useProcessoVendedores.ts` (abas Compradores/Vendedores), `NovoProcessoModal.tsx` (4 caminhos), `NovoProcessoRapidoModal.tsx`, `contratos/documentos/resolver-pessoa` | C1-c |
| Espelhos (cópias de nome/CPF/e-mail/telefone nas linhas antigas) | `FormularioPessoa`, `CompletarDadosPessoaDrawer`, página da Pessoa, `useEditarLead`, `useProcessoCompradores`/`Vendedores` | C2 (simplesmente apagados) |
| Merge de pessoas | `api/pessoas/[id]/merge`, RPC `merge_pessoas` | C1-d |
| Criação de lead (`leads.pessoa_id`) | `api/leads`, `api/leads/webhook`, indicação de parceiro, `workflow-captacao`, `LeadDetalheModal` | C2 (trigger; código não muda) |
| Leitores ainda nas tabelas antigas | `AbaContrato`/`AbaCustas`/`useProcessoCompradores` (leitura), contratos por template, `interessados` (fallback de id antigo), `AbaVendedores` (embed) | C1-c |
| SQL | `atualizar_telefone_pessoa`, `fn_sincronizar_lead_pessoa`, `merge_pessoas`, `fn_criar_comrel_cliente_processo`, `fn_sincronizar_pessoa_conjuge`, triggers `trg_pv2_*` | C2 |

## Global Constraints
- Worktree `participantes-v2`; um branch por etapa (`feat/participantes-v2-b2c-<etapa>`), PR e merge por etapa depois de teste local do usuário.
- C1 não muda comportamento nem tela: mesmas tabelas gravadas, só passando pelo serviço/rotas.
- Invariantes do CLAUDE.md (operador nunca participante; dono do documento = pessoa do cliente; um lead aberto por pessoa).
- Testes: vitest como nas fases anteriores; falhas pré-existentes: os 4 arquivos de sempre.

## C1-a — Lead: participantes por um serviço único

### Task 1: `escritaServidor.ts` (lead) + testes
Funções (service role; quem chama confere permissão/visibilidade):
- `incluirParticipanteLead(sb, empresaId, leadId, pessoaId): Promise<{ ok: true } | { erro: string; status: number }>` — recusa Pessoa de operador (`rpc('pessoa_e_de_operador')`), recusa o titular do próprio lead, idempotente (23505 = ok).
- `removerParticipanteLead(sb, empresaId, leadId, pessoaId)` — só coparticipante; confere linhas afetadas.
- `incluirVendedorLead(sb, empresaId, leadId, pessoaId)` / `removerVendedorLead(sb, empresaId, leadId, vinculoId)` — `lead_vendedores`.
Testes com `criarFakeDb`.

### Task 2: rotas `POST/DELETE /api/leads/[id]/participantes` e `POST/DELETE /api/leads/[id]/vendedores`
`autenticarRota` + `verificarDestino(ctx, 'lead', id)`; corpo `{ pessoa_id }` (inclusão; com `{ nome, cpf }` reaproveita/cria pela mesma regra do OCR — mover `pessoaPorCpfOuNova` para o serviço). Testes de rota.

### Task 3: escritores do Lead passam pelo serviço
- `useAdicionarParticipante`/`useRemoverParticipante` → rotas da Task 2 (sem `supabase.from('lead_coparticipantes')` no cliente).
- `ocr-confirmar` (novo participante) e `leads/[id]/titular` → funções do serviço.
- `AbaCredito`: apagar o código morto de coparticipantes (vincular/criar/remover); `BlocoVendedor` → rotas de vendedores.
- `vincular-conjuge` → `registrarCasamento` (a rota antiga continua respondendo igual para a tela).
- Critério: `grep -rn "from('lead_coparticipantes')\|from('lead_vendedores')" src --include=*.ts* | grep -v __tests__` só encontra `escritaServidor.ts` e leitores.

## C1-b, C1-c, C1-d, C2
Planos detalhados escritos ao terminar a etapa anterior (mesmo formato). C2 só depois de C1 inteira em produção e alguns dias de uso.
