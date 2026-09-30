# Participantes V2 — B2d-1: OCR "De quem é este documento?" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** No modal "Revisar dados extraídos", a caixinha "Este documento é do cônjuge" vira a escolha "De quem é este documento?" (participantes da proposta + "Novo participante"), com sugestão automática; ao confirmar, os dados vão para a Pessoa escolhida e o documento passa a ser dela.

**Architecture:** Função pura `sugerirDonoDocumento` (spec §3: CPF → nome → novo; sem dado de identificação → dono atual). A rota `POST /api/documentos/[id]/ocr-confirmar` aceita `pessoa_alvo_id` (participante existente, visível pelo JWT do usuário) ou `novo_participante {nome, cpf}` + `lead_id` (reaproveita Pessoa pelo CPF, senão cria; inclui em `lead_coparticipantes` — mesmo caminho da aba Pessoa, sincronização ligada). Nunca Pessoa de operador (invariante 1). `titular: 'conjuge'` continua aceito (compatibilidade) mas a tela não usa mais.

**Spec:** `docs/superpowers/specs/2026-09-28-participantes-v2-design.md` §3 "Modal de extração".

## Global Constraints
- Branch `feat/participantes-v2-fase-b2d-ocr` (de main @ a41a953), worktree `participantes-v2`.
- Espelho em `leads` só onde a Pessoa alvo é titular (`.eq('pessoa_id', alvo)` — já é assim).
- Dono do documento (`documentos.pessoa_id`) = Pessoa escolhida; vínculos com lead/negócio intactos.
- Toda consulta olha `error`; Pessoa excluída nunca é alvo.
- Testes: vitest como nas fases anteriores; falhas pré-existentes: os 4 arquivos de sempre.

## Review Focus
1. Documento sem nome/CPF (comprovante de endereço) → sugere o dono atual, não "Novo participante".
2. "Novo participante" com CPF que já é de uma Pessoa → reaproveita (nunca duplica); se for Pessoa de operador → erro claro, nada gravado.
3. Alvo que não é visível ao usuário (outra carteira, fora da proposta) → 403/404, nada gravado.
4. Contexto Negócio → escolhe só entre participantes existentes (sem "Novo participante").

### Task 1: `sugerirDonoDocumento` (pura, TDD)
Files: `src/lib/participantes/donoDocumento.ts`, `src/lib/participantes/__tests__/donoDocumento.test.ts`.
Interface: `sugerirDonoDocumento(extraido: { cpf?: string | null; nome?: string | null }, participantes: Array<{ pessoaId: string; nome: string; cpf: string | null }>, donoAtualId: string | null): { tipo: 'participante'; pessoaId: string; motivo: 'cpf' | 'nome' | 'dono_atual' } | { tipo: 'novo' }`.
Regras: CPF extraído válido (`cpfValido`) igual ao de um participante (só dígitos) → esse; senão, sem CPF válido, nome normalizado (sem acento, caixa, espaços extras) igual → esse; senão, se havia CPF válido ou nome → `novo`; senão → dono atual se for participante, senão o primeiro participante.

### Task 2: rota `ocr-confirmar`
Body novo: `pessoa_alvo_id?: string`, `novo_participante?: { nome: string; cpf?: string }`, `lead_id?: string`. Ordem de resolução do alvo: `pessoa_alvo_id` → `novo_participante` → `titular === 'conjuge'` (antigo) → dono atual. Checagens: alvo visível via `clienteDoUsuario(token)` (`pessoas` `.is('deleted_at', null)`); `novo_participante` exige `lead_id` visível + `podeServidor(..., 'leads.editar')`; Pessoa reaproveitada/criada nunca de operador (`rpc('pessoa_e_de_operador')`). Documento muda de dono quando alvo ≠ dono atual. Resposta ganha `alvo_pessoa_id` e `alvo_nome`. Testes da rota com fakes (padrão de `src/app/api/participacoes/[id]/__tests__`).

### Task 3: modal
`DocumentoOcrRevisaoModal` recebe `participantes?: Array<{ pessoaId; nome; cpf }>` e `leadId?: string`; troca a caixinha por "De quem é este documento?" (`<select>` + campos Nome/CPF quando "Novo participante", pré-preenchidos do OCR); pré-seleção por `sugerirDonoDocumento`, recalculada quando o usuário corrige o CPF/nome extraído enquanto ele não escolheu à mão; aviso "pessoa divergente" atual continua quando a escolha contraria o documento. `AbaDocumentos` passa os participantes (`useParticipantes` do lead ou do negócio, papéis de compra; `pessoa` ganha `cpf`). Toast final: "Dados salvos no cadastro de <nome>".

### Task 4: entrega
CLAUDE.md (regra: OCR grava na Pessoa escolhida; dono do documento acompanha), suíte, tsc, PR, teste local, merge.
