-- Migration 205: Ações de conformidade + item de checklist condicionado por banco
--
-- 1. Duas novas ações em checklist_items.acao_ao_completar, mesmo padrão de
--    'emitido'/'assinado' (marca timestamp em processos, sem modal):
--    'enviado_conformidade'  → processos.enviado_conformidade_em = agora
--    'processo_conforme'     → processos.conformidade_aprovada_em = agora
--
-- 2. condicao_banco_id: quando preenchido, o item só aparece no Checklist da
--    Fase (PainelChecklist) se o processo tiver esse banco selecionado.
--    Null = sempre aparece (comportamento de hoje, sem quebrar nada existente).

ALTER TABLE checklist_items
  DROP CONSTRAINT IF EXISTS checklist_items_acao_ao_completar_check;

ALTER TABLE checklist_items
  ADD CONSTRAINT checklist_items_acao_ao_completar_check
    CHECK (acao_ao_completar IN (
      'emitido',
      'assinado',
      'salvar_vencimento_credito',
      'salvar_vencimento_matricula',
      'salvar_engenharia',
      'enviado_conformidade',
      'processo_conforme'
    ));

ALTER TABLE checklist_items
  ADD COLUMN IF NOT EXISTS condicao_banco_id UUID REFERENCES bancos(id) ON DELETE SET NULL;

ALTER TABLE processos
  ADD COLUMN IF NOT EXISTS enviado_conformidade_em   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS conformidade_aprovada_em  TIMESTAMPTZ;
