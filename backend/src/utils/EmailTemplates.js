// Signup welcome email
export function welcomeTemplate({ name }) {
  return `
    <h1>Welcome, ${name}!</h1>
    <p>Thanks for signing up !</p>
  `;
}

export function accountVerifyTemplate({ name, actionLink }) {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f6f7f9;padding:20px 0;">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="max-width:560px;width:100%;background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;">
            <tr>
              <td style="padding:20px 24px 0;font-family:Arial,Helvetica,sans-serif;color:#111827;">
                <h1 style="margin:0;font-size:24px;line-height:1.3;color:#00704a;">Verify Your Account</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:12px 24px 0;font-family:Arial,Helvetica,sans-serif;color:#1f2937;font-size:15px;line-height:1.6;">
                <p style="margin:0 0 10px;">Hello ${name},</p>
                <p style="margin:0 0 16px;">Please confirm your email address to continue using Stories Cafe.</p>
                <p style="margin:0 0 18px;">
                  <a href="${actionLink}" style="display:inline-block;padding:10px 16px;background:#00704a;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:700;">
                    Verify Account
                  </a>
                </p>
                <p style="margin:0 0 8px;">If the button does not work, use this link:</p>
                <p style="margin:0 0 12px;word-break:break-all;"><a href="${actionLink}" style="color:#00704a;">${actionLink}</a></p>
                <p style="margin:0 0 16px;color:#6b7280;font-style:italic;">If you did not request this, you can ignore this email.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:12px 24px 18px;font-family:Arial,Helvetica,sans-serif;color:#9ca3af;font-size:12px;border-top:1px solid #f3f4f6;">
                Stories Cafe
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `;
}
