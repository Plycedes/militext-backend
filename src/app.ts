import express, { Application, Request, Response } from "express";
import dotenv from "dotenv";
import cors from "cors";
import cookieParser from "cookie-parser";
import { Server } from "socket.io";
import { createServer } from "http";
import { initializeSocketIO } from "./socket";

dotenv.config();

const app: Application = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    pingTimeout: 60000,
    cors: {
        origin: process.env.CORS_ORIGIN,
        credentials: true,
    },
});

app.set("io", io);

app.use(
    cors({
        origin: process.env.CORS_ORIGIN || "*",
        credentials: true,
    })
);

app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ extended: true, limit: "16kb" }));
app.use(express.static("public"));
app.use(cookieParser());

app.get("/", (_: Request, res: Response) => {
    res.status(200).send({ status: "OK" });
});

import userRouter from "./routers/user.router";
import chatRouter from "./routers/chat.router";
import messageRouter from "./routers/message.router";
import { errorHandler } from "./middlewares/error.middleware";

app.use("/api/v1/users", userRouter);
app.use("/api/v1/chat-app/chats", chatRouter);
app.use("/api/v1/chat-app/messages", messageRouter);

initializeSocketIO(io);

app.use(errorHandler);

export { httpServer };
