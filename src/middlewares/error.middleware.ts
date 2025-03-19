import { Response, NextFunction } from "express";
import { MulterRequest } from "./multer.middleware";
import { ApiError } from "../utils/ApiError";
import { removedUnusedMulterImageFilesOnError } from "../utils/helpers";
import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const errorHandler = (
    err: unknown,
    req: MulterRequest,
    res: Response,
    next: NextFunction
): Response => {
    let error: any = err as ApiError;

    if (!(error instanceof ApiError)) {
        const statusCode: any = error instanceof mongoose.Error ? 400 : 500;
        const message = (error as Error).message || "Something went wrong";

        error = new ApiError(
            statusCode,
            message,
            (error as any)?.errors || [],
            (error as Error).stack
        );
    }

    const response = {
        statusCode: error.statusCode,
        message: error.message,
        ...(process.env.NODE_ENV === "development" ? { stack: error.stack } : {}),
    };

    console.error(`${error.message}`);

    removedUnusedMulterImageFilesOnError(req);
    return res.status(error.statusCode).json(response);
};

export { errorHandler };
