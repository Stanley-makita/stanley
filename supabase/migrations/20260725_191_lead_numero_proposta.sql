-- Nº da Proposta: bancos usam esse número como referência em toda a
-- operação. Já existe em `processos.numero_proposta` (20260507_027) — com
-- exibição na aba Resumo e na Visão Tabela de Negócios — mas nenhuma tela
-- em Leads/Captação captura esse dado, e nenhum fluxo grava lá.
--
-- Captura acontece por análise de crédito (cada banco tentado tem sua
-- própria proposta), em `lead_analises_credito`. `leads.numero_proposta` é
-- um espelho da análise marcada `banco_definido = true` — mesmo padrão de
-- trigger já usado em 20260725_189/190 (Lead↔Pessoa, cônjuge) — pra Tabela
-- e Kanban de Leads mostrarem o dado sem precisar de subquery em
-- `lead_analises_credito` toda hora.

ALTER TABLE lead_analises_credito ADD COLUMN IF NOT EXISTS numero_proposta TEXT;
ALTER TABLE leads               ADD COLUMN IF NOT EXISTS numero_proposta TEXT;

CREATE OR REPLACE FUNCTION fn_sincronizar_lead_numero_proposta()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.banco_definido THEN
    -- Análise decisiva (nova ou com numero_proposta editado depois) —
    -- espelha o valor dela no Lead.
    UPDATE leads
    SET numero_proposta = NEW.numero_proposta
    WHERE id = NEW.lead_id
      AND numero_proposta IS DISTINCT FROM NEW.numero_proposta;
  ELSIF TG_OP = 'UPDATE' AND OLD.banco_definido AND NOT NEW.banco_definido THEN
    -- Banco definido foi desmarcado: nenhuma análise é mais a decisiva,
    -- limpa o espelho no Lead.
    UPDATE leads
    SET numero_proposta = NULL
    WHERE id = NEW.lead_id
      AND numero_proposta IS DISTINCT FROM NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sincronizar_lead_numero_proposta ON lead_analises_credito;
CREATE TRIGGER trg_sincronizar_lead_numero_proposta
  AFTER INSERT OR UPDATE ON lead_analises_credito
  FOR EACH ROW EXECUTE FUNCTION fn_sincronizar_lead_numero_proposta();
