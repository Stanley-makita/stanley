-- Migration 055: Tabela de Registros de Imóveis (configuração auxiliar)
CREATE TABLE registros_imoveis (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id  UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nome        TEXT NOT NULL,
  cidade      TEXT,
  uf          CHAR(2),
  telefone    TEXT,
  observacao  TEXT,
  ativo       BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ
);

CREATE INDEX idx_registros_imoveis_empresa ON registros_imoveis(empresa_id);

ALTER TABLE registros_imoveis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "empresa_acesso" ON registros_imoveis
  USING (empresa_id = (SELECT empresa_id FROM usuarios WHERE id = auth.uid()));

CREATE POLICY "empresa_inserir" ON registros_imoveis FOR INSERT
  WITH CHECK (empresa_id = (SELECT empresa_id FROM usuarios WHERE id = auth.uid()));

CREATE POLICY "empresa_atualizar" ON registros_imoveis FOR UPDATE
  USING (empresa_id = (SELECT empresa_id FROM usuarios WHERE id = auth.uid()));
