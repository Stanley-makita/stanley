export const TEMPLATE_COMPRA_VENDA = {
  id: 'compra_venda',
  titulo: 'Compromisso de Venda e Compra',
  descricao: 'Contrato de compra e venda de imóvel com partes, valores e condições de pagamento.',
  conteudo: `<p style="text-align:center">{{cidade_comarca}}, {{data_extenso}}</p>

<p>Pelo presente instrumento particular, regido pelas disposições dos artigos 481 a 504 do Código Civil Brasileiro e demais legislações pertinentes, as partes abaixo qualificadas reduzem a termo o compromisso de venda e compra do imóvel adiante descrito:</p>

<p><strong>COMPROMITENTE VENDEDOR(A):</strong> {{vendedor_nome}}, {{vendedor_nacionalidade}}, {{vendedor_estado_civil}}{{vendedor_conjuge}}, {{vendedor_profissao}}, portador(a) da CNH nº {{vendedor_cnh}}, RG nº {{vendedor_rg}}, CPF nº {{vendedor_cpf}}, residente e domiciliado(a) em {{vendedor_endereco}}, e-mail: {{vendedor_email}}.</p>

<p><strong>COMPROMISSÁRIO(A) COMPRADOR(A):</strong> {{comprador_nome}}, {{comprador_nacionalidade}}, {{comprador_estado_civil}}{{comprador_conjuge}}, {{comprador_profissao}}, portador(a) da CNH nº {{comprador_cnh}}, RG nº {{comprador_rg}}, CPF nº {{comprador_cpf}}, residente e domiciliado(a) em {{comprador_endereco}}, e-mail: {{comprador_email}}.</p>

<p>Têm entre si justo e acertado o presente compromisso de venda e compra, mediante as cláusulas e condições seguintes:</p>

<h3>CLÁUSULA PRIMEIRA — DO OBJETO</h3>

<p>O(A) COMPROMITENTE VENDEDOR(A) é senhor(a) e legítimo(a) proprietário(a), por força da matrícula nº {{imovel_matricula}} do {{imovel_cartorio}}, do imóvel constituído por {{imovel_descricao_completa}}, situado em {{imovel_endereco}}, com área de {{imovel_area}}, inscrito na Prefeitura Municipal sob nº {{imovel_cadastro_prefeitura}}, e compromete-se a vendê-lo ao(à) COMPROMISSÁRIO(A) COMPRADOR(A), livre e desembaraçado de quaisquer ônus, dívidas ou ações reais e pessoais reipersecutórias, exceto os expressamente informados neste instrumento.</p>

<h3>CLÁUSULA SEGUNDA — DO PREÇO E FORMA DE PAGAMENTO</h3>

<p>O preço certo e ajustado da presente venda e compra é de {{valor_total}} ({{valor_total_extenso}}), a ser pago da seguinte forma:</p>

<p><strong>a) Entrada:</strong> {{valor_entrada}} ({{valor_entrada_extenso}}), pagos neste ato, como sinal e princípio de pagamento.</p>

<p><strong>b) Saldo/Financiamento:</strong> {{valor_financiado}} ({{valor_financiado_extenso}}), a ser quitado junto ao {{banco_financiador}}, mediante crédito imobiliário, cujo saldo devedor será assumido integralmente pelo(a) COMPROMISSÁRIO(A) COMPRADOR(A).</p>

{{clausula_pagamento_observacoes}}

<p>Os dados bancários para eventual transferência são: Banco {{conta_banco}}, Agência {{agencia}}, em nome de {{titular_conta}}.</p>

<h3>CLÁUSULA TERCEIRA — DO INADIMPLEMENTO</h3>

<p>Havendo o descumprimento pelas partes das obrigações elencadas neste instrumento, incidirá sobre o débito inadimplido correção monetária apurada pela variação do IGP-M (FGV), juros de mora de 1% (um por cento) ao mês, além de multa de 2% (dois por cento) sobre o débito inadimplido. Persistindo a inadimplência por mais de 30 (trinta) dias, salvo expressa convenção em contrário, dar-se-á por rescindido de pleno direito o presente instrumento, ficando a parte que der causa constituída em mora e sujeita à sanção penal inerente à rescisão contratual, independentemente de notificação ou interpelação judicial ou extrajudicial.</p>

<h3>CLÁUSULA QUARTA — DA SANÇÃO PENAL</h3>

<p>A parte que, por inadimplência ou desistência das obrigações avençadas, der causa à rescisão contratual, ficará sujeita à multa contratual equivalente a 10% (dez por cento) sobre o valor desta tratativa, sem prejuízo das perdas e danos que a parte infratora causar à parte inocente, bem como custas, emolumentos, comissão de corretagem e demais despesas judiciais e extrajudiciais, além de honorários advocatícios relativos à sucumbência.</p>

<h3>CLÁUSULA QUINTA — DA ESCRITURA</h3>

<p>A escritura pública de venda e compra em favor do(a) COMPROMISSÁRIO(A) COMPRADOR(A) será outorgada no ato da integralização do preço desta avença, correndo as despesas de escrituração por conta exclusiva do(a) COMPROMISSÁRIO(A) COMPRADOR(A).</p>

<h3>CLÁUSULA SEXTA — DA POSSE</h3>

<p>O(A) COMPROMISSÁRIO(A) COMPRADOR(A) ficará imitido(a) na posse do imóvel em {{data_posse}}, mediante a assinatura da escritura pública de venda e compra e quitação integral do preço, ocasião em que o(a) COMPROMITENTE VENDEDOR(A) entregará o imóvel tal como vendido e vistoriado pelo(a) comprador(a), respondendo civil e criminalmente pelas obrigações assumidas.</p>

<h3>CLÁUSULA SÉTIMA — DA INEXISTÊNCIA DE DÍVIDAS E ÔNUS</h3>

<p>A presente transação é realizada inteiramente livre e desembaraçada de quaisquer dívidas, dúvidas e ônus reais, responsabilizando-se o(a) COMPROMITENTE VENDEDOR(A) por quaisquer dívidas disso decorrentes, obrigando-se o(a) mesmo(a) a comprovar tal disponibilidade quando solicitado(a) para tanto.</p>

<h3>CLÁUSULA OITAVA — DOS TRIBUTOS E ENCARGOS</h3>

<p>Os débitos de IPTU, energia elétrica, água/saneamento, condomínio e demais tributos incidentes sobre o imóvel, vencidos até a data da posse, serão pagos pelo(a) COMPROMITENTE VENDEDOR(A) de forma integral; os vincendos a partir da posse serão pagos pelo(a) COMPROMISSÁRIO(A) COMPRADOR(A) diretamente ao órgão credor, ainda que lançados em nome do(a) vendedor(a).</p>

<h3>CLÁUSULA NONA — DA SUCESSÃO</h3>

<p>Os direitos, vantagens e obrigações decorrentes deste instrumento obrigam não só as partes contratantes, como também seus herdeiros e sucessores legais.</p>

<h3>CLÁUSULA DÉCIMA — DA IRREVOGABILIDADE</h3>

<p>O presente compromisso é firmado em caráter irrevogável e irretratável, desde que cumpridas as obrigações contratuais acima estipuladas, ficando facultado ao(à) COMPROMISSÁRIO(A) COMPRADOR(A), em caso de recusa ou impedimento da outorga da escritura, exigir a adjudicação compulsória do imóvel nos termos da Lei nº 649, de 11 de março de 1949, ou o que for de direito; podendo, todavia, o(a) COMPROMITENTE VENDEDOR(A) considerá-lo rescindido caso o(a) comprador(a) não cumpra o pagamento do saldo devedor pactuado na Cláusula Segunda, no prazo e forma convencionados, perdendo, nesta hipótese, os direitos adquiridos por força deste contrato.</p>

<h3>CLÁUSULA DÉCIMA PRIMEIRA — DA BOA-FÉ</h3>

<p>As partes firmam o presente instrumento em condições de igualdade, pautando-se nos princípios da probidade e boa-fé, conforme o artigo 422 do Código Civil Brasileiro, não podendo qualquer delas alegar desconhecimento, vício, dolo, coação ou má-fé, uma vez que o instrumento foi redigido pela empresa contratada FONTINHAS ASSESSORIA, conforme vontade mútua das partes, não tendo a respectiva empresa qualquer responsabilidade quanto à negociação havida entre elas.</p>

<h3>CLÁUSULA DÉCIMA SEGUNDA — DA INEXISTÊNCIA DE ÔNUS</h3>

<p>O(A) COMPROMITENTE VENDEDOR(A) declara, sob pena de responsabilidade civil e penal, que inexistem quaisquer ônus, ações reais ou pessoais reipersecutórias relativas ao imóvel objeto deste instrumento, exceto aqueles expressamente informados nesta avença.</p>

<h3>CLÁUSULA DÉCIMA TERCEIRA — DAS CERTIDÕES</h3>

<p>Foram apresentadas pelo(a) COMPROMITENTE VENDEDOR(A) as certidões de praxe relativas à sua pessoa e ao imóvel, nos termos da Lei nº 7.433, de 18 de dezembro de 1985, cuja relação e teor deverão ser conferidos pelas partes antes da assinatura definitiva: {{lista_certidoes}}. Fica desde já ciente o(a) COMPROMISSÁRIO(A) COMPRADOR(A) da importância desses documentos para a segurança do ato jurídico, sendo de responsabilidade do(a) COMPROMITENTE VENDEDOR(A) quaisquer ações judiciais que possam existir em seu nome ou sobre o imóvel objeto deste instrumento e que venham a causar risco à presente transação.</p>

<h3>CLÁUSULA DÉCIMA QUARTA — DA CORRETAGEM</h3>

<p>A corretagem foi intermediada pelo(a) corretor(a) {{corretor_nome}}, CPF nº {{corretor_cpf}}, CRECI nº {{corretor_creci}}, no valor de {{valor_comissao}} ({{valor_comissao_extenso}}), de responsabilidade do(a) COMPROMITENTE VENDEDOR(A).</p>

<h3>CLÁUSULA DÉCIMA QUINTA — DA PROTEÇÃO DE DADOS</h3>

<p>De acordo com a Lei Geral de Proteção de Dados (Lei nº 13.709/18), as partes declaram concordar que os dados fornecidos serão acessados, utilizados e tratados, eletrônica e manualmente, com a finalidade exclusiva de atingir o objeto da presente contratação, permanecendo armazenados até o encerramento das obrigações contratuais, observada toda a legislação aplicável sobre privacidade e proteção de dados.</p>

<h3>CLÁUSULA DÉCIMA SEXTA — DO FORO</h3>

<p>As partes elegem o foro da Comarca de {{cidade_comarca}} para dirimir quaisquer dúvidas oriundas do presente instrumento, com exclusão de qualquer outro, por mais privilegiado que seja.</p>

<p>E, por estarem justas e acertadas, as partes assinam o presente instrumento em duas vias de igual teor e forma, na presença das testemunhas abaixo, podendo as assinaturas ser de forma física ou por meio digital.</p>

<br/><br/>

<p style="text-align:center">{{cidade_comarca}}, {{data_extenso}}</p>

<br/><br/>

<p>________________________________________<br/>
<strong>{{vendedor_nome}}</strong><br/>
CPF: {{vendedor_cpf}}<br/>
COMPROMITENTE VENDEDOR(A)</p>

<br/>

<p>________________________________________<br/>
<strong>{{comprador_nome}}</strong><br/>
CPF: {{comprador_cpf}}<br/>
COMPROMISSÁRIO(A) COMPRADOR(A)</p>

<br/>

<p>Testemunhas:<br/><br/>
1. ________________________________________<br/>
Nome: [A PREENCHER]<br/>
CPF: [A PREENCHER]<br/><br/>
2. ________________________________________<br/>
Nome: [A PREENCHER]<br/>
CPF: [A PREENCHER]</p>
`,
}
