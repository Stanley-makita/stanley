# Changelog

Formato livre, uma entrada por marco estável (não por commit) — ver
`docs/protocolo-seguranca-recuperacao.md` Parte 5 para a política de versionamento.

## v0.2.0 — 2026-07-15

Primeiro marco formal estável do Fonti após recuperação do fluxo WhatsApp e
consolidação da Sprint Confiança (Sprint Proteção Imediata do Fonti).

- **Protocolo de segurança e recuperação**: diagnóstico completo do estado do
  projeto (branches, backups, migrations, ambientes, feature flags) e política
  formal de branches, checklists de alteração crítica/publicação, procedimentos
  de rollback e de incidente — `docs/protocolo-seguranca-recuperacao.md` e
  demais docs em `docs/`.
- **Organização do repositório**: removido `_projeto/` (repositório Git interno
  obsoleto, parado num commit antigo); material de negócio real (contrato,
  logotipo, formulários de bancos parceiros, planilhas-fonte de calibração)
  reorganizado para `docs/materiais-negocio/`, `docs/formularios-bancos/` e
  `docs/calibracao-simuladores/fontes/`; `tsconfig.tsbuildinfo` (cache de build)
  retirado do versionamento.
- **Scripts de validação**: `npm run typecheck` e `npm run validate`
  (typecheck + suíte de testes) adicionados a `package.json`.
- **Calibração Itaú**: snapshots de teste desatualizados (13 casos) atualizados
  após verificação de que o drift era intencional (correção de double-count de
  MIP/DFI e TAC ausente, já aplicada ao motor de cálculo desde 2026-07-13).
- **Idempotência do webhook WhatsApp**: `fonti_events` generalizada (migration
  `20260715_163`) para cobrir todo o webhook, não só o bloco de comandos
  `*fonti` do operador — chave de dedup composta
  `(messageid, instancia_id, tipo_evento)`, evento novo só é reivindicado com
  instância inequivocamente resolvida, sem retry automático. Endereça
  diretamente o cenário do incidente de duas instâncias processando o mesmo
  evento (2026-07-14/15).
- **Política de branches**: `main` passa a representar produção; alterações de
  risco nascem em `feature/*`/`fix/*`, com exceções documentadas quando
  conscientemente necessárias.

**Testes**: 277/277 passando, typecheck limpo.
