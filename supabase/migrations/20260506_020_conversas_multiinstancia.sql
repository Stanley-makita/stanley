-- Adiciona instancia_id e atendente_id à tabela conversas
ALTER TABLE conversas
  ADD COLUMN IF NOT EXISTS instancia_id  UUID REFERENCES instancias(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS atendente_id  UUID REFERENCES usuarios(id)   ON DELETE SET NULL;

-- atendente_id = quem possui a conversa no momento (muda via transferência)
-- instancia_id = qual instância/número recebeu a conversa

CREATE INDEX IF NOT EXISTS idx_conversas_instancia   ON conversas(instancia_id) WHERE instancia_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conversas_atendente   ON conversas(atendente_id) WHERE atendente_id IS NOT NULL;

-- Atualiza RLS SELECT de conversas: admin/gerente veem tudo; outros só veem as suas
DROP POLICY IF EXISTS "empresa_conversas_select" ON conversas;

CREATE POLICY "empresa_conversas_select" ON conversas
  FOR SELECT USING (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1)
    AND (
      -- Admin ou Gerente: sem restrição adicional
      (SELECT perfil FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1) IN ('admin', 'gerente')
      OR
      -- Atendente: conversa atribuída diretamente a ele
      atendente_id = (SELECT id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1)
      OR
      -- Atendente: conversa na sua instância
      instancia_id IN (
        SELECT id FROM instancias
        WHERE atendente_id = (SELECT id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1)
      )
      OR
      -- Conversas sem instância/atendente (migradas antes do multi-instância): visíveis a todos
      (atendente_id IS NULL AND instancia_id IS NULL)
    )
  );

-- ─────────────────────────────────────────────
-- Tabela de notas internas por conversa
-- Visível apenas para a equipe, nunca enviada ao cliente
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notas_internas (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversa_id  UUID NOT NULL REFERENCES conversas(id) ON DELETE CASCADE,
  autor_id     UUID NOT NULL REFERENCES usuarios(id),
  conteudo     TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notas_conversa ON notas_internas(conversa_id, created_at);

ALTER TABLE notas_internas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notas_select" ON notas_internas
  FOR SELECT USING (
    conversa_id IN (
      SELECT id FROM conversas WHERE empresa_id = (
        SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1
      )
    )
  );

CREATE POLICY "notas_insert" ON notas_internas
  FOR INSERT WITH CHECK (
    autor_id = (SELECT id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1)
    AND conversa_id IN (
      SELECT id FROM conversas WHERE empresa_id = (
        SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1
      )
    )
  );

CREATE POLICY "service_notas_all" ON notas_internas
  FOR ALL USING (auth.role() = 'service_role');
