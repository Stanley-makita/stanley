-- 352 — Data de emissão informada + aviso de negócio parado na fase (pedido da equipe, 11/11/2026)
--
-- 1) fases.alerta_parado_dias: "avisar se o negócio estiver parado há mais de X dias nesta fase".
--    Campo NOVO de propósito — fases.prazo_dias ("SLA") já está preenchido em 35 fases com valores
--    soltos e nunca foi usado; reaproveitá-lo dispararia aviso em quase todas as fases.
--    Começa só na "Coleta de Documentos" (5 dias); a chefia ajusta em Configurações > Fases.
-- 2) processo_avisos_parado: último aviso enviado por negócio (cron /api/processos/alerta-parados),
--    para avisar 1x ao passar do prazo e lembrar a cada 5 dias na mesma fase.
-- 3) Corrigir a data de emissão depois (card "Contrato Emitido") acompanha a comissão gerada na
--    emissão (comissoes.data_emissao/competência), só enquanto ela ainda está "a receber".

-- 1 ─────────────────────────────────────────────────────────────────────────
ALTER TABLE fases
  ADD COLUMN IF NOT EXISTS alerta_parado_dias INTEGER
  CHECK (alerta_parado_dias IS NULL OR alerta_parado_dias > 0);

COMMENT ON COLUMN fases.alerta_parado_dias IS
  'Avisa o operacional (ou o comercial, sem operacional) quando o negócio passa mais de X dias nesta fase; lembra a cada 5 dias. NULL = não avisa.';

UPDATE fases
   SET alerta_parado_dias = 5
 WHERE modulo = 'processos'
   AND ativo = true
   AND lower(trim(nome)) = 'coleta de documentos'
   AND alerta_parado_dias IS NULL;

-- 2 ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS processo_avisos_parado (
  processo_id  UUID        PRIMARY KEY REFERENCES processos(id) ON DELETE CASCADE,
  empresa_id   UUID        NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  fase_id      UUID        NOT NULL REFERENCES fases(id) ON DELETE CASCADE,
  avisado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Só o cron (service role) lê/grava; sem policy para authenticated.
ALTER TABLE processo_avisos_parado ENABLE ROW LEVEL SECURITY;

-- 3 ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION sincronizar_data_emissao_comissao()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE comissoes
     SET data_emissao    = NEW.data_emissao,
         competencia_mes = EXTRACT(MONTH FROM NEW.data_emissao)::INTEGER,
         competencia_ano = EXTRACT(YEAR  FROM NEW.data_emissao)::INTEGER
   WHERE processo_id = NEW.id
     AND status = 'a_receber';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sincronizar_data_emissao_comissao ON processos;
CREATE TRIGGER trg_sincronizar_data_emissao_comissao
  AFTER UPDATE OF data_emissao ON processos
  FOR EACH ROW
  WHEN (
    NEW.status_emissao = 'emitido'
    AND OLD.status_emissao = 'emitido'
    AND NEW.data_emissao IS NOT NULL
    AND NEW.data_emissao IS DISTINCT FROM OLD.data_emissao
  )
  EXECUTE FUNCTION sincronizar_data_emissao_comissao();
