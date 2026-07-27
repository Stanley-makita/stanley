-- Permite que uma análise de crédito seja vinculada a um Processo (negócio
-- já em Financiamento), não só a um Lead — cenário: o processo precisa de
-- uma nova análise de crédito por motivo externo (banco recusou, mudança de
-- renda, etc.) sem precisar voltar o cliente pra fase de Lead.
--
-- lead_id vira nullable e ganha um irmão processo_id; CHECK garante que toda
-- linha pertence a exatamente um dos dois (nunca os dois, nunca nenhum).

ALTER TABLE lead_analises_credito
  ALTER COLUMN lead_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS processo_id UUID REFERENCES processos(id) ON DELETE CASCADE;

ALTER TABLE lead_analises_credito
  ADD CONSTRAINT chk_analise_credito_lead_xor_processo
  CHECK (
    (lead_id IS NOT NULL AND processo_id IS NULL) OR
    (lead_id IS NULL AND processo_id IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS idx_lead_analises_credito_processo ON lead_analises_credito(processo_id);

-- Índice parcial do banco definido, espelhando o já existente por lead_id
CREATE INDEX IF NOT EXISTS idx_lead_analises_banco_definido_processo
  ON lead_analises_credito(processo_id)
  WHERE banco_definido = true;

-- Espelha numero_proposta da análise decisiva também em processos.numero_proposta
-- (mesmo padrão já usado pra leads em 20260725_191) — só entra em ação quando a
-- análise pertence a um processo; o ramo de lead_id fica intacto.
CREATE OR REPLACE FUNCTION fn_sincronizar_lead_numero_proposta()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.lead_id IS NOT NULL THEN
    IF NEW.banco_definido THEN
      UPDATE leads
      SET numero_proposta = NEW.numero_proposta
      WHERE id = NEW.lead_id
        AND numero_proposta IS DISTINCT FROM NEW.numero_proposta;
    ELSIF TG_OP = 'UPDATE' AND OLD.banco_definido AND NOT NEW.banco_definido THEN
      UPDATE leads
      SET numero_proposta = NULL
      WHERE id = NEW.lead_id
        AND numero_proposta IS DISTINCT FROM NULL;
    END IF;
  ELSIF NEW.processo_id IS NOT NULL THEN
    IF NEW.banco_definido THEN
      UPDATE processos
      SET numero_proposta = NEW.numero_proposta
      WHERE id = NEW.processo_id
        AND numero_proposta IS DISTINCT FROM NEW.numero_proposta;
    ELSIF TG_OP = 'UPDATE' AND OLD.banco_definido AND NOT NEW.banco_definido THEN
      UPDATE processos
      SET numero_proposta = NULL
      WHERE id = NEW.processo_id
        AND numero_proposta IS DISTINCT FROM NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
