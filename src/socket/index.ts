import cookie from "cookie";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { Server, Socket } from "socket.io";
import { AvailableChatEvents, ChatEventEnum } from "../constants";
import { IUser, User } from "../models/user.model";
import { ApiError } from "../utils/ApiError";
import { Request } from "express";
import { AuthenticatedSocket } from "../types/types";
import { Chat } from "../models/chat.model";
import { ChatMessage } from "../models/message.model";
import { UserChat } from "../models/userChat.model";
import { Types } from "mongoose";

dotenv.config();

const mountJoinChatEvent = (socket: AuthenticatedSocket): void => {
    socket.on(ChatEventEnum.JOIN_CHAT_EVENT, (chatId: string) => {
        console.log(`User ${socket.user?._id} joined chat ${chatId}`);
        socket.join(chatId);
    });

    socket.on(ChatEventEnum.LEAVE_CHAT_EVENT, (chatId: string) => {
        console.log(`User ${socket.user?._id} left chat ${chatId}`);
        socket.leave(chatId);
    });
};

const mountMessageEvent = (io: Server, socket: AuthenticatedSocket): void => {
    socket.on(ChatEventEnum.NEW_MESSAGE_EVENT, async ({ chatId, content }) => {
        if (!socket.user?._id) return;

        // Validate chat
        const chat = await Chat.findById(chatId);
        if (!chat) {
            return socket.emit(ChatEventEnum.SOCKET_ERROR_EVENT, "Chat does not exist");
        }

        if (!chat.participants.includes(socket.user._id)) {
            return socket.emit(ChatEventEnum.SOCKET_ERROR_EVENT, "Not a participant of this chat");
        }

        // Create message in DB
        const newMessage = await ChatMessage.create({
            chat: chatId,
            sender: socket.user._id,
            content,
        });

        // Populate sender info for frontend
        const populatedMessage = await ChatMessage.findById(newMessage._id)
            .populate("sender", "name number avatar")
            .lean();

        // Find who is online in this chat (in socket room)
        const roomSockets = await io.in(chatId).fetchSockets();
        const onlineUserIds = roomSockets.map((s: any) => s.user?._id.toString());

        // Update unread counts + lastRead
        await Promise.all(
            chat.participants.map(async (participantId: any) => {
                const isOnlineInChat = onlineUserIds.includes(participantId.toString());
                const isSender = participantId.toString() === socket.user!._id.toString();

                const userChat = await UserChat.findOne({ chatId: chatId, userId: participantId });

                if (!userChat) return;

                if (isSender) {
                    // For sender: keep lastRead = now
                    userChat.lastRead = new Date();
                } else if (isOnlineInChat) {
                    // For online participants in this chat: mark as read immediately
                    userChat.lastRead = new Date();
                } else {
                    // For offline/not in room: increment unread
                    userChat.unreadCount += 1;
                    io.to(participantId.toString()).emit(
                        ChatEventEnum.NEW_MESSAGE_EVENT,
                        populatedMessage
                    );
                }
                await userChat.save();
            })
        );

        // Update chat lastMessage
        chat.lastMessage = newMessage._id as Types.ObjectId;
        await chat.save();

        // Emit message to all participants in chat room
        io.in(chatId).emit(ChatEventEnum.NEW_MESSAGE_EVENT, populatedMessage);
    });
};

const mountParticipantTypingEvent = (socket: AuthenticatedSocket): void => {
    socket.on(ChatEventEnum.TYPING_EVENT, (chatId: string) => {
        socket.in(chatId).emit(ChatEventEnum.TYPING_EVENT, chatId);
    });
};

const mountParticipantStoppedTypingEvent = (socket: AuthenticatedSocket): void => {
    socket.on(ChatEventEnum.STOP_TYPING_EVENT, (chatId: string) => {
        socket.in(chatId).emit(ChatEventEnum.STOP_TYPING_EVENT, chatId);
    });
};

const initializeSocketIO = (io: Server) => {
    io.on("connection", async (socket: AuthenticatedSocket) => {
        try {
            const token = socket.handshake.auth?.token;
            if (!token) {
                throw new ApiError(401, "Un-authorized handshake. Token is missing");
            }

            const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET!) as {
                _id: string;
            };
            const user = await User.findById(decodedToken._id).select(
                "-password -refreshToken -emailVerificationToken -emailVerificationExpiry"
            );
            if (!user) throw new ApiError(401, "Invalid token");

            socket.user = user;
            socket.join(user._id.toString());
            socket.emit(ChatEventEnum.CONNECTED_EVENT);
            console.log("User connected 🗼 userId:", user._id.toString());

            // Mount events
            mountJoinChatEvent(socket);
            mountMessageEvent(io, socket);
            mountParticipantTypingEvent(socket);
            mountParticipantStoppedTypingEvent(socket);

            socket.on(ChatEventEnum.DISCONNECT_EVENT, () => {
                console.log("User disconnected 🚫 userId:", socket.user?._id);
                if (socket.user?._id) {
                    socket.leave(socket.user._id.toString());
                }
            });
        } catch (error: any) {
            socket.emit(
                ChatEventEnum.SOCKET_ERROR_EVENT,
                error?.message || "Socket connection failed"
            );
        }
    });
};

const emitSocketEvent = (
    req: Request,
    roomId: string,
    event: (typeof AvailableChatEvents)[0],
    payload: any
) => {
    // console.log(`Emitting \nevent: ${event} \nroomId: ${roomId} \npayload: ${payload}`);
    req.app.get("io").in(roomId).emit(event, payload);
};

export { initializeSocketIO, emitSocketEvent };
