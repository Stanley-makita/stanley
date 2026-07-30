-- Liga o usuário de acesso (login) ao cargo cadastrado no módulo RH
-- (rh_cargos), para que o dropdown "Função" do modal de usuário deixe de
-- usar a lista fixa em código (FUNCOES) e passe a refletir os cargos reais
-- da empresa. A coluna usuarios.funcao (texto livre) é mantida — continua
-- guardando o rótulo do cargo selecionado, usado hoje em telas e templates
-- de e-mail que não fazem join com rh_cargos.

ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS cargo_id UUID REFERENCES rh_cargos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_usuarios_cargo ON usuarios(cargo_id);
