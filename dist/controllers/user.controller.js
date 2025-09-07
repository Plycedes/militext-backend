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
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserController = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const user_model_1 = require("../models/user.model");
const ApiError_1 = require("../utils/ApiError");
const asyncHandler_1 = require("../utils/asyncHandler");
const ApiResponse_1 = require("../utils/ApiResponse");
const generateProfilePicture_1 = require("../utils/generateProfilePicture");
const cloudinary_1 = require("../utils/cloudinary");
const generateAccessAndRefreshTokens = (userId) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = yield user_model_1.User.findById(userId);
        if (!user)
            throw new ApiError_1.ApiError(404, "User not found");
        const accessToken = user.generateAccessToken();
        const refreshToken = user.generateRefreshToken();
        user.refreshToken = refreshToken;
        yield user.save({ validateBeforeSave: false });
        return { accessToken, refreshToken };
    }
    catch (error) {
        throw new ApiError_1.ApiError(500, "Error generating tokens");
    }
});
class UserController {
}
exports.UserController = UserController;
_a = UserController;
UserController.registerUser = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { email, username, number, password } = req.body;
    if ([email, username, number, password].some((field) => (field === null || field === void 0 ? void 0 : field.trim()) === "")) {
        throw new ApiError_1.ApiError(400, "No field can be empty");
    }
    const existingUser = yield user_model_1.User.findOne({ $or: [{ username }, { number }, { email }] });
    if (existingUser) {
        throw new ApiError_1.ApiError(409, "Username or Email already exists");
    }
    const pfp = yield (0, generateProfilePicture_1.generateProfilePicture)(username);
    if (!pfp) {
        throw new ApiError_1.ApiError(500, "Failed to generate profile picture");
    }
    const user = yield user_model_1.User.create({
        username,
        email,
        number,
        password,
        avatar: pfp.url,
        avatarId: pfp.public_id,
    });
    const createdUser = yield user_model_1.User.findById(user._id).select("-password -refreshToken");
    if (!createdUser) {
        throw new ApiError_1.ApiError(500, "Error while creating new user");
    }
    return res
        .status(200)
        .json(new ApiResponse_1.ApiResponse(200, createdUser, "User created successfully"));
}));
UserController.loginUser = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { email, username, number, password } = req.body;
    if (!username && !email && !number) {
        throw new ApiError_1.ApiError(400, "Username or email or number is required");
    }
    const user = (yield user_model_1.User.findOne({
        $or: [{ username }, { email }, { number }],
    }));
    if (!user) {
        throw new ApiError_1.ApiError(404, "User not registered");
    }
    const isPasswordValid = yield user.isPasswordCorrect(password);
    if (!isPasswordValid) {
        throw new ApiError_1.ApiError(401, "Incorrect Password");
    }
    const userId = user._id.toString();
    const { accessToken, refreshToken } = yield generateAccessAndRefreshTokens(userId);
    const loggedInUser = yield user_model_1.User.findById(user._id).select("-password -refreshToken");
    const options = { httpOnly: true, secure: true };
    return res
        .status(200)
        .cookie("accessToken", accessToken, options)
        .cookie("refreshToken", refreshToken, options)
        .json(new ApiResponse_1.ApiResponse(200, { user: loggedInUser, accessToken, refreshToken }, "User logged in successfully"));
}));
UserController.logoutUser = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    if (!req.user) {
        return res.status(401).json(new ApiResponse_1.ApiResponse(401, {}, "Unauthorized"));
    }
    yield user_model_1.User.findByIdAndUpdate(req.user._id, { $unset: { refreshToken: 1 } }, { new: true });
    const options = { httpOnly: true, secure: true };
    return res
        .status(200)
        .clearCookie("accessToken", options)
        .clearCookie("refreshToken", options)
        .json(new ApiResponse_1.ApiResponse(200, {}, "User logged out"));
}));
UserController.refreshAccessToken = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken;
    if (!incomingRefreshToken) {
        throw new ApiError_1.ApiError(401, "Unauthorized request");
    }
    const decodedToken = jsonwebtoken_1.default.verify(incomingRefreshToken, process.env.REFRESH_TOKEN_SECRET);
    const user = (yield user_model_1.User.findById(decodedToken._id));
    if (!user || incomingRefreshToken !== user.refreshToken) {
        throw new ApiError_1.ApiError(401, "Invalid or expired refresh token");
    }
    const userId = user._id.toString();
    const { accessToken, refreshToken: newRefreshToken } = yield generateAccessAndRefreshTokens(userId);
    return res
        .status(200)
        .cookie("accessToken", accessToken, { httpOnly: true, secure: true })
        .cookie("refreshToken", newRefreshToken, { httpOnly: true, secure: true })
        .json(new ApiResponse_1.ApiResponse(200, { accessToken, refreshToken: newRefreshToken }, "Access token refreshed"));
}));
UserController.changeCurrentPassword = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _b;
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) {
        throw new ApiError_1.ApiError(400, "Both old and new passwords are required");
    }
    const user = (yield user_model_1.User.findById((_b = req.user) === null || _b === void 0 ? void 0 : _b._id));
    if (!user)
        throw new ApiError_1.ApiError(404, "User not found");
    const isPasswordCorrect = yield user.isPasswordCorrect(oldPassword);
    if (!isPasswordCorrect)
        throw new ApiError_1.ApiError(400, "Invalid old password");
    user.password = newPassword;
    yield user.save({ validateBeforeSave: false });
    return res.status(200).json(new ApiResponse_1.ApiResponse(200, {}, "Password changed successfully"));
}));
UserController.resetPassword = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _b;
    const { newPassword } = req.body;
    if (!newPassword) {
        throw new ApiError_1.ApiError(400, "New password is required");
    }
    const user = (yield user_model_1.User.findById((_b = req.user) === null || _b === void 0 ? void 0 : _b._id));
    if (!user)
        throw new ApiError_1.ApiError(404, "User not found");
    user.password = newPassword;
    yield user.save({ validateBeforeSave: false });
    return res.status(200).json(new ApiResponse_1.ApiResponse(200, {}, "Password reset successful"));
}));
UserController.getCurrentUser = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    return res
        .status(200)
        .json(new ApiResponse_1.ApiResponse(200, req.user, "Current User fetched successfully"));
}));
UserController.updateUserAvatar = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _b, _c;
    const { files } = req.files;
    if (!files || !files.attachments) {
        throw new ApiError_1.ApiError(400, "Avatar file is missing");
    }
    console.log("File received");
    const avatar = yield (0, cloudinary_1.uploadOnCloudinary)(files.attachments[0].path);
    if (!avatar)
        throw new ApiError_1.ApiError(400, "Error while uploading avatar");
    const oldUser = yield user_model_1.User.findById((_b = req.user) === null || _b === void 0 ? void 0 : _b._id).select("avatarId");
    if (oldUser === null || oldUser === void 0 ? void 0 : oldUser.avatarId) {
        yield (0, cloudinary_1.deleteFromCloudinary)(oldUser.avatarId);
    }
    const user = yield user_model_1.User.findByIdAndUpdate((_c = req.user) === null || _c === void 0 ? void 0 : _c._id, { avatar: avatar.url, avatarId: avatar.public_id }, { new: true }).select("-password");
    return res.status(200).json(new ApiResponse_1.ApiResponse(200, user, "Avatar updated successfully"));
}));
