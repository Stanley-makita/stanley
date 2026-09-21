-- Habilita real-time nas tabelas de fluxo financeiro do Consórcio
-- Necessário para a Prévia Financeira/DRE, A Receber e Comercial a Pagar
-- atualizarem sozinhas quando outra sessão gera/recebe/paga parcelas.
-- Idempotente: ADD TABLE falha se a tabela já estiver na publicação.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'financeiro_consorcio_receber'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE financeiro_consorcio_receber;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'financeiro_consorcio_comercial_pagar'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE financeiro_consorcio_comercial_pagar;
  END IF;
END $$;
