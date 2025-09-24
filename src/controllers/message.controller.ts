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
import { deleteFromCloudinary, uploadOnCloudinary } from "../utils/cloudinary";

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

    static deleteMessages = asyncHandler(async (req: AuthRequest, res: Response) => {
        const { chatId } = req.params;
        const { messageIds } = req.body as { messageIds: string[] };

        if (!Array.isArray(messageIds) || messageIds.length === 0) {
            throw new ApiError(400, "No message IDs provided");
        }

        const chat = await Chat.findOne({
            _id: new mongoose.Types.ObjectId(chatId),
            participants: req.user!._id,
        });

        if (!chat) {
            throw new ApiError(404, "Chat does not exist");
        }

        const messages = await ChatMessage.find({
            _id: { $in: messageIds.map((id) => new mongoose.Types.ObjectId(id)) },
        });

        if (messages.length === 0) {
            throw new ApiError(404, "No messages found");
        }

        const unauthorized = messages.some(
            (msg) => msg.sender.toString() !== req.user!._id.toString()
        );
        if (unauthorized) {
            throw new ApiError(403, "Not authorized to delete one or more messages");
        }

        const allAttachments = messages.flatMap((msg) => msg.attachments || []);

        await ChatMessage.deleteMany({
            _id: { $in: messageIds.map((id) => new mongoose.Types.ObjectId(id)) },
        });

        if (chat.lastMessage && messageIds.includes(chat.lastMessage.toString())) {
            const lastMessage = await ChatMessage.findOne(
                { chat: chatId },
                {},
                { sort: { createdAt: -1 } }
            );

            await Chat.findByIdAndUpdate(chatId, {
                lastMessage: lastMessage ? lastMessage._id : null,
            });
        }

        emitSocketEvent(req, chatId, ChatEventEnum.MESSAGE_DELETE_EVENT, {});

        res.status(200).json(new ApiResponse(200, messages, "Messages deleted successfully"));

        if (allAttachments.length > 0) {
            (async () => {
                try {
                    const deletePromises = allAttachments.map((asset) =>
                        deleteFromCloudinary(asset.publicId)
                    );
                    await Promise.all(deletePromises);
                } catch (err) {
                    console.error("Background attachment deletion failed:", err);
                }
            })();
        }
    });

    static uploadMessageAttachments = asyncHandler(async (req: AuthRequest, res: Response) => {
        const files = req.files as Express.Multer.File[];

        if (!files || files.length === 0) {
            throw new ApiError(400, "No attachments provided");
        }

        const uploadPromises = files.map((attachment) => uploadOnCloudinary(attachment.path));

        const results = await Promise.all(uploadPromises);

        const uploadedFiles = results
            .filter((r) => r) // drop failed uploads if any
            .map((result) => ({
                url: result!.url,
                publicId: result!.public_id,
            }));

        if (!uploadedFiles.length) {
            throw new ApiError(400, "Error while uploading attachments");
        }

        return res
            .status(201)
            .json(new ApiResponse(201, uploadedFiles, "Attachments uploaded successfully"));
    });
}
