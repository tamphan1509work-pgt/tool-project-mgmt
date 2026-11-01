// Gửi email qua SMTP. Cấu hình bằng biến môi trường (không lưu mật khẩu trong database):
//   SMTP_HOST, SMTP_PORT (mặc định 587), SMTP_SECURE ("true" cho cổng 465),
//   SMTP_USER, SMTP_PASS, MAIL_FROM (VD: "Project Hub <noreply@congty.com>")
export async function createMailerFromEnv(env = process.env) {
  if (!env.SMTP_HOST) return null;
  const { default: nodemailer } = await import('nodemailer');
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: Number(env.SMTP_PORT) || 587,
    secure: env.SMTP_SECURE === 'true',
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  });
  const from = env.MAIL_FROM || env.SMTP_USER || 'Project Hub <noreply@localhost>';
  return {
    from,
    send: ({ to, subject, text, html }) => transport.sendMail({ from, to, subject, text, html }),
  };
}
