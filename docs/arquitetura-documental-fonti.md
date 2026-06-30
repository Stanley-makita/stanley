# Arquitetura Documental do Fonti — Sprint Inteligência Documental V2

**Fase 1 — Projeto de Arquitetura (documento de referência, sem implementação)**

Status: proposta para aprovação. Nenhum código, migration ou alteração de tabela foi feita nesta fase.

---

## 0. Premissa adotada

```
Pessoa → Acervo Documental → Documento → Extrações OCR → Validação → Vínculos
```

Documentos enviados pelo cliente (identidade, comprovantes, holerites, extratos, certidões, IR, declarações) pertencem à **Pessoa** e formam um **Acervo** reutilizável por Leads, Processos, Simulações, Formulários e pelo **Normi**.

Documentos produzidos **durante** o processo (contrato, matrícula atualizada, laudo, parecer, minuta, despacho, registro) são tratados como uma **segunda categoria**, analisada no item 1.

---

## 1. Arquitetura Recomendada

### 1.1 Concordo com a separação Acervo da Pessoa × Documentos do Processo — com uma ressalva

A distinção que você propõe é correta e deve existir **conceitualmente**: um RG não é "trabalho realizado", é prova de identidade da pessoa; um laudo de engenharia é "trabalho realizado" para aquela operação específica, não é reutilizável em outra venda do mesmo cliente, e normalmente nem é "sobre" a pessoa — é sobre o imóvel/operação.

**Ressalva:** eu não criaria dois sistemas paralelos (duas tabelas-mãe, dois pipelines de OCR, dois catálogos). Isso reproduziria o problema atual (`processo_documentos` vs `documentos_clientes` já são duas streams desencontradas). Em vez disso, proponho **um único modelo técnico** (`documentos`) com um **domínio** que discrimina a propriedade:

| Domínio (`dominio`) | Nome formal | Dono | Reutilizável? | OCR? | Exemplos |
|---|---|---|---|---|---|
| `acervo_documental` | **Acervo Documental** | Pessoa (obrigatório — proprietária dos documentos) | Sim — via vínculo N:N com Lead/Processo | Sim, tipicamente | RG, CNH, CPF, comprovante de residência, holerite, extrato, certidão, IR, declaração |
| `processo_trabalho` | Documentos do Processo | Processo (obrigatório, 1:1) | Não — nasce e morre com o processo | Eventual (ex: ler dados de uma matrícula) | Contrato, matrícula atualizada, laudo, parecer, minuta, despacho, registro |

O nome técnico do domínio é `acervo_documental`; a **Pessoa continua sendo a proprietária** de todo documento desse domínio — "Acervo Documental" é o nome do conjunto, não uma mudança de quem é dono.

Por que um único modelo e não dois sistemas:
- **Normi consulta uma tabela só** — não precisa saber se é "tipo pessoa" ou "tipo processo", só filtra por `dominio` quando relevante.
- **Catálogo, storage, compartilhamento e auditoria são reaproveitados** — um laudo também pode precisar ser compartilhado via WhatsApp ou ter buscado dados por OCR; não faz sentido essa infraestrutura existir só para um dos dois domínios.
- **A regra de dono é imposta por constraint, não por convenção**: linhas `acervo_documental` exigem `pessoa_id` e proíbem `processo_id` direto; linhas `processo_trabalho` exigem `processo_id` e proíbem reuso (sem tabela de vínculo — é dono direto, 1:1, porque não deve circular entre processos).

Isso responde sua pergunta dos dois jeitos: **sim, a separação faz sentido e deve ser mantida** — mas como uma propriedade do mesmo modelo, não como duas arquiteturas distintas.

### 1.2 Extrações OCR como histórico (1:N)

Cada execução de OCR vira uma linha própria, nunca sobrescreve a anterior. Campos por execução, conforme solicitado:

- `provider` (ex: `claude_vision`, `claude_haiku_texto`)
- `modelo` (ex: `claude-sonnet-5`)
- `versao` (versão do prompt/schema de extração — permite saber se uma mudança de prompt afetou o resultado)
- `executado_em`
- `confianca` (`alta` / `media` / `baixa`)
- `dados` (JSONB — payload completo retornado)
- `status` (`pendente`, `processando`, `concluido`, `erro`, `ignorado`)
- `solicitado_por` (usuário ou `sistema` quando automático)
- `tempo_processamento_ms`
- `vigente` (boolean — exatamente uma extração `concluido` por documento marcada vigente; as demais ficam para auditoria)

A apuração de renda (hoje uma tabela paralela `apuracoes_renda`) deixa de ser um sistema à parte: vira mais um `provider` de extração (`provider = 'apuracao_renda'`), gravando seu resultado estruturado no mesmo histórico. A lógica de negócio (pipeline de 3 etapas) não muda — só onde o resultado final é persistido.

### 1.3 Validação Humana como camada formal

Concordo integralmente e é uma peça que faltava na proposta anterior. A cadeia fica:

```
Documento → OCR (extração, dado "bruto") → Validação Operacional → Dados Oficiais
```

Modelagem: a validação **não cria uma tabela de "dados oficiais" separada com schema próprio** (isso recriaria o problema de fonte dupla que já existe hoje entre `pessoa_documentos_identificacao` e os campos flat em `pessoas`). Em vez disso, a validação é um **evento sobre a extração vigente**:

- `extracoes_ocr.validado_em`, `validado_por`, `dados_validados` (JSONB — cópia editável dos dados extraídos; o operador pode corrigir um campo que o OCR leu errado sem precisar reprocessar o documento)
- Enquanto `validado_em IS NULL`, o dado é **sugestão** (usável só para preenchimento automático de formulário com revisão, nunca para gravação silenciosa em cadastro)
- A partir de `validado_em IS NOT NULL`, `dados_validados` passa a ser a fonte oficial — é isso que formulários, simuladores e o Normi devem ler por padrão, não o `dados` bruto do OCR

Isso dá rastreabilidade total: o que a IA leu (`dados`) e o que o humano confirmou (`dados_validados`) ficam ambos guardados, nunca um sobrescrevendo o outro.

### 1.4 Catálogo de Tipos de Documento

Tabela única, eliminando os arrays hardcoded espalhados em componentes. Atributos propostos (os pedidos + complementares que considero necessários):

| Atributo | Propósito |
|---|---|
| `codigo` | identificador estável (ex: `rg`, `extrato_bancario`) — usado em código/integrações |
| `nome` | label de exibição |
| `grupo` | agrupamento visual (`identificacao`, `comprovante`, `financeiro`, `juridico`, `produzido_processo`) |
| `dominio_permitido` | `acervo_documental`, `processo_trabalho`, ou ambos — controla onde o tipo pode ser usado |
| `permanente` | nunca expira (RG, CPF) |
| `validade_dias` | prazo padrão quando não permanente |
| `permite_ocr` | habilita botão/fluxo de OCR para esse tipo |
| `permite_compartilhamento` | habilita compartilhamento via WhatsApp |
| `gera_formulario` | indica se o tipo alimenta geração automática de formulário bancário |
| `utilizado_pelo_normi` | flag de visibilidade para consultas do Normi (alguns tipos internos podem não interessar a ele) |
| `obrigatorio_por_operacao` | regra de obrigatoriedade (pode ser JSON: `{banco: 'caixa', modalidade: 'fgts', obrigatorio: true}` — permite checklist dinâmico por banco/produto, hoje isso é hardcoded no motor de checklist) |
| `schema_extracao` | (complementar) JSON Schema esperado do OCR para esse tipo — permite validar a extração e construir UI de revisão dinamicamente, sem hardcode de campos por tipo como hoje |
| `ordem_exibicao`, `ativo`, `icone` | (complementar) suporte de UI |

Adicionar um tipo novo no futuro passa a ser um INSERT no catálogo, não um deploy de frontend.

### 1.5 Vínculos — reuso sem duplicar arquivo

```
documento_vinculos
  documento_id  → documentos (apenas dominio = acervo_documental)
  entidade_tipo → 'lead' | 'processo'
  entidade_id
  vinculado_em / vinculado_por
  UNIQUE(documento_id, entidade_tipo, entidade_id)
```

Generaliza o `documento_processo_vinculos` que já existe hoje, estendendo para Lead. Um mesmo extrato bancário pode estar vinculado a um Lead **e**, quando o Lead vira Processo, ao Processo, **e** a um segundo Processo do mesmo cliente no futuro — sem duplicar o arquivo, sem reenviar, sem reprocessar OCR.

Documentos `processo_trabalho` não usam essa tabela — são propriedade direta e exclusiva do processo (`documentos.processo_id`).

### 1.6 Ciclo de Vida do Documento

Acrescentando o conceito proposto. O ciclo de vida tem 7 estados, mas eles não vivem todos no mesmo nível: alguns são propriedade do **documento** (globais), outros são propriedade do **vínculo** (por Lead/Processo onde o documento é usado) — essa distinção é explicada no item 1.6.2.

```
Recebido
   │  (upload concluído + registro em "documentos")
   ▼
OCR Executado
   │  (extracoes_ocr concluída e marcada vigente — dado ainda "bruto")
   ▼
Validado
   │  (operador confirma/corrige os dados da extração vigente)
   ▼
Homologado            ◄── estado por VÍNCULO, não global (ver 1.6.2)
   │  (documento aceito para uso numa operação específica)
   ▼
Utilizado              ◄── estado por VÍNCULO, não global
       (consumido por um formulário, checklist ou simulação)

Em paralelo, a qualquer momento da linha acima:
   ──(validade vencida, calculado a partir do catálogo)──►  Expirado
   ──(chegou novo documento do mesmo tipo p/ a mesma pessoa)──►  Substituído
```

**Recebido**, **OCR Executado** e **Validado** são estados globais do documento (refletem o estado da extração vigente — `extracoes_ocr`). **Expirado** é um status calculado (não armazenado como evento, igual à lógica de validade que já existe hoje), e **Substituído** é marcado quando um novo documento do mesmo `catalogo_tipo_id` chega para a mesma Pessoa (`documentos.substituido_por_id` aponta para o novo; o antigo permanece no histórico, só sai das listagens padrão).

**Homologado** e **Utilizado** vivem em `documento_vinculos` (por entidade — Lead ou Processo), não em `documentos` — o motivo está no item 1.6.2.

#### 1.6.2 Validado × Homologado — são conceitos diferentes, concordo com a separação

São duas perguntas diferentes, e por isso merecem campos diferentes em níveis diferentes do modelo:

| | Validado | Homologado |
|---|---|---|
| Pergunta que responde | "Os dados que o OCR leu deste documento estão corretos?" | "Este documento (com esses dados) é aceito para uso **nesta operação específica**?" |
| Camada | Qualidade do dado (extração) | Aceitação de negócio (operação/banco/jurídico) |
| Quem decide | Operador que revisa a extração | Pode envolver outra área (jurídico, operacional) ou regra do banco/produto |
| Onde vive no modelo | `extracoes_ocr.validado_em/validado_por` — **global, um por documento** | `documento_vinculos.homologado_em/homologado_por` — **um por vínculo (por operação)** |
| Pode variar entre Processos do mesmo cliente? | Não — os dados lidos do documento são os mesmos em qualquer lugar | **Sim** — o mesmo extrato pode estar homologado no Processo X e pendente de homologação no Processo Y, porque o banco Y exige um extrato mais recente ou o jurídico daquele processo levantou uma ressalva específica |

Concretamente: um comprovante de residência pode ter dados **Validados** (endereço lido corretamente pelo OCR e confirmado pelo operador) mas ainda não estar **Homologado** para um Processo específico porque aquele banco exige o comprovante com no máximo 30 dias e este já está com 45. O dado está correto (Validado), mas o documento não atende ao critério daquela operação (não Homologado) — são informações distintas e ambas precisam ser auditáveis separadamente.

Isso também explica por que **Utilizado** segue o mesmo raciocínio de "por vínculo": um documento só deveria alimentar formulário/checklist de uma operação depois de homologado *para aquela operação*, então faz sentido rastrear o uso no mesmo nível (vínculo), não no documento como um todo.

> Campos adicionais propostos em `documento_vinculos` (conceituais, sem migration nesta fase): `homologado_em`, `homologado_por`, `utilizado_em`. Se no futuro for necessário registrar múltiplos usos do mesmo documento na mesma operação (ex: usado em 2 formulários diferentes do mesmo processo), isso pode evoluir para uma tabela de log (`documento_usos`) sem alterar o restante do modelo.

---

## 2. Justificativas (resumo das decisões)

- **Um modelo técnico, dois domínios** em vez de dois sistemas: evita recriar a fragmentação atual (`processo_documentos` vs `documentos_clientes`) e mantém o Normi com uma única fonte.
- **Extrações como histórico append-only**: necessário tanto para auditoria quanto porque reprocessar com um prompt/modelo melhor no futuro não deve destruir o que já foi confirmado.
- **Validação como evento sobre a extração**, não como tabela de schema fixo por tipo: evita recriar o problema atual de `pessoa_documentos_identificacao` (schema rígido, só 4 tipos cobertos) e escala para qualquer tipo de documento sem migration nova a cada tipo.
- **Catálogo orientado a dados**: regras de negócio (validade, obrigatoriedade por banco, permissões de OCR/compartilhamento) saem do código e viram configuração — hoje builtins em componentes React e no motor de checklist.
- **Vínculo N:N só onde reuso faz sentido**: aplicar vínculo também a `processo_trabalho` seria complexidade sem benefício, já que esses documentos não são, por definição, reutilizáveis.
- **Ciclo de vida em dois níveis (documento vs. vínculo)**: separa "o dado está correto" (Validado, global) de "o documento serve para esta operação" (Homologado/Utilizado, por vínculo) — sem isso, um documento aceito num Processo pareceria erroneamente aceito em todos.

---

## 3. Diagrama das Entidades

```
                              Pessoa  (proprietária)
                                │
                ┌───────────────┴────────────────┐
                │                                 │
        Acervo Documental                   (campos próprios:
        (documentos dominio=                 nome, cpf, etc. —
         acervo_documental)                   sem mais espelhamento
                │                              de doc nos flats)
                │
         ┌──────┴───────────────────────────────┐
         │                                       │
     Documento (RG)                        Documento (Extrato bancário)
     ciclo: Recebido→OCR Executado→         ciclo: Recebido→OCR Executado→
            Validado→Expirado/Substituído           Validado→Expirado/Substituído
         │                                       │
   ┌─────┼─────────────┐                  ┌──────┼─────────────┐
   │     │             │                  │      │             │
 OCR   Validação   Compartilh.          OCR    Validação   Vínculos
 (1:N) (sobre OCR,  (histórico)        (1:N)   (sobre OCR,     │
        global)                                  global)        │
                                                          ┌──────┴──────┐
                                                          │             │
                                                    Vínculo Lead A   Vínculo Processo X
                                                    Homologado: -    Homologado: sim
                                                    Utilizado: -     Utilizado: sim (formulário)
                                                                          │
                                                                   (mesmo documento,
                                                                    reaproveitado)
                                                                          │
                                                                   Vínculo Processo Y
                                                                   Homologado: pendente
                                                                   (banco Y exige extrato
                                                                    mais recente)


                              Processos
                                │
                        Documentos do Processo
                        (dominio=processo_trabalho)
                                │
                 ┌──────────────┼───────────────┐
                 │              │               │
             Contrato       Laudo          Matrícula
             (dono único = processo, sem vínculo, sem reuso —
              ciclo de vida igual: Recebido→OCR Executado(opcional)
              →Validado→Expirado/Substituído; sem Homologado/Utilizado
              por vínculo, pois já pertence a uma única operação)


                            Catálogo de
                          Tipos de Documento
        (codigo, grupo, dominio_permitido, validade,
         permanente, permite_ocr, permite_compartilhamento,
         gera_formulario, utilizado_pelo_normi,
         obrigatorio_por_operacao, schema_extracao)
                                │
              referenciado por TODO documento
              (acervo_documental OU processo_trabalho)


                              Normi
                                │
                  consulta única: "documentos"
                  + extração vigente e validada
                  + estado do vínculo (homologado/utilizado)
                  quando o contexto é lead/processo
                  (não sabe e não precisa saber se
                   veio de pessoa, lead ou processo)
```

### Modelo relacional simplificado

```
pessoas 1───N documentos (quando dominio = acervo_documental, pessoa_id obrigatório)
processos 1───N documentos (quando dominio = processo_trabalho, processo_id obrigatório, 1:1 de fato)

documentos
  recebido_em
  substituido_por_id → documentos (self-FK, nulo exceto quando Substituído)
  status_ciclo_vida (calculado: recebido | ocr_executado | validado | expirado | substituido)

documentos 1───N extracoes_ocr
  extracoes_ocr: validado_em / validado_por / dados_validados  (estado "Validado", global)

documentos N───N (leads, processos) via documento_vinculos   [só acervo_documental]
  documento_vinculos: homologado_em / homologado_por  (estado "Homologado", por vínculo)
                       utilizado_em                    (estado "Utilizado", por vínculo)

documentos N───1 catalogo_tipos_documento
documentos 1───N documentos_compartilhamentos   [reaproveitado, já existe hoje]
```

---

## 4. Fluxos

### 4.1 Upload via WhatsApp
```
Cliente envia arquivo no WhatsApp
   → Webhook recebe, baixa do provedor (URL expira rápido)
   → Resolve pessoa_id pelo telefone (cria Pessoa se não existir)
   → Upload no storage (path por pessoa_id, não mais por conversa)
   → INSERT documentos (dominio=acervo_documental, pessoa_id, origem=whatsapp,
       classificacao=NULL, status_ocr=pendente)
   → (opcional, configurável por tipo no catálogo) dispara OCR automaticamente
       se detecção heurística sugerir tipo com permite_ocr=true
   → Realtime notifica operador (reaproveita pipeline de notificações do Item 20)
```

### 4.2 Upload Manual (operador, dentro de Lead/Processo/Pessoa)
```
Operador seleciona tipo no catálogo (ou "detectar automaticamente")
   → Upload no storage
   → INSERT documentos (dominio definido pelo contexto de origem:
       se enviado dentro de "Pessoa"/"Lead" → acervo_documental
       se enviado dentro de "Processo > Documentos do Processo" → processo_trabalho)
   → Se acervo_documental E a tela de origem foi um Lead/Processo →
       cria automaticamente o documento_vinculo para aquela entidade
```

### 4.3 OCR
```
Documento com permite_ocr=true (resolvido via catálogo)
   → Disparo manual (botão) ou automático (configurável por tipo)
   → INSERT extracoes_ocr (status=processando, solicitado_por, executado_em)
   → Provider (Claude Vision / Haiku texto, conforme tipo) processa
   → UPDATE extracoes_ocr (status=concluido|erro, dados, confianca, tempo_processamento_ms)
   → Marca essa extração como vigente=true (desmarca a anterior)
   → documentos.status_ocr atualizado para refletir a extração vigente
```

### 4.4 Classificação
```
Automática: extracao_ocr.dados.tipo_detectado → resolve catalogo_tipos_documento
            por codigo → grava documentos.catalogo_tipo_id (sugestão, não oficial)
Manual: operador escolhe na UI (dropdown vindo do catálogo, filtrado por
        dominio_permitido) → grava direto, sobrepõe sugestão automática
```

### 4.5 Validação (dado correto — global ao documento)
```
Operador abre extração vigente → revisa campo a campo
   → Edita o que o OCR leu errado → grava em dados_validados
   → Confirma → extracoes_ocr.validado_em/validado_por preenchidos
   → Documento entra no estado "Validado" (ciclo de vida)
   → A partir daqui, formulários/simuladores/Normi leem dados_validados,
     não mais dados (bruto)
```

### 4.5b Homologação (aceite por operação — por vínculo)
```
Documento já Validado é avaliado no contexto de um Lead/Processo específico
   → Responsável daquela operação confirma que o documento atende aos
       critérios daquela operação (prazo de validade exigido pelo banco,
       conformidade jurídica, etc.)
   → UPDATE documento_vinculos (homologado_em, homologado_por)
   → Esse mesmo documento pode estar Homologado num Processo e ainda
       pendente noutro — o estado não é do documento, é do vínculo
   → Quando o documento é de fato consumido (formulário gerado, checklist
       concluído) → documento_vinculos.utilizado_em é preenchido
       (estado "Utilizado")
```

### 4.6 Compartilhamento
```
Operador seleciona documento do Acervo (ou do Processo)
   → Define destino (cliente, corretor, interno, número customizado)
   → Gera signed URL, envia via WhatsApp
   → INSERT documentos_compartilhamentos (reaproveita tabela atual,
       só passa a referenciar "documentos" único em vez de documentos_clientes)
```

### 4.7 Vinculação ao Lead
```
Lead precisa de um documento do Acervo da Pessoa associada
   → Busca documentos da Pessoa filtrados por catálogo/grupo relevante
   → Se já existe vínculo (documento_vinculos entidade_tipo=lead) → reaproveita
   → Se não existe → cria vínculo (não duplica arquivo, não reprocessa OCR)
```

### 4.8 Vinculação ao Processo
```
Processo nasce a partir de um Lead (fluxo já existente)
   → Todos os vínculos do Lead (entidade_tipo=lead) são "herdados":
       cria-se vínculo equivalente entidade_tipo=processo, entidade_id=processo.id
   → Documentos do Acervo continuam pertencendo só à Pessoa — o Processo
       passa a enxergá-los via vínculo, igual ao Lead enxergava
```

### 4.9 Reutilização em outro Processo
```
Cliente já tem Processo X concluído, abre Processo Y (nova operação)
   → Tela de Documentos do Processo Y consulta o Acervo da Pessoa
   → Operador seleciona quais documentos do Acervo quer vincular a Y
   → Cria documento_vinculos (entidade_tipo=processo, entidade_id=Y)
       — mesmo arquivo físico, mesma extração, zero reprocessamento
```

### 4.10 Geração de Formulários
```
Motor de formulário precisa de dado X de uma Pessoa, no contexto de um Processo
   → Consulta documentos da Pessoa filtrados por catalogo_tipo (gera_formulario=true)
   → Lê extracao_ocr vigente E validada (dados_validados) — nunca dado não confirmado
   → Confere documento_vinculos.homologado_em para aquele Processo — se ainda
       não homologado, formulário sinaliza pendência em vez de preencher
   → Ao gerar o formulário com sucesso → documento_vinculos.utilizado_em preenchido
   → Se não houver validação → formulário sinaliza campo pendente
       em vez de preencher com dado não confiável
```

### 4.11 Consulta pelo Normi
```
Normi pergunta: "quais documentos a Pessoa/Lead/Processo X tem disponíveis,
                  de que tipo, com que dados oficiais?"
   → Uma única consulta: documentos (+ vínculos quando o contexto é lead/processo)
       + extracao_ocr vigente + dados_validados
   → Normi nunca precisa saber se o documento "mora" em pessoa, lead,
       processo, tabela de OCR genérico ou apuração de renda — é tudo
       a mesma Biblioteca Documental
```

---

## 5. Estratégia de Migração em Fases

> Cada fase é independentemente reversível e não quebra a fase anterior — permite pausar entre fases sem deixar o sistema inconsistente.

**Fase A — Catálogo**
Criar `catalogo_tipos_documento`, popular com os tipos atuais (13 + 4 de identidade). Não toca em dado existente. Frontend passa a ler o catálogo em vez do array hardcoded (consumo aditivo, sem remover o array ainda).

**Fase B — Histórico de OCR**
Criar `extracoes_ocr`. Toda nova execução de OCR grava lá. `documentos_clientes.ocr_dados` continua sendo escrito em paralelo (espelho) até a Fase E, para não quebrar nada que já leia esse campo.

**Fase C — Validação**
Adicionar `validado_em/validado_por/dados_validados` em `extracoes_ocr`. UI de revisão de OCR passa a gravar nesses campos ao confirmar. Consumidores (formulários) continuam lendo a fonte antiga até serem migrados na Fase E.

**Fase D — Modelo unificado `documentos` + vínculos**
Criar `documentos` (com `dominio`) e `documento_vinculos`. Rodar uma migração de dados que:
- Copia `documentos_clientes` → `documentos` (`dominio=acervo_documental`), recriando vínculos de lead/processo como `documento_vinculos`
- Copia `processo_documentos` → `documentos` (`dominio=processo_trabalho`)
- Resolve `pessoa_id` para os casos hoje sem pessoa identificada (regra de fallback a definir — ver Riscos)

Tabelas antigas continuam existindo e legíveis (não removidas ainda).

**Fase E — Corte de leitura**
Frontend e APIs passam a ler exclusivamente o modelo novo. `pessoa_documentos_identificacao` vira visão sobre `documentos`/`extracoes_ocr` (ou mantém-se como tabela de dados estruturados 1:1, alimentada pela validação). Campos flat em `pessoas` (rg, cnh etc.) deixam de ser escritos — viram somente leitura/deprecados.

**Fase F — Consolidação de UI**
As 3 implementações de `AbaDocumentos` colapsam numa só, parametrizada por contexto (Pessoa/Lead/Processo) e domínio.

**Fase G — Aposentadoria**
Remover tabelas antigas (`documentos_clientes`, `processo_documentos`, campos flat) só depois de um período de operação estável com o modelo novo e confirmação de que nada mais lê as tabelas antigas.

---

## 6. Riscos

1. **Resolução de `pessoa_id` para documentos órfãos** — `processo_documentos` hoje não exige vínculo com pessoa identificada; pode haver uploads sem pessoa resolvível. Precisa de regra de fallback (ex: pessoa "sistema"/genérica do processo, ou manter esses casos especificamente como `processo_trabalho` por padrão, o que de fato resolve a maior parte do problema).
2. **Volume de dado migrado** — `documentos_clientes` é tabela de alto volume (todo histórico de WhatsApp); migração de dados precisa rodar em lote, não em transação única.
3. **Quebra de consumidores não mapeados** — qualquer código hoje lendo `pessoas.rg`/`pessoas.registro_cnh` direto (formulários, simuladores) precisa ser identificado antes da Fase E, sob risco de regressão silenciosa.
4. **Storage path muda de partição** (hoje por processo/conversa, futuro por pessoa) — exige plano de RLS/policy novo no bucket, não só nas tabelas.
5. **Duplicidade temporária de gravação** (Fases B/C escrevendo em dois lugares) — janela de inconsistência se um caminho de código escrever só no novo e outro só ler do antigo; precisa de checklist de auditoria por fase antes de avançar.
6. **Regra de obrigatoriedade por banco/produto** (`obrigatorio_por_operacao`) hoje vive hardcoded no motor de checklist operacional — migrar isso para o catálogo é mudança de comportamento, não só de schema, e precisa de validação funcional com o time de operações.

## 7. Benefícios

- **Reuso real de documento** entre Lead → Processo → outro Processo, sem reenvio nem reprocessamento de OCR.
- **Fonte única de verdade** para qualquer consumidor (formulário, simulador, Normi) — elimina a pergunta "esse dado vem de onde".
- **Auditoria completa**: toda extração de OCR preservada, toda validação rastreada (quem confirmou, quando, o que mudou em relação ao bruto).
- **Extensibilidade sem deploy**: novo tipo de documento, nova regra de obrigatoriedade por banco, nova flag de comportamento — tudo via catálogo, não via código.
- **Pronto para Normi desde a Fase B/C** (histórico + validação já dão dado confiável), e totalmente simples a partir da Fase D (consulta única).
- **Redução de código duplicado**: uma implementação de UI e um pipeline de OCR em vez de três telas e dois motores.

## 8. O que manter da arquitetura atual

- **`pessoa_documentos_identificacao` como conceito está correto** — é o único pedaço de hoje que já segue "documento pertence à pessoa". Vira a base do desenho de validação (campos estruturados 1:1 por documento), não é descartado, é generalizado.
- **`documento_processo_vinculos`** — o conceito de junction table para reuso já existe; só precisa generalizar para também cobrir Lead (`documento_vinculos`).
- **Motor de OCR (Claude Vision) e o pipeline de apuração de renda (3 etapas)** — lógica de negócio validada, mantém-se; muda só onde o resultado é persistido.
- **`documentos_compartilhamentos`** — modelo de auditoria de compartilhamento já está correto, só passa a referenciar a tabela `documentos` unificada.
- **Cálculo de validade (`permanente`/`validade_dias`/status visual)** — lógica já correta, migra para o catálogo em vez de função hardcoded por classificação.

## 9. O que deve ser descartado

- **As 4 FKs soltas e paralelas em `documentos_clientes`** (`conversa_id`, `pessoa_id`, `lead_id`, `processo_id` todas opcionais e sem hierarquia) — substituídas por dono único + vínculos.
- **Array hardcoded de tipos de documento no componente** — substituído pelo catálogo.
- **`ocr_dados` como coluna única sobrescrita a cada execução** — substituída pelo histórico `extracoes_ocr`.
- **Sincronização manual de campos flat em `pessoas`** (rg, registro_cnh, validade_cnh, etc.) — fonte dupla de verdade, motivo recorrente de divergência; é eliminada quando a validação formal assume o papel de "dado oficial".
- **`apuracoes_renda` como tabela paralela desconectada do histórico de OCR genérico** — passa a ser só mais um `provider` dentro do mesmo histórico.
- **As 3 implementações divergentes de `AbaDocumentos`** — convergem para uma única, parametrizada.

---

## Pendente de decisão (não bloqueia aprovação da arquitetura, mas precisa de resposta antes da Fase D)

- Regra de fallback para `pessoa_id` ausente em uploads históricos de `processo_documentos`.
- Lista definitiva de quais tipos hoje classificados como "documento de processo" (contrato, matrícula, laudo, parecer, minuta, despacho, registro) devem ou não permitir OCR — afeta o catálogo da Fase A.
- Quem é dono da governança do catálogo (que perfil pode criar/editar tipo de documento) — sugiro admin/gestor, a confirmar.
