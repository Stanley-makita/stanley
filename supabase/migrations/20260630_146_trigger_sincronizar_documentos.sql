-- ============================================================
-- Migration: 20260630_146_trigger_sincronizar_documentos.sql
-- Sprint Inteligência Documental — Fase E (sincronização via trigger)
-- Substitui o dual-write feito em código de aplicação (fatias 1/2) por
-- um trigger único em documentos_clientes: sincroniza INSERT/UPDATE/DELETE
-- com `documentos`/`documento_vinculos` automaticamente, sem depender de
-- nenhum call site lembrar de chamar uma função.
--
-- Reaproveita exatamente a regra de resolução de pessoa_id das migrations
-- 144/145 (direto → via lead → via comprador principal do processo, sem
-- fuzzy match de CPF/nome). Se a linha deixar de ter pessoa_id resolvível
-- num UPDATE, a linha espelhada em `documentos` é removida (consistente
-- com "sem pessoa, não entra no modelo novo").
-- ============================================================

CREATE OR REPLACE FUNCTION fn_sincronizar_documento_unificado()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pessoa_id        UUID;
  v_catalogo_tipo_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM documentos WHERE id = OLD.id;
    RETURN OLD;
  END IF;

  v_pessoa_id := NEW.pessoa_id;

  IF v_pessoa_id IS NULL AND NEW.lead_id IS NOT NULL THEN
    SELECT pessoa_id INTO v_pessoa_id FROM leads WHERE id = NEW.lead_id;
  END IF;

  IF v_pessoa_id IS NULL AND NEW.processo_id IS NOT NULL THEN
    SELECT pessoa_id INTO v_pessoa_id
    FROM processo_compradores
    WHERE processo_id = NEW.processo_id AND pessoa_id IS NOT NULL
    ORDER BY principal DESC
    LIMIT 1;
  END IF;

  IF v_pessoa_id IS NULL THEN
    -- Sem pessoa resolvível: não entra (ou sai, se já estava) do modelo novo
    DELETE FROM documentos WHERE id = NEW.id;
    RETURN NEW;
  END IF;

  v_catalogo_tipo_id := NULL;
  IF NEW.classificacao IS NOT NULL THEN
    SELECT id INTO v_catalogo_tipo_id FROM catalogo_tipos_documento WHERE codigo = NEW.classificacao;
  END IF;

  INSERT INTO documentos (
    id, empresa_id, dominio, pessoa_id, processo_id, catalogo_tipo_id,
    classificacao_legado, nome_original, nome_exibicao, mime_type, tamanho_bytes,
    storage_bucket, storage_path, origem, status_ocr, permanente,
    validade_data, validade_dias, recebido_em, deleted_at
  ) VALUES (
    NEW.id, NEW.empresa_id, 'acervo_documental', v_pessoa_id, NULL, v_catalogo_tipo_id,
    NEW.classificacao, NEW.nome_original, NEW.nome_exibicao, NEW.mime_type, NEW.tamanho_bytes,
    NEW.storage_bucket, NEW.storage_path, NEW.canal_origem, NEW.ocr_status, NEW.permanente,
    NEW.validade_data, NEW.validade_dias, NEW.created_at, NEW.deleted_at
  )
  ON CONFLICT (id) DO UPDATE SET
    pessoa_id            = EXCLUDED.pessoa_id,
    catalogo_tipo_id     = EXCLUDED.catalogo_tipo_id,
    classificacao_legado = EXCLUDED.classificacao_legado,
    nome_original        = EXCLUDED.nome_original,
    nome_exibicao        = EXCLUDED.nome_exibicao,
    mime_type            = EXCLUDED.mime_type,
    tamanho_bytes        = EXCLUDED.tamanho_bytes,
    storage_bucket       = EXCLUDED.storage_bucket,
    storage_path         = EXCLUDED.storage_path,
    origem               = EXCLUDED.origem,
    status_ocr           = EXCLUDED.status_ocr,
    permanente           = EXCLUDED.permanente,
    validade_data        = EXCLUDED.validade_data,
    validade_dias        = EXCLUDED.validade_dias,
    deleted_at           = EXCLUDED.deleted_at;

  IF NEW.lead_id IS NOT NULL THEN
    INSERT INTO documento_vinculos (empresa_id, documento_id, entidade_tipo, entidade_id)
    VALUES (NEW.empresa_id, NEW.id, 'lead', NEW.lead_id)
    ON CONFLICT (documento_id, entidade_tipo, entidade_id) DO NOTHING;
  END IF;

  IF NEW.processo_id IS NOT NULL THEN
    INSERT INTO documento_vinculos (empresa_id, documento_id, entidade_tipo, entidade_id)
    VALUES (NEW.empresa_id, NEW.id, 'processo', NEW.processo_id)
    ON CONFLICT (documento_id, entidade_tipo, entidade_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sincronizar_documento_unificado ON documentos_clientes;
CREATE TRIGGER trg_sincronizar_documento_unificado
  AFTER INSERT OR UPDATE OR DELETE ON documentos_clientes
  FOR EACH ROW EXECUTE FUNCTION fn_sincronizar_documento_unificado();
