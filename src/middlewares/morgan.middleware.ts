import morgan, { StreamOptions } from "morgan";
import { Request, Response } from "express";
import logger from "../config/logger";

// Custom token for error message
morgan.token("message", (_req: Request, res: Response) => res.locals.errorMessage || "");

const getIpFormat = () => ":remote-addr - ";

const successResponseFormat = `${getIpFormat()}:method :url :status - :response-time ms`;
const errorResponseFormat = `${getIpFormat()}:method :url :status - :response-time ms - message: :message`;

const successStream: StreamOptions = {
    write: (message) => logger.info(message.trim()),
};

const errorStream: StreamOptions = {
    write: (message) => logger.error(message.trim()),
};

export const successLogger = morgan(successResponseFormat, {
    skip: (_req, res) => res.statusCode >= 400,
    stream: successStream,
});

export const errorLogger = morgan(errorResponseFormat, {
    skip: (_req, res) => res.statusCode < 400,
    stream: errorStream,
});
