# Participantes da proposta (Fonti V2 — Parte 1) — Design

**Data:** 2026-09-28
**Status:** aprovado em conversa (4 seções), aguardando revisão do spec escrito
**Implementação:** depois do go-live de 01/10/2026 (equipe começa no modelo atual)

## Objetivo

Uma proposta (financiamento de aquisição, CGI, contrato) pode ter **N participantes**, e nem todos são
cônjuges. Caso real: Heitor (filho, solteiro) + Afrânio (pai, casado com "Maria") compondo renda no
mesmo financiamento. No Ploomes o Afrânio foi cadastrado no campo de cônjuge por falta de opção. O Fonti
hoje só tem titular + cônjuge na aba Pessoa e no OCR.

**Sucesso:** todos os participantes são cadastrados juntos, no mesmo lead, cada um com cadastro completo
próprio preenchido a partir dos seus documentos, e **andam juntos** por todo o processo — Captação
(Pessoa + OCR), Crédito/renda composta, conversão lead → negócio, formulários de banco e contratos — sem
redigitar nada e **sem nenhum dado de participante com duas fontes de verdade**.

## Decisões tomadas com o usuário

| Decisão | Escolha |
|---|---|
| Escopo | **Parte 1 do Fonti V2 completa**: Pessoa + Participação + Relacionamento Pessoal como fonte única. **Não** unificar Lead+Processo em Negócio (Parte 2 fica como projeto separado) |
| Meio-termo com colunas `conjuge_*` | **Rejeitado** — "entrada de dados dos participantes não pode haver dúvidas". Colunas antigas deixam de ser fonte |
| Alcance | Captação (Pessoa + OCR), Crédito/renda, conversão em Negócio, formulários e contratos |
| Cônjuge de participante | "Depende do caso": às vezes só anuente, às vezes compõe renda → flag **compõe renda** por participante |
| "Casado com" | Fato da Pessoa (vale pra qualquer proposta); pode apontar pra alguém **fora** da proposta |
| Lote misto no WhatsApp | Bot cria o lead normal; **separação por pessoa acontece no modal de extração**, com sugestão do sistema e confirmação do usuário |
| Pessoa de outra carteira | **Permite** adicionar como participante; o comercial passa a ver/editar a Pessoa; sistema avisa que ela também é cliente de outro comercial |
| Regime de bens / data do casamento | Passam a ser **do casal** (Relacionamento), não de cada Pessoa |
| `leads.pessoa_id` | Vira **derivado** (só leitura, mantido pelo banco a partir da Participação titular) |
| Go-live 01/10 | Mantido no modelo atual; V2 construído em paralelo, dados migrados depois |

## Estado atual (base para o design)

Dado de cônjuge hoje mora em **5 lugares**:
- `leads.conjuge_nome/cpf/data_nascimento/renda_formal/renda_informal` (`add_lead_fields.sql`, 095)
- `pessoas.conjuge_nome/cpf/data_nascimento/telefone/profissao/renda_formal/renda_informal` (061)
- `leads.conjuge_pessoa_id` e `pessoas.conjuge_pessoa_id` (094), com trigger que copia nome/cpf/nascimento
  da Pessoa do cônjuge para os campos soltos (`fn_sincronizar_pessoa_conjuge`, 190)
- `processo_vendedores.conjuge_nome/cpf/rg/data_nasc/papel` (049)

Outros participantes:
- `lead_coparticipantes` (210): lead ↔ pessoa, `papel` texto (default `coproponente`); usado na aba Crédito
- `lead_vendedores` (276) + `leads.vendedor_pessoa_id` + `leads.vendedor_nome/cpf/telefone` (095/096)
- `processo_compradores` (005 + `pessoa_id` em 024): **copia** nome/cpf/email/telefone/renda_mensal, `principal`
- `processo_vendedores` (005 + `pessoa_id` em 024): copia nome/cpf/email/telefone

Renda duplicada: `leads.renda_formal/informal` e `pessoas.renda_formal/informal`. Estado civil, regime
(`regime_casamento`) e `data_casamento` ficam na Pessoa.

UI: `AbaPessoa.tsx` (657 linhas) — formulário do titular; bloco "Cônjuge / Companheiro(a)" dentro de
"Estado Civil" edita os campos soltos. `AbaCredito.tsx` (1968 linhas) — coparticipantes e vendedores.
OCR: `DocumentoOcrRevisaoModal.tsx` com checkbox "Este documento é do cônjuge" (`titular: 'principal' |
'conjuge'`), rota `ocr-confirmar`. Formulários: `dados-lead.ts`/`dados.ts` já montam **lista** de
`DadosComprador` (titular + cônjuge + coparticipantes). Contratos: `resumoParaTemplate.ts`
(`resumo.compradores`). Um lead pode gerar **vários** processos (`processos.lead_id` sem unicidade).

## 1. Modelo de dados

### Pessoa (`pessoas`) — permanente
Dados próprios: nome, CPF, nascimento, RG, profissão, contatos, endereço, **renda formal/informal**,
**estado civil**. **Remove** todas as colunas `conjuge_*`, `conjuge_pessoa_id`, `regime_casamento`,
`data_casamento` (vão para o Relacionamento).

### Relacionamento Pessoal (`pessoa_relacionamentos`) — nova
```
id, empresa_id,
pessoa_a_id, pessoa_b_id        -- par não ordenado; CHECK (pessoa_a_id < pessoa_b_id)
tipo                            -- 'casamento' | 'uniao_estavel'
regime_bens                     -- mesmo domínio de regime_casamento atual
data_inicio                     -- data do casamento/união
data_fim                        -- null = vigente (divórcio/viuvez registra fim, não apaga)
created_at, updated_at
UNIQUE (pessoa_a_id, pessoa_b_id) WHERE data_fim IS NULL
```
- Uma pessoa tem no máximo **um** relacionamento vigente (índice único parcial por pessoa, nas duas
  colunas, via trigger de validação).
- Estado civil `casado`/`uniao_estavel` sem relacionamento vigente é permitido (cônjuge ainda não
  cadastrado), mas a tela mostra pendência.

### Participação (`participacoes`) — nova, substitui 4 tabelas + campos soltos
```
id, empresa_id,
lead_id      NULL REFERENCES leads,
processo_id  NULL REFERENCES processos,    -- CHECK: exatamente um dos dois
pessoa_id    NOT NULL REFERENCES pessoas,
papel        -- compra: 'titular' | 'coparticipante' | 'conjuge_anuente'
             -- venda:  'vendedor' | 'conjuge_vendedor' (cônjuge do vendedor que só assina)
compoe_renda BOOLEAN NOT NULL
ordem        INT NOT NULL                  -- ordem dos compradores (1º, 2º, 3º); vendedores ordem própria
created_at, updated_at, criado_por
UNIQUE (lead_id, pessoa_id), UNIQUE (processo_id, pessoa_id)
UNIQUE (lead_id) WHERE papel='titular';  UNIQUE (processo_id) WHERE papel='titular'
```
- **Nunca copia dado da Pessoa** (nome, CPF, renda sempre lidos da Pessoa).
- Defaults: `titular`/`coparticipante` → `compoe_renda = true`; `conjuge_anuente` → `false`;
  `vendedor` → `false` (sem significado).
- **Guard no banco** (trigger BEFORE INSERT/UPDATE): rejeita `pessoa_id` cujo telefone pertença a um
  usuário interno ativo (`usuarios.telefone_whatsapp`/`telefone`) — invariante 1 do `*cria cliente`.
- Lead/processo precisa ter titular: garantido por RPC de criação (lead nasce com titular) e por
  bloqueio de remover titular (só "tornar titular" outro, atômico).

### `leads.pessoa_id` — derivado
(`processos` não tem coluna de pessoa; o comprador principal passa a ser a Participação `titular`.)

Trigger em `participacoes` mantém `leads.pessoa_id` = pessoa da Participação `titular`. Gravação direta
em `leads.pessoa_id` passa a ser rejeitada (trigger BEFORE UPDATE compara com a Participação). RLS de
carteira, bot e invariantes que leem `leads.pessoa_id` continuam funcionando sem reescrita.

### Visibilidade (RLS)
- `participacoes` e `pessoa_relacionamentos`: mesma regra do lead/processo a que pertencem (via
  `usuario_atual_pode(...)`, nunca lista fixa de perfis — ver CLAUDE.md).
- RLS de `pessoas` (carteira comercial) ganha: comercial vê/edita Pessoa que participa de um lead/processo
  visível pra ele — não só `leads.responsavel_id` do lead da pessoa. Idem para a Pessoa ligada por
  Relacionamento a um participante (o cônjuge de fora da proposta).
- UPDATE em tabela com RLS restritiva sempre com `.select('id')` + erro se vazio (regra do CLAUDE.md).

### Escrita só pelo servidor
Toda criação/alteração de Participação e Relacionamento passa por rotas `/api/participacoes/*` e
`/api/relacionamentos/*` (checagem `podeServidor` + visibilidade com JWT do usuário, mesmo padrão de
`/api/documentos/vinculos`). Nenhum componente grava direto nessas tabelas.

## 2. Tela: aba Pessoa com N participantes

Componente único `ParticipantesProposta` usado no Lead (aba Pessoa) **e** no Negócio (substitui listas
de compradores/vendedores).

```
[● Heitor · Titular] [Afrânio · Coparticipante] [Maria · Cônjuge de Afrânio] [+ Participante]
─────────────────────────────────────────────────────────────────────────────
Afrânio Silva
Papel: [Coparticipante ▾]  Compõe renda: [✔]  [Tornar titular] [Remover da proposta]
Identificação · Documentos · Renda · Estado Civil · Endereço · Trabalho · Conta bancária
Estado Civil: (Casado)  Casado(a) com: [Maria Souza ▾]  Data [__]  Regime [__]
```

- Cada aba edita **a Pessoa daquela aba** (formulário atual de `AbaPessoa.tsx` extraído para
  `FormularioPessoa`, recebendo `pessoaId`). Mantém regras existentes: reset por `id + updated_at` via ref
  (PRs #337/#346), `normalizarDataPlausivel`, `cpfValido`.
- Cabeçalho do participante: papel, compõe renda, tornar titular, remover da proposta (só a Participação;
  Pessoa e documentos permanecem). Titular não tem "Remover".
- **+ Participante**: busca Pessoa existente (nome/CPF, `/api/pessoas` com `papel=participante`, que
  ignora carteira e mostra aviso "também é cliente de <comercial>") ou cria nova só com nome. Papel
  padrão coparticipante; vendedores continuam adicionados por aqui com papel vendedor (busca `papel=vendedor`).
- **Casado(a) com**: dropdown com participantes da proposta primeiro, depois "Buscar pessoa…" e "Nova
  pessoa…". Escolher/criar alguém fora da proposta pergunta "Incluir <nome> na proposta como cônjuge
  anuente?" (padrão sim). Data e regime são do Relacionamento e aparecem iguais nas abas dos dois.
- CPF digitado que já pertence a outra Pessoa → oferece "Usar Pessoa existente" (nunca duplica; hoje o
  UNIQUE rejeitaria).
- Mobile: abas com rolagem horizontal; formulário em coluna única (padrão do plano UX responsivo).
- Rótulo do papel `conjuge_anuente` na UI: "Cônjuge de <nome do participante com quem é casado>"
  (derivado do Relacionamento); sem relacionamento, só "Cônjuge anuente".

## 3. OCR e bot

### Modal de extração (`DocumentoOcrRevisaoModal`)
Checkbox "é do cônjuge" → escolha **"De quem é este documento?"**: lista de participantes + "Novo
participante" (nome/CPF extraídos pré-preenchidos, papel escolhível, incluindo "Cônjuge de X").

Pré-seleção, nesta ordem:
1. CPF extraído (válido por `cpfValido`) = CPF de um participante → esse participante.
2. Sem CPF no documento: nome extraído bate (normalizado, sem acento/caixa) com um participante → esse.
3. CPF extraído = Pessoa existente fora da proposta → "já cadastrado: adicionar como participante?".
4. Nada bate → "Novo participante".

Usuário sempre confirma. Aviso de "pessoa divergente" atual continua quando a escolha contraria o
documento. Ao confirmar (`ocr-confirmar` recebe `pessoa_id` alvo em vez de `titular`):
- dados aplicados na Pessoa alvo com as regras atuais (vazio preenche; divergente → conflito);
  espelhamento em `leads` só quando a alvo é o titular (enquanto `leads` tiver essas colunas);
- `documentos.pessoa_id` = Pessoa alvo; vínculo com o lead mantido;
- CPF que já é de outra Pessoa → mesmo aviso `cpf_pertence_a` atual.

**Certidão de casamento**: mostra os dois cônjuges extraídos; usuário liga cada um a participante ou
novo; confirma → cria/atualiza Relacionamento (tipo, `data_inicio`, `regime_bens` da certidão) e marca
estado civil dos dois.

**Documento já no titular**: aba Documentos ganha "Mover para participante…" (troca o dono via rota de
servidor; só documentos cujo dono é participante daquela proposta). "Organizar arquivos" mostra o dono.

### Bot
- `*cria cliente`: sem mudança de comportamento; cria lead + Participação titular (pela nova RPC).
- `*salva <nome>`: `buscarEntidade` passa a achar a Pessoa também como **participante** (qualquer papel)
  de lead/processo aberto; documentos ganham essa Pessoa como dono e vínculo com o lead/processo onde ela
  participa. Resposta diz "Afrânio (coparticipante do lead de Heitor)".
- Invariantes do CLAUDE.md atualizados: (2) "dono do documento é a pessoa **do participante**"; (1) agora
  garantido também por trigger em `participacoes`.

## 4. Crédito, conversão, formulários, contratos

- **Crédito**: quadro de renda por participante (renda da Pessoa) + total = soma dos com
  `compoe_renda = true`. `renda_considerada` do lead continua sendo o campo de override manual existente.
  Lista de coparticipantes/vendedores da aba Crédito passa a ser a mesma das Participações.
- **Simulação na tela** usa o total acima. `*simula` no WhatsApp não muda (renda vem do texto).
- **Conversão lead → negócio** (`NovoProcessoModal`): lista participantes do lead com checkbox (todos
  marcados); cria Participações no processo (mesmo papel/ordem/compõe renda). Documentos pela rota
  `/api/documentos/vinculos`.
- **Formulários** (`dados-lead.ts`, `dados.ts`, `flat-template.ts`, geradores por banco): builder único
  `montarCompradores(proposta)` lê Participações ordenadas e devolve `DadosComprador[]` com o cônjuge
  resolvido pelo Relacionamento. Formulário com N vagas e proposta com mais compradores → **aviso**
  explícito ("formulário tem 2 compradores; proposta tem 3 — gerar 2ª via para Maria"), nunca corte
  silencioso. Vagas por banco levantadas no plano.
- **Contratos** (`resumoParaTemplate.ts`, `substituirVariaveis.ts`): qualificação de cada parte usa o
  Relacionamento ("casado com X sob o regime Y"). Vendedores e seus cônjuges pelo mesmo modelo
  (substitui `processo_vendedores.conjuge_*`).

## 5. Migração dos dados

1. **Diagnóstico (só leitura)** `supabase/<data>_diagnostico_participantes_v2.sql`: renda divergente
   lead × Pessoa; cônjuge só em campos soltos (com/sem CPF); `processo_compradores`/`processo_vendedores`
   sem `pessoa_id`; CPF de cônjuge solto que já existe em outra Pessoa; `pessoas.conjuge_pessoa_id`
   não recíproco; pessoas de operador em qualquer lista de participante. Usuário revisa antes de gravar.
2. **Conversão (migration)**:
   - lead → Participação titular (`leads.pessoa_id`); cônjuge (`leads.conjuge_pessoa_id` → senão
     `pessoas.conjuge_pessoa_id` → senão campos soltos com nome ⇒ cria Pessoa) → `conjuge_anuente`,
     `compoe_renda = renda do cônjuge > 0`; `lead_coparticipantes` → `coparticipante`;
     `lead_vendedores` + `leads.vendedor_pessoa_id` → `vendedor`.
   - processo → `processo_compradores` (`principal` → titular, demais coparticipante; sem `pessoa_id`
     ⇒ busca por CPF ⇒ senão cria Pessoa); `processo_vendedores` (+ `conjuge_*` ⇒ Pessoa + Relacionamento).
   - Relacionamentos a partir de `pessoas.conjuge_pessoa_id`, `regime_casamento`, `data_casamento`
     (divergência entre os dois cônjuges → valor do titular, registrado no diagnóstico).
   - Renda: Pessoa vence; se nula, recebe a do lead.
3. **Colunas antigas → `_legado`** (renomear, sem leitura/escrita) por 30 dias, depois `DROP`. O projeto
   não tem backup automático (protocolo de segurança) — esta é a rede de proteção. Trigger
   `fn_sincronizar_pessoa_conjuge` removido.

## 6. Entrega em duas fases (sem duas fontes de escrita)

**Fase A — invisível para a equipe**
1. Tabelas, RLS, guards, backfill.
2. Sincronização **de mão única** antigo → novo (triggers nas tabelas/colunas antigas atualizam
   Participações/Relacionamentos). Ninguém grava nas tabelas novas diretamente ainda.
3. Migram para o modelo novo as leituras que **combinam várias fontes** (onde o modelo novo muda o
   resultado): formulários (+ aviso de vagas), Crédito (totais), vínculos/destinos de documento, busca
   do bot. Leitores que só exibem uma tabela antiga (~20 arquivos com `processo_compradores`, dashboards,
   agenda, clicksign, contratos) continuam corretos porque a sincronização mantém as tabelas antigas
   iguais — migram na Fase B, antes das colunas virarem `_legado`.

**Fase B — troca de escrita**
4. `ParticipantesProposta` (Lead e Negócio), OCR novo, "Mover para participante", `*salva` por participante,
   RPC de criação de lead com titular.
5. Desliga a sincronização; `leads.pessoa_id` passa a derivado; colunas antigas → `_legado`.
6. Atualiza CLAUDE.md (invariantes, "Pegadinhas de arquitetura") e remove código morto que lia `conjuge_*`.

Em nenhum momento existe escrita em dois lugares: na Fase A escreve-se só no antigo (e copia-se numa
direção); na Fase B, só no novo.

## Tratamento de erros

- Toda rota nova olha `error` **e** linhas afetadas (RLS silenciosa).
- Conflito de CPF (UNIQUE) → resposta estruturada com o dono atual, UI oferece usar a Pessoa existente.
- Corrida criando o mesmo participante (dois cliques/duas abas) → `UNIQUE (lead_id, pessoa_id)`;
  rota trata `23505` como sucesso idempotente.
- Troca de titular é uma RPC atômica (rebaixa o atual e promove o novo na mesma transação).
- Remover participante com documentos cujo dono é ele: permitido (documento fica na Pessoa); aviso
  informando quantos documentos deixam de aparecer no lead.

## Testes

- Unitários: `montarCompradores` (ordem, cônjuge via Relacionamento, compõe renda, excesso de vagas);
  pré-seleção do OCR (4 regras); defaults de papel; rótulo "Cônjuge de X".
- Banco real (não só mock — regra do CLAUDE.md): guard de operador; titular único; `leads.pessoa_id`
  derivado; RLS de carteira com participante de outro comercial; backfill num dump de teste com
  diagnóstico zerado de inconsistências inesperadas.
- Ponta a ponta: Heitor + Afrânio + Maria (anuente) — `*inicio` + lote misto + `*cria cliente` →
  separar no OCR → casado com → converter em negócio → formulário BB e contrato com os três. Segundo
  cliente do mesmo comercial em seguida: dois leads, pessoas distintas (teste existente do CLAUDE.md).

## Fora de escopo

- Unificar Lead + Processo em Negócio (Parte 2 do V2).
- Imóvel como entidade, Empresa como parte (pergunta aberta do V2).
- Papéis fiador/procurador (o modelo aceita, mas UI e formulários não nesta entrega).
- Separação automática de documentos no `*cria cliente` (decisão: separar na extração).
