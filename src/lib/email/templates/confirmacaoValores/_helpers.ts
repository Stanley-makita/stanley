export function fmt(v: number | null): string {
  if (v == null) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

export function assinatura(nome: string, funcao: string, email: string, tel: string | null): string {
  return `
<table cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;border-top:2px solid #C2AA6A;padding-top:12px;font-family:Arial,sans-serif;font-size:13px;color:#253B29;">
  <tr><td><strong>${nome}</strong></td></tr>
  <tr><td style="color:#555;">${funcao}</td></tr>
  <tr><td style="color:#555;">${email}</td></tr>
  ${tel ? `<tr><td style="color:#555;">WhatsApp: ${tel}</td></tr>` : ''}
</table>
`.trim()
}

export function layoutEmail(titulo: string, corpo: string, assinaturaHtml: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f4f4;padding:24px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:600px;width:100%;">
        <tr>
          <td style="background:#253B29;padding:20px 32px;">
            <span style="color:#C2AA6A;font-size:20px;font-weight:bold;">Fontinhas Assessoria</span>
            <span style="color:#E7E0C4;font-size:14px;margin-left:12px;">Confirmação de Valores — ${titulo}</span>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;color:#333;font-size:14px;line-height:1.7;">
            ${corpo}
            <br><br>
            ${assinaturaHtml}
          </td>
        </tr>
        <tr>
          <td style="background:#f9f9f6;padding:16px 32px;font-size:11px;color:#999;text-align:center;border-top:1px solid #eee;">
            Este e-mail contém informações confidenciais. Caso não seja o destinatário, por favor desconsidere.
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

export function blocoConfirmacao(url: string): string {
  return `
<!-- Bloco de confirmação -->
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:32px;">
  <tr>
    <td style="border-top:1px solid #e5e5e5;padding-top:28px;">

      <!-- Card com borda -->
      <table width="100%" cellpadding="0" cellspacing="0" border="0"
        style="border:2px solid #253B29;border-radius:14px;overflow:hidden;background:#f7fbf8;">
        <tr>
          <!-- Faixa verde lateral -->
          <td width="6" style="background:#253B29;">&nbsp;</td>
          <td style="padding:24px 28px;text-align:center;">

            <!-- Ícone -->
            <div style="font-size:32px;line-height:1;margin-bottom:10px;">📋</div>

            <!-- Título -->
            <p style="font-size:15px;font-weight:700;color:#253B29;margin:0 0 6px;letter-spacing:0.2px;">
              Confirmação de Ciência e Aceite
            </p>

            <!-- Subtítulo -->
            <p style="font-size:13px;color:#4a6b55;margin:0 0 24px;line-height:1.55;">
              Revise os valores acima e, estando de acordo,<br>
              clique no botão para registrar seu aceite.
            </p>

            <!-- Botão principal -->
            <a href="${url}"
              style="display:inline-block;background:#1a7a3c;color:#ffffff;font-size:17px;font-weight:800;
                     padding:20px 64px;border-radius:10px;text-decoration:none;
                     letter-spacing:1px;text-transform:uppercase;
                     box-shadow:0 4px 16px rgba(26,122,60,0.45);">
              ✔&nbsp; Confirmar Ciência e Aceite
            </a>

            <!-- Nota -->
            <p style="font-size:11px;color:#8fa898;margin:18px 0 0;font-style:italic;">
              Este link é individual, seguro e de uso único.
            </p>

          </td>
        </tr>
      </table>

    </td>
  </tr>
</table>`
}

export function tabelaValores(linhas: [string, string][]): string {
  const rows = linhas
    .map(([label, valor]) => `
      <tr>
        <td style="padding:4px 12px;font-size:13px;color:#555;border-bottom:1px solid #f0f0f0;">${label}</td>
        <td style="padding:4px 12px;font-size:13px;color:#253B29;font-weight:600;text-align:right;border-bottom:1px solid #f0f0f0;">${valor}</td>
      </tr>`)
    .join('')
  return `
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e5e5e5;border-radius:6px;margin:16px 0;overflow:hidden;">
  <thead>
    <tr style="background:#f5f3ee;">
      <th style="padding:8px 12px;font-size:12px;color:#253B29;text-align:left;font-weight:600;">Descrição</th>
      <th style="padding:8px 12px;font-size:12px;color:#253B29;text-align:right;font-weight:600;">Valor</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>`
}
