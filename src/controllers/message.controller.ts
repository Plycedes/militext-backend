import mongoose, { PipelineStage, Types } from "mongoose";
import { asyncHandler } from "../utils/asyncHandler";
import { AuthRequest } from "../middlewares/auth.middleware";
import { Response } from "express";
import { Chat } from "../models/chat.model";
import { ApiError } from "../utils/ApiError";
import { ChatMessage, IMessage } from "../models/message.model";
import { ApiResponse } from "../utils/ApiResponse";
import { MulterRequest } from "../middlewares/multer.middleware";
import { getLocalPath, getStaticFilePath, removeLocalFile } from "../utils/helpers";
import { emitSocketEvent } from "../socket";
import { ChatEventEnum } from "../constants";
import { UserChat } from "../models/userChat.model";

type AttachmentRequest = Request & {
    files?: { attachments?: Express.Multer.File[] };
};

const chatMessageCommonAggregation = (): PipelineStage[] => {
    return [
        {
            $lookup: {
                from: "users",
                foreignField: "_id",
                localField: "sender",
                as: "sender",
                pipeline: [
                    {
                        $project: {
                            username: 1,
                            avatar: 1,
                            email: 1,
                        },
                    },
                ],
            },
        },
        {
            $addFields: {
                sender: { $first: "$sender" },
            },
        },
    ];
};

export class MessageController {
    static getAllMessages = asyncHandler(async (req: AuthRequest, res: Response) => {
        const { chatId } = req.params;
        const userId = req.user!._id;
        const { before, limit = 20 } = req.query;

        const selectedChat = await Chat.findById(chatId);
        if (!selectedChat) {
            throw new ApiError(404, "Chat does not exist");
        }

        if (!selectedChat.participants?.includes(userId)) {
            throw new ApiError(400, "User is not a part of this chat");
        }

        // 🔹 Step 1: Fetch userChat to get lastReadAt
        const userChat = await UserChat.findOne({ chatId, userId });
        const lastRead = userChat?.lastRead;

        // 🔹 Step 2: Fetch messages before updating lastReadAt
        const messages = await ChatMessage.aggregate([
            // {
            //     $match: {
            //         chat: new mongoose.Types.ObjectId(chatId),
            //     },
            // },
            // ...chatMessageCommonAggregation(),
            {
                $match: before
                    ? {
                          chat: new mongoose.Types.ObjectId(chatId),
                          _id: { $lt: new mongoose.Types.ObjectId(before as string) },
                      }
                    : { chat: new mongoose.Types.ObjectId(chatId) },
            },
            ...chatMessageCommonAggregation(),
            { $sort: { createdAt: -1 } },
            { $limit: Number(limit) },
        ]);

        // 🔹 Step 3: Mark messages as read (update lastReadAt + reset unreadCount)
        if (userChat) {
            userChat.lastRead = new Date();
            userChat.unreadCount = 0;
            await userChat.save();
        }

        return res.status(200).json(
            new ApiResponse(
                200,
                {
                    messages: messages.reverse(),
                    lastRead,
                    limit: Number(limit),
                    hasMore: messages.length === Number(limit),
                    nextCursor: messages.length ? messages[0]._id : null,
                },
                "Messages fetched successfully"
            )
        );
    });

    static sendMessage = asyncHandler(async (req: MulterRequest, res: Response) => {
        const { chatId } = req.params;
        const { content } = req.body;

        const { files } = req.files as AttachmentRequest;

        if (!content && !files?.attachments?.length) {
            throw new ApiError(400, "Message content or attachment is required");
        }

        const selectedChat = await Chat.findById(chatId);

        if (!selectedChat) {
            throw new ApiError(404, "Chat does not exist");
        }

        const messageFiles: { url: string; localPath: string }[] = [];

        if (files?.attachments?.length) {
            files.attachments.forEach((attachment) => {
                messageFiles.push({
                    url: getStaticFilePath(req, attachment.filename),
                    localPath: getLocalPath(attachment.filename),
                });
            });
        }

        const message = await ChatMessage.create({
            sender: new mongoose.Types.ObjectId(req.user!._id),
            content: content || "",
            chat: new mongoose.Types.ObjectId(chatId),
            attachments: messageFiles,
        });

        const chat = await Chat.findByIdAndUpdate(
            chatId,
            { $set: { lastMessage: message._id } },
            { new: true }
        );

        const messages = await ChatMessage.aggregate([
            { $match: { _id: new mongoose.Types.ObjectId(message._id as string) } },
            ...chatMessageCommonAggregation(),
        ]);

        const receivedMessage = messages[0];
        if (!receivedMessage) {
            throw new ApiError(500, "Internal server error");
        }

        chat?.participants.forEach((participantObjectId: Types.ObjectId) => {
            if (participantObjectId.toString() === req.user!._id.toString()) return;

            emitSocketEvent(
                req,
                participantObjectId.toString(),
                ChatEventEnum.MESSAGE_RECEIVED_EVENT,
                receivedMessage
            );
        });

        return res
            .status(201)
            .json(new ApiResponse(201, receivedMessage, "Message saved successfully"));
    });

    static deleteMessage = asyncHandler(async (req: AuthRequest, res: Response) => {
        const { chatId, messageId } = req.params;

        const chat = await Chat.findOne({
            _id: new mongoose.Types.ObjectId(chatId),
            participants: req.user!._id,
        });

        if (!chat) {
            throw new ApiError(404, "Chat does not exist");
        }

        const message = await ChatMessage.findOne({
            _id: new mongoose.Types.ObjectId(messageId),
        });

        if (!message) {
            throw new ApiError(404, "Message does not exits");
        }

        if (message.sender.toString() !== req.user!._id.toString()) {
            throw new ApiError(403, "Not authorized to delete");
        }

        if (message.attachments.length > 0) {
            message.attachments.forEach((asset) => removeLocalFile(asset.localPath));
        }

        await ChatMessage.deleteOne({ _id: new mongoose.Types.ObjectId(messageId) });

        if (chat.lastMessage?.toString() === (message._id as string)) {
            const lastMessage = await ChatMessage.findOne(
                { chat: chatId },
                {},
                { sort: { createdAt: -1 } }
            );

            await Chat.findByIdAndUpdate(chatId, {
                lastMessage: lastMessage ? lastMessage._id : null,
            });
        }

        chat.participants.forEach((participantsObjectID: Types.ObjectId) => {
            if (participantsObjectID.toString() === req.user!._id.toString()) return;

            emitSocketEvent(
                req,
                participantsObjectID.toString(),
                ChatEventEnum.MESSAGE_DELETE_EVENT,
                message
            );
        });

        return res.status(200).json(new ApiResponse(200, message, "Message deleted successfully"));
    });
}
