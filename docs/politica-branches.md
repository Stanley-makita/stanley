# Política de Branches e Publicação

> Base: `docs/protocolo-seguranca-recuperacao.md` Parte 4. Existe para reduzir risco
> operacional — não é burocracia por si só, e pode ser flexibilizada conscientemente
> quando a situação justificar (ver "Exceções" no final).

## Regras

- **`main` representa produção.** Nenhum commit direto — nem do próprio autor — fora das
  exceções documentadas abaixo.
- **Toda alteração de risco nasce em `feature/<escopo-curto>` ou `fix/<escopo-curto>`.**
  "Risco" aqui inclui qualquer área crítica listada em
  `docs/checklist-alteracao-critica.md`.
- **Migration em commit separado da lógica de aplicação** que a usa — permite reverter
  ou auditar cada um independentemente.
- **Merge para `main` só depois do checklist de publicação**
  (`docs/checklist-publicacao-producao.md`).
- **Commits pequenos e semanticamente isolados** — um commit, uma mudança de
  comportamento compreensível sozinha. Não misturar investigação/debug com correção
  definitiva no mesmo commit.

## Exceções

A política existe para reduzir risco, não para travar trabalho quando o risco real é
baixo ou a situação é excepcional (ex.: hotfix urgente com produção já quebrada, onde o
tempo de abrir branch/PR é o próprio risco). Nesses casos:

- A exceção é permitida, mas **a decisão de pular a política precisa ser documentada** —
  no mínimo, uma linha no corpo do commit explicando por que foi direto em `main` (ou
  por que algum passo do checklist foi pulado) e qual o plano de regularização depois
  (ex.: escrever o teste que faltou, criar a tag retroativa).
- Hotfix direto em produção é sempre uma exceção, nunca a regra — se está acontecendo
  com frequência, é sinal de que a política ou o ambiente (falta de homologação) precisa
  mudar, não de que a exceção virou norma.
