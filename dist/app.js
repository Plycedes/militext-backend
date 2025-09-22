"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.httpServer = void 0;
const express_1 = __importDefault(require("express"));
const dotenv_1 = __importDefault(require("dotenv"));
const cors_1 = __importDefault(require("cors"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const socket_io_1 = require("socket.io");
const http_1 = require("http");
const socket_1 = require("./socket");
const morgan_middleware_1 = require("./middlewares/morgan.middleware");
dotenv_1.default.config();
const app = (0, express_1.default)();
const httpServer = (0, http_1.createServer)(app);
exports.httpServer = httpServer;
const io = new socket_io_1.Server(httpServer, {
    pingTimeout: 60000,
    cors: {
        origin: process.env.CORS_ORIGIN,
        credentials: true,
    },
});
app.set("io", io);
(0, socket_1.initializeSocketIO)(io);
app.use((0, cors_1.default)({
    origin: process.env.CORS_ORIGIN || "*",
    credentials: true,
}));
app.use(express_1.default.json({ limit: "16kb" }));
app.use(express_1.default.urlencoded({ extended: true, limit: "16kb" }));
app.use(express_1.default.static("public"));
app.use((0, cookie_parser_1.default)());
if (false) {
    app.use(morgan_middleware_1.successLogger);
    app.use(morgan_middleware_1.errorLogger);
}
app.get("/", (_, res) => {
    res.status(200).send({ status: "OK" });
});
const user_router_1 = __importDefault(require("./routers/user.router"));
const chat_router_1 = __importDefault(require("./routers/chat.router"));
const message_router_1 = __importDefault(require("./routers/message.router"));
const email_router_1 = __importDefault(require("./routers/email.router"));
const error_middleware_1 = require("./middlewares/error.middleware");
app.use("/api/v1/users", user_router_1.default);
app.use("/api/v1/chats", chat_router_1.default);
app.use("/api/v1/emails", email_router_1.default);
app.use("/api/v1/messages", message_router_1.default);
app.use(error_middleware_1.errorHandler);
