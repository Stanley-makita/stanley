-- ============================================================
-- Migration: 20260713_157_catalogo_pastas_processo.sql
-- Estrutura de Pastas por Processo — Entrega 2, parte 1/2
--
-- Réplica das 13 posições de pastas que a empresa já usa há anos na rede
-- compartilhada (01 Comprador ... 13 Simulações), como categorização de
-- documentos DENTRO de um Processo — ortogonal à taxonomia de tipo de
-- documento (catalogo_tipos_documento, usada pra OCR/UX de upload).
--
-- Só 11 das 13 posições viram categorias reais de arquivo aqui: "04
-- Formulários" e "13 Simulações" continuam como abas próprias do sistema
-- (já existem) — a navegação de pastas as inclui só como atalho visual pra
-- essas abas, sem armazenar documento nelas (ver plano de UI, Entrega 2
-- parte 2). Por isso não têm linha nesta tabela.
--
-- Mesmo padrão de catalogo_tipos_documento (migration 141): catálogo global
-- (não multi-tenant), leitura liberada pra qualquer autenticado, escrita
-- reservada a service role por enquanto.
-- ============================================================

CREATE TABLE catalogo_pastas_processo (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo          TEXT        NOT NULL UNIQUE,
  nome            TEXT        NOT NULL,
  ordem_exibicao  INTEGER     NOT NULL,
  ativo           BOOLEAN     NOT NULL DEFAULT true,
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_catalogo_pastas_processo_ativo ON catalogo_pastas_processo (ativo, ordem_exibicao);

ALTER TABLE catalogo_pastas_processo ENABLE ROW LEVEL SECURITY;

CREATE POLICY "usuarios_autenticados_leem_catalogo_pastas"
  ON catalogo_pastas_processo FOR SELECT
  TO authenticated
  USING (ativo = true);

-- Números "04" e "13" ficam de fora de propósito (Formulários/Simulações
-- continuam abas próprias). Número fica só no `nome`, não no `codigo` — se a
-- numeração física mudar um dia, só edita nome/ordem_exibicao, sem tocar em
-- código que referencia `codigo`.
INSERT INTO catalogo_pastas_processo (codigo, nome, ordem_exibicao) VALUES
  ('comprador',           '01 Comprador',                     10),
  ('imovel',              '02 Imóvel',                        20),
  ('vendedor',            '03 Vendedor',                      30),
  ('certidoes',           '05 Certidões',                     50),
  ('confirmacao_valores', '06 Confirmação de Valores',        60),
  ('juridico',            '07 Jurídico',                      70),
  ('contrato_emitido',    '08 Contrato Emitido ou Assinado',  80),
  ('requerimentos',       '09 Requerimentos',                 90),
  ('contrato_registrado', '10 Contrato Registrado',          100),
  ('financeiro',          '11 Financeiro',                   110),
  ('extra',               '12 Extra',                        120);
