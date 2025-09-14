import jwt from "jsonwebtoken";
import { Types } from "mongoose";
import { Response, Request } from "express";

import { User, IUser } from "../models/user.model";
import { MulterRequest } from "../middlewares/multer.middleware";
import { AuthRequest, CustomRequest } from "../middlewares/auth.middleware";

import { ApiError } from "../utils/ApiError";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiResponse } from "../utils/ApiResponse";
import { generateProfilePicture } from "../utils/generateProfilePicture";
import { uploadOnCloudinary, deleteFromCloudinary } from "../utils/cloudinary";

import { JsonObject } from "../types/jsonTypes";
import {
    RegisterRequestBody,
    LoginRequestBody,
    ChangePasswordRequestBody,
} from "../types/requestTypes";

type AttachmentRequest = Request & {
    files?: { attachments?: Express.Multer.File[] };
};

const generateAccessAndRefreshTokens = async (userId: string): Promise<JsonObject> => {
    try {
        const user = await User.findById(userId);
        if (!user) throw new ApiError(404, "User not found");

        const accessToken = user.generateAccessToken();
        const refreshToken = user.generateRefreshToken();

        user.refreshToken = refreshToken;
        await user.save({ validateBeforeSave: false });

        return { accessToken, refreshToken };
    } catch (error) {
        throw new ApiError(500, "Error generating tokens");
    }
};

export class UserController {
    static registerUser = asyncHandler(
        async (req: CustomRequest<RegisterRequestBody>, res: Response): Promise<Response> => {
            const { email, username, number, password } = req.body;

            if ([email, username, number, password].some((field) => field?.trim() === "")) {
                throw new ApiError(400, "No field can be empty");
            }

            const existingUser = await User.findOne({ $or: [{ username }, { number }, { email }] });

            if (existingUser) {
                throw new ApiError(409, "Username or Email already exists");
            }

            const pfp = await generateProfilePicture(username);
            if (!pfp) {
                throw new ApiError(500, "Failed to generate profile picture");
            }

            const user = await User.create({
                username,
                email,
                number,
                password,
                avatar: pfp.url,
                avatarId: pfp.public_id,
            });

            const createdUser = await User.findById(user._id).select("-password -refreshToken");

            if (!createdUser) {
                throw new ApiError(500, "Error while creating new user");
            }

            return res
                .status(200)
                .json(new ApiResponse(200, createdUser, "User created successfully"));
        }
    );

    static loginUser = asyncHandler(
        async (req: CustomRequest<LoginRequestBody>, res: Response): Promise<Response> => {
            const { email, username, number, password } = req.body;

            if (!username && !email && !number) {
                throw new ApiError(400, "Username or email or number is required");
            }

            const user = (await User.findOne({
                $or: [{ username }, { email }, { number }],
            })) as IUser;

            if (!user) {
                throw new ApiError(404, "User not registered");
            }

            const isPasswordValid = await user.isPasswordCorrect(password);

            if (!isPasswordValid) {
                throw new ApiError(401, "Incorrect Password");
            }

            const userId = (user._id as Types.ObjectId).toString();

            const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(userId);
            const loggedInUser = await User.findById(user._id).select("-password -refreshToken");

            const options = { httpOnly: true, secure: true };

            return res
                .status(200)
                .cookie("accessToken", accessToken, options)
                .cookie("refreshToken", refreshToken, options)
                .json(
                    new ApiResponse(
                        200,
                        { user: loggedInUser, accessToken, refreshToken },
                        "User logged in successfully"
                    )
                );
        }
    );

    static logoutUser = asyncHandler(
        async (req: CustomRequest, res: Response): Promise<Response> => {
            if (!req.user) {
                return res.status(401).json(new ApiResponse(401, {}, "Unauthorized"));
            }
            await User.findByIdAndUpdate(
                req.user._id,
                { $unset: { refreshToken: 1 } },
                { new: true }
            );

            const options = { httpOnly: true, secure: true };

            return res
                .status(200)
                .clearCookie("accessToken", options)
                .clearCookie("refreshToken", options)
                .json(new ApiResponse(200, {}, "User logged out"));
        }
    );

    static refreshAccessToken = asyncHandler(
        async (req: CustomRequest, res: Response): Promise<Response> => {
            const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken;

            if (!incomingRefreshToken) {
                throw new ApiError(401, "Unauthorized request");
            }

            const decodedToken = jwt.verify(
                incomingRefreshToken,
                process.env.REFRESH_TOKEN_SECRET as string
            ) as { _id: string };

            const user = (await User.findById(decodedToken._id)) as IUser;

            if (!user || incomingRefreshToken !== user.refreshToken) {
                throw new ApiError(401, "Invalid or expired refresh token");
            }

            const userId = (user._id as Types.ObjectId).toString();

            const { accessToken, refreshToken: newRefreshToken } =
                await generateAccessAndRefreshTokens(userId);

            return res
                .status(200)
                .cookie("accessToken", accessToken, { httpOnly: true, secure: true })
                .cookie("refreshToken", newRefreshToken, { httpOnly: true, secure: true })
                .json(
                    new ApiResponse(
                        200,
                        { accessToken, refreshToken: newRefreshToken },
                        "Access token refreshed"
                    )
                );
        }
    );

    static changeCurrentPassword = asyncHandler(
        async (req: CustomRequest<ChangePasswordRequestBody>, res: Response): Promise<Response> => {
            const { oldPassword, newPassword } = req.body;

            if (!oldPassword || !newPassword) {
                throw new ApiError(400, "Both old and new passwords are required");
            }

            const user = (await User.findById(req.user?._id)) as IUser;
            if (!user) throw new ApiError(404, "User not found");

            const isPasswordCorrect = await user.isPasswordCorrect(oldPassword);
            if (!isPasswordCorrect) throw new ApiError(400, "Invalid old password");

            user.password = newPassword;
            await user.save({ validateBeforeSave: false });

            return res.status(200).json(new ApiResponse(200, {}, "Password changed successfully"));
        }
    );

    static resetPassword = asyncHandler(
        async (req: AuthRequest, res: Response): Promise<Response> => {
            const { newPassword } = req.body;

            if (!newPassword) {
                throw new ApiError(400, "New password is required");
            }

            const user = (await User.findById(req.user?._id)) as IUser;
            if (!user) throw new ApiError(404, "User not found");

            user.password = newPassword;
            await user.save({ validateBeforeSave: false });

            return res.status(200).json(new ApiResponse(200, {}, "Password reset successful"));
        }
    );

    static getCurrentUser = asyncHandler(
        async (req: CustomRequest, res: Response): Promise<Response> => {
            const user = await User.findById(req.user!._id);
            return res
                .status(200)
                .json(new ApiResponse(200, user, "Current User fetched successfully"));
        }
    );

    static updateUserAvatar = asyncHandler(
        async (req: MulterRequest, res: Response): Promise<Response> => {
            const { files } = req.files as AttachmentRequest;

            if (!files || !files.attachments) {
                throw new ApiError(400, "Avatar file is missing");
            }

            console.log("File received");

            const avatar = await uploadOnCloudinary(files.attachments[0].path);
            if (!avatar) throw new ApiError(400, "Error while uploading avatar");

            const oldUser = await User.findById(req.user?._id).select("avatarId");
            if (oldUser?.avatarId) {
                await deleteFromCloudinary(oldUser.avatarId);
            }

            const user = await User.findByIdAndUpdate(
                req.user?._id,
                { avatar: avatar.url, avatarId: avatar.public_id },
                { new: true }
            ).select("-password");

            return res.status(200).json(new ApiResponse(200, user, "Avatar updated successfully"));
        }
    );

    static checkUsername = asyncHandler(async (req: AuthRequest, res: Response) => {
        const { username } = req.params;
        const user = await User.findOne({ username });
        let available = false;
        console.log(user);
        console.log(req.user);

        if (!user) {
            available = true;
        } else if (req.user?._id && user._id.toString() === req.user._id.toString()) {
            available = true;
        }

        return res
            .status(200)
            .json(new ApiResponse(200, { available }, "Username check successfully"));
    });

    static checkNumber = asyncHandler(async (req: Request, res: Response) => {
        const { number } = req.params;
        const user = await User.findOne({ number });
        return res
            .status(200)
            .json(new ApiResponse(200, { available: !user }, "Number check successfully"));
    });

    static checkEmail = asyncHandler(async (req: Request, res: Response) => {
        const { email } = req.params;
        const user = await User.findOne({ email });
        return res
            .status(200)
            .json(new ApiResponse(200, { available: !user }, "Email check successfully"));
    });

    static updateUser = asyncHandler(async (req: AuthRequest, res: Response) => {
        const { username, email, number, password } = req.body;
        if (username) {
            const user = await User.findOne({ $or: [username, email, number] });
            if (user) throw new ApiError(407, "User with same username, email or number exists");
        }

        const user = await User.findById(req.user!._id);
        if (!user) throw new ApiError(404, "User not found");

        const passwordCorrect = user.isPasswordCorrect(password);
        if (!passwordCorrect) throw new ApiError(403, "Unauthorized");

        const updatedUser = await User.findByIdAndUpdate(req.user!._id, req.body);

        return res
            .status(200)
            .json(new ApiResponse(200, { user: updatedUser }, "User updated successfully"));
    });
}
