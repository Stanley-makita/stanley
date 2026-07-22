-- Sprint Segurança Documental — Branch 0B (fix/clicksign-webhook-autenticado).
--
-- Tabela dedicada de idempotência para o fechamento de contratos via
-- ClickSign, usada tanto pelo webhook (evento real da ClickSign) quanto
-- pelo polling manual (`/api/clicksign/atualizar-status`).
--
-- Não reutiliza `fonti_events` (domínio WhatsApp: messageid/instancia_id não
-- têm correspondência natural aqui, e a migration 20260715_163 já proíbe
-- explicitamente reaproveitar o sentinel de idempotência para eventos novos
-- de outro domínio).
--
-- A chave de deduplicação é `processo_contrato_id` sozinho (UNIQUE), não uma
-- combinação de campos do payload da ClickSign: a documentação oficial da
-- ClickSign (v3) não expõe um identificador único de evento em `close`/
-- `document_closed` (só `event.name` e, às vezes, `event.data.occurred_at`).
-- O invariante de negócio real e estável é "este contrato só fecha uma vez"
-- — por isso a reivindicação é por contrato, não por evento.
--
-- Rollback: DROP TABLE clicksign_fechamentos; (aditiva, sem dependentes
-- fora do código desta branch — reverter o código antes de rodar o DROP).

CREATE TABLE clicksign_fechamentos (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  processo_contrato_id UUID        NOT NULL REFERENCES processo_contratos(id) ON DELETE CASCADE,
  evento               TEXT        NOT NULL,
  origem               TEXT        NOT NULL CHECK (origem IN ('webhook', 'polling')),
  status               TEXT        NOT NULL DEFAULT 'processando'
                                   CHECK (status IN ('processando', 'processado', 'falhou')),
  detalhe_falha        TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT clicksign_fechamentos_contrato_key UNIQUE (processo_contrato_id)
);

CREATE INDEX idx_clicksign_fechamentos_status ON clicksign_fechamentos (status);

ALTER TABLE clicksign_fechamentos ENABLE ROW LEVEL SECURITY;

-- Só service_role acessa esta tabela — é usada exclusivamente pelo webhook e
-- pelo polling, ambos via supabaseAdmin. Nenhuma tela lê/escreve aqui.
CREATE POLICY "clicksign_fechamentos_service" ON clicksign_fechamentos
  FOR ALL TO service_role USING (true);

COMMENT ON TABLE clicksign_fechamentos IS
  'Trava de fechamento de contratos ClickSign — 1 linha por processo_contrato_id (UNIQUE), NÃO um histórico de eventos recebidos (um segundo evento para o mesmo contrato não gera nova linha, colide com a UNIQUE e é tratado como já-em-andamento). Reivindicação atômica consumida por processarFechamentoContratoClicksign() (src/lib/clicksign/processarFechamento.ts) — protege só a transição running->closed; a busca da URL assinada não depende desta tabela. Não é log de auditoria de UI.';
