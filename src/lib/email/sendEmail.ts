import nodemailer from 'nodemailer'

export interface SendEmailParams {
  to: string
  subject: string
  html: string
  replyTo?: string
}

export interface SendEmailResult {
  ok: boolean
  error?: string
}

function createTransport() {
  const port = parseInt(process.env.SMTP_PORT ?? '465', 10)
  const secure = process.env.SMTP_SECURE !== 'false'

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST!,
    port,
    secure,
    auth: {
      user: process.env.SMTP_USER!,
      pass: process.env.SMTP_PASS!,
    },
  })
}

export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const fromName = process.env.EMAIL_FROM_NAME ?? 'Credifon'
  const fromEmail = process.env.EMAIL_FROM!

  if (!fromEmail || !process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return { ok: false, error: 'Variáveis SMTP não configuradas no servidor.' }
  }

  try {
    const transporter = createTransport()
    await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to: params.to,
      subject: params.subject,
      html: params.html,
      replyTo: params.replyTo ?? fromEmail,
    })
    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'Erro desconhecido ao enviar e-mail.' }
  }
}
