import { User } from "../models/user.model";
import { EmailService } from "../services/email.service";
import { ApiError } from "../utils/ApiError";
import { ApiResponse } from "../utils/ApiResponse";
import { asyncHandler } from "../utils/asyncHandler";
import { Request, Response } from "express";

export class EmailController {
    static sendVerificationEmail = asyncHandler(async (req: Request, res: Response) => {
        const { email } = req.body;

        const user = await User.findOne({ email });
        if (!user) {
            throw new ApiError(404, "Email does not exist on the grid");
        }

        const verificationCode = EmailService.generateVerificationCode();
        await EmailService.storeVerificationCode(email, verificationCode);
        await EmailService.sendVerificationEmail(email, verificationCode);

        return res.status(200).send(new ApiResponse(200, { email }, "Verification email sent"));
    });

    static verifyEmail = asyncHandler(async (req: Request, res: Response) => {
        const { email, code } = req.body;

        const isValid = await EmailService.verifyCode(email, code);

        if (!isValid) {
            throw new ApiError(400, "Invalid or expired verification code");
        }

        let user = await User.findOne({ email });
        if (!user) {
            throw new ApiError(404, "User not found");
        }

        const token = user.generateResetToken();

        return res.status(200).send(new ApiResponse(200, { reset_token: token }, "Email verified"));
    });
}
