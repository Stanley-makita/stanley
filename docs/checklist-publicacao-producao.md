# Checklist — Antes de Publicar em Produção

> Base: `docs/protocolo-seguranca-recuperacao.md` Parte 13.

- [ ] `npm run validate` (typecheck + testes automatizados) passando.
- [ ] Testes manuais dos fluxos afetados feitos (em homologação, quando existir —
      até lá, com cautela redobrada em produção mesmo).
- [ ] Teste de regressão dos fluxos críticos vizinhos (ver lista de áreas críticas em
      `docs/checklist-alteracao-critica.md`).
- [ ] Backup imediatamente anterior à publicação, se a mudança tocar dados existentes.
- [ ] Plano de rollback confirmado e acessível (`docs/procedimento-rollback.md`).
- [ ] Ativação controlada (feature flag ligada gradualmente, se aplicável).
- [ ] Monitoramento ativo nos primeiros minutos/horas após a publicação
      (`npx vercel logs` — puxar logo após o teste, retenção é curta).
- [ ] Criação de tag/versão estável após confirmação de que o marco está sólido.
