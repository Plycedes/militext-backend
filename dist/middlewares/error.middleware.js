"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = void 0;
const ApiError_1 = require("../utils/ApiError");
const helpers_1 = require("../utils/helpers");
const mongoose_1 = __importDefault(require("mongoose"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
// Make it generic over any Request type
const errorHandler = (err, req, res, next) => {
    let error = err;
    if (!(error instanceof ApiError_1.ApiError)) {
        const statusCode = error instanceof mongoose_1.default.Error ? 400 : 500;
        const message = error.message || "Error: Something went wrong";
        error = new ApiError_1.ApiError(statusCode, message, (error === null || error === void 0 ? void 0 : error.errors) || [], error.stack);
    }
    const response = Object.assign({ statusCode: error.statusCode, message: error.message }, (process.env.NODE_ENV === "development" ? { stack: error.stack } : {}));
    res.locals.errorMessage = error.message;
    console.error(`${error.message}`);
    // If you want to support MulterRequest safely:
    if ("file" in req) {
        (0, helpers_1.removedUnusedMulterImageFilesOnError)(req);
    }
    res.status(error.statusCode).json(response);
};
exports.errorHandler = errorHandler;
