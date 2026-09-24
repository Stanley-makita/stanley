# Pastas de documentos na Captação + "Organizar arquivos" — Design

**Data:** 2026-09-24
**Status:** aprovado em conversa, aguardando revisão do spec escrito

## Objetivo

Levar para a aba Documentos da **Captação** (lead) a mesma organização em pastas que já existe no
módulo **Negócios** (processo), resolvendo o problema específico da Captação: documentos chegam pelo
WhatsApp em qualquer ordem e muitas vezes sem nome útil. Um botão **"Organizar arquivos"** usa IA
barata para sugerir a pasta de cada arquivo sem pasta; o operador revisa e confirma. Quando o lead
vira negócio, os arquivos chegam ao negócio já nas pastas escolhidas.

**Sucesso:** o comercial abre a Captação, clica em um botão e em poucos cliques todos os arquivos
estão nas pastas certas, sem precisar mover um por um; e o negócio criado a partir do lead herda
essa organização.

## Decisões tomadas com o usuário

| Decisão | Escolha |
|---|---|
| Quais pastas na Captação | As mesmas 13 de Negócios (catálogo `catalogo_pastas_processo`) — 04 e 13 continuam atalhos para as abas Formulários/Simulações |
| Quando a IA roda | Só quando o operador clica em "Organizar arquivos" (não no webhook) |
| Quem decide a pasta | IA sugere, operador confirma na lista de revisão — nada move sozinho |
| Custo aceito | ~R$ 0,01 por foto / ~R$ 0,04 por PDF de 3 páginas (Haiku 4.5), ≈ R$ 20–40/mês para 200 clientes |

## Estado atual (base para o design)

- Catálogo global de pastas: `catalogo_pastas_processo` (migration 157) — 11 pastas de arquivo +
  01B Terceiros (migration 253). Números 04 e 13 não têm linha (são atalhos de aba).
- A pasta é **por vínculo**: `documento_vinculos.pasta_id` (documento do acervo reaproveitado) ou
  `documentos.pasta_id` (documento `processo_trabalho`, dono direto do processo). Ver
  `useMoverDocumentoParaPasta`.
- Sugestão de pasta: `inferirPastaSugerida()` (`src/lib/documentos.ts`) — papel da pessoa no
  processo (comprador/vendedor) > `catalogo_tipos_documento.pasta_sugerida_codigo` do tipo.
- A grade de pastas, filtro e contadores em `AbaDocumentos.tsx` só existem para
  `contexto === 'processo'`.
- Classificação de tipo: `processarOcrDocumento()` (`src/lib/documentos/ocr.ts`) tem uma **fase 1
  separada** (Haiku 4.5, `max_tokens: 120`, prompt `SYSTEM_PROMPT_CLASSIFICAR`) antes da extração
  completa (Sonnet 5). Tipos reconhecidos: rg, cnh, cpf, comprovante_endereco, comprovante_renda,
  extrato_fgts, extrato_bancario, certidao_casamento, certidao_nascimento, outro. O resultado vai
  para `documentos.classificacao_legado` (hoje `outro` é gravado como `null`).
- Lead → Negócio: a etapa "Vincular documentos" do `NovoProcessoModal` cria `documento_vinculos`
  com `pasta_id` já sugerido por papel > tipo.
- Documentos aparecem na Captação por vínculo `entidade_tipo in ('lead','lead_historico')` **ou**
  por pertencerem à Pessoa do lead (`documentos.pessoa_id`) sem vínculo com o lead.

## Design

### 1. Aba Documentos da Captação

- Com `contexto === 'lead'`, `AbaDocumentos` mostra a mesma grade de pastas de Negócios (as 13
  posições + "Todos"), contadores por pasta e navegação para dentro da pasta.
- Nova entrada virtual **"Sem pasta"** (só na Captação), destacada, com o total de arquivos sem
  pasta — é onde os arquivos do WhatsApp aparecem até serem organizados.
- Pasta de um documento no contexto lead = `documento_vinculos.pasta_id` do vínculo com **este**
  lead (`entidade_tipo = 'lead'`, `entidade_id = leadId`). Documento sem vínculo com o lead (só
  pela Pessoa) conta como "Sem pasta".
- Upload pelo computador: seletor de pasta por arquivo, igual Negócios; dentro de uma pasta, vem
  pré-selecionada.
- Mover de pasta manualmente pelo card, igual Negócios.

### 2. "Organizar arquivos"

**Entrada:** banner/linha "N arquivos sem pasta · Organizar arquivos", visível quando N > 0.

**Passo 1 — classificar (servidor):** nova rota `POST /api/leads/[id]/organizar-documentos/classificar`.
- Recebe os ids dos documentos sem pasta do lead (servidor revalida: pertencem à empresa e ao
  lead/Pessoa do lead).
- Para cada documento **ainda sem tipo conhecido** (`classificacao_legado` nulo ou `'auto'`), roda
  só a fase 1 do OCR (classificação Haiku), extraída de `processarOcrDocumento` para uma função
  reutilizável `classificarTipoDocumento()`. Grava o tipo em `classificacao_legado` — incluindo
  `'outro'` (para não pagar de novo na próxima vez).
- Documentos com tipo já conhecido não chamam a IA.
- Mime não suportado (áudio, figurinha, vídeo) → não chama a IA, volta sem sugestão.
- Concorrência limitada (ex.: 4 em paralelo) e timeout por chamada (45s, mesmo do OCR atual).
  Falha em um documento não derruba os outros: volta como "sem sugestão".
- Resposta: por documento `{ documento_id, tipo, pasta_sugerida_codigo | null }`, com a sugestão
  calculada por `inferirPastaSugerida()` usando: vendedor(es) vinculados ao lead como
  `pessoasVendedorasIds`, a Pessoa do lead como `pessoasCompradorasIds`, e o
  `pasta_sugerida_codigo` do tipo.

**Passo 2 — revisar (tela):** modal com uma linha por arquivo: miniatura (clique abre o arquivo),
nome, tipo identificado, seletor de pasta pré-preenchido com a sugestão (vazio quando não há).
Botões: "Confirmar" e "Cancelar". Linhas sem pasta escolhida continuam em "Sem pasta".

**Passo 3 — gravar (servidor):** nova rota `POST /api/leads/[id]/organizar-documentos/aplicar`
com `[{ documento_id, pasta_id }]`.
- Upsert do vínculo com o lead: se já existe `documento_vinculos` (`entidade_tipo = 'lead'`,
  `entidade_id = leadId`), atualiza `pasta_id`; se não existe (documento só da Pessoa), cria o
  vínculo com a pasta. **Nunca** altera `documentos.pessoa_id` (dono continua sendo a Pessoa —
  invariante 2 do CLAUDE.md).
- Checa linhas afetadas (lição do CLAUDE.md: UPDATE bloqueado não dá erro).
- Service role no servidor, revalidando empresa e pertencimento ao lead.

### 3. Integrações

- **Extrair dados:** `processarOcrDocumento` pula a fase 1 quando `classificacao_legado` já é um
  tipo conhecido (≠ nulo/'auto'/'outro'), indo direto à extração. Ao concluir, se o documento
  tem vínculo com lead **sem pasta**, preenche a pasta sugerida pelo tipo (sem custo extra).
- **Lead → Negócio** (`NovoProcessoModal`, etapa "Vincular documentos"): a pasta do vínculo com o
  lead de origem vira a **primeira prioridade** da sugestão, acima de papel e tipo. Implementado
  como um parâmetro opcional novo em `inferirPastaSugerida()` (`pastaDoLeadCodigo`), para a regra
  continuar num lugar só.

### 4. Dados

- Sem tabela nova e sem migration: `documento_vinculos.pasta_id` já existe e não é restrito a
  processo; `documentos.classificacao_legado` não tem CHECK.
- Conferir na implementação: a policy de INSERT/UPDATE de `documento_vinculos` para
  `entidade_tipo = 'lead'` — as rotas novas usam service role, então não dependem dela; o "mover
  de pasta" manual pelo card (client-side) depende da policy `documento_vinculos_update`
  (migration 158), que é por empresa e já cobre lead.

## Tratamento de erros

| Situação | Comportamento |
|---|---|
| IA falha/timeout em um arquivo | Linha aparece sem sugestão; os demais seguem |
| Arquivo não suportado (áudio/figurinha/vídeo) | Sem chamada à IA, sem sugestão |
| Tipo "outro" | Sem sugestão; operador escolhe ou deixa em "Sem pasta" |
| Documento de outra empresa/lead no payload | Ignorado pelo servidor (revalidação) |
| Gravação sem linha afetada | Erro explícito na tela, não toast de sucesso |

## Testes

- Unit: `inferirPastaSugerida` com `pastaDoLeadCodigo` (prioridade acima de papel/tipo).
- Rota classificar: pula IA quando tipo conhecido; grava `'outro'`; mime não suportado; falha
  isolada de um documento; sugestão vendedor vs comprador.
- Rota aplicar: atualiza vínculo existente; cria vínculo quando só há Pessoa; nunca toca
  `documentos.pessoa_id`; rejeita documento de outro lead/empresa.
- `processarOcrDocumento`: pula fase 1 com tipo conhecido; preenche pasta do vínculo lead sem pasta.
- Manual (produção): lead com 5+ arquivos do WhatsApp → Organizar → confirmar → converter em
  negócio → arquivos nas mesmas pastas.

## Fora do escopo

- Reconhecer documentos do imóvel (matrícula, IPTU, contrato) na classificação — viram "outro".
- Renomear arquivos automaticamente.
- Classificar automaticamente na chegada pelo WhatsApp (opção B, descartada).
