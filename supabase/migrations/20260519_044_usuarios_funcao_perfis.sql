-- Adiciona coluna funcao e novos valores ao enum usuario_perfil
-- para suportar gestão de equipe com perfis operacionais específicos

ALTER TYPE usuario_perfil ADD VALUE IF NOT EXISTS 'gestor';
ALTER TYPE usuario_perfil ADD VALUE IF NOT EXISTS 'comercial';
ALTER TYPE usuario_perfil ADD VALUE IF NOT EXISTS 'operacional';
ALTER TYPE usuario_perfil ADD VALUE IF NOT EXISTS 'juridico';
ALTER TYPE usuario_perfil ADD VALUE IF NOT EXISTS 'apoio';

ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS funcao text;
