# Credifon CRM — Setup

## Pré-requisitos

- Node.js 18+
- Conta no [Supabase](https://supabase.com) (ou Supabase local via CLI)
- Git

## 1. Instalar dependências

```bash
cd squads/credifon-crm/_projeto
npm install
```

## 2. Configurar variáveis de ambiente

```bash
cp .env.local.example .env.local
```

Preencha `.env.local` com os valores do seu projeto Supabase:

```env
NEXT_PUBLIC_SUPABASE_URL=https://SEU_PROJETO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

Encontre essas chaves em: **Supabase Dashboard → Settings → API**

## 3. Aplicar as migrations no banco

No **Supabase Dashboard → SQL Editor**, execute os arquivos na ordem:

```
supabase/migrations/20260415_001_base_config.sql
supabase/migrations/20260415_002_auth_rbac.sql
supabase/migrations/20260415_003_dashboard.sql
supabase/migrations/20260415_004_leads.sql
supabase/migrations/20260415_005_processos.sql
supabase/migrations/20260415_006_financeiro.sql
supabase/migrations/20260415_007_relatorios_rpcs.sql
supabase/migrations/20260415_008_notificacoes.sql
supabase/migrations/20260415_009_agenda_rpc.sql
supabase/migrations/20260415_010_documentos.sql
supabase/migrations/20260415_011_configuracoes_avancadas.sql
```

## 4. Criar os buckets no Supabase Storage

No **Supabase Dashboard → Storage**:

1. **New bucket** → Nome: `documentos` → **Private** (public = false)
2. **New bucket** → Nome: `logos` → **Public** (public = true)

## 5. Criar a primeira empresa e usuário admin

Use o **SQL Editor** para inserir diretamente (bypassa RLS):

```sql
-- 1. Criar empresa
INSERT INTO empresas (nome, email) 
VALUES ('Fontinhas Assessoria', 'contato@fontinhas.com.br')
RETURNING id;

-- Anote o id retornado como {EMPRESA_ID}

-- 2. Crie o usuário no Dashboard → Authentication → Users → Invite user
-- Use o email: marciofontinhas1605@gmail.com

-- 3. Após o usuário aceitar o convite, vincule ao perfil admin:
INSERT INTO usuarios (id, empresa_id, nome, email, perfil, ativo)
SELECT 
  u.id,
  '{EMPRESA_ID}'::uuid,
  'Marcio Fontinhas',
  'marciofontinhas1605@gmail.com',
  'admin',
  true
FROM auth.users u
WHERE u.email = 'marciofontinhas1605@gmail.com';
```

## 6. Popular dados iniciais (fases, bancos)

Execute `supabase/seed.sql` no SQL Editor após descomentá-lo e substituir `{EMPRESA_ID}`.

## 7. Rodar o projeto

```bash
npm run dev
```

Acesse: [http://localhost:3000](http://localhost:3000)

O sistema redireciona para `/login`. Faça login com o usuário admin criado.

---

## Estrutura do Projeto

```
src/
├── app/
│   ├── (auth)/login/       # Página de login
│   └── (protected)/        # Rotas autenticadas
│       ├── layout.tsx       # Layout com Sidebar
│       ├── dashboard/
│       ├── leads/
│       ├── processos/
│       ├── financeiro/
│       ├── relatorios/
│       ├── notificacoes/
│       ├── agenda/
│       ├── documentos/
│       └── configuracoes/
├── components/
│   ├── layout/Sidebar.tsx
│   └── ui/                  # shadcn/ui components
├── hooks/
│   └── useUsuarioAtual.ts
└── lib/
    ├── supabase/
    │   ├── client.ts
    │   └── server.ts
    └── utils.ts
```

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Banco**: Supabase (PostgreSQL + Auth + Storage + Realtime)
- **UI**: Tailwind CSS + shadcn/ui
- **Estado servidor**: React Query v5
- **Gráficos**: Recharts
- **Datas**: date-fns
- **Drag & Drop**: @dnd-kit
