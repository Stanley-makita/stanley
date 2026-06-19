-- Estende comissoes_padrao para suportar regras por modalidade com piso e teto por operação
-- '' (string vazia) em modalidade = vale para todas as modalidades do banco

ALTER TABLE comissoes_padrao
  ADD COLUMN IF NOT EXISTS modalidade  TEXT          NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS teto_valor  NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS piso_valor  NUMERIC(14,2) NOT NULL DEFAULT 0;

-- Troca unique constraint de (empresa_id, banco_id) para (empresa_id, banco_id, modalidade)
ALTER TABLE comissoes_padrao
  DROP CONSTRAINT IF EXISTS comissoes_padrao_empresa_id_banco_id_key;

ALTER TABLE comissoes_padrao
  ADD CONSTRAINT comissoes_padrao_empresa_banco_modalidade_key
  UNIQUE (empresa_id, banco_id, modalidade);
