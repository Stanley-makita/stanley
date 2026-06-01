-- Migration: Checklists dinâmicos por fase
-- Tabelas: checklist_templates, checklist_items, checklist_execucoes

-- ═══ 1. checklist_templates ═════════════════════════════════════════════════
CREATE TABLE checklist_templates (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  UUID        NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  fase_id     UUID        NOT NULL REFERENCES fases(id)   ON DELETE CASCADE,
  nome        TEXT        NOT NULL,
  ativo       BOOLEAN     NOT NULL DEFAULT true,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (empresa_id, fase_id)
);

CREATE INDEX idx_checklist_templates_empresa_fase ON checklist_templates(empresa_id, fase_id);

ALTER TABLE checklist_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "checklist_templates_select" ON checklist_templates
  FOR SELECT USING (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE id = auth.uid())
  );

CREATE POLICY "checklist_templates_insert" ON checklist_templates
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND perfil IN ('admin', 'gerente'))
  );

CREATE POLICY "checklist_templates_update" ON checklist_templates
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND perfil IN ('admin', 'gerente'))
  );

CREATE POLICY "checklist_templates_delete" ON checklist_templates
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND perfil IN ('admin', 'gerente'))
  );

-- ═══ 2. checklist_items ═════════════════════════════════════════════════════
CREATE TABLE checklist_items (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id  UUID        NOT NULL REFERENCES checklist_templates(id) ON DELETE CASCADE,
  empresa_id   UUID        NOT NULL,
  descricao    TEXT        NOT NULL,
  obrigatorio  BOOLEAN     NOT NULL DEFAULT false,
  ordem        INTEGER     NOT NULL DEFAULT 0,
  ativo        BOOLEAN     NOT NULL DEFAULT true,
  criado_em    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_checklist_items_template ON checklist_items(template_id, ordem) WHERE ativo = true;

ALTER TABLE checklist_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "checklist_items_select" ON checklist_items
  FOR SELECT USING (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE id = auth.uid())
  );

CREATE POLICY "checklist_items_insert" ON checklist_items
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND perfil IN ('admin', 'gerente'))
  );

CREATE POLICY "checklist_items_update" ON checklist_items
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND perfil IN ('admin', 'gerente'))
  );

CREATE POLICY "checklist_items_delete" ON checklist_items
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM usuarios WHERE id = auth.uid() AND perfil IN ('admin', 'gerente'))
  );

-- ═══ 3. checklist_execucoes ═════════════════════════════════════════════════
CREATE TABLE checklist_execucoes (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  processo_id UUID        NOT NULL REFERENCES processos(id) ON DELETE CASCADE,
  item_id     UUID        NOT NULL REFERENCES checklist_items(id) ON DELETE CASCADE,
  empresa_id  UUID        NOT NULL,
  marcado     BOOLEAN     NOT NULL DEFAULT false,
  marcado_por UUID        REFERENCES usuarios(id),
  marcado_em  TIMESTAMPTZ,
  UNIQUE (processo_id, item_id)
);

CREATE INDEX idx_checklist_execucoes_processo ON checklist_execucoes(processo_id);

ALTER TABLE checklist_execucoes ENABLE ROW LEVEL SECURITY;

-- Qualquer colaborador da empresa pode ler e escrever execuções
CREATE POLICY "checklist_execucoes_select" ON checklist_execucoes
  FOR SELECT USING (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE id = auth.uid())
  );

CREATE POLICY "checklist_execucoes_insert" ON checklist_execucoes
  FOR INSERT WITH CHECK (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE id = auth.uid())
  );

CREATE POLICY "checklist_execucoes_update" ON checklist_execucoes
  FOR UPDATE USING (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE id = auth.uid())
  );

CREATE POLICY "checklist_execucoes_delete" ON checklist_execucoes
  FOR DELETE USING (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE id = auth.uid())
  );
