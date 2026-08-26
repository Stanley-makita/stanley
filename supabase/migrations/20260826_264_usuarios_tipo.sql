-- Classificação de usuário: interno (equipe, pode ser responsável/co-responsável em
-- Leads/Processos) ou externo (parceiro/colaborador com login normal, mas que não deve
-- aparecer como opção de responsável — só como destinatário de compartilhamento de
-- documentos, via WhatsApp pessoal já cadastrado).
CREATE TYPE usuario_tipo AS ENUM ('interno', 'externo');

ALTER TABLE usuarios ADD COLUMN tipo_usuario usuario_tipo NOT NULL DEFAULT 'interno';
