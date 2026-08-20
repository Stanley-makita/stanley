-- ============================================================
-- Migration 259 — Financeiro de Consórcio (1/3): configuração de
-- percentuais e nº de parcelas por administradora.
--
-- Cada administradora de consórcio (Porto, Embracon etc.) pode ter seu
-- próprio % de comissão da empresa, % de fatia do comercial sobre esse
-- valor, e nº de parcelas do fluxo de comissão. `administradora_nome` é
-- texto livre (mesmo padrão de processo_cotas.administradora_nome — não há
-- tabela própria de administradoras), então a linha "padrão/geral"
-- (administradora_nome IS NULL) serve de fallback pra administradora sem
-- config específica.
-- ============================================================

CREATE TABLE financeiro_config_consorcio (
  id                              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id                      UUID        NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  administradora_nome             TEXT,  -- NULL = linha "padrão/geral"

  comissao_total_percentual       NUMERIC(5,2) NOT NULL DEFAULT 4  CHECK (comissao_total_percentual BETWEEN 0 AND 100),
  comissao_comercial_percentual   NUMERIC(5,2) NOT NULL DEFAULT 25 CHECK (comissao_comercial_percentual BETWEEN 0 AND 100),
  numero_parcelas_padrao          INTEGER      NOT NULL DEFAULT 13 CHECK (numero_parcelas_padrao > 0),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE financeiro_config_consorcio ENABLE ROW LEVEL SECURITY;

-- só 1 linha "geral" por empresa
CREATE UNIQUE INDEX ux_fin_config_consorcio_geral
  ON financeiro_config_consorcio(empresa_id) WHERE administradora_nome IS NULL;
-- só 1 linha por administradora nomeada por empresa
CREATE UNIQUE INDEX ux_fin_config_consorcio_administradora
  ON financeiro_config_consorcio(empresa_id, administradora_nome) WHERE administradora_nome IS NOT NULL;

CREATE TRIGGER trg_fin_config_consorcio_updated_at
  BEFORE UPDATE ON financeiro_config_consorcio
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Mesma graduação de comissoes_padrao: leitura livre pra membro ativo da
-- empresa; escrita restrita a admin/gerente.
CREATE POLICY "membro_le_fin_config_consorcio"
  ON financeiro_config_consorcio FOR SELECT
  USING (
    empresa_id IN (SELECT empresa_id FROM usuarios WHERE id = auth.uid() AND ativo = true)
  );

CREATE POLICY "gestor_escreve_fin_config_consorcio"
  ON financeiro_config_consorcio FOR INSERT
  WITH CHECK (
    empresa_id IN (
      SELECT empresa_id FROM usuarios
      WHERE id = auth.uid() AND perfil IN ('admin', 'gerente') AND ativo = true
    )
  );

CREATE POLICY "gestor_atualiza_fin_config_consorcio"
  ON financeiro_config_consorcio FOR UPDATE
  USING (
    empresa_id IN (
      SELECT empresa_id FROM usuarios
      WHERE id = auth.uid() AND perfil IN ('admin', 'gerente') AND ativo = true
    )
  )
  WITH CHECK (
    empresa_id IN (
      SELECT empresa_id FROM usuarios
      WHERE id = auth.uid() AND perfil IN ('admin', 'gerente') AND ativo = true
    )
  );

CREATE POLICY "gestor_remove_fin_config_consorcio"
  ON financeiro_config_consorcio FOR DELETE
  USING (
    empresa_id IN (
      SELECT empresa_id FROM usuarios
      WHERE id = auth.uid() AND perfil IN ('admin', 'gerente') AND ativo = true
    )
  );
