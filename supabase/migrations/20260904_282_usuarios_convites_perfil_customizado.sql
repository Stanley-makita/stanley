-- Perfis de Acesso Customizados — Task 3/4.
--
-- Só é preenchida quando perfil = 'customizado'. Sem CHECK cruzando as duas
-- colunas de propósito (mantém simples; a UI garante a combinação coerente,
-- mesmo padrão de confiança já usado em outras colunas condicionais deste
-- schema).

ALTER TABLE usuarios ADD COLUMN perfil_customizado_id UUID REFERENCES perfis_acesso(id);
ALTER TABLE convites ADD COLUMN perfil_customizado_id UUID REFERENCES perfis_acesso(id);
