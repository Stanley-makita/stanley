# Participantes V2 — B2c / C2: a virada (participacoes vira a fonte)

> Pré-requisito: C1 inteira em produção (#362, #363, #364, #365, #366) e alguns dias de uso da equipe.
> Deploy **fora do horário**, na ordem: migration → código no mesmo minuto (ver "Ordem de deploy").

## Onde estamos depois da C1

- Toda escrita de participante passa por **dois serviços**: `escritaServidor.ts` (lead) e `escritaNegocio.ts` (negócio).
  Casamento passa por `registrarCasamento` / `salvarCasamentoDoFormulario`. Merge passa por `merge_pessoas` (332).
- Esses serviços ainda gravam nas **tabelas antigas** (`lead_coparticipantes`, `lead_vendedores`,
  `processo_compradores`, `processo_vendedores`). Os triggers `trg_pv2_*` (Fase A) copiam para `participacoes`.
- Os leitores já leem `participacoes`, exceto os hooks das abas Compradores/Vendedores do negócio
  (`useProcessoCompradores`/`useProcessoVendedores`, que também alimentam Contrato e Custas): o `id` deles é a
  linha antiga, que editar/remover usam.

A virada inverte a fonte: os serviços gravam `participacoes` + `pessoas`, e as tabelas antigas congelam.

## C2-a — Código (um PR, mergeado logo depois da migration)

1. **Serviço do lead** (`escritaServidor.ts`): incluir/remover participante e vendedor, trocar titular e cônjuge do
   titular passam a gravar `participacoes` (papel, ordem, compoe_renda) em vez de `lead_coparticipantes`/`lead_vendedores`.
   Os testes atuais continuam valendo (mudam só as tabelas esperadas).
2. **Serviço do negócio** (`escritaNegocio.ts`): incluir/editar/remover gravam `participacoes` + campos da Pessoa.
   Mapeamento dos campos que hoje só existem na linha antiga:

   | Linha antiga | Destino |
   |---|---|
   | `principal` | papel `titular` (um por negócio) |
   | `nome`/`cpf`/`email`/`telefone` | Pessoa (`pessoas`, `pessoa_telefones` via `atualizar_telefone_pessoa`) |
   | `renda_mensal` (comprador) | renda da Pessoa (já é a fonte desde a Fase A) |
   | `banco`/`agencia`/`conta` (vendedor) | `pessoas.conta_bancaria_*` (já é a fonte desde a B2a) |
   | `estado_civil` + `conjuge_*` (vendedor) | Pessoa do cônjuge + `registrarCasamento`; participação `conjuge_vendedor` |
   | `conjuge_papel = 'proprietario'` | o cônjuge entra como `vendedor` (também é dono), não `conjuge_vendedor` |
   | linha sem Pessoa (`pessoa_id` nulo) | `pessoaPorCpfOuNova` (já usado no lead) — participação sempre tem Pessoa |

3. **Hooks das abas Compradores/Vendedores**: leem `participacoes` + Pessoa e devolvem o **mesmo formato**
   `ProcessoComprador`/`ProcessoVendedor` (o visual não muda). O `id` vira o id da participação, e as rotas
   `/api/processos/[id]/{compradores,vendedores}/[linhaId]` passam a receber esse id.
   Contrato (`substituirVariaveis`) e Custas recebem o mesmo formato. O cônjuge do vendedor passa a vir do casamento
   registrado, não mais de `processo_vendedores.conjuge_nome`.
4. **Espelhos apagados**: as cópias de nome/CPF/e-mail/telefone/estado civil nas linhas antigas
   (`FormularioPessoa`, `CompletarDadosPessoaDrawer`, página da Pessoa, `useEditarLead`) somem.
5. `atualizar-cliente`: o fallback que traduz id antigo de `processo_compradores` continua (links antigos de e-mail).

## C2-b — Migration 333 (rodar fora do horário, logo antes do merge do C2-a)

1. `DROP TRIGGER trg_pv2_lead_coparticipantes / trg_pv2_lead_vendedores / trg_pv2_processo_compradores /
   trg_pv2_processo_vendedores` — a cópia antigo→novo para de existir.
2. `trg_pv2_leads` / `trg_pv2_pessoas`: ficam só as partes que ainda valem — `leads.pessoa_id` gravado pela
   criação de lead (bot, webhook, indicação, tela) continua virando a participação `titular` (o código de criação
   de lead **não muda**). Campos soltos `conjuge_*` deixam de criar Pessoa (nenhuma tela grava mais).
3. **Tabelas antigas somente leitura**: trigger `BEFORE INSERT OR UPDATE OR DELETE` que recusa com mensagem clara
   (pega qualquer caminho esquecido em vez de perder dado em silêncio). Não apagar as tabelas (B3).
4. **Funções SQL que ainda escrevem/leem as antigas**:
   - `atualizar_telefone_pessoa` — para de copiar telefone para `processo_compradores`/`processo_vendedores`.
   - `fn_sincronizar_lead_pessoa` — para de escrever `processo_compradores`.
   - `fn_sincronizar_documento_unificado` e `fn_validar_comunicacao_relacionamento` — leem `participacoes`.
   - `trg_comrel_criar_cliente_processo` (AFTER INSERT em `processo_compradores`) — o equivalente já existe em
     `participacoes` (`trg_comrel_criar_participacao`, migration 330); remover o antigo.
   - `merge_pessoas` (332) — deixa de mexer nas tabelas antigas (ficam congeladas).
5. Conferência pós-migration (SQL de diagnóstico, só leitura): toda proposta aberta tem exatamente um titular;
   nenhuma participação de Pessoa de operador; contagem de participantes por negócio igual à das linhas antigas
   (no momento da virada).

## Ordem de deploy (fora do horário)

1. Teste SQL da 333 (BEGIN…ROLLBACK), como nas fases anteriores.
2. Rodar a 333.
3. Mergear o C2-a imediatamente (entre os passos 2 e 3, gravações de participante pela tela falham com a mensagem
   de "somente leitura" — por isso fora do horário; o bot não escreve nessas tabelas).
4. Conferência pós-virada + teste manual: lead com 3 participantes → negócio; editar comprador/vendedor; contrato;
   formulário BB com cônjuge.

**Volta atrás**: migration de reversão pronta junto (recria os triggers `trg_pv2_*`, remove a trava de somente
leitura) + revert do PR. As linhas antigas continuam lá, congeladas no momento da virada.

## B3 (depois de semanas estável)

Apagar as tabelas antigas, os campos soltos `conjuge_*`/`vendedor_*` de `leads`/`pessoas` e o fallback de id antigo.
