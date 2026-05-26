-- Campos específicos de consórcio na tabela processos
ALTER TABLE processos
  ADD COLUMN IF NOT EXISTS administradora      text,
  ADD COLUMN IF NOT EXISTS grupo_consorcio     text,
  ADD COLUMN IF NOT EXISTS cota_consorcio      text,
  ADD COLUMN IF NOT EXISTS valor_carta         numeric,
  ADD COLUMN IF NOT EXISTS parcela_consorcio   numeric,
  ADD COLUMN IF NOT EXISTS prazo_meses         int,
  ADD COLUMN IF NOT EXISTS credito_desejado    numeric,
  ADD COLUMN IF NOT EXISTS carta_sugerida      numeric,
  ADD COLUMN IF NOT EXISTS justificativa_carta text;

-- Tabela de simulações de consórcio
CREATE TABLE IF NOT EXISTS processo_simulacoes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  processo_id  uuid NOT NULL REFERENCES processos(id)  ON DELETE CASCADE,
  empresa_id   uuid NOT NULL REFERENCES empresas(id)   ON DELETE CASCADE,
  descricao    text NOT NULL,
  arquivo_path text,
  arquivo_nome text,
  arquivo_mime text,
  criado_em    timestamptz NOT NULL DEFAULT now(),
  usuario_id   uuid REFERENCES usuarios(id)
);

ALTER TABLE processo_simulacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "empresa_acesso" ON processo_simulacoes
  USING (empresa_id = (SELECT empresa_id FROM usuarios WHERE id = auth.uid()));
