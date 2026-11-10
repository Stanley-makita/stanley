-- 349 — Autoria da criação de Pessoa: quem criou e por qual caminho.
--
-- Caso real (28/10/2026): 2 cadastros duplicados da cliente "JAQUELINE CORDEIRO..." apareceram e não
-- havia como saber quem os criou nem por qual tela — `pessoas` não guardava autor e `pessoas_alteracoes`
-- só registra edição. Agora toda Pessoa nova guarda:
--   criado_por     → usuário (usuarios.id). Preenchido pelo trigger com o usuário logado (JWT); as rotas de
--                    servidor (service role, auth.uid() nulo) passam explicitamente.
--   criado_origem  → caminho: 'ocr_novo_participante', 'ocr_conjuge', 'ocr_certidao_casamento',
--                    'participante_lead', 'vendedor_lead', … ; sem informação: 'tela' (usuário logado) ou
--                    'sem_usuario' (bot, webhook ou rota de servidor que não informou o usuário).
-- Cadastros antigos ficam com NULL (não há como reconstituir).

ALTER TABLE pessoas
  ADD COLUMN IF NOT EXISTS criado_por uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS criado_origem text;

COMMENT ON COLUMN pessoas.criado_por IS 'Usuário que criou o cadastro (migration 349). NULL = antes da 349 ou sem usuário.';
COMMENT ON COLUMN pessoas.criado_origem IS 'Caminho que criou o cadastro (ex.: ocr_novo_participante, participante_lead, tela, sem_usuario).';

CREATE OR REPLACE FUNCTION fn_pessoas_autoria_criacao() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.criado_por IS NULL THEN
    NEW.criado_por := usuario_atual_id();
  END IF;
  IF NEW.criado_origem IS NULL THEN
    NEW.criado_origem := CASE WHEN NEW.criado_por IS NULL THEN 'sem_usuario' ELSE 'tela' END;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_pessoas_autoria_criacao ON pessoas;
CREATE TRIGGER trg_pessoas_autoria_criacao
  BEFORE INSERT ON pessoas
  FOR EACH ROW EXECUTE FUNCTION fn_pessoas_autoria_criacao();
