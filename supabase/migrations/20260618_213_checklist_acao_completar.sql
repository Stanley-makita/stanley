-- Migration 213: Campo acao_ao_completar em checklist_items
-- null     = nenhuma ação especial
-- 'emitido' → seta status_emissao='emitido' + data_emissao=hoje ao marcar o item
-- 'assinado' → reservado para contratos (implementação futura)

ALTER TABLE checklist_items
  ADD COLUMN IF NOT EXISTS acao_ao_completar TEXT
    CHECK (acao_ao_completar IN ('emitido', 'assinado'));
