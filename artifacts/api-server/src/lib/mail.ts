import nodemailer from "nodemailer";

function getTransporter() {
  const host = process.env.SMTP_HOST || (process.env.NODE_ENV === "production" ? "mailpit" : "localhost");
  const port = parseInt(process.env.SMTP_PORT || "1025", 10);
  const secure = process.env.SMTP_SECURE === "true";
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  const hasValidAuth = !!user && !!pass && !user.startsWith("your-") && !pass.startsWith("your-");

  const config: any = {
    host,
    port,
    secure,
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 10000,
  };

  if (hasValidAuth) {
    config.auth = { user, pass };
  }

  const fromAddress = hasValidAuth ? user : `"TracelyTag Security" <noreply@tracelytag.local>`;

  return {
    transporter: nodemailer.createTransport(config),
    fromAddress,
    hasValidAuth,
    host,
    port,
  };
}

export async function sendOtpEmail(to: string, otpCode: string): Promise<void> {
  const { transporter, fromAddress, host, port } = getTransporter();

  const mailOptions = {
    from: fromAddress,
    to,
    subject: "Your TracelyTag One-Time Password (OTP)",
    text: `Your One-Time Password (OTP) for TracelyTag login is: ${otpCode}. It is valid for 5 minutes.`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; max-width: 500px; margin: 0 auto; color: #1e293b; background: #ffffff;">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 16px;">
          <h2 style="color: #2563eb; margin: 0; font-size: 20px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">TracelyTag Authentication</h2>
        </div>
        <p style="font-size: 14px; line-height: 1.5; color: #475569; margin: 12px 0;">Dear User,</p>
        <p style="font-size: 14px; line-height: 1.5; color: #475569; margin: 12px 0;">A sign-in request was received for your TracelyTag account. Enter the one-time verification code below to authorize your session:</p>
        <div style="background-color: #f1f5f9; border: 1px dashed #cbd5e1; padding: 18px; text-align: center; border-radius: 8px; margin: 24px 0;">
          <span style="font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #0f172a; font-family: monospace;">${otpCode}</span>
        </div>
        <p style="font-size: 12px; color: #64748b; margin-top: 16px;">This OTP is valid for <strong>5 minutes</strong>. If you did not initiate this login attempt, please protect your credentials immediately.</p>
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 24px 0 16px;" />
        <p style="font-size: 11px; color: #94a3b8; text-align: center; margin: 0;">TracelyTag Industrial Security Panel • Automated System Notification</p>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`[SMTP Mail] OTP email successfully sent to ${to} via ${host}:${port}`);
  } catch (err: any) {
    console.warn(`[SMTP Mail Warning] Could not deliver email to ${to} (${err.message}). Falling back to system console:`);
    console.log(`[SECURITY NOTICE] OTP Code for ${to}: >>> ${otpCode} <<<`);
  }
}

export async function sendPasswordResetEmail(to: string, resetUrl: string, otpCode: string): Promise<void> {
  const { transporter, fromAddress, host, port } = getTransporter();

  const mailOptions = {
    from: fromAddress,
    to,
    subject: "Reset Your TracelyTag Account Password",
    text: `You requested to reset your TracelyTag account password.\n\nClick the link below or enter the 6-digit verification code:\nVerification Code: ${otpCode}\nReset Link: ${resetUrl}\n\nThis link and code will expire in 15 minutes.\nIf you did not make this request, you can safely ignore this email.`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 28px; border: 1px solid #e2e8f0; border-radius: 12px; max-width: 520px; margin: 0 auto; color: #1e293b; background: #ffffff;">
        <div style="border-bottom: 2px solid #2563eb; padding-bottom: 12px; margin-bottom: 20px;">
          <h2 style="color: #2563eb; margin: 0; font-size: 20px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">TracelyTag Security</h2>
          <span style="font-size: 12px; color: #64748b;">Password Recovery Protocol</span>
        </div>
        <p style="font-size: 14px; line-height: 1.5; color: #334155;">Hello,</p>
        <p style="font-size: 14px; line-height: 1.5; color: #334155;">A password reset request was initiated for your TracelyTag account. Click the button below to establish a new password:</p>
        
        <div style="text-align: center; margin: 28px 0;">
          <a href="${resetUrl}" style="background-color: #2563eb; color: #ffffff; padding: 12px 28px; border-radius: 8px; font-weight: 600; text-decoration: none; font-size: 14px; display: inline-block; box-shadow: 0 2px 4px rgba(37,99,235,0.2);">
            Reset Password
          </a>
        </div>

        <p style="font-size: 13px; color: #64748b; margin-top: 20px; text-align: center;">Or enter this 6-digit confirmation code directly on the reset screen:</p>
        <div style="background-color: #f8fafc; border: 1px dashed #cbd5e1; padding: 12px; text-align: center; border-radius: 8px; margin: 12px 0;">
          <span style="font-size: 24px; font-weight: 700; letter-spacing: 6px; color: #0f172a; font-family: monospace;">${otpCode}</span>
        </div>

        <p style="font-size: 12px; color: #64748b; line-height: 1.4; word-break: break-all;">
          If the button above does not work, copy and paste this link into your browser:<br/>
          <a href="${resetUrl}" style="color: #2563eb; text-decoration: underline;">${resetUrl}</a>
        </p>

        <p style="font-size: 12px; color: #94a3b8; margin-top: 20px;">This request expires in <strong>15 minutes</strong>. If you did not request a password change, please disregard this email.</p>
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 24px 0 16px;" />
        <p style="font-size: 11px; color: #94a3b8; text-align: center; margin: 0;">TracelyTag Industrial Security Panel • Automated Security Notice</p>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`[SMTP Mail] Password reset email successfully sent to ${to} via ${host}:${port}`);
  } catch (err: any) {
    console.warn(`[SMTP Mail Warning] Could not deliver reset email to ${to} (${err.message}). Falling back to system console:`);
    console.log(`[SECURITY NOTICE] Password Reset Link for ${to}: >>> ${resetUrl} <<< (Code: ${otpCode})`);
  }
}
