#!/usr/bin/env bash
# Recria o banco de TESTE (Supabase credifon-crm-staging) a partir da PRODUÇÃO:
# estrutura completa do schema public + dados de CONFIGURAÇÃO (lista de permissão abaixo)
# + logins (auth.users) + policies do Storage. Nenhum dado de cliente é copiado.
# APAGA tudo que estiver no public do teste.
#
# Precisa de pg_dump/psql 17 (binários portáteis em C:\Users\Marci\pgtools\pgsql\bin) e das
# connection strings (session pooler, aws-1-sa-east-1, porta 5432, senha com URL-encode):
#   PROD_URL=... TESTE_URL=... PG_BIN=/c/Users/Marci/pgtools/pgsql/bin bash scripts/sincronizar-ambiente-teste.sh
set -euo pipefail
: "${PROD_URL:?}" "${TESTE_URL:?}"
B="${PG_BIN:-/c/Users/Marci/pgtools/pgsql/bin}"
D="$(mktemp -d)"

# Só estas tabelas levam dados. Tabela nova de CONFIGURAÇÃO entra aqui; de cliente, nunca.
CONFIG="bancos base_conhecimento_categorias base_conhecimento_docs bot_config canais_leads_config
catalogo_pastas_processo catalogo_tipos_documento checklist_items checklist_templates comissoes_padrao
comunicacao_templates contrato_assessoria_contadores empresas fase_statuses fases financeiro_config_consorcio
instancias lead_aba_config metas_equipe origens_lead perfil_customizado_permissoes perfil_permissoes
perfis_acesso processo_contadores produtos registros_imoveis rh_cargo_regras rh_cargos rh_departamentos
rh_faixas_comissao rh_funcionario_empresas rh_funcionario_regras rh_funcionarios rh_regras_comissao
simulador_config_geral simulador_custas_config simulador_itbi_config sla_config_operacional
usuario_permissoes usuarios"
T=(); for t in $CONFIG; do T+=(-t "public.$t"); done

echo "== dump da produção"
"$B/pg_dump" "$PROD_URL" --schema=public --schema-only --no-owner \
  | grep -v "ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin" > "$D/schema.sql"
{ echo "set session_replication_role = replica;"; "$B/pg_dump" "$PROD_URL" --data-only --no-owner "${T[@]}"; } > "$D/dados.sql"
{ echo "set session_replication_role = replica;"; echo "delete from auth.identities; delete from auth.users;"
  "$B/pg_dump" "$PROD_URL" --data-only --no-owner -t auth.users -t auth.identities; } > "$D/auth.sql"
"$B/pg_dump" "$PROD_URL" --schema=storage --schema-only --no-owner \
  | awk '/^CREATE POLICY/{f=1} f{print} f&&/;$/{f=0}' > "$D/storage_policies.sql"
REALTIME=$("$B/psql" "$PROD_URL" -Atc "select string_agg('public.'||tablename, ', ') from pg_publication_tables where pubname='supabase_realtime' and schemaname='public'")

echo "== recriando o teste"
"$B/psql" "$TESTE_URL" -v ON_ERROR_STOP=1 -q <<'EOF'
do $$ declare r record; begin
  for r in select policyname from pg_policies where schemaname='storage' and tablename='objects' loop
    execute format('drop policy %I on storage.objects', r.policyname); end loop; end $$;
drop schema if exists public cascade;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists pg_net with schema extensions;
EOF
"$B/psql" "$TESTE_URL" -1 -v ON_ERROR_STOP=1 -q -f "$D/schema.sql"
"$B/psql" "$TESTE_URL" -1 -v ON_ERROR_STOP=1 -q -f "$D/storage_policies.sql"
"$B/psql" "$TESTE_URL" -1 -v ON_ERROR_STOP=1 -q -f "$D/auth.sql"
"$B/psql" "$TESTE_URL" -1 -v ON_ERROR_STOP=1 -q -f "$D/dados.sql"
"$B/psql" "$TESTE_URL" -v ON_ERROR_STOP=1 -q <<EOF
update public.instancias set token = 'DESLIGADO-TESTE-' || id;  -- teste nunca fala com o WhatsApp real
alter publication supabase_realtime add table $REALTIME;
notify pgrst, 'reload schema';
EOF
rm -rf "$D"
echo "== pronto"
