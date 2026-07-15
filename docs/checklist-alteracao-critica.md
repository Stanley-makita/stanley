# Checklist — Antes de Iniciar Alteração Crítica

> "Regra dos Cinco Pontos Seguros" (`docs/protocolo-seguranca-recuperacao.md` Parte 12).
> Aplica-se a qualquer mudança nas áreas críticas (WhatsApp, conversas, documentos,
> criação de Pessoa, Captação, Negócios/Processos, autenticação, banco/migrations,
> motor de simulação, integrações externas, webhooks, jobs/crons, múltiplas instâncias).

Nenhuma alteração crítica começa sem:

- [ ] Código atual commitado — nada solto no working directory.
- [ ] Branch exclusiva criada para a alteração (`feature/*` ou `fix/*`).
- [ ] `npm run validate` (typecheck + testes) passando antes de começar.
- [ ] Backup realizado, se a alteração tocar dados existentes.
- [ ] Plano de rollback descrito por escrito (mesmo que 2 linhas) — ver
      `docs/procedimento-rollback.md`.
