# Geração de contratos: tempo de resposta e fidelidade

## Problema observado

A rota de entendimento excedeu 120 segundos em produção, no negócio #proc-067. A hospedagem devolveu HTTP 504 em texto e o cliente tentou interpretar a resposta como JSON, escondendo o timeout. Cláudia e Marcio estavam ativos na mesma empresa, com IDs de autenticação coerentes; não foi comprovado bloqueio exclusivo do jurídico.

O fluxo também fazia uma chamada de IA só para listar cláusulas e podia substituir uma redação reprovada por um modelo incompleto. A redação não recebia o modelo completo. O validador interpretava a menção a testemunhas no fechamento como início das assinaturas, rejeitando documentos completos.

## Alterações locais

- Plano determinístico extraído do modelo: geração passa de três/quatro chamadas de IA para duas, sem correção automática oculta.
- Esforço medium explícito no mesmo modelo de IA, timeout de 75 segundos por chamada e retries do SDK desativados. As rotas devolvem JSON antes do teto de 120 segundos e registram etapa, duração e status, sem conteúdo dos documentos.
- Respostas HTTP em texto/HTML, sessão expirada, acesso negado e falhas de validação recebem mensagens próprias.
- Modelo completo versionado enviado à redação. Suplemento de financiamento baseado no contrato Carolina e Bruna (Wagner), sem dados pessoais do negócio anterior. Não há busca automática nos 1.500 arquivos.
- Cláusula de inadimplemento protegida: multa de atraso de 2% não se confunde com multa rescisória. Mantida a base rescisória já existente no sistema; não houve decisão de padronizar todo o acervo juridicamente.
- Condição de posse confirmada inserida literalmente; conferência de cláusulas obrigatórias, e-mails, entrada, financiamento, cadastro imobiliário e valores dos intermediadores.
- Resumo validado por esquema, com e-mails, data de casamento e múltiplos intermediadores.
- Falha de redação ou conferência não devolve fallback nem salva uma minuta substituta. Pendências identificadas ficam visíveis para revisão.
- Interface mostra a etapa atual, preserva instruções e oferece nova tentativa. Alteração de instruções, tipo ou lista de anexos invalida o reaproveitamento do resumo na tentativa de redação. Gravações verificam a linha afetada.

## Validação

- 53 testes do módulo passaram: `node node_modules/vitest/vitest.mjs run --dir src src/lib/contratos`.
- Checagem TypeScript do código ativo (`src` e `next-env.d.ts`) sem erros. O comando global inclui uma cópia antiga em `output/relatorios-producao`, com erros próprios; essa cópia não foi modificada.
- Teste real com dados fictícios, sem gravação no banco: entendimento 22,5 segundos, redação/conferência 37,5 segundos, total aproximado de 60 segundos. Dois compradores, dois intermediadores, e-mails e comissões conferidos. Dados deliberadamente ausentes viraram pendências. Não é medição com anexos de produção nem garantia de latência.
- ESLint não executou por ausência de configuração no repositório. A conexão do navegador de verificação expirou; não foi feita validação visual da interface.

## Limites e publicação

Alterações locais, sem deploy, migrations ou mudança de permissões. A geração ainda é síncrona em duas etapas, com prazo e erro controlados; não foi implantada fila de trabalhos. Não estão incluídas curadoria/indexação de todo o acervo, seleção de variantes aprovadas pela advogada nem exportação Word preservando o arquivo original. As conferências objetivas não substituem revisão jurídica nem garantem equivalência semântica de todos os trechos variáveis.
