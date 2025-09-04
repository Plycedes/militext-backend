import transporter from "../config/nodemailer";
import { EmailVerification } from "../models/email.model";

export class EmailService {
    static async sendVerificationEmail(email: string, verificationCode: string): Promise<void> {
        const mailOptions = {
            from: process.env.SMTP_USER!,
            to: email,
            subject: "Email Verification Code",
            html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Email Verification</h2>
          <p>Your verification code is:</p>
          <div style="background-color: #f0f0f0; padding: 20px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 2px; margin: 20px 0;">
            ${verificationCode}
          </div>
          <p>This code will expire in 10 minutes.</p>
          <p>If you didn't request this verification, please ignore this email.</p>
        </div>
      `,
        };

        await transporter.sendMail(mailOptions);
    }

    static async storeVerificationCode(email: string, code: string): Promise<void> {
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
        await EmailVerification.findOneAndUpdate(
            { email },
            { code, expiresAt, createdAt: new Date() },
            { upsert: true }
        );
    }

    static async verifyCode(email: string, code: string): Promise<boolean> {
        const record = await EmailVerification.findOne({ email });
        if (!record) return false;

        const now = new Date();
        if (record.code === code && record.expiresAt > now) {
            await EmailVerification.deleteOne({ email });
            return true;
        }
        return false;
    }

    static generateVerificationCode(): string {
        return Math.floor(100000 + Math.random() * 900000).toString();
    }
}
