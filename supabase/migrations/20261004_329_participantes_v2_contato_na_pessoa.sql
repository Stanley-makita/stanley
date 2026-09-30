-- ============================================================
-- Migration 329: Participantes V2 — B2a: dados de contato das linhas antigas vão para a Pessoa
-- A aba do Negócio (useAdicionarComprador/useAdicionarVendedor) ainda grava e-mail/telefone/
-- estado civil só em processo_compradores/processo_vendedores. O trigger da Fase A passa a
-- copiar esses dados para a Pessoa depois de sincronizar o processo — SÓ PREENCHE campo vazio,
-- nunca sobrescreve; nunca toca Pessoa de operador; nunca grava telefone de usuário interno
-- numa Pessoa de cliente (invariante 1 do CLAUDE.md). Conta bancária do vendedor já é copiada
-- por pv2_sincronizar_processo (326).
-- Rodar ANTES o diagnóstico supabase/2026-10-04_diagnostico_contato_linhas_antigas.sql.
-- Rodar fora do horário comercial: o backfill mexe em pessoas.updated_at (formulários abertos
-- da AbaPessoa recarregam).
-- ============================================================
BEGIN;

CREATE OR REPLACE FUNCTION pv2_copiar_contato_linhas_antigas(p_processo_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_email text; v_estado text; v_tel text; v_empresa uuid;
BEGIN
  FOR r IN
    SELECT pc.pessoa_id, pc.email, pc.telefone, NULL::text AS estado_civil, pc.created_at
    FROM processo_compradores pc WHERE pc.processo_id = p_processo_id AND pc.pessoa_id IS NOT NULL
    UNION ALL
    SELECT pv.pessoa_id, pv.email, pv.telefone, pv.estado_civil, pv.created_at
    FROM processo_vendedores pv WHERE pv.processo_id = p_processo_id AND pv.pessoa_id IS NOT NULL
    ORDER BY 5
  LOOP
    SELECT empresa_id INTO v_empresa FROM pessoas WHERE id = r.pessoa_id AND deleted_at IS NULL;
    CONTINUE WHEN v_empresa IS NULL OR pessoa_e_de_operador(r.pessoa_id);

    v_email  := nullif(trim(r.email), '');
    IF v_email IS NOT NULL AND v_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN v_email := NULL; END IF;
    v_estado := lower(nullif(trim(r.estado_civil), ''));
    IF v_estado NOT IN ('solteiro', 'casado', 'uniao_estavel', 'divorciado', 'viuvo') THEN v_estado := NULL; END IF;

    UPDATE pessoas SET
      email        = coalesce(email, v_email),
      estado_civil = coalesce(estado_civil, v_estado)
    WHERE id = r.pessoa_id
      AND ((email IS NULL AND v_email IS NOT NULL) OR (estado_civil IS NULL AND v_estado IS NOT NULL));

    v_tel := nullif(trim(r.telefone), '');
    IF v_tel IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pessoa_telefones t WHERE t.pessoa_id = r.pessoa_id AND t.ativo)
       AND NOT EXISTS (
         SELECT 1 FROM usuarios u
         WHERE u.empresa_id = v_empresa AND u.ativo
           AND ((u.telefone_whatsapp IS NOT NULL AND telefone_canonico_br(u.telefone_whatsapp) = telefone_canonico_br(v_tel))
             OR (u.telefone IS NOT NULL AND telefone_canonico_br(u.telefone) = telefone_canonico_br(v_tel)))
       ) THEN
      INSERT INTO pessoa_telefones (pessoa_id, empresa_id, telefone, principal, whatsapp, ativo)
      VALUES (r.pessoa_id, v_empresa, v_tel, true, true, true)
      ON CONFLICT (empresa_id, telefone) WHERE ativo = true DO NOTHING;
    END IF;
  END LOOP;
END $$;
REVOKE EXECUTE ON FUNCTION pv2_copiar_contato_linhas_antigas(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION pv2_copiar_contato_linhas_antigas(uuid) TO service_role;

-- Mesma função da 327 + a cópia de contato depois da sincronização.
CREATE OR REPLACE FUNCTION fn_pv2_processo_filhos() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NULL; END IF;
  IF current_setting('pv2.backfill', true) = 'on' THEN RETURN NULL; END IF;
  IF TG_OP = 'DELETE' THEN
    PERFORM pv2_sincronizar_processo(OLD.processo_id);
  ELSE
    PERFORM pv2_sincronizar_processo(NEW.processo_id);
    PERFORM pv2_copiar_contato_linhas_antigas(NEW.processo_id);
    IF TG_OP = 'UPDATE' AND OLD.processo_id IS DISTINCT FROM NEW.processo_id THEN
      PERFORM pv2_sincronizar_processo(OLD.processo_id);
    END IF;
  END IF;
  RETURN NULL;
END $$;

-- Backfill: triggers pv2 desligados (a cópia não precisa re-sincronizar nada).
SELECT set_config('pv2.backfill', 'on', true);
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM processos WHERE deleted_at IS NULL ORDER BY created_at LOOP
    PERFORM pv2_copiar_contato_linhas_antigas(r.id);
  END LOOP;
END $$;
SELECT set_config('pv2.backfill', 'off', true);

COMMIT;
