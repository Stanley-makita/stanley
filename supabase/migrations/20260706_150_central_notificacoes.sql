-- ============================================================
-- Migration: 20260706_150_central_notificacoes.sql
-- Central de Notificações — infraestrutura definitiva:
--   * coluna `tipo` deixa de ser ENUM Postgres e vira TEXT (mesmo padrão já
--     usado por `entidade`) — elimina a necessidade de uma migration
--     `ALTER TYPE ... ADD VALUE` a cada tipo novo de notificação.
--   * novas colunas: severidade, prioridade, dados_json, origem.
--   * policy de exclusão (não existia).
--   * RPC genérica `criar_notificacao`, porta de entrada única usada pelo
--     NotificationService (src/lib/notificacoes/notificationService.ts) —
--     INSERT direto continua REVOKED para authenticated (ver migration 008).
--   * REPLICA IDENTITY FULL — necessário para o realtime conseguir filtrar
--     eventos UPDATE/DELETE por usuario_id.
--
-- Não altera nenhum trigger de negócio existente (processo_tarefas,
-- processos, leads, lead_tarefas, solicitacoes_operacionais) — todos usam
-- literais de texto simples, compatíveis com `tipo TEXT` sem nenhuma mudança.
-- ============================================================

-- 1) Redefinir as duas RPCs que ainda fazem cast explícito ::tipo_notificacao,
--    ANTES de o enum deixar de existir (evita quebrar em runtime). Corpo
--    idêntico ao vigente em 20260519_046_fix_notificacoes_solicitacao.sql,
--    só removendo o cast — um literal de string se adapta ao tipo da coluna
--    automaticamente uma vez que ela vire TEXT.
CREATE OR REPLACE FUNCTION enviar_mensagem_solicitacao(
  p_solicitacao_id UUID,
  p_texto          TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sol     solicitacoes_operacionais%ROWTYPE;
  v_dest_id UUID;
  v_msg_id  UUID;
  v_caller  UUID := auth.uid();
BEGIN
  SELECT * INTO v_sol
    FROM solicitacoes_operacionais
   WHERE id = p_solicitacao_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitação não encontrada';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM usuarios
     WHERE id = v_caller AND empresa_id = v_sol.empresa_id AND ativo = true
  ) THEN
    RAISE EXCEPTION 'Sem permissão para enviar mensagem nesta solicitação';
  END IF;

  v_dest_id := CASE
    WHEN v_caller = v_sol.solicitante_id THEN v_sol.responsavel_id
    WHEN v_caller = v_sol.responsavel_id THEN v_sol.solicitante_id
    ELSE v_sol.responsavel_id
  END;

  INSERT INTO solicitacao_mensagens(empresa_id, solicitacao_id, autor_id, texto)
  VALUES (v_sol.empresa_id, p_solicitacao_id, v_caller, p_texto)
  RETURNING id INTO v_msg_id;

  IF v_dest_id IS NOT NULL AND v_dest_id != v_caller THEN
    INSERT INTO notificacoes(empresa_id, usuario_id, tipo, titulo, mensagem, entidade_id, entidade)
    VALUES (
      v_sol.empresa_id,
      v_dest_id,
      CASE
        WHEN v_caller = v_sol.responsavel_id THEN 'solicitacao_retorno'
        ELSE 'solicitacao_respondida'
      END,
      CASE
        WHEN v_caller = v_sol.responsavel_id THEN 'Operacional adicionou mensagem'
        ELSE 'Comercial respondeu à solicitação'
      END,
      left(p_texto, 100),
      p_solicitacao_id,
      'solicitacao'
    );
  END IF;

  RETURN v_msg_id;
END;
$$;

CREATE OR REPLACE FUNCTION responder_solicitacao(
  p_id            UUID,
  p_retorno       TEXT,
  p_status        TEXT,
  p_anexo_path    TEXT DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sol solicitacoes_operacionais%ROWTYPE;
BEGIN
  SELECT * INTO v_sol
    FROM solicitacoes_operacionais
   WHERE id = p_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitação não encontrada';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM usuarios
     WHERE id = auth.uid() AND empresa_id = v_sol.empresa_id AND ativo = true
  ) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  UPDATE solicitacoes_operacionais SET
    retorno_operacional = p_retorno,
    status              = p_status::status_solicitacao,
    concluido_em        = CASE WHEN p_status = 'concluido' THEN now() ELSE concluido_em END,
    anexo_retorno_path  = COALESCE(p_anexo_path, anexo_retorno_path),
    updated_at          = now()
  WHERE id = p_id;

  INSERT INTO solicitacao_mensagens(empresa_id, solicitacao_id, autor_id, texto)
  VALUES (v_sol.empresa_id, p_id, auth.uid(), p_retorno);

  IF v_sol.solicitante_id IS NOT NULL AND v_sol.solicitante_id != auth.uid() THEN
    INSERT INTO notificacoes(empresa_id, usuario_id, tipo, titulo, mensagem, entidade_id, entidade)
    VALUES (
      v_sol.empresa_id,
      v_sol.solicitante_id,
      'solicitacao_retorno',
      'Operacional respondeu à solicitação',
      left(p_retorno, 100),
      p_id,
      'solicitacao'
    );
  END IF;
END;
$$;

-- 2) Converter a coluna tipo de ENUM para TEXT preservando os dados.
ALTER TABLE notificacoes
  ALTER COLUMN tipo TYPE TEXT USING tipo::TEXT;

-- 3) Agora que nada mais depende do enum, remover o tipo antigo.
DROP TYPE tipo_notificacao;

-- 4) Novas colunas: severidade (estilo visual do toast/item) e prioridade
--    (dado de negócio para ordenação/filtros/IA futura — dimensão
--    independente de severidade, não controla nenhum estilo nesta sprint).
ALTER TABLE notificacoes
  ADD COLUMN severidade TEXT NOT NULL DEFAULT 'info',
  ADD COLUMN prioridade TEXT NOT NULL DEFAULT 'normal',
  ADD COLUMN dados_json JSONB,
  ADD COLUMN origem     TEXT;

ALTER TABLE notificacoes
  ADD CONSTRAINT notificacoes_severidade_check
  CHECK (severidade IN ('info', 'success', 'warning', 'error', 'critical'));

ALTER TABLE notificacoes
  ADD CONSTRAINT notificacoes_prioridade_check
  CHECK (prioridade IN ('low', 'normal', 'high', 'critical'));

-- 5) Réplica identidade completa: necessária para o realtime filtrar
--    UPDATE/DELETE por usuario_id (payload "old" precisa carregar a coluna).
ALTER TABLE notificacoes REPLICA IDENTITY FULL;

-- 6) Policy de exclusão (não existia — usuário não podia excluir notificação).
CREATE POLICY "usuario_exclui_propria_notificacao"
  ON notificacoes FOR DELETE
  USING (usuario_id = auth.uid());

-- 7) RPC genérica de criação — porta de entrada única para
--    NotificationService.notify(). INSERT direto continua REVOKED para
--    authenticated (migration 008); esta função roda como SECURITY DEFINER
--    e resolve/valida a empresa no servidor (nunca aceita do chamador, evita
--    spoof cross-tenant), mesmo padrão de marcar_notificacoes_lidas.
CREATE OR REPLACE FUNCTION criar_notificacao(
  p_usuario_id  UUID,
  p_tipo        TEXT,
  p_titulo      TEXT,
  p_mensagem    TEXT DEFAULT NULL,
  p_entidade    TEXT DEFAULT NULL,
  p_entidade_id UUID DEFAULT NULL,
  p_severidade  TEXT DEFAULT 'info',
  p_prioridade  TEXT DEFAULT 'normal',
  p_dados_json  JSONB DEFAULT NULL,
  p_origem      TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_empresa_id UUID;
  v_id UUID;
BEGIN
  SELECT empresa_id INTO v_empresa_id
    FROM usuarios
   WHERE id = p_usuario_id AND ativo = true;

  IF v_empresa_id IS NULL THEN
    RAISE EXCEPTION 'Usuário destinatário inválido ou inativo';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM usuarios
     WHERE id = auth.uid() AND empresa_id = v_empresa_id AND ativo = true
  ) THEN
    RAISE EXCEPTION 'Sem permissão para notificar este usuário';
  END IF;

  IF p_titulo IS NULL OR length(trim(p_titulo)) = 0 THEN
    RAISE EXCEPTION 'Título é obrigatório';
  END IF;

  INSERT INTO notificacoes (
    empresa_id, usuario_id, tipo, titulo, mensagem,
    entidade, entidade_id, severidade, prioridade, dados_json, origem
  ) VALUES (
    v_empresa_id, p_usuario_id, p_tipo, p_titulo, p_mensagem,
    p_entidade, p_entidade_id, COALESCE(p_severidade, 'info'), COALESCE(p_prioridade, 'normal'),
    p_dados_json, p_origem
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION criar_notificacao(
  UUID, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, JSONB, TEXT
) TO authenticated;

-- 8) Publicação realtime: notificacoes já está em supabase_realtime desde a
--    migration 008 — nada a fazer aqui (reconfigurar geraria erro de
--    "already member of publication").
