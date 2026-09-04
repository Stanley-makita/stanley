-- Perfis de Acesso Customizados — Task 4/4.
--
-- Ganha um branch novo para v_perfil = 'customizado': resolve o id do
-- perfil customizado do usuário e consulta perfil_customizado_permissoes em
-- vez de perfil_permissoes. Ausência de linha = false, sempre — perfil
-- customizado nunca cai no CASE de fallback final (que é só para os 7
-- perfis fixos), então nunca herda leads.ver_todas/leads.redistribuir por
-- acidente. A checagem de exceção individual (usuario_permissoes) continua
-- rodando antes deste branch, prioridade inalterada.

CREATE OR REPLACE FUNCTION usuario_atual_pode(p_acao text) RETURNS boolean AS $$
DECLARE
  v_usuario_id              uuid := usuario_atual_id();
  v_perfil                  usuario_perfil := usuario_atual_perfil();
  v_empresa_id               uuid := usuario_atual_empresa_id();
  v_permitido                boolean;
  v_perfil_customizado_id    uuid;
BEGIN
  IF v_perfil = 'admin' THEN
    RETURN true;
  END IF;

  SELECT permitido INTO v_permitido
    FROM usuario_permissoes
   WHERE usuario_id = v_usuario_id AND acao = p_acao
   LIMIT 1;
  IF FOUND THEN
    RETURN v_permitido;
  END IF;

  IF v_perfil = 'customizado' THEN
    SELECT perfil_customizado_id INTO v_perfil_customizado_id
      FROM usuarios WHERE id = v_usuario_id;

    SELECT permitido INTO v_permitido
      FROM perfil_customizado_permissoes
     WHERE perfil_customizado_id = v_perfil_customizado_id AND acao = p_acao
     LIMIT 1;

    RETURN COALESCE(v_permitido, false);
  END IF;

  SELECT permitido INTO v_permitido
    FROM perfil_permissoes
   WHERE empresa_id = v_empresa_id AND perfil = v_perfil AND acao = p_acao
   LIMIT 1;
  IF FOUND THEN
    RETURN v_permitido;
  END IF;

  RETURN CASE p_acao
    WHEN 'leads.ver_todas'    THEN v_perfil <> 'comercial'
    WHEN 'leads.redistribuir' THEN v_perfil IN ('gestor', 'gerente', 'apoio', 'comercial')
    ELSE false
  END;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;
