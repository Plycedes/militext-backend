"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorLogger = exports.successLogger = void 0;
const morgan_1 = __importDefault(require("morgan"));
const logger_1 = __importDefault(require("../config/logger"));
// Custom token for error message
morgan_1.default.token("message", (_req, res) => res.locals.errorMessage || "");
const getIpFormat = () => ":remote-addr - ";
const successResponseFormat = `${getIpFormat()}:method :url :status - :response-time ms`;
const errorResponseFormat = `${getIpFormat()}:method :url :status - :response-time ms - message: :message`;
const successStream = {
    write: (message) => logger_1.default.info(message.trim()),
};
const errorStream = {
    write: (message) => logger_1.default.error(message.trim()),
};
exports.successLogger = (0, morgan_1.default)(successResponseFormat, {
    skip: (_req, res) => res.statusCode >= 400,
    stream: successStream,
});
exports.errorLogger = (0, morgan_1.default)(errorResponseFormat, {
    skip: (_req, res) => res.statusCode < 400,
    stream: errorStream,
});
