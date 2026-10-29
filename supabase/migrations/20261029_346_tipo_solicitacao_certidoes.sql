-- Novo tipo de solicitação: Certidões.
-- Só o valor do enum: o SLA padrão (48h) mora no front (SLA_HORAS_PADRAO). A tabela
-- sla_config_operacional não é lida pelo código, e o novo valor não pode ser usado na
-- mesma transação do ADD VALUE — por isso não há seed aqui.
ALTER TYPE tipo_solicitacao ADD VALUE IF NOT EXISTS 'certidoes' AFTER 'custas';
