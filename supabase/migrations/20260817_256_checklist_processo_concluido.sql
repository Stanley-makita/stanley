-- Nova ação de checklist: 'processo_concluido' — marcar o item correspondente
-- (ex.: "Processo Concluído", na fase Liberação de Recursos) trava o processo
-- (concluido_em preenchido) e passa a exibir o status "Processo Concluído" no
-- cabeçalho, mesmo padrão de acao_ao_completar já usado por
-- 'assinado'/'enviado_conformidade'/'processo_conforme' (migrations 205/206).

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
      'processo_conforme',
      'processo_inconforme',
      'processo_concluido'
    ));

ALTER TABLE processos
  ADD COLUMN IF NOT EXISTS concluido_em TIMESTAMPTZ;
