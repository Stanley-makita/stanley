-- Migration 107: Expande CHECK constraint de acao_ao_completar para suportar
-- ações de validade de crédito, matrícula e engenharia (com valor avaliado)

ALTER TABLE checklist_items
  DROP CONSTRAINT IF EXISTS checklist_items_acao_ao_completar_check;

ALTER TABLE checklist_items
  ADD CONSTRAINT checklist_items_acao_ao_completar_check
    CHECK (acao_ao_completar IN (
      'emitido',
      'assinado',
      'salvar_vencimento_credito',
      'salvar_vencimento_matricula',
      'salvar_engenharia'
    ));
