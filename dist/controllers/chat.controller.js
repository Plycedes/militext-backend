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
exports.ChatController = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const chat_model_1 = require("../models/chat.model");
const message_model_1 = require("../models/message.model");
const helpers_1 = require("../utils/helpers");
const asyncHandler_1 = require("../utils/asyncHandler");
const user_model_1 = require("../models/user.model");
const ApiResponse_1 = require("../utils/ApiResponse");
const ApiError_1 = require("../utils/ApiError");
const socket_1 = require("../socket");
const constants_1 = require("../constants");
const userChat_model_1 = require("../models/userChat.model");
const chatCommonAggregation = () => [
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
const chatCommonAggregation2 = (currentUserId) => [
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
const deleteCascadeChatMessages = (chatId) => __awaiter(void 0, void 0, void 0, function* () {
    const messages = yield message_model_1.ChatMessage.find({
        chat: new mongoose_1.default.Types.ObjectId(chatId),
    });
    let attachments = [];
    attachments = attachments.concat(...messages.map((message) => message.attachments));
    attachments.forEach((attachment) => {
        (0, helpers_1.removeLocalFile)(attachment.localPath);
    });
    yield message_model_1.ChatMessage.deleteMany({
        chat: new mongoose_1.default.Types.ObjectId(chatId),
    });
});
class ChatController {
}
exports.ChatController = ChatController;
_a = ChatController;
ChatController.searchAvailableUsers = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const users = yield user_model_1.User.aggregate([
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
    return res.status(200).json(new ApiResponse_1.ApiResponse(200, users, "Users fetched successfully"));
}));
ChatController.getAOneOnOneChat = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { receiverId } = req.params;
    const receiver = yield user_model_1.User.findById(receiverId);
    if (!receiver)
        throw new ApiError_1.ApiError(404, "Receiver does not exist");
    if (receiver._id.toString() === req.user._id.toString()) {
        throw new ApiError_1.ApiError(400, "You cannot link with yourself");
    }
    const chat = yield chat_model_1.Chat.aggregate([
        {
            $match: {
                isGroupChat: false,
                $and: [
                    {
                        participants: { $elemMatch: { $eq: req.user._id } },
                    },
                    {
                        participants: {
                            $elemMatch: { $eq: new mongoose_1.default.Types.ObjectId(receiverId) },
                        },
                    },
                ],
            },
        },
        ...chatCommonAggregation2(req.user._id),
    ]);
    if (chat.length) {
        return res
            .status(200)
            .json(new ApiResponse_1.ApiResponse(200, chat[0], "Chat retreived successfully"));
    }
    else {
        throw new ApiError_1.ApiError(404, "Users not linked");
    }
}));
// ---------------- One-on-one chat ----------------
ChatController.createAOneOnOneChat = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _b;
    const { receiverId: receiverNum } = req.params;
    const participant = yield user_model_1.User.findOne({ number: receiverNum });
    if (!participant) {
        throw new ApiError_1.ApiError(404, "Number not registered on the Grid");
    }
    if (req.user._id.toString() === participant._id.toString()) {
        throw new ApiError_1.ApiError(404, "You cannot link with yourself");
    }
    // 1. Create chat
    const newChatInstance = yield chat_model_1.Chat.create({
        name: "One on one chat",
        participants: [req.user._id, participant._id],
        admin: req.user._id,
    });
    // 2. Create UserChat entries for participants
    const members = [req.user._id, participant._id];
    yield Promise.all(members.map((userId) => userChat_model_1.UserChat.create({
        chatId: newChatInstance._id,
        userId,
        lastRead: new Date(),
        unreadCount: 0,
    })));
    // 3. Return aggregated chat payload
    const createdChat = yield chat_model_1.Chat.aggregate([
        { $match: { _id: newChatInstance._id } },
        ...chatCommonAggregation2(req.user._id),
    ]);
    const payload = createdChat[0];
    if (!payload) {
        throw new ApiError_1.ApiError(500, "Internal server error");
    }
    // 4. Emit socket events
    (_b = payload === null || payload === void 0 ? void 0 : payload.participants) === null || _b === void 0 ? void 0 : _b.forEach((p) => {
        var _b;
        if (p._id.toString() === req.user._id.toString())
            return;
        (0, socket_1.emitSocketEvent)(req, (_b = p._id) === null || _b === void 0 ? void 0 : _b.toString(), constants_1.ChatEventEnum.NEW_CHAT_EVENT, payload);
    });
    return res.status(201).json(new ApiResponse_1.ApiResponse(201, payload, "Linked successfully"));
}));
// ---------------- Group chat ----------------
ChatController.createAGroupChat = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _b;
    const { name, numbers } = req.body;
    const participants = yield user_model_1.User.find({ number: { $in: numbers } }).then((users) => users.map((user) => user._id.toString()));
    if (participants.includes(req.user._id.toString())) {
        throw new ApiError_1.ApiError(400, "Participants array should not contain the group creator");
    }
    const members = [...new Set([...participants, req.user._id.toString()])];
    if (members.length < 3) {
        throw new ApiError_1.ApiError(400, "Seems like you have passed duplicate participants");
    }
    // 1. Create group chat
    const groupChat = yield chat_model_1.Chat.create({
        name,
        isGroupChat: true,
        participants: members,
        admin: req.user._id,
    });
    // 2. Create UserChat entries for participants
    yield Promise.all(members.map((userId) => userChat_model_1.UserChat.create({
        chatId: groupChat._id,
        userId,
        lastRead: new Date(),
        unreadCount: 0,
    })));
    // 3. Return aggregated chat payload
    const chat = yield chat_model_1.Chat.aggregate([
        { $match: { _id: groupChat._id } },
        ...chatCommonAggregation(),
    ]);
    const payload = chat[0];
    if (!payload) {
        throw new ApiError_1.ApiError(500, "Internal server error");
    }
    // 4. Emit socket events
    (_b = payload === null || payload === void 0 ? void 0 : payload.participants) === null || _b === void 0 ? void 0 : _b.forEach((p) => {
        var _b;
        if (p._id.toString() === req.user._id.toString())
            return;
        (0, socket_1.emitSocketEvent)(req, (_b = p._id) === null || _b === void 0 ? void 0 : _b.toString(), constants_1.ChatEventEnum.NEW_CHAT_EVENT, payload);
    });
    return res
        .status(201)
        .json(new ApiResponse_1.ApiResponse(201, payload, "Group chat created successfully"));
}));
ChatController.getGroupChatDetails = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { chatId } = req.params;
    const groupChat = yield chat_model_1.Chat.aggregate([
        {
            $match: {
                _id: new mongoose_1.default.Types.ObjectId(chatId),
                isGroupChat: true,
            },
        },
        ...chatCommonAggregation(),
    ]);
    const chat = groupChat[0];
    if (!chat) {
        throw new ApiError_1.ApiError(404, "Group chat not found");
    }
    return res.status(200).json(new ApiResponse_1.ApiResponse(200, chat, "Group chat fetched successfully"));
}));
ChatController.renameGroupChat = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _b, _c, _d;
    const { chatId } = req.params;
    const { name } = req.body;
    const groupChat = yield chat_model_1.Chat.findOne({
        _id: new mongoose_1.default.Types.ObjectId(chatId),
        isGroupChat: true,
    });
    if (!groupChat) {
        throw new ApiError_1.ApiError(404, "Group chat does not exist");
    }
    if (((_b = groupChat.admin) === null || _b === void 0 ? void 0 : _b.toString()) !== ((_c = req.user._id) === null || _c === void 0 ? void 0 : _c.toString())) {
        throw new ApiError_1.ApiError(404, "You are not an admin");
    }
    const updatedGroupChat = yield chat_model_1.Chat.findByIdAndUpdate(chatId, {
        $set: {
            name,
        },
    }, { new: true });
    const chat = yield chat_model_1.Chat.aggregate([
        {
            $match: {
                _id: updatedGroupChat._id,
            },
        },
        ...chatCommonAggregation(),
    ]);
    const payload = chat[0];
    if (!payload) {
        throw new ApiError_1.ApiError(500, "Internal server error");
    }
    (_d = payload === null || payload === void 0 ? void 0 : payload.participants) === null || _d === void 0 ? void 0 : _d.forEach((participant) => {
        var _b;
        (0, socket_1.emitSocketEvent)(req, (_b = participant._id) === null || _b === void 0 ? void 0 : _b.toString(), constants_1.ChatEventEnum.UPDATE_GROUP_NAME_EVENT, payload);
    });
    return res
        .status(200)
        .json(new ApiResponse_1.ApiResponse(200, chat[0], "Group chat name updated successfully"));
}));
ChatController.deleteGroupChat = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _b, _c, _d;
    const { chatId } = req.params;
    const groupChat = yield chat_model_1.Chat.aggregate([
        {
            $match: {
                _id: new mongoose_1.default.Types.ObjectId(chatId),
                isGroupChat: true,
            },
        },
        ...chatCommonAggregation(),
    ]);
    const chat = groupChat[0];
    if (!chat) {
        throw new ApiError_1.ApiError(404, "Group chat does not exist");
    }
    if (((_b = chat.admin) === null || _b === void 0 ? void 0 : _b.toString()) !== ((_c = req.user._id) === null || _c === void 0 ? void 0 : _c.toString())) {
        throw new ApiError_1.ApiError(404, "Only admin can delete the group");
    }
    yield chat_model_1.Chat.findByIdAndDelete(chatId);
    yield deleteCascadeChatMessages(chatId);
    (_d = chat === null || chat === void 0 ? void 0 : chat.participants) === null || _d === void 0 ? void 0 : _d.forEach((participant) => {
        var _b;
        if (participant._id.toString() === req.user._id.toString())
            return;
        (0, socket_1.emitSocketEvent)(req, (_b = participant._id) === null || _b === void 0 ? void 0 : _b.toString(), constants_1.ChatEventEnum.LEAVE_CHAT_EVENT, chat);
    });
    return res.status(200).json(new ApiResponse_1.ApiResponse(200, {}, "Group chat deleted successfully"));
}));
ChatController.deleteOneOnOneChat = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _b, _c;
    const { chatId } = req.params;
    const chat = yield chat_model_1.Chat.aggregate([
        {
            $match: {
                _id: new mongoose_1.default.Types.ObjectId(chatId),
            },
        },
        ...chatCommonAggregation(),
    ]);
    const payload = chat[0];
    if (!payload) {
        throw new ApiError_1.ApiError(404, "Chat does not exist");
    }
    yield chat_model_1.Chat.findByIdAndDelete(chatId);
    yield deleteCascadeChatMessages(chatId);
    const otherParticipant = (_b = payload === null || payload === void 0 ? void 0 : payload.participants) === null || _b === void 0 ? void 0 : _b.find((participant) => (participant === null || participant === void 0 ? void 0 : participant._id.toString()) !== req.user._id.toString());
    if (otherParticipant) {
        (0, socket_1.emitSocketEvent)(req, (_c = otherParticipant._id) === null || _c === void 0 ? void 0 : _c.toString(), constants_1.ChatEventEnum.LEAVE_CHAT_EVENT, payload);
    }
    return res.status(200).json(new ApiResponse_1.ApiResponse(200, {}, "Chat deleted successfully"));
}));
ChatController.leaveGroupChat = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _b;
    const { chatId } = req.params;
    const groupChat = yield chat_model_1.Chat.findOne({
        _id: new mongoose_1.default.Types.ObjectId(chatId),
        isGroupChat: true,
    });
    if (!groupChat) {
        throw new ApiError_1.ApiError(404, "Group chat does not exist");
    }
    const existingParticipants = groupChat.participants;
    if (!(existingParticipants === null || existingParticipants === void 0 ? void 0 : existingParticipants.some((id) => id.toString() === req.user._id.toString()))) {
        throw new ApiError_1.ApiError(400, "You are not a part of this group chat");
    }
    const updatedChat = yield chat_model_1.Chat.findByIdAndUpdate(chatId, {
        $pull: {
            participants: (_b = req.user) === null || _b === void 0 ? void 0 : _b.id,
        },
    }, { new: true });
    const chat = yield chat_model_1.Chat.aggregate([
        {
            $match: {
                _id: updatedChat._id,
            },
        },
        ...chatCommonAggregation(),
    ]);
    const payload = chat[0];
    if (!payload) {
        throw new ApiError_1.ApiError(500, "Internal server error");
    }
    return res.status(200).json(new ApiResponse_1.ApiResponse(200, payload, "Left a group successfully"));
}));
ChatController.addNewParticipantInGroupChat = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _b, _c;
    const { chatId, participantNum } = req.params;
    const participantId = yield user_model_1.User.findOne({
        number: participantNum,
    }).then((user) => user === null || user === void 0 ? void 0 : user.number);
    if (!participantId) {
        throw new ApiError_1.ApiError(404, "Number not found on the Grid");
    }
    const groupChat = yield chat_model_1.Chat.findOne({
        _id: new mongoose_1.default.Types.ObjectId(chatId),
        isGroupChat: true,
    });
    if (!groupChat) {
        throw new ApiError_1.ApiError(404, "Group chat does not exists");
    }
    if (((_b = groupChat.admin) === null || _b === void 0 ? void 0 : _b.toString()) !== ((_c = req.user._id) === null || _c === void 0 ? void 0 : _c.toString())) {
        throw new ApiError_1.ApiError(403, "You are not an admin");
    }
    const existingParticipants = groupChat.participants;
    if (existingParticipants === null || existingParticipants === void 0 ? void 0 : existingParticipants.some((id) => id.toString() === participantId)) {
        throw new ApiError_1.ApiError(409, "Participant already in the group chat");
    }
    const updateChat = yield chat_model_1.Chat.findByIdAndUpdate([
        {
            $push: {
                paricipants: participantId,
            },
        },
        { new: true },
    ]);
    const chat = yield chat_model_1.Chat.aggregate([
        {
            $match: {
                _id: updateChat._id,
            },
        },
        ...chatCommonAggregation(),
    ]);
    const payload = chat[0];
    if (!payload) {
        throw new ApiError_1.ApiError(500, "Internal server error");
    }
    (0, socket_1.emitSocketEvent)(req, participantId, constants_1.ChatEventEnum.NEW_CHAT_EVENT, payload);
    return res
        .status(200)
        .json(new ApiResponse_1.ApiResponse(200, payload, "Participant added successfully"));
}));
ChatController.removeParticipantFromGroupChat = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _b, _c;
    const { chatId, participantNum } = req.params;
    const participantId = participantNum;
    const groupChat = yield chat_model_1.Chat.findOne({
        _id: new mongoose_1.default.Types.ObjectId(chatId),
        isGroupChat: true,
    });
    if (!groupChat) {
        throw new ApiError_1.ApiError(404, "Group chat does not exist");
    }
    if (!((_b = groupChat.admin) === null || _b === void 0 ? void 0 : _b.toString()) !== ((_c = req.user.id) === null || _c === void 0 ? void 0 : _c.toString())) {
        throw new ApiError_1.ApiError(404, "You are not an admin");
    }
    const existingParticipants = groupChat.participants;
    if (!(existingParticipants === null || existingParticipants === void 0 ? void 0 : existingParticipants.some((id) => id.toString() === participantId))) {
        throw new ApiError_1.ApiError(404, "Participant does not exist in the group chat");
    }
    const updatedChat = yield chat_model_1.Chat.findByIdAndUpdate([
        {
            $pull: {
                participants: participantId,
            },
        },
        { new: true },
    ]);
    const chat = yield chat_model_1.Chat.aggregate([
        {
            $match: {
                _id: updatedChat.id,
            },
        },
        ...chatCommonAggregation(),
    ]);
    const payload = chat[0];
    if (!payload) {
        throw new ApiError_1.ApiError(500, "Internal server error");
    }
    (0, socket_1.emitSocketEvent)(req, participantId, constants_1.ChatEventEnum.LEAVE_CHAT_EVENT, payload);
    return res
        .status(200)
        .json(new ApiResponse_1.ApiResponse(200, payload, "Participant removed successfully"));
}));
ChatController.getAllChats = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const userId = req.user._id;
    const chats = yield chat_model_1.Chat.aggregate([
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
        .json(new ApiResponse_1.ApiResponse(200, chats || [], "User chats fetched successfully"));
}));
