-- Origens de Lead Customizadas — Task 1/2.
--
-- Substitui o enum fixo lead_origem como fonte de verdade da lista de
-- origens: catálogo por empresa, com código estável (o que fica gravado em
-- leads.origem — nunca muda) e nome editável (o que aparece na tela).
--
-- sistema=true: as 5 origens gravadas automaticamente por webhook/bot
-- (site, whatsapp, instagram, facebook, indicacao) — só o nome pode ser
-- editado, nunca desativadas/excluídas (a Task 4 impõe essa regra nos
-- hooks; aqui não há CHECK específico, mesmo padrão de confiança já usado
-- em outras tabelas de configuração deste projeto).
-- sistema=false: as 6 manuais existentes mais qualquer nova criada pela
-- tela — aceitam criar/renomear/desativar (nunca excluir fisicamente).

CREATE TABLE origens_lead (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  UUID        NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  codigo      TEXT        NOT NULL,
  nome        TEXT        NOT NULL,
  sistema     BOOLEAN     NOT NULL DEFAULT false,
  ativo       BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, codigo)
);

CREATE INDEX idx_origens_lead_empresa ON origens_lead(empresa_id);

ALTER TABLE origens_lead ENABLE ROW LEVEL SECURITY;

-- Leitura aberta a qualquer usuário ativo da empresa — necessário nos
-- dropdowns de preenchimento manual, usados por qualquer perfil com
-- leads.criar/leads.editar. Mesmo padrão de fases_select/bancos_select
-- (sem checagem de perfil na leitura).
CREATE POLICY "origens_lead_select" ON origens_lead
  FOR SELECT USING (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE id = auth.uid())
  );

CREATE POLICY "origens_lead_insert" ON origens_lead
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM usuarios
      WHERE id = auth.uid() AND perfil IN ('admin', 'gerente') AND empresa_id = origens_lead.empresa_id
    )
  );

CREATE POLICY "origens_lead_update" ON origens_lead
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM usuarios
      WHERE id = auth.uid() AND perfil IN ('admin', 'gerente') AND empresa_id = origens_lead.empresa_id
    )
  );

COMMENT ON TABLE origens_lead IS
  'Catálogo de origens de Lead por empresa. codigo é o valor gravado em leads.origem (estável); nome é o rótulo exibido (editável). sistema=true = as 5 automáticas por webhook, nunca desativáveis.';

-- Seed: cada empresa existente recebe as 11 linhas atuais, com o mesmo
-- texto e código já usados em produção hoje — não muda nada visualmente
-- até alguém editar pela tela nova.
INSERT INTO origens_lead (empresa_id, codigo, nome, sistema)
SELECT id, v.codigo, v.nome, v.sistema
FROM empresas
CROSS JOIN (VALUES
  ('site',               'Site',               true),
  ('whatsapp',           'WhatsApp',           true),
  ('instagram',          'Instagram',          true),
  ('facebook',           'Facebook',           true),
  ('indicacao',          'Indicação',          true),
  ('direto',             'Direto',             false),
  ('corretor',           'Corretor',           false),
  ('imobiliaria',        'Imobiliária',        false),
  ('construtora',        'Construtora',        false),
  ('parceiro_comercial', 'Parceiro Comercial', false),
  ('outros',             'Outros',             false)
) AS v(codigo, nome, sistema);
