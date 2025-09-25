"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AvailableChatEvents = exports.ChatEventEnum = exports.AvailableUserRoles = exports.UserRolesEnum = void 0;
exports.UserRolesEnum = {
    ADMIN: "ADMIN",
    USER: "USER",
};
exports.AvailableUserRoles = Object.values(exports.UserRolesEnum);
exports.ChatEventEnum = {
    CONNECTED_EVENT: "connected",
    DISCONNECT_EVENT: "disconnect",
    JOIN_CHAT_EVENT: "joinChat",
    LEAVE_CHAT_EVENT: "leaveChat",
    UPDATE_GROUP_NAME_EVENT: "updateGroupName",
    MESSAGE_RECEIVED_EVENT: "messageReceived",
    MESSAGE_EDITED_EVENT: "messageEdited",
    NEW_CHAT_EVENT: "newChat",
    SOCKET_ERROR_EVENT: "socketError",
    STOP_TYPING_EVENT: "stopTyping",
    TYPING_EVENT: "typing",
    MESSAGE_DELETE_EVENT: "messageDeleted",
    NEW_MESSAGE_EVENT: "newMessage",
    SOCEKT_CONNECT_ERROR: "connectError",
    CHAT_DELETE_EVENT: "chatDeleted",
};
exports.AvailableChatEvents = Object.values(exports.ChatEventEnum);
