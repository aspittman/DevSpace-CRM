import nodemailer from 'nodemailer'

export async function sendOutreachEmail(input: { to: string; subject: string; body: string }) {
  const host = process.env.SMTP_HOST ?? 'smtp.gmail.com'
  const port = Number(process.env.SMTP_PORT ?? 587)
  const user = process.env.SMTP_USER ?? process.env.SMTP_USERNAME
  const password = process.env.SMTP_PASSWORD
  const fromEmail = process.env.FROM_EMAIL ?? 'domains@devspacetechnologies.com'
  const fromName = process.env.FROM_NAME ?? 'DevSpace Technologies'

  if (!user || !password) {
    throw new Error('CRM SMTP is not configured. Set SMTP_USER and SMTP_PASSWORD in the CRM environment.')
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass: password },
  })

  const result = await transporter.sendMail({
    from: { name: fromName, address: fromEmail },
    to: input.to,
    subject: input.subject,
    text: input.body,
  })

  return {
    messageId: result.messageId,
    provider: host.includes('gmail') ? 'Gmail SMTP' : `SMTP (${host})`,
    fromEmail,
  }
}
