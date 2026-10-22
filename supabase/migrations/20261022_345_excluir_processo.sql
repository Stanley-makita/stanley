-- Excluir processo (negócio) aberto por engano — ex.: comercial criou o mesmo
-- processo duas vezes pro mesmo cliente (caso real 22/10/2026, Estevan Carlos Petyk).
-- Exclusão é SOFT DELETE: só marca deleted_at + quem/por quê. Pessoa, documentos
-- (documentos.pessoa_id), lead e participações ficam intactos — a RLS de
-- processos_select (migration 320) e o bot já filtram deleted_at IS NULL.
--
-- Permissão nova 'processos.excluir': admin sempre; qualquer outro perfil (inclusive
-- gestor) só com liberação em Configurações > Perfis de Acesso — por isso o fallback
-- de usuario_atual_pode (ELSE false, migration 283) já serve, sem recriar a função.

-- 1. Colunas de auditoria da exclusão.
ALTER TABLE processos
  ADD COLUMN IF NOT EXISTS excluido_por     UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS motivo_exclusao  TEXT;

-- 2. RPC: excluir_processo.
CREATE OR REPLACE FUNCTION excluir_processo(
  p_processo_id UUID,
  p_motivo      TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead_id         UUID;
  v_numero          TEXT;
  v_status_emissao  TEXT;
  v_deleted_at      TIMESTAMPTZ;
BEGIN
  IF p_motivo IS NULL OR length(trim(p_motivo)) < 10 THEN
    RAISE EXCEPTION 'Informe a justificativa da exclusão (mínimo 10 caracteres).';
  END IF;

  IF NOT usuario_atual_pode('processos.excluir') THEN
    RAISE EXCEPTION 'Sem permissão para excluir processo.' USING ERRCODE = '42501';
  END IF;

  SELECT lead_id, numero_processo, status_emissao::text, deleted_at
    INTO v_lead_id, v_numero, v_status_emissao, v_deleted_at
    FROM processos
   WHERE id = p_processo_id AND empresa_id = usuario_atual_empresa_id();

  IF NOT FOUND OR v_deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Processo não encontrado ou já excluído.';
  END IF;

  -- Emitido já gerou comissão/financeiro — duplicado nunca chega até aqui.
  IF v_status_emissao = 'emitido' THEN
    RAISE EXCEPTION 'Processo já emitido não pode ser excluído.';
  END IF;

  UPDATE processos
     SET deleted_at      = now(),
         excluido_por    = usuario_atual_id(),
         motivo_exclusao = trim(p_motivo)
   WHERE id = p_processo_id;

  -- Fica registrado no lead (o histórico do processo some junto com ele).
  IF v_lead_id IS NOT NULL THEN
    INSERT INTO lead_historico (lead_id, empresa_id, usuario_id, tipo, descricao)
    VALUES (
      v_lead_id, usuario_atual_empresa_id(), usuario_atual_id(), 'acao_operacional',
      'Processo ' || coalesce(v_numero, p_processo_id::text) || ' excluído. Justificativa: ' || trim(p_motivo)
    );
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION excluir_processo(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION excluir_processo(UUID, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
