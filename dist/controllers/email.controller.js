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
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmailController = void 0;
const user_model_1 = require("../models/user.model");
const email_service_1 = require("../services/email.service");
const ApiError_1 = require("../utils/ApiError");
const ApiResponse_1 = require("../utils/ApiResponse");
const asyncHandler_1 = require("../utils/asyncHandler");
class EmailController {
}
exports.EmailController = EmailController;
_a = EmailController;
EmailController.sendVerificationEmail = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { email } = req.body;
    const user = yield user_model_1.User.findOne({ email });
    if (!user) {
        throw new ApiError_1.ApiError(404, "Email does not exist on the grid");
    }
    const verificationCode = email_service_1.EmailService.generateVerificationCode();
    yield email_service_1.EmailService.storeVerificationCode(email, verificationCode);
    yield email_service_1.EmailService.sendVerificationEmail(email, verificationCode);
    return res.status(200).send(new ApiResponse_1.ApiResponse(200, { email }, "Verification email sent"));
}));
EmailController.verifyEmail = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { email, code } = req.body;
    const isValid = yield email_service_1.EmailService.verifyCode(email, code);
    if (!isValid) {
        throw new ApiError_1.ApiError(400, "Invalid or expired verification code");
    }
    let user = yield user_model_1.User.findOne({ email });
    if (!user) {
        throw new ApiError_1.ApiError(404, "User not found");
    }
    const token = user.generateResetToken();
    return res.status(200).send(new ApiResponse_1.ApiResponse(200, { reset_token: token }, "Email verified"));
}));
