-- Migration 206: Ação "Processo Inconforme" (par mutuamente exclusivo com
-- "Processo Conforme") + timestamp de reprovação de conformidade.
--
-- Não cria coluna nova para exibir o status na UI — reaproveita o mesmo
-- padrão de badge já usado por "Emitido"/"Assinado". Só adiciona:
-- 1. Novo valor permitido em acao_ao_completar.
-- 2. processos.conformidade_reprovada_em, simétrico a conformidade_aprovada_em.

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
      'processo_inconforme'
    ));

ALTER TABLE processos
  ADD COLUMN IF NOT EXISTS conformidade_reprovada_em TIMESTAMPTZ;
