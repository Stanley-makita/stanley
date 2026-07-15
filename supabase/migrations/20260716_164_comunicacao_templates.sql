-- Central de Comunicação com o Cliente (Fase 1 — comunicação manual).
-- Nome da tabela é agnóstico de canal (não "whatsapp_templates") porque a mesma
-- estrutura deve servir outros canais em fases futuras — só o `canal` distingue.
CREATE TABLE IF NOT EXISTS comunicacao_templates (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  canal      TEXT NOT NULL DEFAULT 'whatsapp',
  -- Chave estável usada pela aplicação (nunca o `nome`, que é só rótulo de exibição e
  -- pode ser editado livremente sem quebrar nenhuma referência em código).
  codigo     TEXT NOT NULL,
  nome       TEXT NOT NULL,
  -- Corpo com placeholders {{variavel}}, substituídos por src/lib/comunicacao/substituirVariaveis.ts
  corpo      TEXT NOT NULL,
  ativo      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (empresa_id, codigo)
);

CREATE INDEX IF NOT EXISTS idx_comunicacao_templates_empresa ON comunicacao_templates(empresa_id);

ALTER TABLE comunicacao_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "comunicacao_templates_select" ON comunicacao_templates
  FOR SELECT USING (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1)
  );

CREATE POLICY "comunicacao_templates_insert" ON comunicacao_templates
  FOR INSERT WITH CHECK (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1)
  );

CREATE POLICY "comunicacao_templates_update" ON comunicacao_templates
  FOR UPDATE USING (
    empresa_id = (SELECT empresa_id FROM usuarios WHERE auth_user_id = auth.uid() LIMIT 1)
  );

-- Seed mínimo: 3 modelos básicos para toda empresa já existente, pra Fase 1 não nascer
-- com o seletor vazio. Usuários podem editar/desativar depois (sem UI de admin ainda —
-- direto no banco, aceitável nesta fase).
INSERT INTO comunicacao_templates (empresa_id, canal, codigo, nome, corpo)
SELECT
  e.id,
  'whatsapp',
  v.codigo,
  v.nome,
  v.corpo
FROM empresas e
CROSS JOIN (
  VALUES
    (
      'ATENDIMENTO_INICIADO',
      'Atendimento iniciado',
      'Olá {{comprador_nome}}! Aqui é {{responsavel_nome}}, da equipe responsável pelo seu negócio. Já iniciamos o atendimento e vamos te manter informado sobre cada etapa. Qualquer dúvida, é só chamar por aqui.'
    ),
    (
      'SOLICITAR_DOCUMENTO',
      'Solicitar documento',
      'Olá {{comprador_nome}}, tudo bem? Para darmos continuidade ao seu negócio (etapa atual: {{fase_atual}}), precisamos que você nos envie um documento. Assim que possível, é só mandar por aqui. Obrigado!'
    ),
    (
      'ALTERACAO_ETAPA',
      'Atualização de etapa',
      'Olá {{comprador_nome}}! Seu negócio avançou para a etapa "{{fase_atual}}". Em breve traremos mais novidades. Qualquer dúvida, estou à disposição.'
    )
) AS v(codigo, nome, corpo)
ON CONFLICT (empresa_id, codigo) DO NOTHING;
