-- Permite reabrir um Processo marcado como Concluído (concluido_em) — só
-- admin/gestor/gerente, mediante justificativa obrigatória. Mesma ideia de
-- reabrir_fechamento (migration 210), mas com enforcement real de permissão
-- via usuario_atual_pode (aquele RPC não checava perfil, confiava só no
-- grant de app; aqui seguimos o padrão mais rígido já usado em
-- fn_bloquear_retrocesso_fase_sem_permissao, migration 255).

-- 1. Nova ação, mesmo fallback padrão de processos.retroceder_fase.
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
    WHEN 'processos.reabrir'  THEN v_perfil IN ('gerente', 'gestor', 'admin')
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

-- 2. Colunas de auditoria da reabertura.
ALTER TABLE processos
  ADD COLUMN IF NOT EXISTS reaberto_em      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reaberto_por     UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS motivo_reabertura TEXT;

-- 3. RPC: reabrir_processo — limpa concluido_em (destrava) e desmarca
-- qualquer item de checklist com acao_ao_completar='processo_concluido'
-- desse processo, pra permitir concluir de novo mais tarde sem sujeira.
CREATE OR REPLACE FUNCTION reabrir_processo(
  p_processo_id UUID,
  p_motivo      TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_empresa_id UUID;
  v_concluido_em TIMESTAMPTZ;
BEGIN
  IF p_motivo IS NULL OR trim(p_motivo) = '' THEN
    RAISE EXCEPTION 'Motivo da reabertura é obrigatório';
  END IF;

  IF NOT usuario_atual_pode('processos.reabrir') THEN
    RAISE EXCEPTION 'Sem permissão para reabrir processo.' USING ERRCODE = '42501';
  END IF;

  SELECT empresa_id, concluido_em INTO v_empresa_id, v_concluido_em
    FROM processos
   WHERE id = p_processo_id AND empresa_id = usuario_atual_empresa_id();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Processo não encontrado ou acesso negado';
  END IF;
  IF v_concluido_em IS NULL THEN
    RAISE EXCEPTION 'Este processo não está concluído — nada para reabrir';
  END IF;

  UPDATE processos
     SET concluido_em      = NULL,
         reaberto_em       = now(),
         reaberto_por      = usuario_atual_id(),
         motivo_reabertura = p_motivo
   WHERE id = p_processo_id;

  UPDATE checklist_execucoes ce
     SET marcado = false, marcado_por = NULL, marcado_em = NULL
    FROM checklist_items ci
   WHERE ce.item_id = ci.id
     AND ce.processo_id = p_processo_id
     AND ci.acao_ao_completar = 'processo_concluido';
END;
$$;
