-- Tabela de marcas de início de sessão para o comando *fonti inicio.
-- Permite ao comercial delimitar exatamente quais documentos pertencem a cada cliente
-- quando vários clientes chegam em sequência na mesma conversa.

CREATE TABLE IF NOT EXISTS fonti_marcas (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id        UUID        NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  telefone_conversa TEXT        NOT NULL,   -- telefone do parceiro do chat (corretor / funcionário)
  iniciado_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, telefone_conversa)
);

ALTER TABLE fonti_marcas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role only" ON fonti_marcas USING (false);
