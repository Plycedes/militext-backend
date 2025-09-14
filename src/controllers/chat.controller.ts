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

    let attachments: { localPath: string }[] = [];

    attachments = attachments.concat(...messages.map((message) => message.attachments));

    attachments.forEach((attachment) => {
        removeLocalFile(attachment.localPath);
    });

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
        const { receiverId } = req.params;

        const receiver = await User.findById(receiverId);

        if (!receiver) throw new ApiError(404, "Receiver does not exist");

        if (receiver._id.toString() === req.user!._id.toString()) {
            throw new ApiError(400, "You cannot link with yourself");
        }

        const chat = await Chat.aggregate([
            {
                $match: {
                    isGroupChat: false,
                    $and: [
                        {
                            participants: { $elemMatch: { $eq: req.user!._id } },
                        },
                        {
                            participants: {
                                $elemMatch: { $eq: new mongoose.Types.ObjectId(receiverId) },
                            },
                        },
                    ],
                },
            },
            ...chatCommonAggregation2(req.user!._id),
        ]);

        if (chat.length) {
            return res
                .status(200)
                .json(new ApiResponse(200, chat[0], "Chat retreived successfully"));
        } else {
            throw new ApiError(404, "Users not linked");
        }
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
        ]);

        const chat = groupChat[0];

        if (!chat) {
            throw new ApiError(404, "Group chat not found");
        }

        return res.status(200).json(new ApiResponse(200, chat, "Group chat fetched successfully"));
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

    static deleteGroupChat = asyncHandler(async (req: AuthRequest, res: Response) => {
        const { chatId } = req.params;

        const groupChat = await Chat.aggregate([
            {
                $match: {
                    _id: new mongoose.Types.ObjectId(chatId),
                    isGroupChat: true,
                },
            },
            ...chatCommonAggregation(),
        ]);

        const chat = groupChat[0];

        if (!chat) {
            throw new ApiError(404, "Group chat does not exist");
        }

        if (chat.admin?.toString() !== req.user!._id?.toString()) {
            throw new ApiError(404, "Only admin can delete the group");
        }

        await Chat.findByIdAndDelete(chatId);

        await deleteCascadeChatMessages(chatId);

        chat?.participants?.forEach((participant: IUser) => {
            if (participant._id.toString() === req.user!._id.toString()) return;
            emitSocketEvent(req, participant._id?.toString(), ChatEventEnum.LEAVE_CHAT_EVENT, chat);
        });

        return res.status(200).json(new ApiResponse(200, {}, "Group chat deleted successfully"));
    });

    static deleteOneOnOneChat = asyncHandler(async (req: AuthRequest, res: Response) => {
        const { chatId } = req.params;

        const chat = await Chat.aggregate([
            {
                $match: {
                    _id: new mongoose.Types.ObjectId(chatId),
                },
            },
            ...chatCommonAggregation(),
        ]);

        const payload = chat[0];

        if (!payload) {
            throw new ApiError(404, "Chat does not exist");
        }

        await Chat.findByIdAndDelete(chatId);

        await deleteCascadeChatMessages(chatId);

        const otherParticipant = payload?.participants?.find(
            (participant: IUser & { _id: Types.ObjectId }) =>
                participant?._id.toString() !== req.user!._id.toString()
        );

        if (otherParticipant) {
            emitSocketEvent(
                req,
                otherParticipant._id?.toString(),
                ChatEventEnum.LEAVE_CHAT_EVENT,
                payload
            );
        }

        return res.status(200).json(new ApiResponse(200, {}, "Chat deleted successfully"));
    });

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
        }).then((user) => user?.number);
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

        const updateChat = await Chat.findByIdAndUpdate([
            {
                $push: {
                    paricipants: participantId,
                },
            },
            { new: true },
        ]);

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

            const updatedChat = await Chat.findByIdAndUpdate([
                {
                    $pull: {
                        participants: participantId,
                    },
                },
                { new: true },
            ]);

            const chat = await Chat.aggregate([
                {
                    $match: {
                        _id: updatedChat!.id,
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
