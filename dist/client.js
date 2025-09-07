"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const socket_io_client_1 = require("socket.io-client");
const readline_1 = __importDefault(require("readline"));
const constants_1 = require("./constants");
const SERVER_URL = "http://localhost:8000";
// netwatch
// const TOKEN =
//     "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJfaWQiOiI2OGI5NDVmOGIyMzcxNWFiZDBjMGE2NWUiLCJlbWFpbCI6ImJsYWNrc3RlZWxlbXBlcm9yQGdtYWlsLmNvbSIsInVzZXJuYW1lIjoic3RlZWwiLCJpYXQiOjE3NTcxODM1MDEsImV4cCI6MTc1NzI2OTkwMX0.H_xbVnWkJRAiRpo_pyIA9QyLTQoOamUCWiw4QcHXMQg"; // valid JWT from your auth system
// steel
const TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJfaWQiOiI2OGI5NDVmOGIyMzcxNWFiZDBjMGE2NWUiLCJlbWFpbCI6ImJsYWNrc3RlZWxlbXBlcm9yQGdtYWlsLmNvbSIsInVzZXJuYW1lIjoic3RlZWwiLCJpYXQiOjE3NTcxODk2NTQsImV4cCI6MTc1NzI3NjA1NH0.iwnSleHxFgzIqSOowbjQAPBiNRqstIuupY6StWHRHKs";
const CHAT_ID = "68bc7cba5178b598bbdd43a5";
let socket;
// readline setup for interactive menu
const rl = readline_1.default.createInterface({
    input: process.stdin,
    output: process.stdout,
});
// --- Socket Setup ---
function connectClient() {
    socket = (0, socket_io_client_1.io)(SERVER_URL, {
        auth: { token: TOKEN },
    });
    socket.on("connect", () => {
        console.log("✅ Connected to server. Socket ID:", socket.id);
        printMenu();
    });
    socket.on(constants_1.ChatEventEnum.CONNECTED_EVENT, () => {
        console.log("🟢 Server acknowledged connection");
    });
    socket.on(constants_1.ChatEventEnum.NEW_MESSAGE_EVENT, (message) => {
        console.log("💬 New message received:", message);
    });
    socket.on(constants_1.ChatEventEnum.TYPING_EVENT, (data) => {
        console.log(`✍️ ${data.username} is typing in chat`);
    });
    socket.on(constants_1.ChatEventEnum.STOP_TYPING_EVENT, () => {
        console.log(`✋ User stopped typing in chat`);
    });
    socket.on("disconnect", () => {
        console.log("❌ Disconnected");
    });
    socket.on(constants_1.ChatEventEnum.SOCKET_ERROR_EVENT, (err) => {
        console.error("⚠️ Socket error:", err);
    });
}
// --- Chat Actions ---
function joinChat(chatId) {
    console.log(`➡️ Joining chat ${chatId}`);
    socket.emit(constants_1.ChatEventEnum.JOIN_CHAT_EVENT, chatId);
}
function leaveChat(chatId) {
    console.log(`⬅️ Leaving chat ${chatId}`);
    socket.emit(constants_1.ChatEventEnum.LEAVE_CHAT_EVENT, chatId);
}
function sendMessage(chatId, content) {
    console.log(`📤 Sending message to ${chatId}: ${content}`);
    socket.emit(constants_1.ChatEventEnum.NEW_MESSAGE_EVENT, { chatId, content });
}
function startTyping(chatId) {
    console.log(`✍️ You started typing in ${chatId}`);
    socket.emit(constants_1.ChatEventEnum.TYPING_EVENT, chatId);
}
function stopTyping(chatId) {
    console.log(`✋ You stopped typing in ${chatId}`);
    socket.emit(constants_1.ChatEventEnum.STOP_TYPING_EVENT, chatId);
}
// --- Console Menu ---
function printMenu() {
    console.log(`
==== Chat Client Menu ====
1. Join Chat
2. Leave Chat
3. Send Message
4. Start Typing
5. Stop Typing
6. Exit
===========================
`);
    rl.question("Choose an option: ", handleMenuChoice);
}
function handleMenuChoice(choice) {
    switch (choice.trim()) {
        case "1":
            joinChat(CHAT_ID);
            break;
        case "2":
            leaveChat(CHAT_ID);
            break;
        case "3":
            rl.question("Enter message: ", (msg) => {
                sendMessage(CHAT_ID, msg);
                printMenu();
            });
            return;
        case "4":
            startTyping(CHAT_ID);
            break;
        case "5":
            stopTyping(CHAT_ID);
            break;
        case "6":
            console.log("👋 Exiting client...");
            rl.close();
            socket.disconnect();
            return;
        default:
            console.log("Invalid choice");
    }
    printMenu();
}
// --- Run ---
connectClient();
