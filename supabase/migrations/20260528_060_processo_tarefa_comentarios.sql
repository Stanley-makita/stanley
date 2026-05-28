-- Migration 060: tabela de comentários para processo_tarefas

CREATE TABLE IF NOT EXISTS processo_tarefa_comentarios (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tarefa_id  UUID        NOT NULL REFERENCES processo_tarefas(id) ON DELETE CASCADE,
  empresa_id UUID        NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  usuario_id UUID        NOT NULL REFERENCES usuarios(id),
  texto      TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE processo_tarefa_comentarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ptc_select" ON processo_tarefa_comentarios
  FOR SELECT USING (
    empresa_id IN (
      SELECT empresa_id FROM usuarios WHERE id = auth.uid() AND ativo = true
    )
  );

CREATE POLICY "ptc_insert" ON processo_tarefa_comentarios
  FOR INSERT WITH CHECK (
    usuario_id = auth.uid()
    AND empresa_id IN (
      SELECT empresa_id FROM usuarios WHERE id = auth.uid() AND ativo = true
    )
  );

CREATE INDEX idx_ptc_tarefa ON processo_tarefa_comentarios(tarefa_id);
