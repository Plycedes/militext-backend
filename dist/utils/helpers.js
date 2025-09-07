"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRandomNumber = exports.getMongoosePaginationOptions = exports.removedUnusedMulterImageFilesOnError = exports.removeLocalFile = exports.getLocalPath = exports.getStaticFilePath = exports.getPaginatedPayload = exports.filterObjectKeys = void 0;
const fs_1 = __importDefault(require("fs"));
const filterObjectKeys = (fieldsArray, objectsArray) => {
    return structuredClone(objectsArray).map((originalObj) => {
        var _a;
        let obj = {};
        (_a = structuredClone(fieldsArray)) === null || _a === void 0 ? void 0 : _a.forEach((field) => {
            if (field.trim() in originalObj) {
                obj[field] = originalObj[field];
            }
        });
        return Object.keys(obj).length > 0 ? obj : originalObj;
    });
};
exports.filterObjectKeys = filterObjectKeys;
const getPaginatedPayload = (dataArray, page, limit) => {
    const startPosition = (page - 1) * limit;
    const totalItems = dataArray.length;
    const totalPages = Math.ceil(totalItems / limit);
    const paginatedData = structuredClone(dataArray).slice(startPosition, startPosition + limit);
    return {
        page,
        limit,
        totalItems,
        totalPages,
        previousPage: page > 1,
        nextPage: page < totalPages,
        currentPageItems: paginatedData.length,
        data: paginatedData,
    };
};
exports.getPaginatedPayload = getPaginatedPayload;
const getStaticFilePath = (req, fileName) => {
    return `${req.protocol}://${req.get("host")}/images/${fileName}`;
};
exports.getStaticFilePath = getStaticFilePath;
const getLocalPath = (fileName) => {
    return `public/images/${fileName}`;
};
exports.getLocalPath = getLocalPath;
const removeLocalFile = (localPath) => {
    fs_1.default.unlink(localPath, (err) => {
        if (err) {
            console.error("Error while removing local files:", err);
        }
        else {
            console.log("Removed local:", localPath);
        }
    });
};
exports.removeLocalFile = removeLocalFile;
const removedUnusedMulterImageFilesOnError = (req) => {
    try {
        if (req.file) {
            (0, exports.removeLocalFile)(req.file.path);
        }
        if (req.files && typeof req.files === "object") {
            Object.values(req.files).forEach((fileField) => {
                if (Array.isArray(fileField)) {
                    fileField.forEach((file) => (0, exports.removeLocalFile)(file.path));
                }
            });
        }
    }
    catch (error) {
        console.error("Error while removing image files:", error);
    }
};
exports.removedUnusedMulterImageFilesOnError = removedUnusedMulterImageFilesOnError;
const getMongoosePaginationOptions = ({ page = 1, limit = 10, customLabels = {}, }) => {
    return {
        page: Math.max(page, 1),
        limit: Math.max(limit, 1),
        pagination: true,
        customLabels: Object.assign({ pagingCounter: "serialNumberStartFrom" }, customLabels),
    };
};
exports.getMongoosePaginationOptions = getMongoosePaginationOptions;
const getRandomNumber = (max) => {
    return Math.floor(Math.random() * max);
};
exports.getRandomNumber = getRandomNumber;
