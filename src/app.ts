import express, { Application, Request, Response } from "express";
import dotenv from "dotenv";
import cors from "cors";
import cookieParser from "cookie-parser";
import { Server } from "socket.io";
import { createServer } from "http";
import { initializeSocketIO } from "./socket";
import { successLogger, errorLogger } from "./middlewares/morgan.middleware";

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
initializeSocketIO(io);

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

if (false) {
    app.use(successLogger);
    app.use(errorLogger);
}

app.get("/", (_: Request, res: Response) => {
    res.status(200).send({ status: "OK" });
});

import userRouter from "./routers/user.router";
import chatRouter from "./routers/chat.router";
import messageRouter from "./routers/message.router";
import emailRouter from "./routers/email.router";
import { errorHandler } from "./middlewares/error.middleware";

app.use("/api/v1/users", userRouter);
app.use("/api/v1/chats", chatRouter);
app.use("/api/v1/emails", emailRouter);
app.use("/api/v1/messages", messageRouter);

app.use(errorHandler);

export { httpServer };
