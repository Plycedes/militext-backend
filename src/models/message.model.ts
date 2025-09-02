import mongoose, { Schema, Document, Types, Model } from "mongoose";

interface IAttachment {
    url: string;
    localPath: string;
}

export interface IMessage extends Document {
    sender: Types.ObjectId;
    content: string;
    attachments: IAttachment[];
    chat: Types.ObjectId;
    createdAt?: Date;
    updatedAt?: Date;
}

const messageSchema = new Schema<IMessage>(
    {
        sender: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        content: {
            type: String,
            required: true,
        },
        attachments: {
            type: [
                {
                    url: { type: String, required: true },
                    localPath: { type: String, required: true },
                },
            ],
            default: [],
        },
        chat: {
            type: Schema.Types.ObjectId,
            ref: "Chat",
            required: true,
        },
    },
    { timestamps: true }
);

export const ChatMessage: Model<IMessage> = mongoose.model<IMessage>("ChatMessage", messageSchema);
