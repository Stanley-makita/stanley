# Procedimento para Incidentes

> Base: `docs/protocolo-seguranca-recuperacao.md` Parte 11. Seguir nesta ordem.

1. **Registrar o início** — sintoma observado + horário, mesmo que só numa nota rápida.
   Sem isso, é impossível depois calcular quanto tempo levou ou reconstruir a sequência.

2. **Dá pra isolar via feature flag?** Se a funcionalidade suspeita tem flag, desligar
   antes de tocar em código ou banco — resposta mais rápida que qualquer outra ação.

3. **Dado de cliente em risco agora?** Se sim, parar a fonte primeiro (ex.: desativar a
   instância WhatsApp envolvida, pausar o cron) — só depois investigar a causa. Não
   investigar com o vazamento/erro ainda ativo.

4. **Causa raiz identificável e recente?** Se for uma alteração de código recente e
   clara: rollback de código (`docs/procedimento-rollback.md` §1).

5. **Dado já corrompido?** Restaurar backup só se não houver como corrigir com um script
   de reparo direcionado — restaurar é a opção mais lenta, usar por último
   (`docs/procedimento-rollback.md` §2).

6. **Depois de resolvido**: registrar o que aconteceu, causa raiz, e o que deveria ter
   impedido — se aplicável, criar/ajustar uma feature flag ou checklist pra próxima vez.
