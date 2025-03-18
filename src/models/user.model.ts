import bcrypt from "bcrypt";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import mongoose, { Schema, Document, Model, Types } from "mongoose";
import { JsonObject } from "../types/jsonTypes";
import {
    AvailableSocialLogins,
    AvailableUserRoles,
    USER_TEMPORARY_TOKEN_EXPIRY,
    UserLoginType,
    UserRolesEnum,
} from "../constants";

export interface IUser extends Document {
    avatar: {
        url: string;
        localPath: string;
    };
    username: string;
    email: string;
    role: string;
    password: string;
    loginType: string;
    isEmailVerified: boolean;
    refreshToken?: string;
    forgotPasswordToken?: string;
    forgotPasswordExpiry?: Date;
    emailVerificationToken?: string;
    emailVerificationExpiry?: Date;
    isPasswordCorrect(password: string): Promise<boolean>;
    generateAccessToken(): string;
    generateRefreshToken(): string;
    generateTemporaryToken(): {
        unHashedToken: string;
        hashedToken: string;
        tokenExpiry: number;
    };
}

const userSchema = new Schema<IUser>(
    {
        avatar: {
            type: {
                url: String,
                localPath: String,
            },
            default: {
                url: `https://via.placeholder.com/200x200.png`,
                localPath: "",
            },
        },
        username: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
            index: true,
        },
        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
        },
        role: {
            type: String,
            enum: AvailableUserRoles,
            default: UserRolesEnum.USER,
            required: true,
        },
        password: {
            type: String,
            required: [true, "Password is required"],
        },
        loginType: {
            type: String,
            enum: AvailableSocialLogins,
            default: UserLoginType.EMAIL_PASSWORD,
        },
        isEmailVerified: {
            type: Boolean,
            default: false,
        },
        refreshToken: String,
        forgotPasswordToken: String,
        forgotPasswordExpiry: Date,
        emailVerificationToken: String,
        emailVerificationExpiry: Date,
    },
    { timestamps: true }
);

userSchema.pre<IUser>("save", async function (next) {
    if (!this.isModified("password")) return next();
    this.password = await bcrypt.hash(this.password, 10);
    next();
});

userSchema.methods.isPasswordCorrect = async function (password: string): Promise<boolean> {
    return bcrypt.compare(password, this.password);
};

userSchema.methods.generateAccessToken = function (): string {
    const payload: JsonObject = {
        _id: (this._id as Types.ObjectId).toString(),
        email: this.email,
        username: this.username,
        role: this.role,
    };

    const secret = process.env.ACCESS_TOKEN_SECRET as string;
    if (!secret) {
        throw new Error("Access token secret is not defined in environment variables");
    }

    const options: jwt.SignOptions = {
        expiresIn: "1d",
    };

    return jwt.sign(payload, secret, options);
};

userSchema.methods.generateRefreshToken = function (): string {
    const payload: JsonObject = {
        _id: (this._id as Types.ObjectId).toString(),
    };

    const secret = process.env.REFRESH_TOKEN_SECRET as string;
    if (!secret) {
        throw new Error("Refresh token secret is not defined in environment variables");
    }

    const options: jwt.SignOptions = {
        expiresIn: "10d",
    };

    return jwt.sign(payload, secret, options);
};

userSchema.methods.generateTemporaryToken = function () {
    const unHashedToken = crypto.randomBytes(20).toString("hex");

    const hashedToken = crypto.createHash("sha256").update(unHashedToken).digest("hex");

    const tokenExpiry = Date.now() + USER_TEMPORARY_TOKEN_EXPIRY;

    return { unHashedToken, hashedToken, tokenExpiry };
};

export const User: Model<IUser> = mongoose.model<IUser>("User", userSchema);
