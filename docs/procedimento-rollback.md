# Procedimento de Rollback

> Curto, direto, pra seguir sob pressão. Base: `docs/protocolo-seguranca-recuperacao.md` Parte 10.

## 1. Rollback de código

```
git log --oneline -10                  # achar o commit ruim e o último bom
git revert <sha-do-commit-ruim>        # reverte só aquele commit, mantém histórico
git push
```

Se for mais de um commit ou o revert conflitar: redeploy manual na Vercel apontando
para a última tag/SHA estável conhecida (ver `CHANGELOG.md` para a tag vigente).

## 2. Rollback de banco (migration)

1. Parar de escrever no banco se possível (ex.: desativar a instância WhatsApp envolvida).
2. Restaurar o backup mais recente anterior à migration problemática (ver plano de
   backup do protocolo — se ainda não há backup testado, isso vai ser lento e manual).
3. Se a migration tiver passo de reversão documentado no próprio arquivo (comentário
   `-- para reverter:`), rodar esse passo antes de tentar restaurar backup inteiro.

## 3. Rollback de feature específica

Se a funcionalidade estiver atrás de feature flag: desligar a flag primeiro — é mais
rápido que qualquer deploy e não precisa reverter código. Só depois decidir se o código
também precisa ser revertido.

## Critério de decisão rápida

- **Sintoma só de UI/comportamento, sem escrita de dado errado**: revert de código, deploy.
- **Dado real já foi escrito errado**: avaliar se dá para corrigir com um script de
  reparo direcionado (mais rápido) antes de considerar restaurar backup inteiro (mais lento).
- **Cliente real em risco agora (ex.: mensagem errada indo pro WhatsApp)**: desligar a
  fonte primeiro (instância/flag), investigar depois.
