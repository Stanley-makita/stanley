-- ============================================================
-- Migration 276: Múltiplos vendedores no Lead
-- Hoje leads.vendedor_pessoa_id só permite 1 vendedor vinculado.
-- Espelha lead_coparticipantes (migration 210): tabela de vínculo
-- N:N entre lead e pessoas, permitindo vincular/desvincular quantos
-- vendedores forem necessários (ex: casal vendendo o imóvel juntos).
-- Backfill: quem já tinha vendedor_pessoa_id vinculado ganha a
-- linha correspondente aqui, pra não sumir da lista na aba Crédito.
-- ============================================================

CREATE TABLE IF NOT EXISTS lead_vendedores (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  UUID        NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  lead_id     UUID        NOT NULL REFERENCES leads(id)    ON DELETE CASCADE,
  pessoa_id   UUID        NOT NULL REFERENCES pessoas(id)  ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (lead_id, pessoa_id)
);

CREATE INDEX IF NOT EXISTS idx_lead_vendedores_lead   ON lead_vendedores(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_vendedores_pessoa ON lead_vendedores(pessoa_id);

ALTER TABLE lead_vendedores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lead_vendedores_select" ON lead_vendedores
  FOR SELECT USING (empresa_id IN (SELECT empresa_id FROM usuarios WHERE id = auth.uid() AND ativo = true));
CREATE POLICY "lead_vendedores_insert" ON lead_vendedores
  FOR INSERT WITH CHECK (empresa_id IN (SELECT empresa_id FROM usuarios WHERE id = auth.uid() AND ativo = true));
CREATE POLICY "lead_vendedores_delete" ON lead_vendedores
  FOR DELETE USING (empresa_id IN (SELECT empresa_id FROM usuarios WHERE id = auth.uid() AND ativo = true));

INSERT INTO lead_vendedores (empresa_id, lead_id, pessoa_id)
SELECT l.empresa_id, l.id, l.vendedor_pessoa_id
FROM leads l
WHERE l.vendedor_pessoa_id IS NOT NULL
ON CONFLICT (lead_id, pessoa_id) DO NOTHING;
