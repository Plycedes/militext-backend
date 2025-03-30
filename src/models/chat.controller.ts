import mongoose, { Schema, Document, Types } from "mongoose";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { JsonObject } from "../types/jsonTypes";
import dotenv from "dotenv";

dotenv.config();

export interface IChat extends Document {
    name: string;
    isGroupChat: boolean;
    lastMessage: Types.ObjectId;
    participants: Types.ObjectId[];
    admin: Types.ObjectId;
}

const chatSchema = new Schema<IChat>(
    {
        name: {
            type: String,
            required: true,
        },
        isGroupChat: {
            type: Boolean,
            default: false,
        },
        lastMessage: {
            type: Schema.Types.ObjectId,
            ref: "ChatMessage",
        },
        participants: [
            {
                type: Schema.Types.ObjectId,
                ref: "User",
            },
        ],
        admin: {
            type: Schema.Types.ObjectId,
            ref: "User",
        },
    },
    { timestamps: true }
);

export const Chat = mongoose.model("Chat", chatSchema);
