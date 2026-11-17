# Valor total financiado (financiamento + custas) — design curto

Data: 2026-11-17 · Tamanho: mudança pequena · Liberação: staging primeiro, depois produção.

## Por quê
Pedido da equipe: quando o cliente financia as custas, o "valor financiado" que importa para ele e para o
banco é o **total** (financiamento + custas). Hoje as telas só mostram o financiamento do imóvel.

## Regra de negócio (do usuário)
- **Financiamento** = o que o banco paga ao **vendedor**. Base da entrada (imóvel − financiamento − FGTS).
- **Custas financiadas** = valor à parte, pago ao **comprador**; pode ficar dentro ou acima da cota de 80%
  conforme o banco. **Não mexe na entrada.**
- **Valor total financiado = financiamento + custas** (só quando "Vai financiar" e há valor de custas).

## Objetivos
1. Captação → Oportunidade: abaixo de "Valor Pretendido (financiado)" + "Financiar despesas", quadro calculado
   "Valor total financiado" (financiamento + custas), visível só quando vai financiar com valor informado.
2. Negócio → Dados do Negócio (EditarProcessoDrawer): o mesmo quadro, junto do bloco "Entrada (calculada
   automaticamente)". Vale também quando a decisão de financiar as custas acontece só no negócio.
3. Financeiro → Emissões: o valor da linha continua sendo o financiamento; negócio com custas financiadas ganha
   um ícone com dica ao passar o mouse: "Custas financiadas: R$ X · Total financiado: R$ Y". Total do rodapé
   segue somando só financiamento.
4. Uma única função de cálculo (`totalFinanciado(financiamento, financiarCustas, valorCustas)` em
   `src/lib/oportunidade/tipoEDespesas.ts`) usada em todos os pontos, inclusive o e-mail de Confirmar Valores,
   que hoje faz a conta por conta própria.

## Não-objetivos (ficam como estão)
- O campo gravado `valor_financiado` / `valor_pretendido` continua sendo **só o financiamento** — nada é
  gravado somado.
- Entrada/recursos próprios, comissão (por enquanto — decisão do usuário), relatórios de produção da equipe,
  Negócios → Emissões (só totais por banco/semana), formulários dos bancos (só marcam Sim/Não), simulador.
- Anti-objetivo: qualquer mudança que altere a entrada calculada ou some custas duas vezes no e-mail.

## Abordagens
- **A — calcular na tela (escolhida).** Os dados já existem (`valor_financiado`, `financiar_despesas_cartorariais`,
  `valor_despesas_financiadas`, em leads e processos — migration 351). Sem migration; staging e produção diferem
  só no deploy.
- B — coluna calculada no banco. Só compensa quando SQL (comissão por banco) precisar do total; descartada agora.

## Futuro (anotado, não fazer agora)
Opção por banco em Configurações > Bancos: "Comissão inclui custas financiadas: Sim/Não" (padrão do Indexador),
quando o usuário souber quais bancos pagam comissão sobre as custas. Aí a opção B pode voltar.

## Decisões minhas (corrigir se discordar)
- Resumo do Negócio (`processos/[id]/page.tsx`, já tem "Valor Financiado" e "Despesas financiadas"): ganha a linha
  "Valor total financiado" quando houver custas financiadas. Sidebar da Captação continua com o valor pretendido.
- "Vai financiar" sem valor de custas informado → quadro não aparece (não dá pra somar); a tela já mostra
  "valor não informado".
- Staging: testar via `npm run dev:teste` / Preview apontando para o Supabase de staging antes do merge.
