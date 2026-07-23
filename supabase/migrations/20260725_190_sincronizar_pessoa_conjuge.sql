-- Suporte a "este documento é do cônjuge" na revisão de OCR.
--
-- Quando o operador confirma um RG/CNH marcando "é do cônjuge", os dados
-- extraídos (nome/cpf/data_nascimento/documentos) passam a ser gravados
-- numa Pessoa própria e completa do cônjuge (pessoas.conjuge_pessoa_id),
-- não mais só nos campos soltos conjuge_nome/conjuge_cpf/conjuge_data_nascimento
-- — isso dá ao cônjuge seu próprio card de Documentos (RG/CNH), igual ao
-- titular, e reaproveita o cônjuge como Pessoa existente se ele já for
-- cliente (mesma checagem por CPF de buscarOuCriarPessoa).
--
-- Esta migration mantém os campos soltos (conjuge_nome/conjuge_cpf/
-- conjuge_data_nascimento) sincronizados automaticamente a partir da
-- Pessoa vinculada — mesmo padrão de trigger já usado em
-- 20260725_189_sincronizar_lead_pessoa.sql, pra continuar tendo esses 3
-- campos disponíveis pra exibição rápida na aba Pessoa sem precisar de
-- JOIN, e pra manterem-se corretos mesmo se o cônjuge atualizar seus
-- próprios dados depois (ex: confirmando outro documento diretamente no
-- cadastro dele).

CREATE OR REPLACE FUNCTION fn_sincronizar_pessoa_conjuge()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.nome IS DISTINCT FROM OLD.nome
     OR NEW.cpf IS DISTINCT FROM OLD.cpf
     OR NEW.data_nascimento IS DISTINCT FROM OLD.data_nascimento THEN
    UPDATE pessoas
    SET conjuge_nome            = NEW.nome,
        conjuge_cpf             = NEW.cpf,
        conjuge_data_nascimento = NEW.data_nascimento
    WHERE conjuge_pessoa_id = NEW.id
      AND deleted_at IS NULL
      AND (conjuge_nome IS DISTINCT FROM NEW.nome
        OR conjuge_cpf IS DISTINCT FROM NEW.cpf
        OR conjuge_data_nascimento IS DISTINCT FROM NEW.data_nascimento);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sincronizar_pessoa_conjuge ON pessoas;
CREATE TRIGGER trg_sincronizar_pessoa_conjuge
  AFTER UPDATE ON pessoas
  FOR EACH ROW EXECUTE FUNCTION fn_sincronizar_pessoa_conjuge();
