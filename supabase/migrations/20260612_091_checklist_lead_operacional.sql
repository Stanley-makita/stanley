-- ============================================================
-- Migration 091: Checklist operacional para Leads
-- Estende checklist_items/execucoes (migration 063) para suportar
-- leads, tipos de ação e log operacional unificado.
-- ============================================================

-- ═══ 1. Estender checklist_items com tipo e metadados ═══════
ALTER TABLE checklist_items
  ADD COLUMN IF NOT EXISTS tipo          TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS link_externo  TEXT,
  ADD COLUMN IF NOT EXISTS bloqueia_avanco BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE checklist_items
  ADD CONSTRAINT chk_checklist_item_tipo CHECK (
    tipo IN ('manual', 'restritivos', 'documento', 'formulario', 'link_externo')
  );

-- ═══ 2. Estender checklist_execucoes para lead_id e log ═════

-- 2a. processo_id passa a ser opcional (checklist serve para leads E processos)
ALTER TABLE checklist_execucoes
  ALTER COLUMN processo_id DROP NOT NULL;

-- 2b. Novos campos do log operacional unificado
ALTER TABLE checklist_execucoes
  ADD COLUMN IF NOT EXISTS lead_id     UUID REFERENCES leads(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS resultado   TEXT,
  ADD COLUMN IF NOT EXISTS observacao  TEXT,
  ADD COLUMN IF NOT EXISTS anexo_id    UUID REFERENCES documentos_clientes(id) ON DELETE SET NULL;

-- 2c. CHECK: obrigatório ter processo_id OU lead_id
ALTER TABLE checklist_execucoes
  ADD CONSTRAINT chk_execucao_entidade CHECK (
    (processo_id IS NOT NULL) OR (lead_id IS NOT NULL)
  );

-- 2d. Índice e UNIQUE para o par (lead, item)
CREATE INDEX IF NOT EXISTS idx_checklist_execucoes_lead ON checklist_execucoes(lead_id) WHERE lead_id IS NOT NULL;

-- UNIQUE parcial para lead (a UNIQUE existente cobre processo_id)
CREATE UNIQUE INDEX IF NOT EXISTS uidx_checklist_execucoes_lead_item
  ON checklist_execucoes(lead_id, item_id)
  WHERE lead_id IS NOT NULL;

-- ═══ 3. Novo tipo no enum lead_historico_tipo ════════════════
ALTER TYPE lead_historico_tipo ADD VALUE IF NOT EXISTS 'acao_operacional';

-- ═══ 4. RLS: lead_id segue mesma regra de empresa ════════════
-- As policies existentes de checklist_execucoes usam empresa_id — manter.
-- Adicionar policy de leitura por lead para garantir isolamento:

-- (policies existentes já cobrem por empresa_id, sem necessidade de novas)

-- ═══ 5. Comentário no template_id: passa a ser nullable no futuro
-- Por ora, checklist_templates ainda é por fase — sem mudança estrutural.
-- Items adicionados via Settings → Fases continuam ligados a template.
