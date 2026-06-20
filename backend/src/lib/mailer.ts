import { config } from './config';

export interface Mailer {
  sendVerificationCode(email: string, code: string): Promise<void>;
}

export class AppMailer implements Mailer {
  async sendVerificationCode(email: string, code: string) {
    if (!config.resendApiKey || !config.emailFrom) {
      if (process.env.NODE_ENV === 'production') throw new Error('EMAIL_NOT_CONFIGURED');
      console.info(`[email verification] ${email}: ${code}`);
      return;
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: config.emailFrom,
        to: [email],
        subject: 'Verify your Permanent Portfolio Planner account',
        text: `Your verification code is ${code}. It expires in 10 minutes.`,
        html: `<p>Your verification code is:</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p><p>It expires in 10 minutes.</p>`,
      }),
    });

    if (!response.ok) throw new Error(`EMAIL_SEND_FAILED:${response.status}`);
  }
}
