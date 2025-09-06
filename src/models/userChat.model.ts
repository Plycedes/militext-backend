import mongoose, { Schema, Document, Model, Types } from "mongoose";

export interface IUserChat extends Document {
    chatId: Types.ObjectId;
    userId: Types.ObjectId;
    lastRead?: Date;
    unreadCount: number;
    muted?: boolean;
    nickname?: string;
}

const userChatSchema = new Schema<IUserChat>(
    {
        chatId: {
            type: Schema.Types.ObjectId,
            ref: "Chat",
            required: true,
            index: true,
        },
        userId: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        lastRead: {
            type: Date,
            default: null,
        },
        unreadCount: {
            type: Number,
            default: 0,
        },
        muted: {
            type: Boolean,
            default: false,
        },
        nickname: {
            type: String,
        },
    },
    { timestamps: true }
);

userChatSchema.index({ userId: 1, chatId: 1 }, { unique: true });

export const UserChat: Model<IUserChat> =
    mongoose.models.UserChat || mongoose.model<IUserChat>("UserChat", userChatSchema);
