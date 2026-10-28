import env from '../config/env.js';

let transporter = null;
async function getTransport() {
  if (transporter) return transporter;
  const nodemailer = (await import('nodemailer')).default;
  transporter = nodemailer.createTransport({ host: env.SMTP_HOST, port: env.SMTP_PORT, secure: env.SMTP_PORT === 465, auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined });
  return transporter;
}

export async function sendMail({ to, subject, text }) {
  if (env.MAIL_TRANSPORT === 'smtp') {
    try { await (await getTransport()).sendMail({ from: env.MAIL_FROM, to, subject, text }); }
    catch (e) { console.error('mail send failed:', e.message); }
    return;
  }
  // Development only: print the message (including any link) to the server console.
  console.log(`\n── MAIL (console transport) ─────────\nTo: ${to}\nSubject: ${subject}\n${text}\n──────────────────────────────────────\n`);
}
