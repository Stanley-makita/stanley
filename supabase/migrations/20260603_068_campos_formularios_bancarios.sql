-- Migration 068: Campos para auto-preenchimento de formulários bancários
-- Adiciona dados de pessoa (sexo, casamento, trabalho, banco) e processo (financiamento)

-- ============================================================
-- PESSOAS — campos novos
-- ============================================================

ALTER TABLE pessoas
  -- Identificação
  ADD COLUMN IF NOT EXISTS sexo                    CHAR(1)        CHECK (sexo IN ('M','F')),
  -- Casamento
  ADD COLUMN IF NOT EXISTS data_casamento          DATE,
  -- Trabalho (necessário para formulários FGTS)
  ADD COLUMN IF NOT EXISTS empresa_nome            TEXT,
  ADD COLUMN IF NOT EXISTS empresa_cnpj            TEXT,
  ADD COLUMN IF NOT EXISTS municipio_trabalho      TEXT,
  ADD COLUMN IF NOT EXISTS uf_trabalho             CHAR(2),
  -- Dados bancários do comprador (débito das parcelas)
  ADD COLUMN IF NOT EXISTS conta_bancaria_banco    TEXT,
  ADD COLUMN IF NOT EXISTS conta_bancaria_agencia  TEXT,
  ADD COLUMN IF NOT EXISTS conta_bancaria_numero   TEXT,
  ADD COLUMN IF NOT EXISTS conta_bancaria_digito   TEXT;

-- ============================================================
-- PROCESSOS — campos de financiamento
-- ============================================================

ALTER TABLE processos
  ADD COLUMN IF NOT EXISTS prazo_amortizacao_meses        INTEGER
    CHECK (prazo_amortizacao_meses > 0),
  ADD COLUMN IF NOT EXISTS dia_vencimento_parcela         INTEGER
    CHECK (dia_vencimento_parcela BETWEEN 1 AND 28),
  ADD COLUMN IF NOT EXISTS sistema_amortizacao            TEXT
    CHECK (sistema_amortizacao IN ('SAC','PRICE')),
  ADD COLUMN IF NOT EXISTS indexador                      TEXT
    CHECK (indexador IN ('TR','IPCA')),
  ADD COLUMN IF NOT EXISTS financiar_despesas_cartorariais BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS valor_recursos_proprios        NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS valor_fgts                     NUMERIC(15,2);

-- ============================================================
-- PESSOA_FGTS_CONTAS — tabela de contas FGTS extraídas
-- (usada na Fase 3 - OCR de extratos)
-- ============================================================

CREATE TABLE IF NOT EXISTS pessoa_fgts_contas (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id          UUID          NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  pessoa_id           UUID          NOT NULL REFERENCES pessoas(id)  ON DELETE CASCADE,
  cod_empregador      TEXT,
  nro_conta_fgts      TEXT,
  pis_pasep           TEXT,
  valor_saque         TEXT,           -- 'TOTAL' ou valor numérico como texto
  saldo_disponivel    NUMERIC(12,2),
  data_extrato        DATE,
  documento_id        UUID,           -- referência ao documentos_clientes de onde foi extraído
  created_at          TIMESTAMPTZ    NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ    NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fgts_contas_pessoa
  ON pessoa_fgts_contas(pessoa_id);

ALTER TABLE pessoa_fgts_contas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fgts_contas_empresa_select" ON pessoa_fgts_contas
  FOR SELECT USING (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE id = auth.uid() AND ativo = true)
  );

CREATE POLICY "fgts_contas_empresa_insert" ON pessoa_fgts_contas
  FOR INSERT WITH CHECK (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE id = auth.uid() AND ativo = true)
  );

CREATE POLICY "fgts_contas_empresa_update" ON pessoa_fgts_contas
  FOR UPDATE USING (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE id = auth.uid() AND ativo = true)
  );

CREATE POLICY "fgts_contas_empresa_delete" ON pessoa_fgts_contas
  FOR DELETE USING (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE id = auth.uid() AND ativo = true)
  );
