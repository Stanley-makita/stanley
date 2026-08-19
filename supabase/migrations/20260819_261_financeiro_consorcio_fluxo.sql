-- ============================================================
-- Migration 261 — Financeiro de Consórcio (3/3): cronograma de parcelas
-- (a receber da empresa + a pagar do comercial).
--
-- Desacoplado de financeiro_fechamentos de propósito: o motor de fechamento
-- mensal (financeiro_contas_receber/financeiro_comissoes_pagar) só escreve
-- dentro de um fechamento já aberto para o mês corrente, mas o fluxo de
-- consórcio precisa gerar, de uma vez, parcelas com vencimento em até N
-- meses no futuro — meses que ainda não têm fechamento aberto. Integrar ao
-- fechamento mensal (somar o que vence no mês corrente) fica pra depois.
--
-- Por cota (processo_cota_id), não por processo: cancelar/substituir 1 cota
-- entre várias ativas do mesmo processo só é uma operação limpa
-- (UPDATE ... WHERE processo_cota_id = X AND status = 'prevista') se as
-- parcelas nascerem por cota — ver migration 262 (trigger de cancelamento).
-- ============================================================

DO $$ BEGIN
  CREATE TYPE fin_status_parcela_consorcio AS ENUM (
    'prevista', 'recebida', 'paga', 'cancelada', 'atrasada'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE financeiro_consorcio_receber (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id        UUID         NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  processo_id       UUID         NOT NULL REFERENCES processos(id) ON DELETE CASCADE,
  processo_cota_id  UUID         NOT NULL REFERENCES processo_cotas(id) ON DELETE CASCADE,

  numero_parcela    INTEGER      NOT NULL,
  total_parcelas    INTEGER      NOT NULL,
  valor_parcela     NUMERIC(15,2) NOT NULL,
  data_vencimento   DATE         NOT NULL,

  status            fin_status_parcela_consorcio NOT NULL DEFAULT 'prevista',
  data_recebimento  DATE,
  valor_recebido    NUMERIC(15,2),
  observacoes       TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (processo_cota_id, numero_parcela)
);

CREATE TABLE financeiro_consorcio_comercial_pagar (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id        UUID         NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  processo_id       UUID         NOT NULL REFERENCES processos(id) ON DELETE CASCADE,
  processo_cota_id  UUID         NOT NULL REFERENCES processo_cotas(id) ON DELETE CASCADE,
  usuario_id        UUID         REFERENCES usuarios(id) ON DELETE SET NULL,  -- comercial do processo no momento da geração (snapshot)

  numero_parcela    INTEGER      NOT NULL,
  total_parcelas    INTEGER      NOT NULL,
  valor_parcela     NUMERIC(15,2) NOT NULL,
  data_vencimento   DATE         NOT NULL,

  status            fin_status_parcela_consorcio NOT NULL DEFAULT 'prevista',
  data_pagamento    DATE,
  valor_pago        NUMERIC(15,2),
  observacoes       TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (processo_cota_id, numero_parcela)
);

CREATE INDEX idx_fin_consorcio_receber_processo   ON financeiro_consorcio_receber(processo_id);
CREATE INDEX idx_fin_consorcio_receber_cota       ON financeiro_consorcio_receber(processo_cota_id);
CREATE INDEX idx_fin_consorcio_receber_venc       ON financeiro_consorcio_receber(empresa_id, data_vencimento);

CREATE INDEX idx_fin_consorcio_comercial_processo ON financeiro_consorcio_comercial_pagar(processo_id);
CREATE INDEX idx_fin_consorcio_comercial_cota     ON financeiro_consorcio_comercial_pagar(processo_cota_id);
CREATE INDEX idx_fin_consorcio_comercial_venc     ON financeiro_consorcio_comercial_pagar(empresa_id, data_vencimento);

CREATE TRIGGER trg_fin_consorcio_receber_updated_at
  BEFORE UPDATE ON financeiro_consorcio_receber
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_fin_consorcio_comercial_pagar_updated_at
  BEFORE UPDATE ON financeiro_consorcio_comercial_pagar
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE financeiro_consorcio_receber ENABLE ROW LEVEL SECURITY;
ALTER TABLE financeiro_consorcio_comercial_pagar ENABLE ROW LEVEL SECURITY;

-- Mesma graduação de processo_cotas: select livre pra usuário ativo da
-- empresa; insert só via RPC SECURITY DEFINER (migration 262), então a
-- policy de insert existe só como rede de segurança pro mesmo perfil que
-- pode editar cota; update/delete restrito a analista/gerente/admin
-- (marcar parcela como paga/recebida, ou corrigir lançamento, não é
-- operação de qualquer usuário).
CREATE POLICY "fin_consorcio_receber_select" ON financeiro_consorcio_receber
  FOR SELECT USING (empresa_id IN (SELECT empresa_id FROM usuarios WHERE id = auth.uid() AND ativo = true));
CREATE POLICY "fin_consorcio_receber_insert" ON financeiro_consorcio_receber
  FOR INSERT WITH CHECK (empresa_id IN (SELECT empresa_id FROM usuarios u WHERE u.id = auth.uid() AND u.ativo = true AND u.perfil IN ('analista','gerente','admin')));
CREATE POLICY "fin_consorcio_receber_update" ON financeiro_consorcio_receber
  FOR UPDATE USING (empresa_id IN (SELECT empresa_id FROM usuarios u WHERE u.id = auth.uid() AND u.ativo = true AND u.perfil IN ('analista','gerente','admin')));
CREATE POLICY "fin_consorcio_receber_delete" ON financeiro_consorcio_receber
  FOR DELETE USING (empresa_id IN (SELECT empresa_id FROM usuarios u WHERE u.id = auth.uid() AND u.ativo = true AND u.perfil IN ('gerente','admin')));

CREATE POLICY "fin_consorcio_comercial_pagar_select" ON financeiro_consorcio_comercial_pagar
  FOR SELECT USING (empresa_id IN (SELECT empresa_id FROM usuarios WHERE id = auth.uid() AND ativo = true));
CREATE POLICY "fin_consorcio_comercial_pagar_insert" ON financeiro_consorcio_comercial_pagar
  FOR INSERT WITH CHECK (empresa_id IN (SELECT empresa_id FROM usuarios u WHERE u.id = auth.uid() AND u.ativo = true AND u.perfil IN ('analista','gerente','admin')));
CREATE POLICY "fin_consorcio_comercial_pagar_update" ON financeiro_consorcio_comercial_pagar
  FOR UPDATE USING (empresa_id IN (SELECT empresa_id FROM usuarios u WHERE u.id = auth.uid() AND u.ativo = true AND u.perfil IN ('analista','gerente','admin')));
CREATE POLICY "fin_consorcio_comercial_pagar_delete" ON financeiro_consorcio_comercial_pagar
  FOR DELETE USING (empresa_id IN (SELECT empresa_id FROM usuarios u WHERE u.id = auth.uid() AND u.ativo = true AND u.perfil IN ('gerente','admin')));
