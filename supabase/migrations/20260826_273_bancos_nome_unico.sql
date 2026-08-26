-- Migration 273: impede banco duplicado por empresa
--
-- A limpeza feita em 2026-08-26_unificar_bancos_duplicados.sql consolidou
-- bancos que tinham 2-3 linhas cada pro mesmo banco real (ver comentário
-- naquele arquivo). Sem uma constraint, nada impede o mesmo problema de
-- voltar a acontecer (ex: cadastrar "Caixa" de novo, ou digitar errado
-- "Caicha" e cadastrar como banco novo em vez de corrigir o existente).
--
-- Índice único case-insensitive por empresa: mesmo nome (ignorando
-- maiúsculas/minúsculas) não pode se repetir dentro da mesma empresa.

CREATE UNIQUE INDEX bancos_empresa_nome_unico
  ON bancos (empresa_id, lower(nome));
