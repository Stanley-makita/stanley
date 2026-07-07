# Central de Notificações — Fonti

> Infraestrutura definitiva de notificações do Fonti: toast + histórico + realtime.
> Esta sprint cobriu Desktop + Toast + Central. Push mobile, e-mail, WhatsApp e IA
> são consumidores futuros do mesmo pipeline — não implementados aqui, só
> deixados prontos (ver seção "Preparado para o futuro" no final).

## Visão geral

A Central de Notificações **já existia** no Fonti (tabela `notificacoes`, RLS, triggers SQL
para 8 eventos de negócio, sino no Topbar, toasts via `sonner`, realtime). Esta sprint evoluiu
essa base existente — não recriou nada do zero — para virar uma infraestrutura genérica que
qualquer módulo futuro pode usar sem precisar de uma migration nova a cada tipo de notificação.

Fluxo completo, do disparo até a tela:

```
código da aplicação
      │
      ▼
NotificationService.notify({ usuarioId, tipo, titulo, ... })
      │
      ▼
RPC criar_notificacao()  (SECURITY DEFINER — só porta de INSERT)
      │
      ▼
INSERT INTO notificacoes
      │
      ▼
Supabase Realtime (canal por usuário, filtrado por usuario_id)
      │
      ▼
useNotificacoes() — hook React
      ├── evento INSERT  → toast.custom(<ToastNotificacao />) + invalida queries
      ├── evento UPDATE  → invalida queries (ex.: lida em outra aba)
      └── evento DELETE  → invalida queries (ex.: excluída em outra aba)
      │
      ▼
Badge do sino + Drawer (Sheet) + página /notificacoes
      (todos leem da mesma query ['notificacoes', usuarioId, limite])
```

Os triggers de negócio que já existiam (fase avançada, lead atribuído, processo emitido,
tarefas, solicitações) continuam funcionando exatamente como antes — eles inserem direto na
tabela via `SECURITY DEFINER`, sem passar pelo `NotificationService`. O serviço é a porta de
entrada só para notificações emitidas a partir de código de aplicação (Server Actions, Route
Handlers, futuros webhooks/crons).

## Toast vs. Central — o conceito

- **Toast**: notificação temporária, aparece no canto superior direito, desaparece sozinha
  (exceto severidade `critical`), só serve para chamar atenção no momento em que a notificação
  chega.
- **Central**: histórico permanente — o sino no Topbar (badge com contagem) abre um drawer
  lateral com todo o histórico, mesmo depois que o toast já sumiu. A página `/notificacoes`
  mostra o mesmo conteúdo em tela cheia.

## Arquivos criados

- `supabase/migrations/20260706_150_central_notificacoes.sql`
- `src/lib/notificacoes/notificationService.ts`
- `src/hooks/useExcluirNotificacao.ts`
- `src/components/notificacoes/ToastNotificacao.tsx`
- `src/components/notificacoes/CentralNotificacoesConteudo.tsx`

## Arquivos alterados

- `src/types/notificacoes.ts` — tipos, `Severidade`, `Prioridade`, `NOTIFICACAO_META`
- `src/hooks/useNotificacoes.tsx` — toast customizado, listeners UPDATE/DELETE (renomeado de
  `.ts` para `.tsx` por passar a conter JSX)
- `src/components/providers.tsx` — `visibleToasts={4}` no `<Toaster>`
- `src/components/layout/SinoNotificacoes.tsx` — dropdown → drawer (`Sheet`)
- `src/components/notificacoes/NotificacaoItem.tsx` — usa `NOTIFICACAO_META`, botão de excluir
- `src/app/(protected)/notificacoes/page.tsx` — usa `CentralNotificacoesConteudo`
- `tailwind.config.ts` — keyframe `fonti-toast-progress` (barra de progresso do toast)

## Arquivos removidos

- `src/components/notificacoes/ListaNotificacoes.tsx` — lógica absorvida por
  `CentralNotificacoesConteudo.tsx` (eliminou também uma divergência: este componente tinha
  sua própria função de navegação, incompleta, em vez de usar `resolverRotaNotificacao`)

## Como emitir uma notificação

```ts
import { notify } from '@/lib/notificacoes/notificationService'

await notify({
  usuarioId: lead.responsavel_id,
  tipo: 'lead_novo',
  titulo: 'Novo lead recebido',
  mensagem: lead.nome,
  entidade: 'lead',
  entidadeId: lead.id,
  origem: 'formulario-site',
})
```

- `severidade` e `prioridade` são opcionais — se omitidos, usam o padrão do tipo definido em
  `NOTIFICACAO_META` (`src/types/notificacoes.ts`).
- Em Server Actions / Route Handlers / futuros webhooks, passe um client server-side como
  segundo argumento:

```ts
import { createClient } from '@/lib/supabase/server'
import { notify } from '@/lib/notificacoes/notificationService'

const supabase = await createClient()
await notify({ usuarioId, tipo: 'ocr_concluido', titulo: 'OCR concluído' }, supabase)
```

- `notify()` nunca lança exceção — se a RPC falhar, loga o erro no console e retorna
  `{ id: null, error }`. Quem chamou não precisa (nem deve) tratar isso como um erro fatal do
  próprio fluxo de negócio.

## Como adicionar um novo tipo de notificação

Não precisa de nenhuma migration — `tipo` é `TEXT` na tabela desde `20260706_150`. Só:

1. Adicionar o literal em `TipoNotificacao` (`src/types/notificacoes.ts`).
2. Adicionar uma entrada em `NOTIFICACAO_META` com ícone (lucide-react), cor (classe Tailwind),
   `severidadePadrao`, `prioridadePadrao` e `label`.

O tipo novo aparece automaticamente no filtro de tipo da Central e já tem ícone/cor/duração de
toast prontos assim que algum módulo chamar `notify({ tipo: 'seu_tipo_novo', ... })`.

## Como conectar um módulo futuro

Exemplo hipotético: notificar quando um lead é criado a partir de um formulário público.

```ts
// dentro do Route Handler/Server Action que cria o lead
import { notify } from '@/lib/notificacoes/notificationService'
import { createClient } from '@/lib/supabase/server'

const supabase = await createClient()
const lead = await criarLead(dados)

if (lead.responsavel_id) {
  await notify({
    usuarioId: lead.responsavel_id,
    tipo: 'lead_novo',
    titulo: 'Novo lead recebido',
    mensagem: lead.nome,
    entidade: 'lead',
    entidadeId: lead.id,
    origem: 'formulario-site',
  }, supabase)
}
```

Nenhuma outra mudança de infraestrutura é necessária — o realtime, o toast, o badge e o drawer
já cobrem qualquer tipo novo automaticamente.

## Severidade vs. Prioridade

Duas dimensões independentes, propositalmente não acopladas:

- **Severidade** (`info | success | warning | error | critical`): controla o **estilo visual**
  do toast/item — ícone, cor, tempo de permanência. `critical` não fecha sozinho.
- **Prioridade** (`low | normal | high | critical`): **dado de negócio**, gravado na coluna
  `prioridade`, sem nenhum efeito visual nesta sprint. Existe para uso futuro em ordenação,
  filtros e IA (ex.: um agente de IA que precise decidir quais notificações resumir primeiro).
  Uma notificação `info` pode ser `prioridade: 'high'` (ex.: "novo lead" é informativo, mas
  prioritário) — as duas colunas não precisam concordar.

## Por que não há toast otimista no autor

`NotificationService.notify()` não mostra um toast local imediatamente após a chamada, mesmo
quando o autor da ação é o próprio destinatário. O canal Realtime já entrega o INSERT ao
destinatário (tipicamente em menos de 300ms), e mostrar dois toasts (um otimista + um vindo do
realtime refletindo o mesmo INSERT) causaria duplicidade visual. Essa é uma decisão deliberada —
não "corrigir" adicionando um toast local sem remover essa observação da documentação.

## Débito técnico consciente (não resolvido nesta sprint, de propósito)

- **Paginação/filtros da Central são em memória** (busca os últimos 200 registros e filtra no
  client). Funciona bem no volume atual; se o histórico por usuário crescer muito, vale migrar
  para paginação real (`range()` no Supabase) e considerar virtualização de lista (ex.
  `@tanstack/react-virtual` — mesma família do `@tanstack/react-query` já usado no projeto).
  Não foi adicionada nenhuma dependência nova nesta sprint sem necessidade comprovada.
- **`resolverRotaNotificacao` não tem deep-link para `entidade: 'solicitacao'`** — gap
  pré-existente, de negócio (não de infraestrutura), documentado no próprio código
  (`src/lib/notificacoes/navegarNotificacao.ts`). Não corrigido nesta sprint.
- **4 tipos de notificação "órfãos"** (`tarefa_vencida`, `cobranca_vencida`,
  `comentario_mencionado`, `solicitacao_sla_vencido`) já existiam antes desta sprint sem nenhum
  trigger/job que os dispare — provavelmente dependeriam de um cron/edge function ainda
  inexistente no projeto. Fora do escopo desta sprint (infraestrutura, não lógica de negócio).

## Preparado para o futuro (não implementado)

A coluna `origem` (de onde veio a notificação) e `dados_json` (payload livre) existem desde
esta sprint especificamente para consumidores futuros:

- **Push mobile**: `dados_json` pode carregar o payload específico do provedor de push.
- **E-mail / WhatsApp**: um futuro `origem: 'canal-email'`/`'canal-whatsapp'` e um listener
  adicional (fora do escopo desta sprint) poderiam decidir, a partir da mesma linha inserida em
  `notificacoes`, se também disparam um envio externo — sem duplicar a lógica de criação.
  `NotificationService.notify()` já é o único ponto de entrada onde esse dispatch entraria.
- **IA**: `prioridade` e `dados_json` são os campos pensados para um agente de IA priorizar/
  resumir notificações no futuro.
- **Auditoria**: a tabela `notificacoes` já registra `criado_em`/`origem`/`usuario_id` por
  linha — suficiente como trilha básica; uma tabela de auditoria dedicada, se necessária no
  futuro, é um esforço separado.

Nenhum destes itens tem código nesta sprint — são só decisões de schema/arquitetura que evitam
retrabalho quando alguém decidir implementá-los.
