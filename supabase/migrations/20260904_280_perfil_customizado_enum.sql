-- Perfis de Acesso Customizados — Task 1/4.
--
-- Adiciona um único valor novo ao enum usuario_perfil: 'customizado'. Todo
-- perfil criado pela tela (Configurações > Perfis de Acesso > "+ Criar novo
-- perfil") usa este mesmo valor — o nome real do perfil vive na tabela nova
-- perfis_acesso (migration 281), não no enum. Isso evita precisar de uma
-- migration de schema a cada perfil novo criado pelo admin.
--
-- Isolada em migration própria: ALTER TYPE ... ADD VALUE não pode ser usado
-- no mesmo bloco de transação em que o valor novo é referenciado (restrição
-- do Postgres) — as migrations 281-283 já podem usar 'customizado' livremente
-- porque rodam depois, em transações separadas.

ALTER TYPE usuario_perfil ADD VALUE IF NOT EXISTS 'customizado';
