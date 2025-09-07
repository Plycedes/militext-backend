"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmailService = void 0;
const nodemailer_1 = __importDefault(require("../config/nodemailer"));
const email_model_1 = require("../models/email.model");
class EmailService {
    static sendVerificationEmail(email, verificationCode) {
        return __awaiter(this, void 0, void 0, function* () {
            const mailOptions = {
                from: process.env.SMTP_USER,
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
            yield nodemailer_1.default.sendMail(mailOptions);
        });
    }
    static storeVerificationCode(email, code) {
        return __awaiter(this, void 0, void 0, function* () {
            const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
            yield email_model_1.EmailVerification.findOneAndUpdate({ email }, { code, expiresAt, createdAt: new Date() }, { upsert: true });
        });
    }
    static verifyCode(email, code) {
        return __awaiter(this, void 0, void 0, function* () {
            const record = yield email_model_1.EmailVerification.findOne({ email });
            if (!record)
                return false;
            const now = new Date();
            if (record.code === code && record.expiresAt > now) {
                yield email_model_1.EmailVerification.deleteOne({ email });
                return true;
            }
            return false;
        });
    }
    static generateVerificationCode() {
        return Math.floor(100000 + Math.random() * 900000).toString();
    }
}
exports.EmailService = EmailService;
