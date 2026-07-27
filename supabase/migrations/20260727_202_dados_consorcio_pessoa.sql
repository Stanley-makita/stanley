-- Campos exigidos pelo formulário de consórcio do cliente PF (ex: conglomerado
-- Itaú Unibanco), ausentes até agora em `pessoas` — reaproveita o restante da
-- estrutura já existente (endereco_*, sexo, nacionalidade, estado_civil,
-- conjuge_cpf/conjuge_data_nascimento, pessoa_documentos_identificacao).
ALTER TABLE pessoas
  ADD COLUMN IF NOT EXISTS endereco_complemento     TEXT,
  ADD COLUMN IF NOT EXISTS residente_exterior       BOOLEAN,
  ADD COLUMN IF NOT EXISTS pep                      BOOLEAN,
  ADD COLUMN IF NOT EXISTS autoriza_oferta_marketing BOOLEAN,
  ADD COLUMN IF NOT EXISTS patrimonio_total         NUMERIC(15,2);
