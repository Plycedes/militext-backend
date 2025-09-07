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
Object.defineProperty(exports, "__esModule", { value: true });
exports.emitSocketEvent = exports.initializeSocketIO = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const dotenv_1 = __importDefault(require("dotenv"));
const constants_1 = require("../constants");
const user_model_1 = require("../models/user.model");
const ApiError_1 = require("../utils/ApiError");
const chat_model_1 = require("../models/chat.model");
const message_model_1 = require("../models/message.model");
const userChat_model_1 = require("../models/userChat.model");
dotenv_1.default.config();
const mountJoinChatEvent = (socket) => {
    socket.on(constants_1.ChatEventEnum.JOIN_CHAT_EVENT, (chatId) => {
        var _a;
        console.log(`User ${(_a = socket.user) === null || _a === void 0 ? void 0 : _a._id} joined chat ${chatId}`);
        socket.join(chatId);
    });
    socket.on(constants_1.ChatEventEnum.LEAVE_CHAT_EVENT, (chatId) => {
        var _a;
        console.log(`User ${(_a = socket.user) === null || _a === void 0 ? void 0 : _a._id} left chat ${chatId}`);
        socket.leave(chatId);
    });
};
const mountMessageEvent = (io, socket) => {
    socket.on(constants_1.ChatEventEnum.NEW_MESSAGE_EVENT, (_a) => __awaiter(void 0, [_a], void 0, function* ({ chatId, content }) {
        var _b;
        if (!((_b = socket.user) === null || _b === void 0 ? void 0 : _b._id))
            return;
        // Validate chat
        const chat = yield chat_model_1.Chat.findById(chatId);
        if (!chat) {
            return socket.emit(constants_1.ChatEventEnum.SOCKET_ERROR_EVENT, "Chat does not exist");
        }
        if (!chat.participants.includes(socket.user._id)) {
            return socket.emit(constants_1.ChatEventEnum.SOCKET_ERROR_EVENT, "Not a participant of this chat");
        }
        // Create message in DB
        const newMessage = yield message_model_1.ChatMessage.create({
            chat: chatId,
            sender: socket.user._id,
            content,
        });
        // Populate sender info for frontend
        const populatedMessage = yield message_model_1.ChatMessage.findById(newMessage._id)
            .populate("sender", "name number avatar")
            .lean();
        // Find who is online in this chat (in socket room)
        const roomSockets = yield io.in(chatId).fetchSockets();
        const onlineUserIds = roomSockets.map((s) => { var _a; return (_a = s.user) === null || _a === void 0 ? void 0 : _a._id.toString(); });
        // Update unread counts + lastRead
        yield Promise.all(chat.participants.map((participantId) => __awaiter(void 0, void 0, void 0, function* () {
            const isOnlineInChat = onlineUserIds.includes(participantId.toString());
            const isSender = participantId.toString() === socket.user._id.toString();
            const userChat = yield userChat_model_1.UserChat.findOne({ chatId: chatId, userId: participantId });
            if (!userChat)
                return;
            if (isSender) {
                // For sender: keep lastRead = now
                userChat.lastRead = new Date();
            }
            else if (isOnlineInChat) {
                // For online participants in this chat: mark as read immediately
                userChat.lastRead = new Date();
            }
            else {
                // For offline/not in room: increment unread
                userChat.unreadCount += 1;
                io.to(participantId.toString()).emit(constants_1.ChatEventEnum.NEW_MESSAGE_EVENT, populatedMessage);
            }
            yield userChat.save();
        })));
        // Update chat lastMessage
        chat.lastMessage = newMessage._id;
        yield chat.save();
        // Emit message to all participants in chat room
        io.in(chatId).emit(constants_1.ChatEventEnum.NEW_MESSAGE_EVENT, populatedMessage);
    }));
};
const mountParticipantTypingEvent = (socket) => {
    socket.on(constants_1.ChatEventEnum.TYPING_EVENT, (chatId) => {
        var _a;
        socket.in(chatId).emit(constants_1.ChatEventEnum.TYPING_EVENT, {
            username: (_a = socket.user) === null || _a === void 0 ? void 0 : _a.username,
        });
    });
};
const mountParticipantStoppedTypingEvent = (socket) => {
    socket.on(constants_1.ChatEventEnum.STOP_TYPING_EVENT, (chatId) => {
        socket.in(chatId).emit(constants_1.ChatEventEnum.STOP_TYPING_EVENT);
    });
};
const initializeSocketIO = (io) => {
    io.on("connection", (socket) => __awaiter(void 0, void 0, void 0, function* () {
        var _a;
        try {
            const token = (_a = socket.handshake.auth) === null || _a === void 0 ? void 0 : _a.token;
            if (!token) {
                throw new ApiError_1.ApiError(401, "Un-authorized handshake. Token is missing");
            }
            const decodedToken = jsonwebtoken_1.default.verify(token, process.env.ACCESS_TOKEN_SECRET);
            const user = yield user_model_1.User.findById(decodedToken._id).select("-password -refreshToken -emailVerificationToken -emailVerificationExpiry");
            if (!user)
                throw new ApiError_1.ApiError(401, "Invalid token");
            socket.user = user;
            socket.join(user._id.toString());
            socket.emit(constants_1.ChatEventEnum.CONNECTED_EVENT);
            console.log("User connected 🗼 userId:", user._id.toString());
            // Mount events
            mountJoinChatEvent(socket);
            mountMessageEvent(io, socket);
            mountParticipantTypingEvent(socket);
            mountParticipantStoppedTypingEvent(socket);
            socket.on(constants_1.ChatEventEnum.DISCONNECT_EVENT, () => {
                var _a, _b;
                console.log("User disconnected 🚫 userId:", (_a = socket.user) === null || _a === void 0 ? void 0 : _a._id);
                if ((_b = socket.user) === null || _b === void 0 ? void 0 : _b._id) {
                    socket.leave(socket.user._id.toString());
                }
            });
        }
        catch (error) {
            socket.emit(constants_1.ChatEventEnum.SOCKET_ERROR_EVENT, (error === null || error === void 0 ? void 0 : error.message) || "Socket connection failed");
        }
    }));
};
exports.initializeSocketIO = initializeSocketIO;
const emitSocketEvent = (req, roomId, event, payload) => {
    // console.log(`Emitting \nevent: ${event} \nroomId: ${roomId} \npayload: ${payload}`);
    req.app.get("io").in(roomId).emit(event, payload);
};
exports.emitSocketEvent = emitSocketEvent;
