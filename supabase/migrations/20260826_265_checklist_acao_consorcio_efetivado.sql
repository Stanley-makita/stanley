-- Nova ação de checklist: 'consorcio_efetivado' — marcar o item correspondente
-- (ex.: "Boleto pago", numa fase de Consórcio) dispara
-- gerar_fluxo_financeiro_consorcio (mesma função já chamada quando o processo
-- avança pra uma fase com fases.e_fase_final_consorcio = true — os dois
-- gatilhos coexistem, a função é idempotente por cota/parcela via
-- ON CONFLICT DO NOTHING). Ação dedicada, não reaproveita 'emitido' (que só
-- seta status_emissao/data_emissao, sem relação com financeiro).

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
      'processo_concluido',
      'consorcio_efetivado'
    ));
