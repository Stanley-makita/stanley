-- Quem vai fazer o registro do processo (Fontinhas / Cliente / Corretor).
-- A existência de assessoria não implica quem cuida do registro na prática
-- (ex: processo sem assessoria pode ainda assim ter o registro feito pela
-- Fontinhas) — campo explícito pedido pelo usuário porque essa informação
-- é usada para apurar pagamento por processo de quem cuida do registro.
alter table processos
  add column responsavel_registro text
  check (responsavel_registro in ('fontinhas', 'cliente', 'corretor'));
