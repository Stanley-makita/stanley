-- ============================================================
-- Migration: 20260415_008_notificacoes.sql
-- ============================================================

CREATE TYPE tipo_notificacao AS ENUM (
  'tarefa_vencida',
  'tarefa_atribuida',
  'fase_avancada',
  'lead_atribuido',
  'processo_emitido',
  'cobranca_vencida',
  'comentario_mencionado'
);

CREATE TABLE notificacoes (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  UUID        NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  usuario_id  UUID        NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo        tipo_notificacao NOT NULL,
  titulo      TEXT        NOT NULL,
  mensagem    TEXT,
  lida        BOOLEAN     NOT NULL DEFAULT false,
  lida_em     TIMESTAMPTZ,
  entidade    TEXT        CHECK (entidade IN ('processo', 'lead', 'tarefa')),
  entidade_id UUID,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE notificacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "usuario_le_proprias_notificacoes"
  ON notificacoes FOR SELECT
  USING (usuario_id = auth.uid());

-- FIX (Renata): REVOKE INSERT direto — triggers SECURITY DEFINER fazem insert como postgres, bypassam RLS
REVOKE INSERT ON notificacoes FROM authenticated;

CREATE POLICY "usuario_marca_lida"
  ON notificacoes FOR UPDATE
  USING (usuario_id = auth.uid())
  WITH CHECK (usuario_id = auth.uid());

CREATE INDEX idx_notificacoes_usuario_criado ON notificacoes (usuario_id, criado_em DESC);
CREATE INDEX idx_notificacoes_usuario_nao_lida ON notificacoes (usuario_id, lida) WHERE lida = false;

ALTER PUBLICATION supabase_realtime ADD TABLE notificacoes;

CREATE OR REPLACE FUNCTION fn_notificar_tarefa_atribuida()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_empresa_id UUID;
  v_titulo_tarefa TEXT;
BEGIN
  IF NEW.responsavel_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.responsavel_id IS NOT DISTINCT FROM NEW.responsavel_id THEN
    RETURN NEW;
  END IF;

  SELECT empresa_id INTO v_empresa_id
  FROM processos WHERE id = NEW.processo_id;

  v_titulo_tarefa := COALESCE(NEW.titulo, 'Nova tarefa');

  INSERT INTO notificacoes (empresa_id, usuario_id, tipo, titulo, mensagem, entidade, entidade_id)
  VALUES (
    v_empresa_id,
    NEW.responsavel_id,
    'tarefa_atribuida',
    'Tarefa atribuída a você',
    v_titulo_tarefa,
    'tarefa',
    NEW.id
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notificar_tarefa_atribuida
  AFTER INSERT OR UPDATE OF responsavel_id ON processo_tarefas
  FOR EACH ROW EXECUTE FUNCTION fn_notificar_tarefa_atribuida();

CREATE OR REPLACE FUNCTION fn_notificar_fase_avancada()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nome_fase TEXT;
  v_nome_imovel TEXT;
BEGIN
  IF OLD.fase_atual_id IS NOT DISTINCT FROM NEW.fase_atual_id THEN
    RETURN NEW;
  END IF;
  IF NEW.fase_atual_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT nome INTO v_nome_fase FROM fases WHERE id = NEW.fase_atual_id;
  v_nome_imovel := COALESCE(NEW.nome_imovel, 'Processo #' || NEW.numero_processo);

  IF NEW.operacional_id IS NOT NULL AND NEW.operacional_id != auth.uid() THEN
    INSERT INTO notificacoes (empresa_id, usuario_id, tipo, titulo, mensagem, entidade, entidade_id)
    VALUES (
      NEW.empresa_id,
      NEW.operacional_id,
      'fase_avancada',
      'Fase avançada: ' || COALESCE(v_nome_fase, 'nova fase'),
      v_nome_imovel,
      'processo',
      NEW.id
    );
  END IF;

  IF NEW.comercial_id IS NOT NULL
     AND NEW.comercial_id != auth.uid()
     AND NEW.comercial_id IS DISTINCT FROM NEW.operacional_id
  THEN
    INSERT INTO notificacoes (empresa_id, usuario_id, tipo, titulo, mensagem, entidade, entidade_id)
    VALUES (
      NEW.empresa_id,
      NEW.comercial_id,
      'fase_avancada',
      'Fase avançada: ' || COALESCE(v_nome_fase, 'nova fase'),
      v_nome_imovel,
      'processo',
      NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notificar_fase_avancada
  AFTER UPDATE OF fase_atual_id ON processos
  FOR EACH ROW EXECUTE FUNCTION fn_notificar_fase_avancada();

CREATE OR REPLACE FUNCTION fn_notificar_lead_atribuido()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.responsavel_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.responsavel_id IS NOT DISTINCT FROM NEW.responsavel_id THEN
    RETURN NEW;
  END IF;
  IF NEW.responsavel_id = auth.uid() THEN
    RETURN NEW;
  END IF;

  INSERT INTO notificacoes (empresa_id, usuario_id, tipo, titulo, mensagem, entidade, entidade_id)
  VALUES (
    NEW.empresa_id,
    NEW.responsavel_id,
    'lead_atribuido',
    'Lead atribuído a você',
    COALESCE(NEW.nome, 'Novo lead'),
    'lead',
    NEW.id
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notificar_lead_atribuido
  AFTER INSERT OR UPDATE OF responsavel_id ON leads
  FOR EACH ROW EXECUTE FUNCTION fn_notificar_lead_atribuido();

CREATE OR REPLACE FUNCTION fn_notificar_processo_emitido()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nome_imovel TEXT;
BEGIN
  IF NEW.status_emissao != 'emitido' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status_emissao = 'emitido' THEN
    RETURN NEW;
  END IF;

  v_nome_imovel := COALESCE(NEW.nome_imovel, 'Processo #' || NEW.numero_processo);

  IF NEW.comercial_id IS NOT NULL THEN
    INSERT INTO notificacoes (empresa_id, usuario_id, tipo, titulo, mensagem, entidade, entidade_id)
    VALUES (
      NEW.empresa_id,
      NEW.comercial_id,
      'processo_emitido',
      'Processo emitido!',
      v_nome_imovel,
      'processo',
      NEW.id
    );
  END IF;

  IF NEW.operacional_id IS NOT NULL
     AND NEW.operacional_id IS DISTINCT FROM NEW.comercial_id
  THEN
    INSERT INTO notificacoes (empresa_id, usuario_id, tipo, titulo, mensagem, entidade, entidade_id)
    VALUES (
      NEW.empresa_id,
      NEW.operacional_id,
      'processo_emitido',
      'Processo emitido!',
      v_nome_imovel,
      'processo',
      NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notificar_processo_emitido
  AFTER UPDATE OF status_emissao ON processos
  FOR EACH ROW EXECUTE FUNCTION fn_notificar_processo_emitido();

CREATE OR REPLACE FUNCTION marcar_notificacoes_lidas(
  p_empresa_id UUID,
  p_ids        UUID[]
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM usuarios
    WHERE id = auth.uid() AND empresa_id = p_empresa_id AND ativo = true
  ) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  UPDATE notificacoes
  SET lida    = true,
      lida_em = now()
  WHERE id = ANY(p_ids)
    AND usuario_id  = auth.uid()
    AND empresa_id  = p_empresa_id
    AND lida        = false;
END;
$$;

GRANT EXECUTE ON FUNCTION marcar_notificacoes_lidas(UUID, UUID[]) TO authenticated;
