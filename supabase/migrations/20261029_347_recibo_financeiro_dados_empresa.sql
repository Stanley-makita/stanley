-- Recibo de lançamento financeiro + Dados da Empresa
--
-- 1. processo_financeiro.situacao ganha 'recebido' (cliente pagou a empresa → gera recibo).
--    'pago' passa a significar só "a empresa pagou o cliente" (repasse); 'pendente' não gera nada.
-- 2. Dados do recibo no próprio lançamento: número sequencial por empresa (atribuído pelo
--    trigger na 1ª vez que vira 'recebido') e nome/CPF de quem pagou quando diferente do
--    proponente principal (vazio = usa o titular do negócio).
-- 3. empresas ganha razão social e endereço (tela Configurações > Dados da Empresa).
-- 4. Único lançamento de receita marcado 'pago' antes desta regra (kit certidões da Érica,
--    29/10) passa para 'recebido', a pedido do usuário.

-- ── 1. situação 'recebido' ──────────────────────────────────────────────────────
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'processo_financeiro'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%situacao%'
  LOOP
    EXECUTE format('ALTER TABLE processo_financeiro DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE processo_financeiro
  ADD CONSTRAINT processo_financeiro_situacao_check
  CHECK (situacao IN ('pendente', 'recebido', 'pago', 'cancelado'));

-- ── 2. dados do recibo ──────────────────────────────────────────────────────────
ALTER TABLE processo_financeiro
  ADD COLUMN IF NOT EXISTS recibo_numero INTEGER,
  ADD COLUMN IF NOT EXISTS recibo_nome   TEXT,
  ADD COLUMN IF NOT EXISTS recibo_cpf    TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS processo_financeiro_recibo_numero_unico
  ON processo_financeiro (empresa_id, recibo_numero) WHERE recibo_numero IS NOT NULL;

-- Número do recibo: atribuído uma vez, na 1ª vez que o lançamento vira 'recebido', e nunca
-- reaproveitado (voltar para pendente e de novo para recebido mantém o mesmo número).
-- Também garante a data do recebimento (pago_em), que é a data impressa no recibo.
CREATE OR REPLACE FUNCTION fn_pf_numero_recibo()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.situacao = 'recebido' THEN
    NEW.pago_em := COALESCE(NEW.pago_em, now());
    IF NEW.recibo_numero IS NULL THEN
      PERFORM pg_advisory_xact_lock(hashtext('recibo:' || NEW.empresa_id::text));
      SELECT COALESCE(MAX(recibo_numero), 0) + 1 INTO NEW.recibo_numero
      FROM processo_financeiro WHERE empresa_id = NEW.empresa_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pf_numero_recibo ON processo_financeiro;
CREATE TRIGGER trg_pf_numero_recibo
  BEFORE INSERT OR UPDATE OF situacao ON processo_financeiro
  FOR EACH ROW EXECUTE FUNCTION fn_pf_numero_recibo();

-- ── 3. dados da empresa ─────────────────────────────────────────────────────────
ALTER TABLE empresas
  ADD COLUMN IF NOT EXISTS razao_social         TEXT,
  ADD COLUMN IF NOT EXISTS endereco_rua         TEXT,
  ADD COLUMN IF NOT EXISTS endereco_numero      TEXT,
  ADD COLUMN IF NOT EXISTS endereco_complemento TEXT,
  ADD COLUMN IF NOT EXISTS endereco_bairro      TEXT,
  ADD COLUMN IF NOT EXISTS endereco_cidade      TEXT,
  ADD COLUMN IF NOT EXISTS endereco_uf          TEXT,
  ADD COLUMN IF NOT EXISTS endereco_cep         TEXT;

-- ── 4. lançamento da Érica ──────────────────────────────────────────────────────
UPDATE processo_financeiro
SET situacao = 'recebido', updated_at = now()
WHERE id = 'a5c59715-1225-46df-8769-b37f1e06c49b' AND situacao = 'pago';
