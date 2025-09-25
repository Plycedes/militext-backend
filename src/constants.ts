export const UserRolesEnum = {
    ADMIN: "ADMIN",
    USER: "USER",
};

export const AvailableUserRoles = Object.values(UserRolesEnum);

export const ChatEventEnum = {
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
} as const;

export const AvailableChatEvents = Object.values(ChatEventEnum);
