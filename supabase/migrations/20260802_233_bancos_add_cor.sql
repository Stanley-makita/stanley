-- Migration 233: Adiciona coluna `cor` na tabela `bancos`.
-- A coluna já era referenciada pelo tipo TypeScript (types/supabase.ts) e pela
-- UI (bolinha colorida em Comissões Banco / AbaComissoesPadrao.tsx), mas nunca
-- foi criada de fato — causava erro 400 do PostgREST ("column bancos_1.cor
-- does not exist") toda vez que a tela Configurações > Comissões Banco tentava
-- carregar (select embutido `banco:bancos(nome, cor)`).

ALTER TABLE bancos
  ADD COLUMN IF NOT EXISTS cor TEXT;
