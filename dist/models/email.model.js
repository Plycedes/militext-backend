"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmailVerification = void 0;
const mongoose_1 = require("mongoose");
const EmailVerificationSchema = new mongoose_1.Schema({
    email: { type: String, required: true, unique: true },
    code: { type: String, required: true },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
    createdAt: { type: Date, default: Date.now },
});
exports.EmailVerification = (0, mongoose_1.model)("EmailVerification", EmailVerificationSchema);
