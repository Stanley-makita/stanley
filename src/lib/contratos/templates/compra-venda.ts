/**
 * Cláusulas PROTEGIDAS (Fase 3 do diagnóstico do Construtor de Contratos) —
 * revisadas contra um contrato real da Fontinhas ("Contrato Carolina e Bruna
 * — Wagner") pra bater com o padrão jurídico já em uso pela empresa, não
 * inventado neste arquivo. Só o texto institucional é protegido; nomes,
 * valores, datas e condições da negociação continuam vindo de {{variável}}.
 *
 * A partir da Fase 4, o texto das 5 cláusulas protegidas (QUARTA, QUINTA,
 * DÉCIMA PRIMEIRA, DÉCIMA QUINTA, DÉCIMA SEXTA) mora em `clausulasProtegidas.ts`
 * — é a MESMA fonte usada pela redação por IA (`redigirContrato.ts`), pra
 * nunca haver dois textos institucionais divergentes no sistema. Este
 * arquivo só interpola essas constantes; o resultado final do caminho
 * determinístico é byte a byte igual ao que era antes desta mudança.
 */
import { CLAUSULAS_PROTEGIDAS_COMPRA_VENDA as C } from '../clausulasProtegidas'

export const TEMPLATE_COMPRA_VENDA = {
  id: 'compra_venda',
  titulo: 'Compromisso de Venda e Compra',
  descricao: 'Contrato de compra e venda de imóvel com partes, valores e condições de pagamento.',
  conteudo: `<p style="text-align:center">{{cidade_comarca}}, {{data_extenso}}</p>

<p>Pelo presente instrumento particular, regido pelas disposições dos artigos 481 a 504 do Código Civil Brasileiro e demais legislações pertinentes, as partes abaixo qualificadas reduzem a termo o compromisso de venda e compra do imóvel adiante descrito:</p>

{{vendedores_qualificacao}}

{{compradores_qualificacao}}

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

${C.SANCAO_PENAL}

${C.ESCRITURA}

<h3>CLÁUSULA SEXTA — DA POSSE</h3>

<p>O(A) COMPROMISSÁRIO(A) COMPRADOR(A) ficará imitido(a) na posse do imóvel {{data_posse}}{{condicao_posse_evento}}, ocasião em que o(a) COMPROMITENTE VENDEDOR(A) entregará o imóvel tal como vendido e vistoriado pelo(a) comprador(a), respondendo civil e criminalmente pelas obrigações assumidas.</p>

<h3>CLÁUSULA SÉTIMA — DA INEXISTÊNCIA DE DÍVIDAS E ÔNUS</h3>

<p>A presente transação é realizada inteiramente livre e desembaraçada de quaisquer dívidas, dúvidas e ônus reais, responsabilizando-se o(a) COMPROMITENTE VENDEDOR(A) por quaisquer dívidas disso decorrentes, obrigando-se o(a) mesmo(a) a comprovar tal disponibilidade quando solicitado(a) para tanto.</p>

<h3>CLÁUSULA OITAVA — DOS TRIBUTOS E ENCARGOS</h3>

<p>Os débitos de IPTU, energia elétrica, água/saneamento, condomínio e demais tributos incidentes sobre o imóvel, vencidos até a data da posse, serão pagos pelo(a) COMPROMITENTE VENDEDOR(A) de forma integral; os vincendos a partir da posse serão pagos pelo(a) COMPROMISSÁRIO(A) COMPRADOR(A) diretamente ao órgão credor, ainda que lançados em nome do(a) vendedor(a).</p>

<h3>CLÁUSULA NONA — DA SUCESSÃO</h3>

<p>Os direitos, vantagens e obrigações decorrentes deste instrumento obrigam não só as partes contratantes, como também seus herdeiros e sucessores legais.</p>

<h3>CLÁUSULA DÉCIMA — DA IRREVOGABILIDADE</h3>

<p>O presente compromisso é firmado em caráter irrevogável e irretratável, desde que cumpridas as obrigações contratuais acima estipuladas, ficando facultado ao(à) COMPROMISSÁRIO(A) COMPRADOR(A), em caso de recusa ou impedimento da outorga da escritura, exigir a adjudicação compulsória do imóvel nos termos da Lei nº 649, de 11 de março de 1949, ou o que for de direito; podendo, todavia, o(a) COMPROMITENTE VENDEDOR(A) considerá-lo rescindido caso o(a) comprador(a) não cumpra o pagamento do saldo devedor pactuado na Cláusula Segunda, no prazo e forma convencionados, perdendo, nesta hipótese, os direitos adquiridos por força deste contrato.</p>

${C.BOA_FE}

<h3>CLÁUSULA DÉCIMA SEGUNDA — DA INEXISTÊNCIA DE ÔNUS</h3>

<p>O(A) COMPROMITENTE VENDEDOR(A) declara, sob pena de responsabilidade civil e penal, que inexistem quaisquer ônus, ações reais ou pessoais reipersecutórias relativas ao imóvel objeto deste instrumento, exceto aqueles expressamente informados nesta avença.</p>

<h3>CLÁUSULA DÉCIMA TERCEIRA — DAS CERTIDÕES</h3>

<p>Foram apresentadas pelo(a) COMPROMITENTE VENDEDOR(A) as certidões de praxe relativas à sua pessoa e ao imóvel, nos termos da Lei nº 7.433, de 18 de dezembro de 1985, cuja relação e teor deverão ser conferidos pelas partes antes da assinatura definitiva: {{lista_certidoes}}. Fica desde já ciente o(a) COMPROMISSÁRIO(A) COMPRADOR(A) da importância desses documentos para a segurança do ato jurídico, sendo de responsabilidade do(a) COMPROMITENTE VENDEDOR(A) quaisquer ações judiciais que possam existir em seu nome ou sobre o imóvel objeto deste instrumento e que venham a causar risco à presente transação.</p>

<h3>CLÁUSULA DÉCIMA QUARTA — DA CORRETAGEM</h3>

<p>A corretagem foi intermediada pelo(a) corretor(a) {{corretor_nome}}, CPF nº {{corretor_cpf}}, CRECI nº {{corretor_creci}}, no valor de {{valor_comissao}} ({{valor_comissao_extenso}}), de responsabilidade {{corretagem_responsavel}}{{corretagem_momento_pagamento}}.</p>

${C.LGPD}

${C.FORO}

<p>E, por estarem justas e acertadas, as partes assinam o presente instrumento em duas vias de igual teor e forma, na presença das testemunhas abaixo, podendo as assinaturas ser de forma física ou por meio digital.</p>

<br/><br/>

<p style="text-align:center">{{cidade_comarca}}, {{data_extenso}}</p>

<br/><br/>

{{vendedores_assinaturas}}

<br/>

{{compradores_assinaturas}}

<br/>

<p>Testemunhas:<br/><br/>
1. ________________________________________<br/>
Nome: {{testemunha1_nome}}<br/>
CPF: {{testemunha1_cpf}}<br/><br/>
2. ________________________________________<br/>
Nome: {{testemunha2_nome}}<br/>
CPF: {{testemunha2_cpf}}</p>
`,
}
