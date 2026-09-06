-- Coluna Modalidade do Lead — mesmo conceito de Processo.modalidade
-- (SFI, SBPE, PMCMV, Pro_Cotista, CGI, Contrato, Consorcio, Registro).
--
-- TEXT livre sem CHECK constraint, mesmo padrão de produto_interesse (a
-- validação dos literais válidos fica na aplicação, não no banco) — decisão
-- explícita: a modalidade do Lead é uma pré-classificação do que o Processo
-- vai assumir depois, então tem que usar exatamente os mesmos literais do
-- enum ModalidadeProcesso do código (não é um catálogo editável por empresa,
-- diferente de origens_lead).

ALTER TABLE leads ADD COLUMN IF NOT EXISTS modalidade TEXT;
