import { Schema, model, Document } from "mongoose";

export interface IEmailVerification extends Document {
    email: string;
    code: string;
    expiresAt: Date;
    createdAt: Date;
}

const EmailVerificationSchema = new Schema<IEmailVerification>({
    email: { type: String, required: true, unique: true },
    code: { type: String, required: true },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
    createdAt: { type: Date, default: Date.now },
});

export const EmailVerification = model<IEmailVerification>(
    "EmailVerification",
    EmailVerificationSchema
);
