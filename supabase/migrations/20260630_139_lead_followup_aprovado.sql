-- ============================================================
-- Migration 139: Follow-up automático para Leads aprovados sem Processo
-- ============================================================

-- Tabela principal de follow-ups
CREATE TABLE lead_followups (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id            UUID        NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  lead_id               UUID        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  responsavel_id        UUID        REFERENCES usuarios(id) ON DELETE SET NULL,
  status                TEXT        NOT NULL DEFAULT 'ativo'
                          CHECK (status IN ('ativo', 'encerrado')),
  motivo_encerramento   TEXT
                          CHECK (motivo_encerramento IN (
                            'processo_criado',
                            'cliente_desistiu',
                            'lead_cancelado',
                            'lead_arquivado'
                          )),
  -- Agendamento
  proxima_notificacao   TIMESTAMPTZ NOT NULL DEFAULT now(),
  dias_sem_processo     INTEGER     NOT NULL DEFAULT 0,
  -- Controle
  ultima_resposta       TEXT        CHECK (ultima_resposta IN ('sim', 'ainda_nao', 'desistiu')),
  ultimo_comentario     TEXT,
  -- Escalonamento
  notificou_gestor      BOOLEAN     NOT NULL DEFAULT false,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  encerrado_em          TIMESTAMPTZ,
  UNIQUE (lead_id)  -- um follow-up por lead
);

-- Histórico de notificações e respostas do follow-up
CREATE TABLE lead_followup_eventos (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  followup_id     UUID        NOT NULL REFERENCES lead_followups(id) ON DELETE CASCADE,
  lead_id         UUID        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  empresa_id      UUID        NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  tipo            TEXT        NOT NULL
                    CHECK (tipo IN ('notificacao_enviada', 'resposta_sim', 'resposta_ainda_nao', 'resposta_desistiu', 'escalonamento_gestor')),
  comentario      TEXT,
  usuario_id      UUID        REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE lead_followups ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_followup_eventos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "empresa_le_followups"
  ON lead_followups FOR SELECT
  USING (empresa_id = (SELECT empresa_id FROM usuarios WHERE id = auth.uid()));

CREATE POLICY "empresa_le_followup_eventos"
  ON lead_followup_eventos FOR SELECT
  USING (empresa_id = (SELECT empresa_id FROM usuarios WHERE id = auth.uid()));

-- Service role tem acesso total (para a API route do cron)
CREATE POLICY "service_gerencia_followups"
  ON lead_followups FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "service_gerencia_followup_eventos"
  ON lead_followup_eventos FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Índices
CREATE INDEX idx_lead_followups_empresa_status ON lead_followups (empresa_id, status);
CREATE INDEX idx_lead_followups_proxima_notif  ON lead_followups (proxima_notificacao) WHERE status = 'ativo';
CREATE INDEX idx_lead_followup_eventos_lead    ON lead_followup_eventos (lead_id, created_at DESC);

-- Estender tipos do lead_historico para incluir eventos de follow-up
-- (a tabela lead_historico usa TEXT para tipo, não enum — ok para inserir novos valores)

-- Trigger: atualizar updated_at
CREATE OR REPLACE FUNCTION fn_followup_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_followup_updated_at
  BEFORE UPDATE ON lead_followups
  FOR EACH ROW EXECUTE FUNCTION fn_followup_updated_at();
