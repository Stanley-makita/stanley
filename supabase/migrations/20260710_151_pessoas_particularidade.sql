-- ============================================================
-- Migration: 20260710_151_pessoas_particularidade.sql
-- Campo PARTICULARIDADE (pedido da Luciana) — observação de texto livre sobre
-- o cliente, exibida ao lado do nome tanto em Captação (Comercial > Cliente)
-- quanto em Negócios > Financiamento (cabeçalho do processo). Fica em
-- `pessoas` (não em `processos`) porque é uma característica da PESSOA, não
-- de um negócio específico — criada uma vez, aparece nos dois lugares.
--
-- Regra de edição (aplicada na camada de aplicação, não em RLS): só o usuário
-- que criou (`particularidade_criado_por`) ou um admin pode editar/apagar.
-- Leitura é liberada pra qualquer perfil com acesso à pessoa/processo (RLS de
-- linha em `pessoas` já cobre isso — ver 20260507_024_pessoas.sql).
-- ============================================================

ALTER TABLE pessoas
  ADD COLUMN IF NOT EXISTS particularidade TEXT,
  ADD COLUMN IF NOT EXISTS particularidade_criado_por UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS particularidade_atualizado_em TIMESTAMPTZ;
