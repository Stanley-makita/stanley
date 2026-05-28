-- Migration 056: Tabela de Imóveis (cadastro master)
CREATE TABLE imoveis (
  id                   UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id           UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  origem               TEXT DEFAULT 'individual' CHECK (origem IN ('empreendimento', 'individual')),
  categoria            TEXT DEFAULT 'residencial' CHECK (categoria IN ('residencial', 'comercial', 'industrial', 'rural')),
  tipo                 TEXT CHECK (tipo IN ('apartamento', 'casa', 'sobrado', 'terreno', 'barracao')),
  condicao             TEXT CHECK (condicao IN ('novo', 'usado')),
  matricula            TEXT,
  cadastro_imobiliario TEXT,
  registro_imoveis_id  UUID REFERENCES registros_imoveis(id),
  area_construida      NUMERIC,
  area_terreno         NUMERIC,
  zona                 TEXT,
  rua                  TEXT,
  numero               TEXT,
  quadra               TEXT,
  lote                 TEXT,
  bloco                TEXT,
  apto_unidade         TEXT,
  bairro               TEXT,
  cidade               TEXT,
  uf                   CHAR(2),
  garagem              BOOLEAN DEFAULT false,
  observacoes          TEXT,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW(),
  deleted_at           TIMESTAMPTZ
);

CREATE INDEX idx_imoveis_empresa ON imoveis(empresa_id);
CREATE INDEX idx_imoveis_search ON imoveis
  USING GIN (to_tsvector('portuguese',
    coalesce(matricula, '') || ' ' || coalesce(rua, '') || ' ' ||
    coalesce(bairro, '') || ' ' || coalesce(cidade, '')));

ALTER TABLE imoveis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "empresa_acesso" ON imoveis
  USING (empresa_id = (SELECT empresa_id FROM usuarios WHERE id = auth.uid()));

CREATE POLICY "empresa_inserir" ON imoveis FOR INSERT
  WITH CHECK (empresa_id = (SELECT empresa_id FROM usuarios WHERE id = auth.uid()));

CREATE POLICY "empresa_atualizar" ON imoveis FOR UPDATE
  USING (empresa_id = (SELECT empresa_id FROM usuarios WHERE id = auth.uid()));
