-- Protege a troca de responsavel_id em leads com a permissão configurável
-- leads.redistribuir. RLS não filtra coluna específica dentro de um UPDATE
-- (a policy leads_update_responsavel_ou_gerencia continua controlando QUEM
-- pode dar UPDATE na linha; esta trigger controla, dentro de um UPDATE já
-- permitido, se ESTA coluna pode mudar) — por isso o enforcement de
-- "redistribuir" precisa ser uma trigger BEFORE UPDATE, comparando OLD/NEW.
--
-- Só dispara quando responsavel_id de fato muda — criação de lead (INSERT,
-- fora do escopo desta trigger), o comando *fonti do bot (só define o
-- responsável na criação, nunca reatribui lead existente) e o drag-and-drop
-- do Kanban (RPC mover_lead_kanban, só toca fase_id/ordem_kanban) continuam
-- funcionando sem tocar nesta trigger.

CREATE OR REPLACE FUNCTION leads_protege_redistribuicao() RETURNS trigger AS $$
BEGIN
  IF NEW.responsavel_id IS DISTINCT FROM OLD.responsavel_id
     AND NOT usuario_atual_pode('leads.redistribuir') THEN
    RAISE EXCEPTION 'Sem permissão para redistribuir este lead (leads.redistribuir)'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trigger_leads_protege_redistribuicao ON leads;
CREATE TRIGGER trigger_leads_protege_redistribuicao
  BEFORE UPDATE ON leads
  FOR EACH ROW
  EXECUTE FUNCTION leads_protege_redistribuicao();
