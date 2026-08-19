-- ============================================================
-- Migration 260 — Financeiro de Consórcio (2/3): flag de "fase final" do
-- módulo Consórcio.
--
-- Fases do módulo Consórcio (Aguardando Atendimento, ..., Concluído) são
-- criadas livremente por empresa via Configurações → Fases, sem seed fixo
-- em migration — então não dá pra identificar "a fase de conclusão" comparando
-- nome (string). Em vez disso, a própria empresa marca qual fase é a final,
-- e o disparo do fluxo financeiro (migration 262) olha esse flag.
-- ============================================================

ALTER TABLE fases
  ADD COLUMN IF NOT EXISTS e_fase_final_consorcio BOOLEAN NOT NULL DEFAULT FALSE;

-- só 1 fase marcada como final do Consórcio por empresa
CREATE UNIQUE INDEX ux_fases_uma_final_consorcio_por_empresa
  ON fases(empresa_id) WHERE e_fase_final_consorcio = TRUE;
