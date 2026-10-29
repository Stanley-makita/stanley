-- Logo usada nos documentos gerados (recibo), separada da logo do sistema (empresas.logo_url,
-- que é a marca Fonti do sidebar/login). Vazio = logo oficial da Fontinhas embutida no código
-- (src/lib/financeiro/logoRecibo.ts). Trocada em Configurações > Dados da Empresa.
ALTER TABLE empresas
  ADD COLUMN IF NOT EXISTS logo_documentos_url  TEXT,
  ADD COLUMN IF NOT EXISTS logo_documentos_path TEXT;
