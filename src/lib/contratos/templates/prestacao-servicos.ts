export const TEMPLATE_PRESTACAO_SERVICOS = {
  id: 'prestacao_servicos',
  titulo: 'Prestação de Serviços',
  descricao: 'Contrato de prestação de serviços de assessoria imobiliária.',
  conteudo: `
<p style="text-align:center"><strong>FONTINHAS ASSESSORIA</strong></p>
<p style="text-align:center">FONTINHAS &amp; FONTINHAS LTDA – CNPJ 77.543.700/0001-57</p>

<hr/>

<p style="text-align:center"><strong>CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE ASSESSORIA</strong></p>

<br/>

<p><strong>1. PARTES CONTRATANTES</strong></p>

<p><strong>CONTRATADA:</strong> FONTINHAS &amp; FONTINHAS LTDA, pessoa jurídica de direito privado, inscrita no CNPJ sob o nº 77.543.700/0001-57, denominada simplesmente CONTRATADA.</p>

<p><strong>CONTRATANTE:</strong> identificado(a) na tabela abaixo, denominado(a) simplesmente CONTRATANTE.</p>

<table style="width:100%;border-collapse:collapse;">
  <tbody>
    <tr>
      <th style="border:1px solid #ccc;padding:6px 10px;background:#f0f0f0;width:40%;text-align:left;font-weight:bold;">Nº do Contrato</th>
      <td style="border:1px solid #ccc;padding:6px 10px;">{{numero_contrato_assessoria}}</td>
    </tr>
    <tr>
      <th style="border:1px solid #ccc;padding:6px 10px;background:#f0f0f0;text-align:left;font-weight:bold;">Data</th>
      <td style="border:1px solid #ccc;padding:6px 10px;">{{data_extenso}}</td>
    </tr>
    <tr>
      <th style="border:1px solid #ccc;padding:6px 10px;background:#f0f0f0;text-align:left;font-weight:bold;">Nome</th>
      <td style="border:1px solid #ccc;padding:6px 10px;">{{contratante_nome}}</td>
    </tr>
    <tr>
      <th style="border:1px solid #ccc;padding:6px 10px;background:#f0f0f0;text-align:left;font-weight:bold;">CPF</th>
      <td style="border:1px solid #ccc;padding:6px 10px;">{{contratante_cpf}}</td>
    </tr>
    <tr>
      <th style="border:1px solid #ccc;padding:6px 10px;background:#f0f0f0;text-align:left;font-weight:bold;">Endereço</th>
      <td style="border:1px solid #ccc;padding:6px 10px;">{{contratante_endereco}}</td>
    </tr>
  </tbody>
</table>

<br/>

<p><strong>2. OBJETO DO CONTRATO</strong></p>

<p>Conforme os serviços abaixo discriminados:</p>

<table style="width:100%;border-collapse:collapse;">
  <tbody>
    <tr>
      <th colspan="2" style="border:1px solid #ccc;padding:8px 10px;background:#d0d8d0;text-align:left;font-weight:bold;">SERVIÇOS CONTRATADOS</th>
    </tr>
    <tr>
      <td style="border:1px solid #ccc;padding:6px 10px;width:32px;text-align:center;">{{check_financiamento}}</td>
      <td style="border:1px solid #ccc;padding:6px 10px;">Formalização do financiamento imobiliário</td>
    </tr>
    <tr>
      <td style="border:1px solid #ccc;padding:6px 10px;text-align:center;">{{check_itbi}}</td>
      <td style="border:1px solid #ccc;padding:6px 10px;">Assessoria de ITBI</td>
    </tr>
    <tr>
      <td style="border:1px solid #ccc;padding:6px 10px;text-align:center;">{{check_registro}}</td>
      <td style="border:1px solid #ccc;padding:6px 10px;">Assessoria de Registro</td>
    </tr>
    <tr>
      <td style="border:1px solid #ccc;padding:6px 10px;text-align:center;">{{check_juridico}}</td>
      <td style="border:1px solid #ccc;padding:6px 10px;">Contrato / Jurídico</td>
    </tr>
  </tbody>
</table>

<br/>

<p><strong>3. VALOR E FORMA DE PAGAMENTO</strong></p>

<table style="width:100%;border-collapse:collapse;">
  <tbody>
    <tr>
      <th style="border:1px solid #ccc;padding:8px 10px;background:#f0f0f0;text-align:left;font-weight:bold;width:50%;">Valor Total dos Serviços</th>
      <th style="border:1px solid #ccc;padding:8px 10px;background:#f0f0f0;text-align:left;font-weight:bold;">Forma de Pagamento</th>
    </tr>
    <tr>
      <td style="border:1px solid #ccc;padding:6px 10px;">{{valor_total_servicos}} ({{valor_total_servicos_extenso}})</td>
      <td style="border:1px solid #ccc;padding:6px 10px;">Na emissão do contrato de financiamento pela instituição financeira</td>
    </tr>
  </tbody>
</table>

<p>3.1. A remuneração será devida exclusivamente na data de emissão do contrato de financiamento pela instituição financeira, sendo inexigível antes desse evento.</p>

<p>3.2. O não pagamento no prazo ensejará incidência de multa de 2% (dois por cento) sobre o valor devido, acrescida de juros moratórios de 1% (um por cento) ao mês e correção monetária pelo IPCA, sem prejuízo de medidas de cobrança extrajudicial e judicial.</p>

<p>3.3. Eventuais desistências pelo CONTRATANTE após o início da execução dos serviços não geram direito à restituição de valores já desembolsados, salvo acordo escrito entre as partes.</p>

<br/>

<p><strong>4. ESCOPO DOS SERVIÇOS</strong></p>

<p>A CONTRATADA prestará os serviços descritos na cláusula 2, comprometendo-se a:</p>

<ul>
  <li>Orientar e organizar a documentação necessária ao processo de financiamento;</li>
  <li>Preencher e protocolar formulários junto à instituição financeira indicada;</li>
  <li>Acompanhar e intermediar o trâmite administrativo do processo;</li>
  <li>Informar o CONTRATANTE sobre o andamento das etapas do processo.</li>
</ul>

<p>4.1. A CONTRATADA exercerá suas atividades como prestadora de serviços de apoio e assessoria, não tendo poderes de representação legal ou mandato para firmar contratos em nome do CONTRATANTE, salvo se instrumento de procuração específico for outorgado.</p>

<br/>

<p><strong>5. LIMITAÇÃO DE RESPONSABILIDADE E DECLARAÇÕES</strong></p>

<p>5.1. A CONTRATADA atua como prestadora de serviços de assessoria e acompanhamento, não sendo responsável por decisões tomadas por instituições financeiras, cartórios, órgãos públicos ou terceiros envolvidos no processo.</p>

<p>5.2. O CONTRATANTE declara estar ciente de que a CONTRATADA não garante e não pode garantir:</p>

<ul>
  <li>a aprovação de crédito pelo banco ou instituição financeira;</li>
  <li>a emissão do contrato de financiamento;</li>
  <li>a avaliação favorável do imóvel;</li>
  <li>o cumprimento de prazo específico de registro;</li>
  <li>a liberação de recursos financeiros;</li>
  <li>decisões tomadas por bancos, cartórios, órgãos públicos ou quaisquer terceiros.</li>
</ul>

<p>5.3. A responsabilidade da CONTRATADA limita-se ao valor pago pelo CONTRATANTE a título de remuneração pelos serviços contratados, exceto nos casos de dolo ou culpa comprovados.</p>

<p>5.4. A CONTRATADA não responderá por atrasos ou descumprimentos causados por caso fortuito, força maior ou por atos de terceiros alheios à sua vontade.</p>

<br/>

<p><strong>6. DESPESAS NÃO INCLUSAS</strong></p>

<p>6.1. Não estão incluídos no valor deste contrato, sendo de exclusiva responsabilidade do CONTRATANTE, os seguintes custos:</p>

<ul>
  <li>Imposto sobre Transmissão de Bens Imóveis (ITBI);</li>
  <li>Emolumentos cartorários;</li>
  <li>Certidões de qualquer natureza;</li>
  <li>Autenticações e reconhecimentos de firma;</li>
  <li>Taxas bancárias;</li>
  <li>Despesas de deslocamento ou postagem, quando solicitadas pelo CONTRATANTE;</li>
  <li>Quaisquer outras despesas exigidas por terceiros envolvidos no processo.</li>
</ul>

<br/>

<p><strong>7. OBRIGAÇÕES DO CONTRATANTE</strong></p>

<p>O CONTRATANTE compromete-se a:</p>

<ul>
  <li>Fornecer documentos e informações verídicas, completas e atualizadas, respondendo civil e criminalmente por eventuais falsidades;</li>
  <li>Colaborar com a CONTRATADA, atendendo tempestivamente às solicitações de documentos e informações;</li>
  <li>Comunicar imediatamente qualquer alteração em seus dados cadastrais;</li>
  <li>Não negociar diretamente com terceiros de forma que prejudique o andamento dos serviços contratados, sem prévia comunicação à CONTRATADA.</li>
</ul>

<br/>

<p><strong>8. PRAZO E RESCISÃO</strong></p>

<p>8.1. O presente contrato vigorará pelo prazo necessário à conclusão dos serviços objeto desta avença ou até a rescisão por qualquer das partes.</p>

<p>8.2. Qualquer das partes poderá rescindir o presente contrato mediante notificação prévia por escrito com antecedência mínima de 5 (cinco) dias úteis.</p>

<p>8.3. A rescisão motivada por inadimplemento ou por descumprimento de obrigações contratuais não afasta o direito da parte inocente à indenização por perdas e danos.</p>

<p>8.4. A rescisão pelo CONTRATANTE após o início da execução dos serviços não o exime do pagamento proporcional pelos serviços já realizados.</p>

<br/>

<p><strong>9. CONFIDENCIALIDADE</strong></p>

<p>9.1. As partes comprometem-se a manter sigilo sobre todas as informações trocadas no âmbito deste contrato, não podendo divulgá-las a terceiros sem autorização expressa da outra parte, exceto quando exigido por lei ou ordem judicial.</p>

<p>9.2. A obrigação de sigilo permanecerá em vigor por 2 (dois) anos após o término ou rescisão deste contrato.</p>

<br/>

<p><strong>10. TRATAMENTO DE DADOS PESSOAIS (LGPD)</strong></p>

<p>10.1. O CONTRATANTE autoriza o tratamento de seus dados pessoais para execução dos serviços contratados, cumprimento de obrigações legais e relacionamento com instituições financeiras, cartórios e órgãos públicos, nos termos da Lei nº 13.709/2018 (Lei Geral de Proteção de Dados Pessoais — LGPD), exclusivamente para as seguintes finalidades:</p>

<ul>
  <li>Instrução do processo de financiamento imobiliário;</li>
  <li>Comunicação com instituições financeiras e cartórios;</li>
  <li>Cumprimento de exigências legais e regulatórias.</li>
</ul>

<br/>

<p><strong>11. ASSINATURA ELETRÔNICA</strong></p>

<p>11.1. As partes reconhecem como plenamente válida e eficaz a assinatura eletrônica realizada por meio de plataforma certificada, como Clicksign ou sistema equivalente, nos termos do art. 10, §2º, da Medida Provisória nº 2.200-2/2001 e demais normas aplicáveis.</p>

<br/>

<p><strong>12. DISPOSIÇÕES GERAIS E FORO</strong></p>

<p>12.1. O presente contrato é celebrado em caráter irrevogável e irretratável, obrigando as partes e seus sucessores.</p>

<p>12.2. Eventuais alterações deste contrato somente serão válidas se realizadas por escrito e assinadas por ambas as partes.</p>

<p>12.3. A tolerância de qualquer das partes quanto ao descumprimento de obrigações pela outra não implica renúncia ao direito de exigi-las no futuro.</p>

<p>12.4. As partes elegem o foro da comarca de {{cidade_foro}} para dirimir quaisquer controvérsias oriundas deste contrato, com renúncia expressa a qualquer outro, por mais privilegiado que seja.</p>

<hr/>

<p style="text-align:center"><strong>DECLARAÇÃO DO CONTRATANTE</strong></p>

<p>O CONTRATANTE declara que: (i) leu integralmente e compreendeu todas as cláusulas deste contrato; (ii) teve oportunidade de esclarecer dúvidas antes da assinatura; (iii) concorda livremente com todas as condições estabelecidas; e (iv) recebeu cópia deste instrumento.</p>

<br/>

<p style="text-align:right">{{cidade_foro}}, {{data_extenso}}.</p>

<br/>

<table style="width:100%;border-collapse:collapse;">
  <tbody>
    <tr>
      <td style="border:1px solid #ccc;padding:12px 10px;width:50%;text-align:center;vertical-align:top;">
        <p><strong>CONTRATANTE: {{contratante_nome}}</strong></p>
        <br/><br/>
        <p>________________________________________</p>
        <p>Assinatura</p>
      </td>
      <td style="border:1px solid #ccc;padding:12px 10px;text-align:center;vertical-align:top;">
        <p><strong>CONTRATADA: FONTINHAS &amp; FONTINHAS LTDA</strong></p>
        <br/><br/>
        <p>________________________________________</p>
        <p>Assinatura</p>
      </td>
    </tr>
  </tbody>
</table>

<br/>

<p style="text-align:center;font-size:11px;color:#666;">Assinado eletronicamente via {{plataforma_assinatura}}</p>
`,
}
