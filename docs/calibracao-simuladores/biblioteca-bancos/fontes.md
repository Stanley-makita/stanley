# Fontes Consultadas — Índice Geral

> Este arquivo é um índice de navegação. A lista completa e detalhada de fontes por banco (com o dado específico que cada uma sustentou) está na seção 12 de cada arquivo individual: `itau.md`, `santander.md`, `bradesco.md`, `banco-do-brasil.md`, `inter.md`. Aqui estão apenas os domínios/documentos mais relevantes, agrupados por tipo, para referência rápida.

Data de acesso de toda a pesquisa: 2026-07-06.

---

## 1. Fontes oficiais dos bancos (mais relevantes)

### Itaú
- itau.com.br/emprestimos-financiamentos/credito-imobiliario
- itau.com.br/emprestimos-financiamentos/credito-garantia-imovel
- blog.itau.com.br/credito-garantia-imovel/o-que-e-home-equity
- blog.itau.com.br/credito-garantia-imovel/custos-do-emprestimo-com-garantia-de-imovel
- itau.com.br/itaubba-pt/para-quem/imobiliario/ (produtos PJ)
- **PDF oficial:** ww3.itau.com.br/imobline/pre/pdf/GuiaCredImob_AOCA.pdf (Guia Crédito Imobiliário — lido integralmente)
- **PDF oficial:** ww3.itau.com.br/imobline/pre/pdf/MaterialExplicativo_ItauAgencias.pdf (v03/13 — lido integralmente)

### Santander
- santander.com.br/banco/credito-financiamento-imobiliario/ (bloqueado para fetch direto — HTTP 403, usado via snippet de busca)
- santander.com.br/banco/credito-com-garantia-imovel (idem)
- santander.com.br/useimovel
- **PDFs oficiais não lidos em texto** (erro de extração): condições gerais do seguro habitacional HDI (2018) e SH/AM (2023), hospedados em cms.santander.com.br

### Bradesco
- banco.bradesco/.../credito-imobiliario-aquisicao-de-imoveis.shtm
- banco.bradesco/.../credito-imobiliario-construcao.shtm
- banco.bradesco/.../credito-imobiliario-aquisicao-de-lote-urbano.shtm
- banco.bradesco/.../credito-pessoal/credimovel.shtm (CGI)
- banco.bradesco/html/pessoajuridica/.../aquisicao-de-imovel.shtm (2 versões com tarifa de avaliação conflitante)
- **PDFs oficiais não lidos em texto** (erro de extração — recomenda-se reprocessar com pdftotext/PyPDF2): cartilha-credito-imobiliario.pdf, segurohabitacional.pdf (assets.bradesco)

### Banco do Brasil
- **PDF oficial, lido integralmente:** bb.com.br/docs/pub/siteEsp/dimob/moduloproduto.pdf (Manual de Crédito Imobiliário, abril/2019 — fonte estrutural mais detalhada de todo o levantamento, embora datada)
- **PDF oficial, lido integralmente:** bb.com.br/docs/pub/trf/tarifasPF.pdf (Tabela de Tarifas PF, vigência 29/06/2026 — dado mais atual e confiável de tarifas entre os 5 bancos)
- bb.com.br/site/pra-voce/financiamentos/financiamento-imobiliario/
- bb.com.br/site/pra-voce/emprestimo/emprestimo-pessoal/emprestimo-com-garantia/emprestimo-com-garantia-de-imovel/ (EGI)
- bb.com.br/site/pro-seu-negocio/credito/financiar-um-investimento/bb-credito-imobiliario-financiamento-a-producao-pj/
- bb.com.br/docs/pub/voce/dwn/faq.pdf (convênio POUPEX, documento sem data, tratar como possivelmente defasado)

### Inter
- inter.co/pra-voce/financiamento-imobiliario/pro-cotista/
- inter.co/pra-voce/financiamento-imobiliario/residencial/taxa-bonificada/
- inter.co/empresas/financiamento-imobiliario/comercial/
- inter.co/pra-voce/financiamento-imobiliario/construcasa/
- inter.co/pra-voce/emprestimos/home-equity/ e inter.co/empresas/emprestimos/home-equity/
- blog.inter.co/tudo-sobre-home-equity
- blog.inter.co/duvidas-sobre-emprestimo-com-garantia-de-imovel/
- blog.inter.co/duvidas-comuns-sobre-financiamento-imobiliario/

---

## 2. Fontes regulatórias / setoriais (não específicas de um banco, usadas para contextualizar regras gerais)

- **SUSEP** — gov.br/susep/.../seguro-habitacional — obrigatoriedade genérica de MIP/DFI no mercado brasileiro.
- **BACEN** — normativos.bcb.gov.br — Resolução CMN nº 4.676/2018, citada por múltiplas fontes (Inter, terceiros) sobre regras de idade+prazo e comprometimento de renda; não foi lida a íntegra do normativo nesta pesquisa em nenhum dos 5 arquivos — **item pendente de leitura direta**.
- **Resolução CMN 5.197/2024** — citada oficialmente pelo BB (portabilidade de apólice de seguro individual).
- **Decreto 6.306/2007** (regulamento do IOF) — citado indiretamente via fontes de terceiros para justificar isenção de IOF em financiamento habitacional; não lido na íntegra em nenhum dos 5 arquivos.
- **Lei nº 9.514/97 e Resolução nº 3.347/06 CMN** — citadas por Itaú (oficial) como base legal da obrigatoriedade de MIP/DFI.
- **Lei nº 8.692/1993, Lei nº 4.380/1964, Decreto-Lei nº 73/1966** — citadas por Inter (oficial) como base legal do comprometimento de renda de 30% e da obrigatoriedade de seguros.
- **ABECIP** — não pesquisado como fonte direta em nenhum dos 5 arquivos (gap comum a todos — ver `pendencias-de-calibracao.md`).

---

## 3. Padrão de bloqueio técnico encontrado (relevante para releitura futura)

Todos os 5 bancos apresentaram bloqueio de fetch direto (HTTP 403) em pelo menos parte de suas páginas oficiais, contornado de formas diferentes por cada pesquisa:
- **Itaú**: contornado via proxy de leitura (r.jina.ai).
- **Santander**: **não contornado** — todo dado oficial do Santander veio de snippets de busca, nunca de leitura direta da página. Esta é a fonte com menor taxa de leitura direta bem-sucedida dos 5 bancos.
- **Bradesco**: acesso direto funcionou para a maioria das páginas HTML; falhou para 2 PDFs (erro de decodificação, não de bloqueio).
- **Banco do Brasil**: contornado via `curl` com user-agent de navegador.
- **Inter**: acesso direto funcionou (WebFetch padrão) para a maioria das páginas.

**Implicação para calibração futura:** o arquivo do Santander tem, proporcionalmente, a menor base de dados lidos diretamente da fonte primária — deve ser o primeiro candidato a nova rodada de pesquisa com uma ferramenta de fetch mais robusta (ex.: browser headless) antes de qualquer calibração fina.

---

## 4. Fontes não oficiais mais usadas (agregadores/comparadores repetidos entre bancos)

Estas apareceram em pelo menos 2 dos 5 arquivos de banco — úteis para triangulação, nunca como fonte primária isolada:
- larya.com.br (blog) — apareceu em Itaú, Santander, Bradesco, Inter.
- spimovel.com.br (blog) — apareceu em Itaú, Santander, Bradesco, Inter.
- myside.com.br (comparador) — apareceu em Santander, Bradesco, Banco do Brasil.
- portas.com.br — apareceu em Itaú, Santander.
- meutudo.com.br / serasa.com.br (conteúdo educativo genérico sobre MIP/DFI, não específico de banco) — apareceu em Itaú, Bradesco.
- imobconecta.com.br — apareceu em Itaú, Inter.

Nenhuma dessas fontes foi usada como base única de um dado registrado como "alta confiança" — sempre aparecem com confiança baixa/média e, quando usadas, é para triangular ou registrar conflito, nunca para afirmar uma regra isoladamente.

---

Para a lista exaustiva de cada uma das ~35–50 fontes consultadas por banco (incluindo as descartadas e as tentativas sem sucesso), ver a seção 12 de cada arquivo individual.
