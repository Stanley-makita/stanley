-- ============================================================
-- Subpastas de documentos + pastas novas (pedido do operacional, 06/10/2026)
--
-- 1. Subpasta: catalogo_pastas_processo.pai_codigo (NULL = pasta principal).
--    Só "01 Comprador" ganha subpastas (decisão do Marcio):
--      01 Documentos Pessoais / 02 Comprovação de Renda / 03 FGTS
--    Documentos já em "01 Comprador" continuam lá (na raiz da pasta).
-- 2. "04 Formulários" e "13 Simulações" deixam de ser só atalho para as abas do
--    sistema e viram pastas de verdade (formulários dos bancos preenchidos fora
--    do sistema, simulações externas). O botão para a aba fica dentro da pasta.
-- 3. Pasta nova "05B Aprovação" (documento do banco comprovando a aprovação).
-- 4. Sugestão automática por tipo de documento aponta para as subpastas do
--    comprador (Organizar arquivos, conversão lead → negócio, Extrair dados).
--    Nada já organizado é movido.
-- Mesmo catálogo em Captação e Negócios. Rodar no staging e na produção.
-- ============================================================

ALTER TABLE catalogo_pastas_processo
  ADD COLUMN IF NOT EXISTS pai_codigo TEXT REFERENCES catalogo_pastas_processo(codigo);

INSERT INTO catalogo_pastas_processo (codigo, nome, ordem_exibicao, pai_codigo) VALUES
  ('comprador_pessoais', '01 Documentos Pessoais',   11, 'comprador'),
  ('comprador_renda',    '02 Comprovação de Renda',  12, 'comprador'),
  ('comprador_fgts',     '03 FGTS',                  13, 'comprador'),
  ('formularios',        '04 Formulários',           40, NULL),
  ('aprovacao',          '05B Aprovação',            55, NULL),
  ('simulacoes',         '13 Simulações',           130, NULL)
ON CONFLICT (codigo) DO NOTHING;

UPDATE catalogo_tipos_documento SET pasta_sugerida_codigo = 'comprador_pessoais'
  WHERE codigo IN ('rg','cnh','cpf','certidao_nascimento','certidao_casamento',
                   'certidao_divorcio','passaporte','rne','comprovante_endereco');
UPDATE catalogo_tipos_documento SET pasta_sugerida_codigo = 'comprador_renda'
  WHERE codigo IN ('comprovante_renda','extrato_bancario','imposto_renda');
UPDATE catalogo_tipos_documento SET pasta_sugerida_codigo = 'comprador_fgts'
  WHERE codigo = 'extrato_fgts';
