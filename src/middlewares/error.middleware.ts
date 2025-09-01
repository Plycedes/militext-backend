import { Request, Response, NextFunction, ErrorRequestHandler } from "express";
import { ApiError } from "../utils/ApiError";
import { removedUnusedMulterImageFilesOnError } from "../utils/helpers";
import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

// Make it generic over any Request type
const errorHandler: ErrorRequestHandler = (err: unknown, req: Request, res: Response) => {
    let error: any = err as ApiError;

    if (!(error instanceof ApiError)) {
        const statusCode = error instanceof mongoose.Error ? 400 : 500;
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

    // If you want to support MulterRequest safely:
    if ("file" in req) {
        removedUnusedMulterImageFilesOnError(req as any);
    }

    res.status(error.statusCode).json(response);
};

export { errorHandler };
