export const TEMPLATE_COMPRA_VENDA = {
  id: 'compra_venda',
  titulo: 'Compromisso de Venda e Compra',
  descricao: 'Contrato de compra e venda de imóvel com partes, valores e condições de pagamento.',
  conteudo: `<h2 style="text-align:center">INSTRUMENTO PARTICULAR DE COMPROMISSO DE VENDA E COMPRA</h2>

<p style="text-align:center">{{cidade_comarca}}, {{data_extenso}}</p>

<p>Pelo presente instrumento particular de compromisso de venda e compra, as partes abaixo qualificadas:</p>

<p><strong>VENDEDOR(A):</strong> {{vendedor_nome}}, {{vendedor_nacionalidade}}, {{vendedor_estado_civil}}, {{vendedor_profissao}}, portador(a) da CNH nº {{vendedor_cnh}}, RG nº {{vendedor_rg}}, CPF nº {{vendedor_cpf}}, residente e domiciliado(a) em {{vendedor_endereco}}, e-mail: {{vendedor_email}}.</p>

<p><strong>COMPRADOR(A):</strong> {{comprador_nome}}, {{comprador_nacionalidade}}, {{comprador_estado_civil}}, {{comprador_profissao}}, portador(a) da CNH nº {{comprador_cnh}}, RG nº {{comprador_rg}}, CPF nº {{comprador_cpf}}, residente e domiciliado(a) em {{comprador_endereco}}, e-mail: {{comprador_email}}.</p>

<p>Têm entre si justo e acertado o presente compromisso de venda e compra do imóvel abaixo descrito, mediante as cláusulas e condições seguintes:</p>

<h3>CLÁUSULA 1ª — DO OBJETO</h3>

<p>O(A) VENDEDOR(A) compromete-se a vender ao(à) COMPRADOR(A) o seguinte imóvel: {{imovel_descricao_completa}}, com matrícula nº {{imovel_matricula}} no {{imovel_cartorio}}, situado em {{imovel_endereco}}, com área de {{imovel_area}}, inscrito na Prefeitura sob nº {{imovel_cadastro_prefeitura}}.</p>

<h3>CLÁUSULA 2ª — DO PREÇO E FORMA DE PAGAMENTO</h3>

<p>O preço total da compra e venda é de {{valor_total}} ({{valor_total_extenso}}), pago da seguinte forma:</p>

<p><strong>a) Entrada:</strong> {{valor_entrada}} ({{valor_entrada_extenso}}), pago neste ato.</p>

<p><strong>b) Financiamento:</strong> {{valor_financiado}} ({{valor_financiado_extenso}}), a ser financiado junto ao {{banco_financiador}}, mediante crédito imobiliário, cujo saldo devedor será assumido pelo(a) COMPRADOR(A).</p>

<p>Os dados bancários para transferência são: Banco {{conta_banco}}, Agência {{agencia}}, Conta corrente em nome de {{titular_conta}}.</p>

<h3>CLÁUSULA 3ª — DA POSSE E ENTREGA DO BEM</h3>

<p>A posse do imóvel será transferida ao(à) COMPRADOR(A) em {{data_posse}}, mediante a assinatura da escritura definitiva de compra e venda e quitação integral do preço.</p>

<h3>CLÁUSULA 4ª — DA CORRETAGEM</h3>

<p>A corretagem foi intermediada pelo(a) corretor(a) {{corretor_nome}}, CPF {{corretor_cpf}}, CRECI nº {{corretor_creci}}, no valor de {{valor_comissao}} ({{valor_comissao_extenso}}), de responsabilidade do(a) VENDEDOR(A).</p>

<h3>CLÁUSULA 5ª — DAS DISPOSIÇÕES GERAIS</h3>

<p>As partes elegem o foro da Comarca de {{cidade_comarca}} para dirimir quaisquer dúvidas oriundas do presente instrumento, com exclusão de qualquer outro, por mais privilegiado que seja.</p>

<p>E, por estarem justas e acertadas, as partes assinam o presente instrumento em duas vias de igual teor e forma, na presença das testemunhas abaixo.</p>

<br/><br/>

<p style="text-align:center">{{cidade_comarca}}, {{data_extenso}}</p>

<br/><br/>

<p>________________________________________<br/>
<strong>{{vendedor_nome}}</strong><br/>
CPF: {{vendedor_cpf}}<br/>
VENDEDOR(A)</p>

<br/>

<p>________________________________________<br/>
<strong>{{comprador_nome}}</strong><br/>
CPF: {{comprador_cpf}}<br/>
COMPRADOR(A)</p>

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
