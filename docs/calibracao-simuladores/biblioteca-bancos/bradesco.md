# Banco: Bradesco

> Pesquisa realizada em 2026-07-06 via fontes públicas (sites oficiais Bradesco, PDFs institucionais e reportagens especializadas). Uso exclusivo para calibração aproximada do motor de simulação interno — não é aconselhamento jurídico nem garantia de que as condições estejam vigentes no momento da leitura. Condições de crédito mudam com frequência; sempre confirmar com simulador oficial antes de qualquer uso operacional.

## 1. Produtos encontrados

| Produto | Público | Fonte oficial |
|---|---|---|
| Aquisição de imóvel residencial (SFH/SFI, "Crédito Imobiliário") | PF | banco.bradesco/.../credito-imobiliario-aquisicao-de-imoveis.shtm |
| Aquisição de imóvel comercial | PF | mesma página, condições diferenciadas |
| Aquisição de lote urbano (terreno) | PF | banco.bradesco/.../credito-imobiliario-aquisicao-de-lote-urbano.shtm |
| Construção (terreno próprio / terreno + construção) | PF | banco.bradesco/.../credito-imobiliario-construcao.shtm |
| CDC Custas de Cartório | PF | banco.bradesco/.../imoveis/index.shtm |
| CDC Material de Construção | PF | idem |
| CDC Reforma/Condomínio | PF | idem |
| Credimóvel (Crédito com Garantia de Imóvel / Home Equity, imóvel quitado) | PF | banco.bradesco/.../credito-pessoal/credimovel.shtm |
| Credfácil Imóvel (variante de CGI, mencionada em fontes não oficiais) | PF/servidor público | não encontrado em página oficial dedicada — apenas citada em fontes de terceiros |
| Carteira Habitacional PJ (taxa de mercado) | PJ | banco.bradesco/.../pessoajuridica/.../aquisicao-de-imovel.shtm |
| Carteira Comercial Imobiliária (CHC) PJ | PJ | mesma página PJ |

Não encontrado em fonte pública: produto específico e nomeado "Financiamento PJ com garantia imobiliária" distinto da Carteira Habitacional/CHC PJ acima — pode ser a mesma coisa, mas não há confirmação textual disso.

## 2. Regras de LTV

- **Residencial PF (até R$ 2,25 milhões, linha SFH):** até 80% do valor de avaliação. Fonte: banco.bradesco/html/classic/.../credito-imobiliario-aquisicao-de-imoveis.shtm (oficial, confiança alta). Acesso 2026-07-06.
- **Residencial PF (acima de R$ 2,25 milhões, SFI):** também "até 80%" segundo a mesma página oficial — não há diferenciação explícita de LTV por faixa de valor nessa página (oficial, confiança média, pois o texto não distingue claramente as duas faixas de forma explícita no resumo extraído).
- **Comercial PF:** até 70% do valor de avaliação, prazo máximo diferente (ver seção 3). Fonte: mesma página oficial (alta).
- **Terreno/lote urbano PF:** até 70% do valor do terreno segundo a página oficial de lote urbano (banco.bradesco/.../credito-imobiliario-aquisicao-de-lote-urbano.shtm, alta). **Conflito de fonte:** uma busca (fonte não oficial, resumo de terceiros) mencionou "até 80%" tanto para lote até R$1,5 milhão (linha SFH) quanto acima (linha CHH) — isso contradiz o valor de 70% extraído diretamente da página oficial. Registrando o conflito sem resolver: página oficial diz 70%; fonte agregadora diz 80%. Prevalece o texto oficial (70%) com confiança alta; o dado de 80% fica com confiança baixa.
- **Construção (terreno próprio):** até 70% do custo total da construção (exclui mão de obra segundo o resumo). Fonte oficial banco.bradesco/.../credito-imobiliario-construcao.shtm (alta).
- **Credimóvel / CGI (Home Equity) PF, imóvel quitado:** até 60% do valor de avaliação do imóvel. Fonte oficial banco.bradesco/.../credimovel.shtm (alta). Fonte de terceiros (creditas.com/exponencial) confirma o mesmo teto de 60% (não oficial, mas convergente — confiança média/alta por convergência).
- **Carteira Habitacional PJ (taxa de mercado):** até 80% de financiamento (teto de imóvel R$ 5 milhões, financiamento máximo R$ 4 milhões). Fonte oficial banco.bradesco/.../pessoajuridica/.../aquisicao-de-imovel.shtm (alta).
- **Carteira Comercial Imobiliária (CHC) PJ:** até 60% de financiamento (mesmo teto de imóvel R$ 5 milhões, financiamento máximo R$ 3 milhões). Fonte oficial, mesma página (alta).

Não encontrado em fonte pública: LTV diferenciado explicitamente por sistema de amortização (SAC vs PRICE) — nenhuma fonte associou LTV diretamente ao sistema de amortização, apenas o comprometimento de renda muda (ver seção 5).

## 3. Prazos

- **Residencial PF:** até 35 anos (420 meses). Fonte oficial (alta), confirmado por reportagem de novembro/2025 sobre nova tabela de taxas (mbbrasilimoveis.com.br, não oficial mas cita dado do próprio banco — confiança média/alta por convergência).
- **Comercial PF:** até 20 anos. Fonte oficial banco.bradesco/.../credito-imobiliario-aquisicao-de-imoveis.shtm (alta).
- **Terreno/lote urbano PF:** até 20 anos ("até 20 anos para pagar"). Fonte oficial (alta). Parcela mínima a partir de R$ 200,00.
- **Construção PF:** mais de 25 anos ("acima de 25 anos" / página cita prazo longo, sem teto numérico exato capturado no resumo — recomenda-se conferir a página diretamente, pois o resumo do fetch não trouxe o número máximo exato). Grau de confiança médio quanto ao teto exato; confirma-se apenas "acima de 25 anos". Obra deve estar com no mínimo 30% concluída para contratação; conclusão da obra permitida em até 2 anos após a contratação; carência de até 2 meses antes da primeira parcela.
- **Credimóvel / CGI PF:** prazo mínimo 2 meses, prazo máximo 240 meses (20 anos). Fonte oficial (alta). Valor mínimo de operação: R$ 50.000.
- **Credfácil Imóvel (fonte não oficial, não confirmada em página institucional dedicada):** prazo até 120 meses (10 anos) — confiança baixa, produto não localizado em página oficial própria.
- **Carteira Habitacional PJ e CHC PJ:** ambas até 10 anos. Fonte oficial (alta).

## 4. Idade + prazo

- Regra específica do Bradesco (idade mínima) confirmada em fonte oficial: cliente deve ter 18 anos completos ou ser emancipado. Fonte oficial (alta).
- Regra de idade máxima / soma idade+prazo: **não encontrada em página oficial do Bradesco.** O que se encontrou foi uma regra setorial (SUSEP, Resolução CNSP nº 205), aplicável ao mercado como um todo, segundo a qual o contrato deve estar quitado até o segurado completar 80 anos e 6 meses (antes o limite era 75 anos). Fontes de terceiros (avozdoidoso.com.br, imobiliarianunes.com.br, koreimob.com.br — todas não oficiais) afirmam que "bancos como Bradesco, Itaú e Banco do Brasil" adotaram esse novo teto de 80 anos e 6 meses, mas nenhuma fonte oficial do Bradesco confirma isso nominalmente. **Marcado como hipótese não confirmada para o Bradesco especificamente:** idade + prazo ≤ 80 anos e 6 meses. Confiança baixa/média (regra setorial provável, mas sem confirmação direta em fonte oficial Bradesco).
- Não encontrado em fonte pública: regra de idade mínima/máxima específica para Credimóvel (CGI) ou para produtos PJ.

## 5. Comprometimento de renda

- **Residencial e Comercial PF (aquisição de imóvel), Construção PF e Lote Urbano PF:** consistentemente reportado como até 30% da renda líquida familiar quando pela tabela SAC, e até 15% quando pela tabela PRICE (TP). Fonte oficial, presente nas páginas de aquisição de imóveis, construção e lote urbano (banco.bradesco, alta confiança — dado repetido em três páginas oficiais diferentes).
- Não encontrado em fonte pública: comprometimento de renda explícito para Credimóvel (CGI) PF ou para os produtos PJ (Carteira Habitacional/CHC) — as páginas oficiais consultadas não mencionaram limite de comprometimento de renda para esses produtos.
- Fonte de terceiro (spimovel.com.br, não oficial) menciona que "o comprometimento de renda para a tabela SAC é limitado a 30%, enquanto na Price o banco pode ser mais flexível dependendo do score" — isso diverge ligeiramente do número fixo de 15% encontrado nas páginas oficiais para PRICE. **Conflito registrado:** oficial diz 15% fixo para PRICE; fonte de terceiro sugere que pode variar com o score. Confiança alta para o oficial (15%), baixa para a variação por score.

## 6. Taxas e indexadores

- **Residencial PF, linha TR:** 12,79% a.a. + TR, para operações contratadas a partir de 03/11/2025, segundo reportagem especializada (mbbrasilimoveis.com.br, citando dados do próprio Bradesco — não é página oficial do banco, mas reproduz tabela divulgada pelo banco; confiança média).
- **Comercial PF / lote urbano, linha TR:** 13,99% a.a. + TR, mesma vigência (03/11/2025). Fonte não oficial (mbbrasilimoveis.com.br), confiança média.
- **Residencial PF, linha Poupança:** existe modalidade "taxa fixa + remuneração da poupança (varia com a Selic)", segundo a mesma reportagem. Nenhuma taxa numérica específica foi capturada para essa linha nas fontes consultadas. Confiança baixa quanto ao número, média quanto à existência da modalidade.
- Outras fontes agregadoras (spimovel.com.br, myside.com.br, larya.com.br — todas não oficiais) citam faixas de 11,49% a 12,99% a.a. + TR, e uma "taxa efetiva com correção pela TR" de 13,49% a.a. e taxa "atrelada à poupança" de 13,99% a.a., além de taxa pré-fixada a partir de 13,5% a.a. para imóveis comerciais ou segunda residência. **Conflito relevante:** os números variam entre fontes de terceiros (11,49%–12,99% a.a. em uma fonte vs. 12,79% a.a. em outra vs. 13,49%/13,99% em outra ainda) — nenhuma dessas é a página oficial do banco com tabela de taxas vigente, e os números não são reconciliáveis com certeza. Todas de confiança baixa a média (nenhuma é fonte primária/oficial com tabela numerada). Recomenda-se, para uso real de calibração, extrair a taxa diretamente do simulador oficial do Bradesco (banco.bradesco/.../simuladores-imoveis.shtm) em tempo real, o que não foi feito nesta pesquisa (fora do escopo de fontes estáticas).
- **Diferenciação correntista vs. não correntista:** as páginas oficiais mencionam "taxas exclusivas para clientes correntista com conta e relacionamento" e a exigência de ser correntista Bradesco para contratar, mas nenhuma tabela numérica pública de taxa correntista vs. não correntista foi localizada. Não encontrado em fonte pública o valor exato do spread por relacionamento.
- **Credimóvel (CGI) PF:** taxa fixa, sem indexador, "a partir de 1,59% a.m." segundo página oficial (banco.bradesco/.../credimovel.shtm, alta confiança quanto à existência de taxa fixa sem indexador; a taxa mínima de 1,59% a.m. é o piso "a partir de", a taxa efetiva final depende da análise de crédito).
- **Credfácil Imóvel (fonte não oficial):** citada como 1,5% a.m. + IPCA — diverge do Credimóvel oficial (que é fixo, sem indexador). Não há confirmação oficial deste produto/taxa; confiança baixa.
- **Carteira Habitacional PJ e CHC PJ:** taxa de 15% a.a. para ambas, correção pelo índice mensal de remuneração básica da poupança (TR/poupança) aplicado à prestação. Fonte oficial (banco.bradesco/.../pessoajuridica/.../aquisicao-de-imovel.shtm, alta).
- **CET (Custo Efetivo Total) — exemplo oficial:** taxa de 9,5% a.a., plano SAC de 360 meses, resultando em CET de 10,43% a.a. Este é um exemplo ilustrativo divulgado pelo próprio banco na página institucional (banco.bradesco/.../imoveis/index.shtm, oficial, alta confiança quanto à existência do exemplo — não confundir com taxa vigente atual).

## 7. Seguros MIP/DFI

- **Obrigatoriedade:** Seguro habitacional obrigatório em todos os financiamentos imobiliários de aquisição, construção e lote urbano, cobrindo MIP (Morte e Invalidez Permanente) e DFI (Danos Físicos ao Imóvel), conforme normativa do Banco Central para instituições do SFH. Fonte oficial (páginas de aquisição, construção e lote urbano do banco.bradesco) e regra setorial (Bacen/SFH). Confiança alta.
- **Cobertura:** MIP cobre o saldo devedor; DFI cobre o valor de avaliação do imóvel — essa lógica geral (não exclusiva do Bradesco) foi confirmada por fonte de terceiro especializada (meutudo.com.br, não oficial, mas consistente com a prática do mercado — confiança média).
- **Cálculo do prêmio:** a página oficial de construção menciona que "o custo do seguro varia conforme a idade do proponente e o valor do imóvel" — confirma a lógica esperada (idade como fator de MIP, valor do imóvel como fator de DFI), mas sem tabela numérica pública de prêmios. Fonte oficial (banco.bradesco/.../credito-imobiliario-construcao.shtm), confiança alta quanto à existência da variável, baixa quanto a valores.
- **Apólice/seguradora:** Foi localizado um PDF institucional intitulado "Seguro Habitacional em Apólices de Mercado" (assets.bradesco/.../segurohabitacional.pdf, 29 páginas, oficial) que não pôde ser lido em texto pelo extrator disponível (arquivo binário/comprimido). O nome do documento sugere que o Bradesco permite contratação de "apólice de mercado" (ou seja, seguradora diferente da seguradora própria do banco) — mas o conteúdo detalhado (condições gerais, seguradora padrão, se é a Bradesco Seguros/BSP Seguros, cálculo de prêmio) não pôde ser confirmado por falta de extração de texto. **Recomenda-se releitura manual desse PDF** (baixado localmente durante esta pesquisa) para extrair as condições gerais completas.
- **Página institucional de resumo (Aquisição de Imóvel PF):** cita como seguradoras possíveis "Bradesco Seguros ou Companhia de Seguros Aliança do Brasil" — fonte oficial (banco.bradesco/.../credito-imobiliario-aquisicao-de-imoveis.shtm), confiança média (não é claro se há outras opções de mercado além dessas duas, nem se uma é padrão e a outra alternativa).
- **Credimóvel (CGI) PF:** segundo a página oficial, "não é necessário [seguro], pois essa modalidade de crédito não exige seguro obrigatório atualmente" — ou seja, ao contrário dos financiamentos SFH/SFI tradicionais, o CGI/Credimóvel do Bradesco não obriga contratação de seguro MIP/DFI. Fonte oficial (banco.bradesco/.../credimovel.shtm), confiança alta.
- Não encontrado em fonte pública: apólice SUSEP específica registrada para o produto habitacional do Bradesco (número de processo SUSEP), nem tabela de prêmio por faixa etária.

## 8. Tarifas

- **Tarifa de Avaliação (PF, aquisição/construção/lote):** cobrada e debitada em conta-corrente na assinatura do contrato ("Tarifa de Avaliação, Reavaliação e Substituição de Bens Recebidos em Garantia"). Fonte oficial (páginas de aquisição, construção e lote urbano). Valor citado por fonte de terceiro (spimovel.com.br, não oficial): em torno de R$ 3.500 — confiança baixa/média (não confirmado em página oficial com valor numérico).
- **Tarifa de Avaliação PJ (Carteira Habitacional/CHC):** R$ 2.800 segundo uma extração e R$ 3.100 segundo outra extração da mesma família de páginas institucionais PJ — **conflito interno entre duas páginas/fetches do próprio site oficial do Bradesco** (aquisicao-de-imovel.shtm em pessoajuridica/solucoes-integradas vs. pessoajuridica/solucoes-integradas/.../imoveis/aquisicao-de-imovel.shtm). Ambas classificadas como oficiais, mas com valores diferentes — pode ser desatualização de uma das páginas ou variação por segmento (Empresas e Negócios vs. Corporate, notando que há também uma versão "corporate" da mesma página: banco.bradesco/html/corporate/solucoes-integradas/emprestimo-e-financiamento/imoveis/aquisicao-de-imovel.shtm — não visitada nesta pesquisa). Confiança média para ambos os valores individualmente; conflito não resolvido.
- **Estudo de viabilidade (construção PF):** tarifa mencionada como debitada em conta-corrente, sem valor numérico público. Fonte oficial (construção PF), confiança alta quanto à existência, sem valor.
- **Registro em cartório / ITBI:** custos de registro do imóvel e ITBI mencionados em praticamente todas as páginas de produto como responsabilidade do cliente, calculados externamente pelo cartório/prefeitura — não são tarifas do banco. Fonte oficial (várias páginas), confiança alta.
- **Credimóvel (CGI) PF:** tarifa de avaliação do imóvel mencionada (sem valor numérico), custas de cartório para registro do contrato pagas diretamente ao cartório. Fonte oficial (banco.bradesco/.../credimovel.shtm), confiança alta quanto à existência, sem valores.
- Não encontrado em fonte pública: tarifa de administração mensal recorrente para nenhum produto — nenhuma página oficial menciona cobrança recorrente de "tarifa de administração" além do seguro habitacional embutido na parcela.

## 9. IOF

- **Financiamento imobiliário residencial (SFH/SFI) para pessoa física:** isento de IOF. Essa é uma regra geral do mercado (não exclusiva do Bradesco), confirmada por fontes especializadas de terceiros (credipronto.com.br, quintoandar.com.br, novaepoca.com.br — não oficiais, mas tecnicamente consistentes com a legislação de IOF vigente para financiamento habitacional). Confiança média-alta (regra setorial bem documentada, mas não há uma página oficial do Bradesco que declare textualmente "não cobramos IOF neste produto").
- **Seguros obrigatórios do SFH (MIP/DFI) vinculados a financiamento residencial de pessoa física:** também isentos de IOF, segundo a mesma lógica regulatória. Confiança média (fonte não oficial, mas consistente com a norma).
- **Aquisição de imóvel comercial (PF):** segundo a página oficial de aquisição de imóveis, "IOF applies" para a modalidade comercial (ao contrário da residencial) — fonte oficial (banco.bradesco/.../credito-imobiliario-aquisicao-de-imoveis.shtm), confiança média (o resumo extraído indicou a incidência, mas não trouxe a alíquota).
- **Lote urbano (terreno) PF:** a página oficial afirma explicitamente "Há incidência de IOF". Fonte oficial (banco.bradesco/.../credito-imobiliario-aquisicao-de-lote-urbano.shtm), confiança alta.
- **Pessoa jurídica / imóveis comerciais em geral:** segundo fonte de terceiro (spimovel.com.br, não oficial), aplicável alíquota de 0,38% + 0,0041% ao dia — esse é o IOF padrão de operações de crédito para PJ conforme legislação federal, não um dado específico do Bradesco. Confiança média (é a regra legal geral, plausivelmente aplicável, mas não confirmada em página oficial do Bradesco com este número).
- **Credimóvel (CGI) PF:** a página oficial lista "IOF" entre os custos do produto, sem detalhar alíquota ou regra de incidência. Fonte oficial (banco.bradesco/.../credimovel.shtm), confiança alta quanto à existência da cobrança, sem detalhe de alíquota.
- Não encontrado em fonte pública: confirmação explícita e numérica de alíquota de IOF para o Credimóvel/CGI do Bradesco (hipótese não confirmada: segue a alíquota padrão de operações de crédito não imobiliário residencial, 0,38% + 0,0041%/dia, por analogia à regra geral de crédito pessoal com garantia — não confirmado para este produto específico).

## 10. Restrições e elegibilidade

- **Idade mínima:** 18 anos completos ou emancipado, em todas as linhas PF verificadas (aquisição, construção, lote urbano). Fonte oficial, confiança alta.
- **Correntista:** exigência de ser correntista Bradesco aparece como requisito em várias páginas de produto PF (aquisição de imóvel) e é explícita para os produtos PJ (Carteira Habitacional/CHC exigem conta em Bradesco Empresas e Negócios; Credimóvel também exige ser correntista). Fonte oficial, confiança alta.
- **Composição de renda:** permitida apenas entre cônjuges ou casais em união estável, segundo página oficial de aquisição de imóvel. Fonte oficial, confiança alta. Não encontrado em fonte pública se essa restrição vale igualmente para comercial, construção e lote urbano (as páginas específicas desses produtos não repetiram a cláusula, mas também não a contradisseram).
- **Restrição de crédito:** exige-se ausência de restrições cadastrais (nome não pode estar negativado) — mencionado de forma geral, fonte oficial, confiança média-alta.
- **Tipos de imóvel aceitos:** urbanos, com infraestrutura completa (para lote/terreno e construção). Para o Credimóvel, tipos aceitos: casas, apartamentos, sobrados, flats e studios urbanos — o imóvel deve estar quitado e livre de ônus/dívidas. Fonte oficial, confiança alta.
- **Imóvel rural:** não encontrado em fonte pública nenhuma menção a financiamento de imóvel rural pelo Bradesco nas linhas de crédito imobiliário pesquisadas — presume-se fora do escopo dos produtos investigados (linhas SFH/SFI e CGI são tipicamente urbanas), mas isso não foi confirmado textualmente como "exclusão explícita" em nenhuma página; é apenas ausência de menção.
- **Construção — percentual mínimo de obra:** para contratação do crédito de construção PF, a obra precisa estar com pelo menos 30% concluída. Fonte oficial (banco.bradesco/.../credito-imobiliario-construcao.shtm), confiança alta. Para PJ (Carteira Habitacional/CHC), projetos de construção são aceitos se ≥30% concluídos também — mesma regra, fonte oficial PJ, confiança alta.
- **FGTS:** uso permitido para aquisição residencial, amortização e quitação de saldo devedor em imóveis residenciais e urbanos dentro do SFH (teto de valor de imóvel citado por fonte de terceiro como R$ 2,25 milhões em 2026 — não confirmado tal teto numérico atualizado diretamente em página oficial nesta pesquisa, mas é consistente com o teto histórico do SFH de R$ 2,25 milhões praticado desde 2024 pelas regras gerais do SFH/Bacen). FGTS não pode ser usado para imóvel comercial. Fonte oficial (página de aquisição PF menciona uso de FGTS restrito a residencial/urbano), confiança alta para a restrição comercial, média para o teto exato de valor.
- **Construção — limite de valor de obra concluída para uso de FGTS:** R$ 1.500.000, segundo página oficial de construção. Confiança alta.
- **PJ — área do imóvel:** deve estar em área urbana com infraestrutura completa; teto de valor de imóvel R$ 5 milhões para ambas as carteiras (Habitacional e CHC). Fonte oficial, confiança alta.
- Não encontrado em fonte pública: lista completa e explícita de tipos de imóveis "não aceitos" (ex.: se casas em condomínio fechado, imóveis em zona rural com uso misto, ou imóveis com pendência judicial têm exclusão expressa) — apenas requisitos positivos (área urbana, infraestrutura completa, quitado/sem ônus para CGI) foram encontrados.

## 11. Diferenças por produto

| Aspecto | Residencial PF | Comercial PF | Terreno/Lote PF | Construção PF | Credimóvel/CGI PF | Habitacional PJ | CHC PJ |
|---|---|---|---|---|---|---|---|
| LTV máx. | 80% | 70% | 70% (conflito: outra fonte diz 80%) | 70% do custo de obra | 60% do imóvel | 80% | 60% |
| Prazo máx. | 35 anos | 20 anos | 20 anos | >25 anos (teto exato não confirmado) | 240 meses (20 anos) | 10 anos | 10 anos |
| Seguro obrigatório | Sim (MIP+DFI) | Sim (MIP+DFI, presumido) | Sim (MIP, DFI não claramente citado) | Sim (MIP+DFI) | Não | Não confirmado | Não confirmado |
| Comprometimento de renda | 30% SAC / 15% PRICE | 30%/15% (presumido, mesma página) | 30%/15% | 30%/15% | Não encontrado | Não encontrado | Não encontrado |
| IOF | Isento | Incide | Incide | Não confirmado | Incide (alíquota não confirmada) | Não confirmado | Não confirmado |
| FGTS | Permitido | Não permitido | Não confirmado | Permitido (até R$1,5 mi de obra concluída) | Não aplicável | Não confirmado | Não confirmado |
| Exige correntista | Sim | Sim | Sim | Sim | Sim | Sim | Sim |

Observação: células "presumido" ou "não confirmado" indicam ausência de dado explícito na fonte para aquele produto específico — não foram inferidas como regra automática, apenas marcadas como lacuna.

## 12. Fontes consultadas

### Oficiais (banco.bradesco / assets.bradesco)
- https://banco.bradesco/html/classic/produtos-servicos/emprestimo-e-financiamento/imoveis/index.shtm — acesso 2026-07-06 — visão geral de produtos imobiliários, CET exemplo.
- https://banco.bradesco/html/classic/produtos-servicos/emprestimo-e-financiamento/credito-pessoal/credimovel.shtm — acesso 2026-07-06 — Credimóvel/CGI, LTV, prazo, taxa, seguro.
- https://banco.bradesco/html/pessoajuridica/solucoes-integradas/emprestimo-e-financiamento/aquisicao-de-imovel.shtm — acesso 2026-07-06 — aquisição PJ, LTV, taxa, tarifa avaliação (R$ 2.800).
- https://banco.bradesco/html/pessoajuridica/solucoes-integradas/emprestimo-e-financiamento/imoveis/aquisicao-de-imovel.shtm — acesso 2026-07-06 — mesma linha PJ, tarifa avaliação (R$ 3.100) — conflito de valor com a página anterior.
- https://banco.bradesco/html/classic/produtos-servicos/emprestimo-e-financiamento/imoveis/credito-imobiliario-aquisicao-de-imoveis.shtm — acesso 2026-07-06 — LTV/prazo residencial e comercial PF, seguradoras, IOF comercial.
- https://banco.bradesco/html/classic/produtos-servicos/emprestimo-e-financiamento/imoveis/credito-imobiliario-construcao.shtm — acesso 2026-07-06 — construção PF, LTV, comprometimento de renda, FGTS.
- https://banco.bradesco/html/classic/produtos-servicos/emprestimo-e-financiamento/imoveis/credito-imobiliario-aquisicao-de-lote-urbano.shtm — acesso 2026-07-06 — LTV, prazo, IOF, tarifas terreno.
- https://assets.bradesco/content/dam/portal-bradesco/assetsimov/classic/pdf/imoveis/cartilha-credito-imobiliario.pdf — acesso 2026-07-06 — Cartilha de Crédito Imobiliário; **não foi possível extrair texto** (PDF binário/comprimido não legível pelo extrator disponível). Recomenda-se releitura manual.
- https://assets.bradesco/content/dam/portal-bradesco/assets/common/pdf/imoveis/segurohabitacional.pdf — acesso 2026-07-06 — Seguro Habitacional em Apólices de Mercado (29 páginas); **não foi possível extrair texto** (mesmo motivo). Recomenda-se releitura manual.
- https://banco.bradesco/html/corporate/solucoes-integradas/emprestimo-e-financiamento/imoveis/aquisicao-de-imovel.shtm — listada em busca, **não visitada** nesta pesquisa (versão "corporate" da linha PJ, poderia esclarecer o conflito de tarifa de avaliação PJ).
- https://banco.bradesco/assets/exclusive/pdf/emprestimos-e-financiamentos/cartilha-credito-imobiliario.pdf — listada em busca, não visitada.
- https://banco.bradesco/assets/exclusive/pdf/emprestimos-e-financiamentos/CheckListDetalhadoLoteUrbanoPF.pdf — listada em busca ("Checklist Detalhado para Aquisição de Lote Urbano", versão 11/2015), não visitada — poderia conter lista de documentos exigidos.
- https://banco.bradesco/html/exclusive/produtos-servicos/emprestimo-e-financiamento/imoveis/credito-imobiliario-aquisicao-de-imoveis.shtm — listada em busca, não visitada (versão segmento Exclusive).
- https://banco.bradesco/html/prime/produtos-servicos/emprestimo-e-financiamento/imoveis/credito-imobiliario-aquisicao-de-lote-urbano.shtm — listada em busca, não visitada.
- https://banco.bradesco/html/exclusive/produtos-servicos/emprestimo-e-financiamento/encontre-seu-credito/simuladores-imoveis.shtm e a versão classic (.../encontre-seu-credito/simuladores-imoveis.shtm) — simuladores públicos, não acessados interativamente (fora do escopo de fetch estático).
- https://assets.bradesco/content/dam/portal-bradesco/assets/corporate/pdf/IOF.pdf — listada em busca ("IOF em operações de câmbio") — tema de câmbio, não diretamente aplicável a crédito imobiliário; não visitada em detalhe.

### Não oficiais (blogs, comparadores, imobiliárias) — usadas apenas como triangulação, nunca como fonte única
- https://www.spimovel.com.br/blog/quais-as-taxas-de-juros-do-bradesco-no-financiamento-imobiliario/3209/ — acesso 2026-07-06 — taxas, tarifa de avaliação (~R$3.500), IOF PJ/comercial (0,38%+0,0041%/dia).
- https://mbbrasilimoveis.com.br/artigo/9029/bradesco-reduz-taxas-de-juros-e-amplia-condicoes-do-financiamento-imobiliario — acesso 2026-07-06 — tabela de taxas vigente a partir de 03/11/2025 (12,79% e 13,99% a.a. + TR).
- https://www.selectimob.com.br/blog/financiamento-imobiliario-bradesco-guia/ — acesso 2026-07-06 — guia geral, não gerou dado novo aproveitável além do já capturado.
- https://larya.com.br/blog/como-funciona-o-financiamento-imobiliario-do-bradesco-2026/ — acesso 2026-07-06 — taxas gerais (11,49%–12,99% a.a. + TR), citado no conflito da seção 6.
- https://larya.com.br/blog/como-funciona-o-financiamento-imobiliario-do-bradesco/ — acesso 2026-07-06 — sem dado adicional relevante.
- https://larya.com.br/blog/como-funciona-o-financiamento-imobiliario-do-bradesco-2/ — acesso 2026-07-06 — regra de idade 80 anos e 6 meses (citada, não confirmada oficialmente para o Bradesco).
- https://larya.com.br/blog/home-equity-como-usar-seu-imovel-como-garantia-com-taxas-baixas/ — acesso 2026-07-06 — contexto geral de home equity, sem dado numérico específico do Bradesco além do já capturado.
- https://myside.com.br/guia-imoveis/taxa-juros-financiamento-imobiliario — acesso 2026-07-06 — comparação geral de taxas entre bancos.
- https://myside.com.br/guia-imoveis/taxa-juros-financiamento-imobiliario-bradesco — acesso 2026-07-06 — taxa efetiva 13,49% a.a. (TR) e 13,99% a.a. (poupança), citada no conflito da seção 6.
- https://www.moneytimes.com.br/refinanciamento-de-imovel-home-equity-credito-com-garantia-de-imovel-cresce-rapido-mesmo-sendo-pouco-conhecido-jcav/ — acesso 2026-07-06 — contexto de mercado sobre CGI/home equity, sem dado numérico específico Bradesco.
- https://conexaofinanceira.com.br/blog/emprestimo-com-garantia/home-equity-melhores-taxas/ — acesso 2026-07-06 — comparação entre bancos, sem detalhe adicional confiável sobre Bradesco.
- https://www.creditas.com/exponencial/emprestimo-com-garantia-de-imovel-bradesco/ — acesso 2026-07-06 — confirma teto de 60% LTV no Credimóvel (convergente com fonte oficial).
- https://www.compareemcasa.com.br/emprestimo-pessoal/bradesco/bradesco-emprestimo-com-garantia-de-imovel/ — acesso 2026-07-06 — sem dado numérico novo confiável.
- https://www.idinheiro.com.br/emprestimos/garantia/emprestimo-com-garantia-de-imovel-bradesco-conheca-o-credimovel/ — acesso 2026-07-06 — sem dado numérico novo confiável (fonte de terceiro, Credfácil Imóvel citado).
- https://www.creditas.com/exponencial/hipoteca-de-imovel-bradesco-emprestimo-com-garantia/ — listada em busca, não detalhada em profundidade.
- https://meutudo.com.br/blog/seguro-mip-e-dfi/ — acesso 2026-07-06 — explicação geral de MIP/DFI (não específica do Bradesco), usada apenas para confirmar a lógica geral de cobertura.
- https://www.reclameaqui.com.br/bradesco/financiamento-imobiliario_j3E46ridoOFF67i8/ — listada em busca, não utilizada como fonte de dado (reclamações de clientes, não normativa).
- https://www.reclameaqui.com.br/bradesco/seguro-contratado-junto-com-financiamento-de-imovel-e-nao-tem-apolice_ksz9lJEc5OQiLOu_/ — listada em busca, não utilizada como fonte de dado.
- https://www.mitrerealty.com.br/noticias/bradesco-reduz-taxas-de-juros-do-financiamento-imobiliario-e-amplia-condicoes — listada em busca, mesmo conteúdo da matéria de mbbrasilimoveis.com.br, não detalhada separadamente.
- https://publicidadeimobiliaria.com/bradesco-reduz-taxas-de-juros-do-financiamento-imobiliario/ — listada em busca, mesma matéria, não detalhada separadamente.
- https://altarendablog.com.br/2025/11/03/bradesco-reduz-juros-do-financiamento-imobiliario-em-2025-novas-taxas-e-condicoes-atualizadas/ — listada em busca, não visitada em detalhe (mesmo tema da matéria de novembro/2025).
- https://www.biasileiloes.com.br/blog/voce-sabia-que-existe-limite-de-idade-para-financiamento.html — acesso 2026-07-06 — contexto setorial sobre limite de idade, não específico do Bradesco.
- https://avozdoidoso.com.br/economia/idade-maxima-que-e-permitido-pegar-financiamento-no-brasil-depois-disso-o-cpf-sera-bloqueado/ — acesso 2026-07-06 — regra setorial de idade (80 anos e 6 meses), citando Bradesco entre os bancos que adotaram.
- https://koreimob.com.br/blog/idosos-financiamento-imobiliario-idade-maxima/ — acesso 2026-07-06 — mesmo tema, não oficial.
- https://www.imobiliarianunes.com.br/noticias/noticias-14/noticias-43/sobe-de-75-anos-para-80-anos-e-seis-meses-o-limite-de-idade-para-ter-um-financiamento-da-casa-propria-2488 — acesso 2026-07-06 — mesma regra setorial (CNSP/SUSEP), fonte de terceiro.
- https://portal.loft.com.br/quantos-anos-financiar-imovel/ — listada em busca, não detalhada.
- https://www.imobiligranja.com.br/blog/453/... e https://blog.imobiligranja.com.br/quero-comprar/... — listadas em busca, mesmo tema idade máxima, não detalhadas individualmente.
- https://www.credipronto.com.br/iof-no-financiamento-imobiliario/ — acesso 2026-07-06 — regra geral de IOF em financiamento imobiliário (isenção residencial PF), não específica do Bradesco.
- https://www.quintoandar.com.br/guias/como-comprar/iof-no-financiamento-imobiliario/ — acesso 2026-07-06 — mesma regra geral de IOF.
- https://www.novaepoca.com.br/iof-no-financiamento-imobiliario-entenda-melhor-sobre-esse-imposto-e-quando-ele-e-cobrado — acesso 2026-07-06 — mesma regra geral de IOF.
- https://www.cashme.com.br/blog/como-calcular-o-iof-sobre-emprestimos-aprenda-aqui/ — listada em busca, não detalhada (cálculo genérico de IOF sobre empréstimos, não específico a imóveis).
- https://www.bradescoseguros.com.br/clientes/produtos/outros-seguros/seguro-habitacional — listada em busca (página do Seguro Habitacional na Bradesco Seguros), **não visitada em detalhe nesta rodada** — recomenda-se visita futura para confirmar se a seguradora do produto habitacional é a própria Bradesco Seguros/BSP Seguros por padrão.
- https://www.imobili... (imobiligranja) — ver acima.

### Observação metodológica
Duas fontes primárias em PDF (Cartilha de Crédito Imobiliário e Seguro Habitacional em Apólices de Mercado) foram localizadas oficialmente, mas o extrator de conteúdo disponível nesta sessão não conseguiu decodificar o texto (PDFs com fluxo comprimido FlateDecode não renderizado). Os arquivos binários foram salvos localmente durante a pesquisa; recomenda-se reprocessá-los com uma ferramenta de extração de texto de PDF (ex.: pdftotext, PyPDF2) para obter os dados completos de tarifas, prêmios de seguro e condições gerais que não puderam ser lidos aqui.
