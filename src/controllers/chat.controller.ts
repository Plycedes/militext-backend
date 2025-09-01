import mongoose, { PipelineStage, Types } from "mongoose";
import { Chat, IChat } from "../models/chat.controller";
import { ChatMessage, IMessage } from "../models/message.model";
import { removeLocalFile } from "../utils/helpers";
import { asyncHandler } from "../utils/asyncHandler";
import { AuthRequest, CustomRequest } from "../middlewares/auth.middleware";
import { IUser, User } from "../models/user.model";
import { ApiResponse } from "../utils/ApiResponse";
import { Response } from "express";
import { ApiError } from "../utils/ApiError";
import { emitSocketEvent } from "../socket";
import { ChatEventEnum } from "../constants";

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

export const deleteCascadeChatMessages = async (chatId: string | Types.ObjectId): Promise<void> => {
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

export const searchAvailableUsers = asyncHandler(
    async (req: AuthRequest, res: Response): Promise<Response> => {
        const users = await User.aggregate([
            {
                $match: {
                    _id: {
                        $ne: req.user._id,
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

export const createOrGetAOneOnOneChat = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { receiverId } = req.params;

    const receiver = await User.findById(receiverId);

    if (!receiver) throw new ApiError(404, "Receiver does not exist");

    if (receiver._id.toString() === req.user._id.toString()) {
        throw new ApiError(400, "You cannot chat with yourself");
    }

    const chat = await Chat.aggregate([
        {
            $match: {
                isGroupChat: false,
                $and: [
                    {
                        participants: { $elemMatch: { $eq: req.user._id } },
                    },
                    {
                        participants: {
                            $elemMatch: { $eq: new mongoose.Types.ObjectId(receiverId) },
                        },
                    },
                ],
            },
        },
        ...chatCommonAggregation(),
    ]);

    if (chat.length) {
        return res.status(200).json(new ApiResponse(200, chat[0], "Chat retreived successfully"));
    }

    const newChatInstance = await Chat.create({
        name: "One on one chat",
        participants: [req.user._id, new mongoose.Types.ObjectId(receiverId)],
        admin: req.user._id,
    });

    const createdChat = await Chat.aggregate([
        {
            $match: {
                _id: newChatInstance._id,
            },
        },
        ...chatCommonAggregation(),
    ]);

    const payload = createdChat[0];

    if (!payload) {
        throw new ApiError(500, "Internal server error");
    }

    payload?.participants?.forEach((participant: IUser) => {
        if (participant._id.toString() === req.user._id.toString()) return;
        emitSocketEvent(req, participant._id?.toString(), ChatEventEnum.NEW_CHAT_EVENT, payload);
    });

    return res.status(201).json(new ApiResponse(201, payload, "Chat retreived successfully"));
});

export const createAGroupChat = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { name, participants } = req.body as { name: string; participants: string[] };

    if (participants.includes(req.user._id.toString())) {
        throw new ApiError(400, "Participants array should not contain the group creator");
    }

    const members = [...new Set([...participants, req.user._id.toString()])];

    if (members.length < 3) {
        throw new ApiError(400, "Seems like you have passed duplicate participants");
    }

    const groupChat = await Chat.create({
        name,
        isGroupChat: true,
        participants: members,
        admin: req.user._id,
    });

    const chat = await Chat.aggregate([
        {
            $match: {
                _id: groupChat._id,
            },
        },
        ...chatCommonAggregation(),
    ]);

    const payload = chat[0];

    if (!payload) {
        throw new ApiError(500, "Internal server error");
    }

    payload?.participants?.forEach((participants: IUser) => {
        if (participants._id.toString() === req.user._id.toString()) return;
        emitSocketEvent(req, participants._id?.toString(), ChatEventEnum.NEW_CHAT_EVENT, payload);
    });

    return res.status(201).json(new ApiResponse(201, payload, "Group chat created successfully"));
});

export const getGroupChatDetails = asyncHandler(async (req: AuthRequest, res: Response) => {
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

export const renameGroupChat = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { chatId } = req.params;
    const { name } = req.body as { name: string };

    const groupChat = await Chat.findOne({
        _id: new mongoose.Types.ObjectId(chatId),
        isGroupChat: true,
    });

    if (!groupChat) {
        throw new ApiError(404, "Group chat does not exist");
    }

    if (groupChat.admin?.toString() !== req.user._id?.toString()) {
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

export const deleteGroupChat = asyncHandler(async (req: AuthRequest, res: Response) => {
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

    if (chat.admin?.toString() !== req.user._id?.toString()) {
        throw new ApiError(404, "Only admin can delete the group");
    }

    await Chat.findByIdAndDelete(chatId);

    await deleteCascadeChatMessages(chatId);

    chat?.participants?.forEach((participant: IUser) => {
        if (participant._id.toString() === req.user._id.toString()) return;
        emitSocketEvent(req, participant._id?.toString(), ChatEventEnum.LEAVE_CHAT_EVENT, chat);
    });

    return res.status(200).json(new ApiResponse(200, {}, "Group chat deleted successfully"));
});

export const deleteOneOnOneChat = asyncHandler(async (req: AuthRequest, res: Response) => {
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
            participant?._id.toString() !== req.user._id.toString()
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

export const leaveGroupChat = asyncHandler(async (req: AuthRequest, res: Response) => {
    const { chatId } = req.params;

    const groupChat = await Chat.findOne({
        _id: new mongoose.Types.ObjectId(chatId),
        isGroupChat: true,
    });

    if (!groupChat) {
        throw new ApiError(404, "Group chat does not exist");
    }

    const existingParticipants: Types.ObjectId[] = groupChat.participants as Types.ObjectId[];

    if (!existingParticipants?.some((id) => id.toString() === req.user._id.toString())) {
        throw new ApiError(400, "You are not a part of this group chat");
    }

    const updatedChat = await Chat.findByIdAndUpdate(
        chatId,
        {
            $pull: {
                participants: req.user?.id,
            },
        },
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

    return res.status(200).json(new ApiResponse(200, payload, "Left a group successfully"));
});

export const addNewParticipantInGroupChat = asyncHandler(
    async (req: AuthRequest, res: Response) => {
        const { chatId, participantId } = req.params;

        const groupChat = await Chat.findOne({
            _id: new mongoose.Types.ObjectId(chatId),
            isGroupChat: true,
        });

        if (!groupChat) {
            throw new ApiError(404, "Group chat does not exists");
        }

        if (groupChat.admin?.toString() !== req.user._id?.toString()) {
            throw new ApiError(403, "You are not an admin");
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
    }
);

export const removeParticipantFromGroupChat = asyncHandler(
    async (req: AuthRequest, res: Response) => {
        const { chatId, participantId } = req.params;

        const groupChat = await Chat.findOne({
            _id: new mongoose.Types.ObjectId(chatId),
            isGroupChat: true,
        });

        if (!groupChat) {
            throw new ApiError(404, "Group chat does not exist");
        }

        if (!groupChat.admin?.toString() !== req.user.id?.toString()) {
            throw new ApiError(404, "You are not an admin");
        }

        const existingParticipants: Types.ObjectId[] = groupChat.participants as Types.ObjectId[];

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

export const getAllChats = asyncHandler(async (req: AuthRequest, res: Response) => {
    const chats = await Chat.aggregate([
        {
            $match: {
                participants: { $elemMatch: { $eq: req.user._id } },
            },
        },
        {
            $sort: {
                updatedAt: -1,
            },
        },
        ...chatCommonAggregation(),
    ]);

    return res
        .status(200)
        .json(new ApiResponse(200, chats || [], "User chats fetched successfully"));
});
