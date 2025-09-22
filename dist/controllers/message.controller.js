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
exports.MessageController = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const asyncHandler_1 = require("../utils/asyncHandler");
const chat_model_1 = require("../models/chat.model");
const ApiError_1 = require("../utils/ApiError");
const message_model_1 = require("../models/message.model");
const ApiResponse_1 = require("../utils/ApiResponse");
const helpers_1 = require("../utils/helpers");
const socket_1 = require("../socket");
const constants_1 = require("../constants");
const userChat_model_1 = require("../models/userChat.model");
const chatMessageCommonAggregation = () => {
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
class MessageController {
}
exports.MessageController = MessageController;
_a = MessageController;
MessageController.getAllMessages = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _b;
    const { chatId } = req.params;
    const userId = req.user._id;
    const { before, limit = 20 } = req.query;
    const selectedChat = yield chat_model_1.Chat.findById(chatId);
    if (!selectedChat) {
        throw new ApiError_1.ApiError(404, "Chat does not exist");
    }
    if (!((_b = selectedChat.participants) === null || _b === void 0 ? void 0 : _b.includes(userId))) {
        throw new ApiError_1.ApiError(400, "User is not a part of this chat");
    }
    // 🔹 Step 1: Fetch userChat to get lastReadAt
    const userChat = yield userChat_model_1.UserChat.findOne({ chatId, userId });
    const lastRead = userChat === null || userChat === void 0 ? void 0 : userChat.lastRead;
    // 🔹 Step 2: Fetch messages before updating lastReadAt
    const messages = yield message_model_1.ChatMessage.aggregate([
        // {
        //     $match: {
        //         chat: new mongoose.Types.ObjectId(chatId),
        //     },
        // },
        // ...chatMessageCommonAggregation(),
        {
            $match: before
                ? {
                    chat: new mongoose_1.default.Types.ObjectId(chatId),
                    _id: { $lt: new mongoose_1.default.Types.ObjectId(before) },
                }
                : { chat: new mongoose_1.default.Types.ObjectId(chatId) },
        },
        ...chatMessageCommonAggregation(),
        { $sort: { createdAt: -1 } },
        { $limit: Number(limit) },
    ]);
    // 🔹 Step 3: Mark messages as read (update lastReadAt + reset unreadCount)
    if (userChat) {
        userChat.lastRead = new Date();
        userChat.unreadCount = 0;
        yield userChat.save();
    }
    return res.status(200).json(new ApiResponse_1.ApiResponse(200, {
        messages: messages.reverse(),
        lastRead,
        limit: Number(limit),
        hasMore: messages.length === Number(limit),
        nextCursor: messages.length ? messages[0]._id : null,
    }, "Messages fetched successfully"));
}));
MessageController.sendMessage = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _b, _c;
    const { chatId } = req.params;
    const { content } = req.body;
    const { files } = req.files;
    if (!content && !((_b = files === null || files === void 0 ? void 0 : files.attachments) === null || _b === void 0 ? void 0 : _b.length)) {
        throw new ApiError_1.ApiError(400, "Message content or attachment is required");
    }
    const selectedChat = yield chat_model_1.Chat.findById(chatId);
    if (!selectedChat) {
        throw new ApiError_1.ApiError(404, "Chat does not exist");
    }
    const messageFiles = [];
    if ((_c = files === null || files === void 0 ? void 0 : files.attachments) === null || _c === void 0 ? void 0 : _c.length) {
        files.attachments.forEach((attachment) => {
            messageFiles.push({
                url: (0, helpers_1.getStaticFilePath)(req, attachment.filename),
                localPath: (0, helpers_1.getLocalPath)(attachment.filename),
            });
        });
    }
    const message = yield message_model_1.ChatMessage.create({
        sender: new mongoose_1.default.Types.ObjectId(req.user._id),
        content: content || "",
        chat: new mongoose_1.default.Types.ObjectId(chatId),
        attachments: messageFiles,
    });
    const chat = yield chat_model_1.Chat.findByIdAndUpdate(chatId, { $set: { lastMessage: message._id } }, { new: true });
    const messages = yield message_model_1.ChatMessage.aggregate([
        { $match: { _id: new mongoose_1.default.Types.ObjectId(message._id) } },
        ...chatMessageCommonAggregation(),
    ]);
    const receivedMessage = messages[0];
    if (!receivedMessage) {
        throw new ApiError_1.ApiError(500, "Internal server error");
    }
    chat === null || chat === void 0 ? void 0 : chat.participants.forEach((participantObjectId) => {
        if (participantObjectId.toString() === req.user._id.toString())
            return;
        (0, socket_1.emitSocketEvent)(req, participantObjectId.toString(), constants_1.ChatEventEnum.MESSAGE_RECEIVED_EVENT, receivedMessage);
    });
    return res
        .status(201)
        .json(new ApiResponse_1.ApiResponse(201, receivedMessage, "Message saved successfully"));
}));
MessageController.deleteMessage = (0, asyncHandler_1.asyncHandler)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _b;
    const { chatId, messageId } = req.params;
    const chat = yield chat_model_1.Chat.findOne({
        _id: new mongoose_1.default.Types.ObjectId(chatId),
        participants: req.user._id,
    });
    if (!chat) {
        throw new ApiError_1.ApiError(404, "Chat does not exist");
    }
    const message = yield message_model_1.ChatMessage.findOne({
        _id: new mongoose_1.default.Types.ObjectId(messageId),
    });
    if (!message) {
        throw new ApiError_1.ApiError(404, "Message does not exits");
    }
    if (message.sender.toString() !== req.user._id.toString()) {
        throw new ApiError_1.ApiError(403, "Not authorized to delete");
    }
    if (message.attachments.length > 0) {
        message.attachments.forEach((asset) => (0, helpers_1.removeLocalFile)(asset.localPath));
    }
    yield message_model_1.ChatMessage.deleteOne({ _id: new mongoose_1.default.Types.ObjectId(messageId) });
    if (((_b = chat.lastMessage) === null || _b === void 0 ? void 0 : _b.toString()) === message._id) {
        const lastMessage = yield message_model_1.ChatMessage.findOne({ chat: chatId }, {}, { sort: { createdAt: -1 } });
        yield chat_model_1.Chat.findByIdAndUpdate(chatId, {
            lastMessage: lastMessage ? lastMessage._id : null,
        });
    }
    chat.participants.forEach((participantsObjectID) => {
        if (participantsObjectID.toString() === req.user._id.toString())
            return;
        (0, socket_1.emitSocketEvent)(req, participantsObjectID.toString(), constants_1.ChatEventEnum.MESSAGE_DELETE_EVENT, message);
    });
    return res.status(200).json(new ApiResponse_1.ApiResponse(200, message, "Message deleted successfully"));
}));
