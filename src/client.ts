import { io, Socket } from "socket.io-client";
import readline from "readline";
import { ChatEventEnum } from "./constants";

// const SERVER_URL = "https://militext-backend.onrender.com";

const SERVER_URL = "http://localhost:8000";

// netwatch
// const TOKEN =
//     "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJfaWQiOiI2OGI5NDVmOGIyMzcxNWFiZDBjMGE2NWUiLCJlbWFpbCI6ImJsYWNrc3RlZWxlbXBlcm9yQGdtYWlsLmNvbSIsInVzZXJuYW1lIjoic3RlZWwiLCJpYXQiOjE3NTcxODM1MDEsImV4cCI6MTc1NzI2OTkwMX0.H_xbVnWkJRAiRpo_pyIA9QyLTQoOamUCWiw4QcHXMQg"; // valid JWT from your auth system

// steel
const TOKEN =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJfaWQiOiI2OGI5NDVmOGIyMzcxNWFiZDBjMGE2NWUiLCJlbWFpbCI6ImJsYWNrc3RlZWxlbXBlcm9yQGdtYWlsLmNvbSIsInVzZXJuYW1lIjoic3RlZWwiLCJpYXQiOjE3NTc4NDE3NDcsImV4cCI6MTc1NzkyODE0N30.2OQlHqqSNo6XqkNN_6IW6PPoX5ndwNAoTHx97PWr3Rs";

const CHAT_ID = "68c6877301644d99441cee64";

let socket: Socket;

// readline setup for interactive menu
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

// --- Socket Setup ---
function connectClient() {
    socket = io(SERVER_URL, {
        auth: { token: TOKEN },
    });

    socket.on("connect", () => {
        console.log("✅ Connected to server. Socket ID:", socket.id);
        printMenu();
    });

    socket.on(ChatEventEnum.CONNECTED_EVENT, () => {
        console.log("🟢 Server acknowledged connection");
    });

    socket.on(ChatEventEnum.NEW_MESSAGE_EVENT, (message) => {
        console.log("💬 New message received:", message);
    });

    socket.on(ChatEventEnum.TYPING_EVENT, (data) => {
        console.log(`✍️ ${data.username} is typing in chat`);
    });

    socket.on(ChatEventEnum.STOP_TYPING_EVENT, () => {
        console.log(`✋ User stopped typing in chat`);
    });

    socket.on("disconnect", () => {
        console.log("❌ Disconnected");
    });

    socket.on(ChatEventEnum.SOCKET_ERROR_EVENT, (err) => {
        console.error("⚠️ Socket error:", err);
    });
}

// --- Chat Actions ---
function joinChat(chatId: string) {
    console.log(`➡️ Joining chat ${chatId}`);
    socket.emit(ChatEventEnum.JOIN_CHAT_EVENT, chatId);
}

function leaveChat(chatId: string) {
    console.log(`⬅️ Leaving chat ${chatId}`);
    socket.emit(ChatEventEnum.LEAVE_CHAT_EVENT, chatId);
}

function sendMessage(chatId: string, content: string) {
    console.log(`📤 Sending message to ${chatId}: ${content}`);
    socket.emit(ChatEventEnum.NEW_MESSAGE_EVENT, { chatId, content });
}

function startTyping(chatId: string) {
    console.log(`✍️ You started typing in ${chatId}`);
    socket.emit(ChatEventEnum.TYPING_EVENT, chatId);
}

function stopTyping(chatId: string) {
    console.log(`✋ You stopped typing in ${chatId}`);
    socket.emit(ChatEventEnum.STOP_TYPING_EVENT, chatId);
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

function handleMenuChoice(choice: string) {
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
