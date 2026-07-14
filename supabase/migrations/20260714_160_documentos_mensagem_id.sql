-- Correlaciona um documento salvo no acervo com a mensagem de WhatsApp que o originou,
-- permitindo mostrar "Salvo no acervo" na bolha da conversa sem depender da URL
-- efemera da Uazapi (mensagens.metadata.file_url, que expira rapido).
ALTER TABLE documentos ADD COLUMN IF NOT EXISTS mensagem_id UUID REFERENCES mensagens(id);

CREATE INDEX IF NOT EXISTS idx_documentos_mensagem_id
  ON documentos (mensagem_id)
  WHERE mensagem_id IS NOT NULL;
