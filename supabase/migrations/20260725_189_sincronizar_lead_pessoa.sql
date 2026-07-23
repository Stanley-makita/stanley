-- Sprint Excelência na Extração Documental — persistência.
--
-- `leads` e `processo_compradores` guardam cópia própria de nome/cpf/email
-- (herdada de antes da entidade Pessoa existir — 20260415_004/005), em vez
-- de ler ao vivo de `pessoas`. Resultado: quando o operador confirma dados
-- extraídos por OCR (ocr-confirmar ou aplicar-ocr, ambos escrevem só em
-- `pessoas`), a Captação (Kanban/detalhe de Lead) e o Negócio/Financiamento
-- (aba Compradores, `select *` direto nessas tabelas) continuam mostrando
-- o nome/cpf antigos até alguém editar manualmente. O mesmo vale pra
-- qualquer outra origem de update em `pessoas` (edição manual, bot de
-- WhatsApp etc.) — não é só um problema do OCR.
--
-- Trigger em `pessoas` (fonte única de verdade) propaga nome/cpf/email pra
-- todos os Leads e compradores de processo vinculados sempre que algum
-- desses campos muda. Reaproveita o mesmo padrão de sincronização via
-- trigger já usado em 20260630_146_trigger_sincronizar_documentos.sql, em
-- vez de depender de cada call site lembrar de atualizar os dois lugares.
--
-- Telefone fica de fora por enquanto: não vem de uma coluna em `pessoas`
-- (mora em `pessoa_telefones`, com regra própria de qual é o principal) e
-- nenhuma das duas rotas de OCR grava telefone hoje — expandir esse trigger
-- pra telefone é uma mudança maior e separada, fora do escopo desta sprint.

CREATE OR REPLACE FUNCTION fn_sincronizar_lead_pessoa()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.nome IS DISTINCT FROM OLD.nome
     OR NEW.cpf IS DISTINCT FROM OLD.cpf
     OR NEW.email IS DISTINCT FROM OLD.email THEN
    UPDATE leads
    SET nome  = NEW.nome,
        cpf   = NEW.cpf,
        email = NEW.email
    WHERE pessoa_id = NEW.id
      AND deleted_at IS NULL
      AND (nome IS DISTINCT FROM NEW.nome
        OR cpf IS DISTINCT FROM NEW.cpf
        OR email IS DISTINCT FROM NEW.email);

    UPDATE processo_compradores
    SET nome  = NEW.nome,
        cpf   = NEW.cpf,
        email = NEW.email
    WHERE pessoa_id = NEW.id
      AND (nome IS DISTINCT FROM NEW.nome
        OR cpf IS DISTINCT FROM NEW.cpf
        OR email IS DISTINCT FROM NEW.email);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sincronizar_lead_pessoa ON pessoas;
CREATE TRIGGER trg_sincronizar_lead_pessoa
  AFTER UPDATE ON pessoas
  FOR EACH ROW EXECUTE FUNCTION fn_sincronizar_lead_pessoa();
