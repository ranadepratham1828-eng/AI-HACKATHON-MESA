// Sends login emails through Resend (https://resend.com), using plain fetch.
// Not configured? sendEmail() returns { sent: false } and the caller shows the
// details to the admin instead, so onboarding never blocks on email.

const env = process.env;

export function emailStatus() {
  return {
    configured: Boolean(env.RESEND_API_KEY && env.EMAIL_FROM),
    from: env.EMAIL_FROM || null,
  };
}

export async function sendEmail({ to, subject, html, text }) {
  if (!emailStatus().configured) return { sent: false, reason: 'Email is not set up (RESEND_API_KEY and EMAIL_FROM)' };
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: env.EMAIL_FROM, to: [to], subject, html, text }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { sent: false, reason: data?.message || `Email service error ${res.status}` };
    return { sent: true, id: data.id };
  } catch (err) {
    return { sent: false, reason: `Could not reach the email service: ${err.message}` };
  }
}

const ROLE_LABEL = { student: 'student', parent: 'parent', school: 'school counsellor' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function loginEmail({ name, role, email, password, loginUrl, reset = false }) {
  const subject = reset ? 'Your new Dishaa password' : 'Your Dishaa login details';
  const intro = reset
    ? 'Your Dishaa password has been reset. Use the details below to log in.'
    : `Welcome to Dishaa! Your ${ROLE_LABEL[role] || ''} account is ready.`;
  const text = `Hi ${name},\n\n${intro}\n\nLog in at: ${loginUrl}\nEmail: ${email}\nTemporary password: ${password}\n\nYou'll be asked to choose your own password when you first log in.\n\nDishaa`;
  const html = `<div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:0 auto;color:#1a1430">
    <div style="background:#0c0820;color:#f6f1e7;padding:20px 24px;border-radius:12px 12px 0 0;font-size:22px;font-weight:600">dishaa</div>
    <div style="border:1px solid #e6e1ef;border-top:0;padding:24px;border-radius:0 0 12px 12px">
      <p>Hi ${esc(name)},</p><p>${esc(intro)}</p>
      <table style="background:#f4f0fd;border-radius:10px;padding:14px 16px;margin:16px 0;font-size:15px">
        <tr><td style="color:#6b6482;padding-right:12px">Email</td><td><b>${esc(email)}</b></td></tr>
        <tr><td style="color:#6b6482;padding-right:12px">Temporary password</td><td><b style="font-family:monospace;font-size:16px">${esc(password)}</b></td></tr>
      </table>
      <p><a href="${esc(loginUrl)}" style="display:inline-block;background:#6b3fd6;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:600">Log in to Dishaa</a></p>
      <p style="color:#6b6482;font-size:13px">You'll be asked to choose your own password when you first log in.</p>
    </div></div>`;
  return { subject, html, text };
}
