-- Central de Comunicação com o Cliente (Fase 1). `processo_comentarios` já é a tabela
-- genérica de timeline do Negócio (usada por comentários manuais e por eventos automáticos,
-- ex.: trigger fn_contrato_timeline_evento). Um envio de mensagem manual ao cliente se encaixa
-- no mesmo padrão — só precisa deste novo valor de `tipo`.
--
-- ALTER TYPE ... ADD VALUE precisa ficar isolado em sua própria migration: não pode ser
-- combinado, na mesma transação, com nenhum comando que já use o valor novo.
ALTER TYPE tipo_comentario ADD VALUE IF NOT EXISTS 'comunicacao_cliente';
