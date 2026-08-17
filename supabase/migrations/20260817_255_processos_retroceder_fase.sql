-- Permite retroceder a fase de um Processo (Financiamento/CGI/Contrato/
-- Registro) — hoje só existia esse fluxo pro Consórcio (via AbaFases). Nova
-- ação 'processos.retroceder_fase', restrita a admin/gestor/gerente por
-- padrão (config. futura em Perfis de Acesso via perfil_permissoes).
--
-- Diferente de processos.editar (só verificado no client/RLS genérico de
-- update), aqui o enforcement é real: um trigger BEFORE UPDATE bloqueia
-- qualquer tentativa de mover processos.fase_atual_id para uma fase de
-- ordem menor sem essa permissão — cobre tanto a UI nova (PipelineBar /
-- Kanban) quanto qualquer chamada direta à tabela.
--
-- Checklist não precisa de tratamento aqui: checklist_execucoes já é
-- vinculado a processo_id + item_id (não à fase atual), então marcações
-- feitas numa fase permanecem intactas ao retroceder.

-- 1. Estende usuario_atual_pode() com o fallback padrão da nova ação.
CREATE OR REPLACE FUNCTION usuario_atual_pode(p_acao text) RETURNS boolean AS $$
DECLARE
  v_usuario_id  uuid := usuario_atual_id();
  v_perfil      usuario_perfil := usuario_atual_perfil();
  v_empresa_id  uuid := usuario_atual_empresa_id();
  v_permitido   boolean;
BEGIN
  IF v_perfil = 'admin' THEN
    RETURN true;
  END IF;

  SELECT permitido INTO v_permitido
    FROM usuario_permissoes
   WHERE usuario_id = v_usuario_id AND acao = p_acao
   LIMIT 1;
  IF FOUND THEN
    RETURN v_permitido;
  END IF;

  SELECT permitido INTO v_permitido
    FROM perfil_permissoes
   WHERE empresa_id = v_empresa_id AND perfil = v_perfil AND acao = p_acao
   LIMIT 1;
  IF FOUND THEN
    RETURN v_permitido;
  END IF;

  RETURN CASE p_acao
    WHEN 'leads.ver_todas'    THEN v_perfil <> 'comercial'
    WHEN 'leads.redistribuir' THEN v_perfil IN ('gestor', 'gerente', 'apoio', 'comercial')
    WHEN 'processos.criar'    THEN v_perfil IN ('analista', 'consultor', 'gerente', 'gestor', 'comercial', 'admin')
    WHEN 'processos.editar'   THEN v_perfil IN ('gerente', 'gestor', 'admin')
    WHEN 'processos.retroceder_fase' THEN v_perfil IN ('gerente', 'gestor', 'admin')
    WHEN 'usuarios.convidar'  THEN v_perfil IN ('admin', 'gerente', 'gestor')
    WHEN 'financeiro.editar'  THEN v_perfil IN ('gerente', 'gestor', 'admin')
    WHEN 'rh.ver'             THEN v_perfil IN ('admin', 'gestor')
    WHEN 'rh.editar'          THEN v_perfil = 'admin'
    WHEN 'pessoas.ver'        THEN v_perfil IN ('admin', 'gestor', 'comercial', 'operacional', 'juridico', 'gerente', 'analista', 'consultor')
    WHEN 'pessoas.editar'     THEN v_perfil IN ('admin', 'gestor', 'comercial', 'operacional', 'gerente', 'analista')
    WHEN 'pessoas.merge'      THEN v_perfil IN ('admin', 'gerente', 'gestor')
    WHEN 'pessoas.excluir'    THEN v_perfil IN ('admin', 'gestor', 'gerente')
    WHEN 'biblioteca.publicar' THEN v_perfil IN ('admin', 'gerente', 'gestor')
    WHEN 'biblioteca.excluir'  THEN v_perfil IN ('admin', 'gerente', 'gestor')
    ELSE false
  END;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- 2. Trigger: bloqueia UPDATE de fase_atual_id para uma fase de ordem menor
-- (retrocesso) quando o usuário não tem processos.retroceder_fase. Avanço e
-- troca entre fases de mesma ordem (não deveria existir, mas por segurança)
-- seguem liberados — só a comparação estrita de ordem é regressão de fase.
CREATE OR REPLACE FUNCTION fn_bloquear_retrocesso_fase_sem_permissao()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ordem_old INTEGER;
  v_ordem_new INTEGER;
BEGIN
  IF OLD.fase_atual_id IS NOT DISTINCT FROM NEW.fase_atual_id THEN
    RETURN NEW;
  END IF;
  IF OLD.fase_atual_id IS NULL OR NEW.fase_atual_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT ordem INTO v_ordem_old FROM fases WHERE id = OLD.fase_atual_id;
  SELECT ordem INTO v_ordem_new FROM fases WHERE id = NEW.fase_atual_id;

  IF v_ordem_old IS NOT NULL AND v_ordem_new IS NOT NULL AND v_ordem_new < v_ordem_old THEN
    IF NOT usuario_atual_pode('processos.retroceder_fase') THEN
      RAISE EXCEPTION 'Sem permissão para retroceder a fase do processo.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bloquear_retrocesso_fase_sem_permissao ON processos;
CREATE TRIGGER trg_bloquear_retrocesso_fase_sem_permissao
  BEFORE UPDATE OF fase_atual_id ON processos
  FOR EACH ROW EXECUTE FUNCTION fn_bloquear_retrocesso_fase_sem_permissao();

-- 3. Notificação: "Fase avançada" ficava incorreta num retrocesso — passa a
-- comparar a ordem das fases e ajustar tipo/título de acordo.
CREATE OR REPLACE FUNCTION fn_notificar_fase_avancada()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nome_fase TEXT;
  v_nome_imovel TEXT;
  v_ordem_old INTEGER;
  v_ordem_new INTEGER;
  v_tipo TEXT;
  v_titulo_prefixo TEXT;
BEGIN
  IF OLD.fase_atual_id IS NOT DISTINCT FROM NEW.fase_atual_id THEN
    RETURN NEW;
  END IF;
  IF NEW.fase_atual_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT nome, ordem INTO v_nome_fase, v_ordem_new FROM fases WHERE id = NEW.fase_atual_id;
  SELECT ordem INTO v_ordem_old FROM fases WHERE id = OLD.fase_atual_id;
  v_nome_imovel := COALESCE(NEW.nome_imovel, 'Processo #' || NEW.numero_processo);

  IF v_ordem_old IS NOT NULL AND v_ordem_new IS NOT NULL AND v_ordem_new < v_ordem_old THEN
    v_tipo := 'fase_retrocedida';
    v_titulo_prefixo := 'Fase retrocedida: ';
  ELSE
    v_tipo := 'fase_avancada';
    v_titulo_prefixo := 'Fase avançada: ';
  END IF;

  IF NEW.operacional_id IS NOT NULL AND NEW.operacional_id != auth.uid() THEN
    INSERT INTO notificacoes (empresa_id, usuario_id, tipo, titulo, mensagem, entidade, entidade_id)
    VALUES (
      NEW.empresa_id,
      NEW.operacional_id,
      v_tipo,
      v_titulo_prefixo || COALESCE(v_nome_fase, 'nova fase'),
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
      v_tipo,
      v_titulo_prefixo || COALESCE(v_nome_fase, 'nova fase'),
      v_nome_imovel,
      'processo',
      NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$;
