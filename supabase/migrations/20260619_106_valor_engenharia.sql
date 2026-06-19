-- Valor da avaliação de engenharia no processo
ALTER TABLE processos
  ADD COLUMN IF NOT EXISTS valor_engenharia NUMERIC(14,2);

-- Histórico de avaliações por imóvel
-- Permite registrar múltiplas avaliações ao longo do tempo para o mesmo imóvel,
-- vinculadas ao processo que originou cada avaliação.
CREATE TABLE IF NOT EXISTS imovel_avaliacoes (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id          UUID          NOT NULL REFERENCES empresas(id),
  imovel_id           UUID          NOT NULL REFERENCES imoveis(id) ON DELETE CASCADE,
  processo_id         UUID          REFERENCES processos(id) ON DELETE SET NULL,
  valor_avaliado      NUMERIC(14,2) NOT NULL,
  validade_engenharia DATE,
  criado_em           TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

ALTER TABLE imovel_avaliacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "empresa ve proprias avaliacoes"
  ON imovel_avaliacoes
  FOR ALL
  USING (
    empresa_id IN (SELECT empresa_id FROM usuarios WHERE id = auth.uid())
  );
