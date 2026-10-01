-- ============================================================
-- Migration 334: Participantes V2 — usuário da equipe pode ser cliente
--
-- pessoa_e_de_operador (324) marcava como "da equipe" QUALQUER Pessoa com telefone ativo igual ao de um
-- usuário ativo — e Pessoa da equipe nunca vira participante. Efeito real (01/10/2026, go-live): cliente de
-- teste com o telefone do próprio comercial sumiu do lead e do negócio em silêncio; e um usuário que fosse
-- cliente de verdade nunca poderia participar de uma proposta.
--
-- A proteção que importa (incidente 21/09) é o BOT nunca escolher o cliente pelo telefone de quem manda a
-- mensagem — isso continua (migration 314 + guard da Prioridade 4 em workflow-captacao.ts, que não usam esta
-- função). Aqui a regra fica: "da equipe" = telefone de usuário E sem CPF válido (a Pessoa-âncora que o bot
-- cria para a conversa do próprio comercial). Pessoa com CPF válido é gente de verdade e pode participar.
--
-- E trocar/incluir/remover telefone passa a ressincronizar as propostas da Pessoa (antes só mudanças em
-- `pessoas` disparavam; corrigir o telefone não fazia a Pessoa voltar para a proposta).
-- Idempotente. Sem backfill em massa: o trigger ressincroniza na próxima edição de telefone.
-- ============================================================
BEGIN;

CREATE OR REPLACE FUNCTION pessoa_e_de_operador(p_pessoa_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT EXISTS (SELECT 1 FROM pessoas p WHERE p.id = p_pessoa_id AND cpf_valido(p.cpf))
     AND EXISTS (
    SELECT 1
    FROM pessoa_telefones pt
    JOIN usuarios u ON u.empresa_id = pt.empresa_id AND u.ativo = true
    WHERE pt.pessoa_id = p_pessoa_id AND pt.ativo = true
      AND (
        (u.telefone_whatsapp IS NOT NULL AND telefone_canonico_br(u.telefone_whatsapp) = telefone_canonico_br(pt.telefone))
        OR (u.telefone IS NOT NULL AND telefone_canonico_br(u.telefone) = telefone_canonico_br(pt.telefone))
      )
  );
$$;
REVOKE EXECUTE ON FUNCTION pessoa_e_de_operador(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION pessoa_e_de_operador(uuid) TO authenticated, service_role;

-- Telefone mudou → propostas da Pessoa ressincronizam (ser ou não "da equipe" depende do telefone).
CREATE OR REPLACE FUNCTION fn_pv2_pessoa_telefones() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_pessoa uuid := coalesce(NEW.pessoa_id, OLD.pessoa_id); r record;
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NULL; END IF;
  IF current_setting('pv2.backfill', true) = 'on' THEN RETURN NULL; END IF;
  FOR r IN SELECT id FROM leads WHERE deleted_at IS NULL AND v_pessoa IN (pessoa_id, conjuge_pessoa_id, vendedor_pessoa_id)
           UNION SELECT lead_id FROM participacoes WHERE lead_id IS NOT NULL AND pessoa_id = v_pessoa LOOP
    PERFORM pv2_sincronizar_lead(r.id);
  END LOOP;
  FOR r IN SELECT DISTINCT processo_id AS id FROM participacoes WHERE processo_id IS NOT NULL AND pessoa_id = v_pessoa LOOP
    PERFORM pv2_sincronizar_processo(r.id);
  END LOOP;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_pv2_pessoa_telefones ON pessoa_telefones;
CREATE TRIGGER trg_pv2_pessoa_telefones AFTER INSERT OR DELETE OR UPDATE OF telefone, ativo, pessoa_id ON pessoa_telefones
  FOR EACH ROW EXECUTE FUNCTION fn_pv2_pessoa_telefones();

COMMIT;
