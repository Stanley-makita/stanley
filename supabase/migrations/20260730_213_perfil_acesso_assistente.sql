-- Adiciona o perfil "Assistente" ao enum usuario_perfil.
-- Nasce sem nenhuma permissão fixa (PERMISSOES_PADRAO.assistente = []) — todo
-- acesso configurável fica disponível para ser liberado manualmente em
-- Configurações > Perfis de Acesso.

ALTER TYPE usuario_perfil ADD VALUE IF NOT EXISTS 'assistente';
