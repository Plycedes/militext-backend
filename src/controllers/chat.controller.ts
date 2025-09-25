import mongoose, { PipelineStage, Types } from "mongoose";
import { Chat } from "../models/chat.model";
import { ChatMessage, IMessage } from "../models/message.model";
import { removeLocalFile } from "../utils/helpers";
import { asyncHandler } from "../utils/asyncHandler";
import { AuthRequest } from "../middlewares/auth.middleware";
import { IUser, User } from "../models/user.model";
import { ApiResponse } from "../utils/ApiResponse";
import { Response } from "express";
import { ApiError } from "../utils/ApiError";
import { emitSocketEvent } from "../socket";
import { ChatEventEnum } from "../constants";
import { UserChat } from "../models/userChat.model";
import { uploadOnCloudinary, deleteFromCloudinary } from "../utils/cloudinary";

const chatCommonAggregation = (): PipelineStage[] => [
    {
        $lookup: {
            from: "users",
            foreignField: "_id",
            localField: "participants",
            as: "participants",
            pipeline: [
                {
                    $project: {
                        password: 0,
                        refreshToken: 0,
                        forgotPasswordToken: 0,
                        forgotPasswordExpiry: 0,
                        emailVerificationToken: 0,
                        emailVerificationExpiry: 0,
                    },
                },
            ],
        },
    },
    {
        $lookup: {
            from: "chatmessages",
            foreignField: "_id",
            localField: "lastMessage",
            as: "lastMessage",
            pipeline: [
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
            ],
        },
    },
    {
        $addFields: {
            lastMessage: { $first: "$lastMessage" },
        },
    },
];

const chatCommonAggregation2 = (currentUserId: mongoose.Types.ObjectId): PipelineStage[] => [
    {
        $lookup: {
            from: "users",
            foreignField: "_id",
            localField: "participants",
            as: "participants",
            pipeline: [
                {
                    $match: {
                        _id: { $ne: currentUserId }, // 🚀 exclude current user
                    },
                },
                {
                    $project: {
                        password: 0,
                        refreshToken: 0,
                        forgotPasswordToken: 0,
                        forgotPasswordExpiry: 0,
                        emailVerificationToken: 0,
                        emailVerificationExpiry: 0,
                    },
                },
            ],
        },
    },
    {
        $lookup: {
            from: "chatmessages",
            foreignField: "_id",
            localField: "lastMessage",
            as: "lastMessage",
            pipeline: [
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
            ],
        },
    },
    {
        $addFields: {
            lastMessage: { $first: "$lastMessage" },
        },
    },
];

const deleteCascadeChatMessages = async (chatId: string | Types.ObjectId): Promise<void> => {
    const messages: IMessage[] = await ChatMessage.find({
        chat: new mongoose.Types.ObjectId(chatId),
    });

    let attachments: { publicId: string }[] = [];

    attachments = attachments.concat(...messages.map((message) => message.attachments));

    const deletePromises = attachments.map((attachment) => {
        deleteFromCloudinary(attachment.publicId);
    });

    await Promise.all(deletePromises);

    await ChatMessage.deleteMany({
        chat: new mongoose.Types.ObjectId(chatId),
    });
};

export class ChatController {
    static searchAvailableUsers = asyncHandler(
        async (req: AuthRequest, res: Response): Promise<Response> => {
            const users = await User.aggregate([
                {
                    $match: {
                        _id: {
                            $ne: req.user!._id,
                        },
                    },
                },
                {
                    $project: {
                        avatar: 1,
                        username: 1,
                        email: 1,
                    },
                },
            ]);

            return res.status(200).json(new ApiResponse(200, users, "Users fetched successfully"));
        }
    );

    static getAOneOnOneChat = asyncHandler(async (req: AuthRequest, res: Response) => {
        const { receiverId: chatId } = req.params;

        const chat = await Chat.aggregate([
            {
                $match: {
                    _id: new mongoose.Types.ObjectId(chatId),
                },
            },
            ...chatCommonAggregation2(req.user!._id),
            // Count messages in this chat
            {
                $lookup: {
                    from: "chatmessages",
                    localField: "_id",
                    foreignField: "chat",
                    as: "messages",
                },
            },
            {
                $addFields: {
                    messageCount: { $size: "$messages" },
                },
            },
            {
                $project: {
                    messages: 0, // don’t send actual messages
                },
            },
            // Count common groups between both participants
            {
                $lookup: {
                    from: "chats",
                    let: { participants: "$participants._id" },
                    pipeline: [
                        {
                            $match: {
                                isGroup: true,
                                $expr: {
                                    $setIsSubset: ["$$participants", "$participants"],
                                },
                            },
                        },
                        { $count: "commonGroupCount" },
                    ],
                    as: "commonGroups",
                },
            },
            {
                $addFields: {
                    commonGroupCount: {
                        $ifNull: [{ $arrayElemAt: ["$commonGroups.commonGroupCount", 0] }, 0],
                    },
                },
            },
        ]);

        if (!chat.length) {
            throw new ApiError(404, "Users not linked");
        }

        const chatData = chat[0];

        const friendshipLevel = Math.min(69, Math.floor(chatData.messageCount / 10));

        let friendshipLabel = "Acquaintance";
        if (friendshipLevel >= 5) friendshipLabel = "Friend";
        if (friendshipLevel >= 15) friendshipLabel = "Close Friend";
        if (friendshipLevel >= 30) friendshipLabel = "Best Friend";
        if (friendshipLevel >= 50) friendshipLabel = "Soulmate";
        if (friendshipLevel >= 69) friendshipLabel = "Inseparable";

        const responseData = {
            ...chatData,
            friendshipLevel,
            friendshipLabel,
        };

        return res
            .status(200)
            .json(new ApiResponse(200, responseData, "Chat retrieved successfully"));
    });

    // ---------------- One-on-one chat ----------------
    static createAOneOnOneChat = asyncHandler(async (req: AuthRequest, res: Response) => {
        const { receiverId: receiverNum } = req.params;

        const participant = await User.findOne({ number: receiverNum });
        if (!participant) {
            throw new ApiError(404, "Number not registered on the Grid");
        }
        if (req.user!._id.toString() === participant._id.toString()) {
            throw new ApiError(404, "You cannot link with yourself");
        }

        // 1. Create chat
        const newChatInstance = await Chat.create({
            name: "One on one chat",
            participants: [req.user!._id, participant._id],
            admin: req.user!._id,
        });

        // 2. Create UserChat entries for participants
        const members = [req.user!._id, participant._id];
        await Promise.all(
            members.map((userId) =>
                UserChat.create({
                    chatId: newChatInstance._id,
                    userId,
                    lastRead: new Date(),
                    unreadCount: 0,
                })
            )
        );

        // 3. Return aggregated chat payload
        const createdChat = await Chat.aggregate([
            { $match: { _id: newChatInstance._id } },
            ...chatCommonAggregation2(req.user!._id),
        ]);

        const payload = createdChat[0];
        if (!payload) {
            throw new ApiError(500, "Internal server error");
        }

        // 4. Emit socket events
        payload?.participants?.forEach((p: IUser) => {
            if (p._id.toString() === req.user!._id.toString()) return;
            emitSocketEvent(req, p._id?.toString(), ChatEventEnum.NEW_CHAT_EVENT, payload);
        });

        return res.status(201).json(new ApiResponse(201, payload, "Linked successfully"));
    });

    // ---------------- Group chat ----------------
    static createAGroupChat = asyncHandler(async (req: AuthRequest, res: Response) => {
        const { name, numbers } = req.body as { name: string; numbers: string[] };

        const participants: string[] = await User.find({ number: { $in: numbers } }).then((users) =>
            users.map((user) => user._id.toString())
        );

        if (participants.includes(req.user!._id.toString())) {
            throw new ApiError(400, "Participants array should not contain the group creator");
        }

        const members = [...new Set([...participants, req.user!._id.toString()])];

        if (members.length < 3) {
            throw new ApiError(400, "Seems like you have passed duplicate participants");
        }

        // 1. Create group chat
        const groupChat = await Chat.create({
            name,
            isGroupChat: true,
            participants: members,
            admin: [req.user!._id],
            superAdmin: req.user!._id,
        });

        // 2. Create UserChat entries for participants
        await Promise.all(
            members.map((userId) =>
                UserChat.create({
                    chatId: groupChat._id,
                    userId,
                    lastRead: new Date(),
                    unreadCount: 0,
                })
            )
        );

        // 3. Return aggregated chat payload
        const chat = await Chat.aggregate([
            { $match: { _id: groupChat._id } },
            ...chatCommonAggregation(),
        ]);

        const payload = chat[0];
        if (!payload) {
            throw new ApiError(500, "Internal server error");
        }

        // 4. Emit socket events
        payload?.participants?.forEach((p: IUser) => {
            if (p._id.toString() === req.user!._id.toString()) return;
            emitSocketEvent(req, p._id?.toString(), ChatEventEnum.NEW_CHAT_EVENT, payload);
        });

        return res
            .status(201)
            .json(new ApiResponse(201, payload, "Group chat created successfully"));
    });

    static getGroupChatDetails = asyncHandler(async (req: AuthRequest, res: Response) => {
        const { chatId } = req.params;
        const groupChat = await Chat.aggregate([
            {
                $match: {
                    _id: new mongoose.Types.ObjectId(chatId),
                    isGroupChat: true,
                },
            },
            ...chatCommonAggregation(),
            {
                $lookup: {
                    from: "chatmessages",
                    localField: "_id",
                    foreignField: "chat",
                    as: "messages",
                },
            },
            {
                $addFields: {
                    messageCount: { $size: "$messages" },
                },
            },
            {
                $project: {
                    messages: 0,
                },
            },
        ]);

        const chatData = groupChat[0];

        if (!chatData) {
            throw new ApiError(404, "Group chat not found");
        }

        const friendshipLevel = Math.min(69, Math.floor(chatData.messageCount / 10));

        let friendshipLabel = "Casual Crew";
        if (friendshipLevel >= 5) friendshipLabel = "Regulars";
        if (friendshipLevel >= 15) friendshipLabel = "Inner Circle";
        if (friendshipLevel >= 30) friendshipLabel = "Family vibes";
        if (friendshipLevel >= 50) friendshipLabel = "Generational";
        if (friendshipLevel >= 69) friendshipLabel = "Synonyms";

        const responseData = {
            ...chatData,
            friendshipLevel,
            friendshipLabel,
        };

        return res
            .status(200)
            .json(new ApiResponse(200, responseData, "Group chat fetched successfully"));
    });

    static renameGroupChat = asyncHandler(async (req: AuthRequest, res: Response) => {
        const { chatId } = req.params;
        const { name } = req.body as { name: string };

        const groupChat = await Chat.findOne({
            _id: new mongoose.Types.ObjectId(chatId),
            isGroupChat: true,
        });

        if (!groupChat) {
            throw new ApiError(404, "Group chat does not exist");
        }

        if (!groupChat.admin.some((id) => id.toString() === req.user!._id.toString())) {
            throw new ApiError(404, "You are not an admin");
        }

        const updatedGroupChat = await Chat.findByIdAndUpdate(
            chatId,
            {
                $set: {
                    name,
                },
            },
            { new: true }
        );

        const chat = await Chat.aggregate([
            {
                $match: {
                    _id: updatedGroupChat!._id,
                },
            },
            ...chatCommonAggregation(),
        ]);

        const payload = chat[0];

        if (!payload) {
            throw new ApiError(500, "Internal server error");
        }

        payload?.participants?.forEach((participant: IUser) => {
            emitSocketEvent(
                req,
                participant._id?.toString(),
                ChatEventEnum.UPDATE_GROUP_NAME_EVENT,
                payload
            );
        });

        return res
            .status(200)
            .json(new ApiResponse(200, chat[0], "Group chat name updated successfully"));
    });

    static updateGroupAvatar = asyncHandler(async (req: AuthRequest, res: Response) => {
        const { chatId } = req.params;
        if (!req.file?.path) {
            throw new ApiError(400, "Avatar file is missing!!");
        }

        console.log("File received");

        const avatar = await uploadOnCloudinary(req.file.path);
        if (!avatar) throw new ApiError(400, "Error while uploading avatar");

        const oldChat = await Chat.findById(req.user?._id).select("avatarId");
        if (oldChat?.avatarId) {
            await deleteFromCloudinary(oldChat.avatarId);
        }

        const chat = await Chat.findByIdAndUpdate(
            chatId,
            { avatar: avatar.url, avatarId: avatar.public_id },
            { new: true }
        );

        return res.status(200).json(new ApiResponse(200, chat, "Avatar updated successfully"));
    });

    static deleteChat = asyncHandler(
        async (req: AuthRequest<{ chatIds: string[] }>, res: Response) => {
            const { chatIds } = req.body;

            if (!chatIds || chatIds.length === 0) {
                throw new ApiError(400, "No chatIds provided");
            }

            const chats = await Chat.find({ _id: { $in: chatIds } });

            if (chats.length === 0) {
                throw new ApiError(404, "No chats found");
            }

            // Process each chat
            const updatedChats = await Promise.all(
                chats.map(async (chat) => {
                    if (!chat.participants.includes(req.user!._id)) {
                        throw new ApiError(400, `User not a participant of chat ${chat._id}`);
                    }

                    if (!chat.deletedBy.includes(req.user!._id)) {
                        chat.deletedBy.push(req.user!._id);
                        await chat.save();
                    }

                    return chat;
                })
            );

            return res
                .status(200)
                .json(new ApiResponse(200, updatedChats, "Chats marked deleted successfully"));
        }
    );

    static leaveGroupChat = asyncHandler(async (req: AuthRequest, res: Response) => {
        const { chatId } = req.params;

        const groupChat = await Chat.findOne({
            _id: new mongoose.Types.ObjectId(chatId),
            isGroupChat: true,
        });

        if (!groupChat) {
            throw new ApiError(404, "Group chat does not exist");
        }

        const existingParticipants: Types.ObjectId[] = groupChat.participants as Types.ObjectId[];

        if (!existingParticipants?.some((id) => id.toString() === req.user!._id.toString())) {
            throw new ApiError(400, "You are not a part of this group chat");
        }

        let updatedChat = await Chat.findByIdAndUpdate(
            chatId,
            [
                {
                    $set: {
                        participants: { $setDifference: ["$participants", [req.user!._id]] },
                        admin: { $setDifference: ["$admin", [req.user!._id]] },
                    },
                },
            ],
            { new: true }
        );

        if (!updatedChat) {
            throw new ApiError(404, "Chat not found");
        }

        if (updatedChat.admin.length === 0) {
            if (updatedChat.participants.length > 0) {
                updatedChat.admin.push(updatedChat.participants[0]);
                if (updatedChat.superAdmin?.toString() === req.user!._id.toString()) {
                    updatedChat.admin.push(updatedChat.participants[0]);
                }
                await updatedChat.save();
            } else {
                await Chat.findByIdAndDelete(chatId);
                updatedChat = null;
            }
        }

        const chat = await Chat.aggregate([
            {
                $match: {
                    _id: updatedChat!._id,
                },
            },
            ...chatCommonAggregation(),
        ]);

        const payload = chat[0];

        if (!payload) {
            throw new ApiError(500, "Internal server error");
        }

        return res.status(200).json(new ApiResponse(200, payload, "Left a group successfully"));
    });

    static promoteToAdmin = asyncHandler(async (req: AuthRequest, res: Response) => {
        const { userId, chatId } = req.body;
        const chat = await Chat.findByIdAndUpdate(chatId, {
            $addToSet: { admin: userId }, // ensures no duplicate entry
        });

        if (!chat) {
            throw new ApiError(404, "Chat not found");
        }

        return res.status(200).json(new ApiResponse(200, {}, "Promoted to admin successfully"));
    });

    static demoteFromAdmin = asyncHandler(async (req: AuthRequest, res: Response) => {
        const { userId, chatId } = req.body;
        const chat = await Chat.findByIdAndUpdate(chatId, {
            $pull: { admin: userId },
        });

        if (!chat) {
            throw new ApiError(404, "Chat not found");
        }

        return res.status(200).json(new ApiResponse(200, {}, "Promoted to admin successfully"));
    });

    static addNewParticipantInGroupChat = asyncHandler(async (req: AuthRequest, res: Response) => {
        const { chatId, participantNum } = req.params;

        const participantId: string | null | undefined = await User.findOne({
            number: participantNum,
        }).then((user) => user?._id.toString());
        if (!participantId) {
            throw new ApiError(404, "Number not found on the Grid");
        }

        const groupChat = await Chat.findOne({
            _id: new mongoose.Types.ObjectId(chatId),
            isGroupChat: true,
        });

        if (!groupChat) {
            throw new ApiError(404, "Group chat does not exists");
        }

        if (!groupChat.admin.some((id) => id.toString() === req.user!._id.toString())) {
            throw new ApiError(404, "You are not an admin");
        }

        const existingParticipants: Types.ObjectId[] = groupChat.participants as Types.ObjectId[];

        if (existingParticipants?.some((id) => id.toString() === participantId)) {
            throw new ApiError(409, "Participant already in the group chat");
        }

        const updateChat = await Chat.findByIdAndUpdate(
            chatId,
            { $push: { participants: participantId } },
            { new: true }
        );

        const chat = await Chat.aggregate([
            {
                $match: {
                    _id: updateChat!._id,
                },
            },
            ...chatCommonAggregation(),
        ]);

        const payload = chat[0];
        if (!payload) {
            throw new ApiError(500, "Internal server error");
        }

        emitSocketEvent(req, participantId, ChatEventEnum.NEW_CHAT_EVENT, payload);

        return res
            .status(200)
            .json(new ApiResponse(200, payload, "Participant added successfully"));
    });

    static removeParticipantFromGroupChat = asyncHandler(
        async (req: AuthRequest, res: Response) => {
            const { chatId, participantNum } = req.params;
            const participantId = participantNum;

            const groupChat = await Chat.findOne({
                _id: new mongoose.Types.ObjectId(chatId),
                isGroupChat: true,
            });

            if (!groupChat) {
                throw new ApiError(404, "Group chat does not exist");
            }

            if (!groupChat.admin.some((id) => id.toString() === req.user!._id.toString())) {
                throw new ApiError(404, "You are not an admin");
            }

            const existingParticipants: Types.ObjectId[] =
                groupChat.participants as Types.ObjectId[];

            if (!existingParticipants?.some((id) => id.toString() === participantId)) {
                throw new ApiError(404, "Participant does not exist in the group chat");
            }

            const updatedChat = await Chat.findByIdAndUpdate(
                chatId,
                { $pull: { participants: participantId, admin: participantId } },
                { new: true }
            );

            const chat = await Chat.aggregate([
                {
                    $match: {
                        _id: updatedChat!._id,
                    },
                },
                ...chatCommonAggregation(),
            ]);

            const payload = chat[0];
            if (!payload) {
                throw new ApiError(500, "Internal server error");
            }

            emitSocketEvent(req, participantId, ChatEventEnum.LEAVE_CHAT_EVENT, payload);

            return res
                .status(200)
                .json(new ApiResponse(200, payload, "Participant removed successfully"));
        }
    );

    static getAllChats = asyncHandler(async (req: AuthRequest, res: Response) => {
        const userId = req.user!._id;

        const chats = await Chat.aggregate([
            {
                $match: {
                    participants: { $elemMatch: { $eq: userId } },
                    deletedBy: { $ne: userId },
                },
            },
            {
                $sort: {
                    updatedAt: -1,
                },
            },
            ...chatCommonAggregation(),
            // 🔗 Join with UserChat
            {
                $lookup: {
                    from: "userchats", // collection name
                    let: { chatId: "$_id" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ["$chatId", "$$chatId"] },
                                        { $eq: ["$userId", userId] },
                                    ],
                                },
                            },
                        },
                        {
                            $project: {
                                unreadCount: 1,
                                lastRead: 1,
                            },
                        },
                    ],
                    as: "userChat",
                },
            },
            {
                $unwind: {
                    path: "$userChat",
                    preserveNullAndEmptyArrays: true,
                },
            },
        ]);

        return res
            .status(200)
            .json(new ApiResponse(200, chats || [], "User chats fetched successfully"));
    });
}
