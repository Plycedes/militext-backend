import fs from "fs";
import { Request } from "express";
import mongoose from "mongoose";
import { JsonObject, JsonArray } from "../types/jsonTypes";
import { MulterRequest } from "../middlewares/multer.middleware";

export const removeLocalFile = (localPath: string): void => {
    fs.unlink(localPath, (err) => {
        if (err) {
            console.error("Error while removing local files:", err);
        } else {
            console.log("Removed local:", localPath);
        }
    });
};

export const removedUnusedMulterImageFilesOnError = (req: MulterRequest): void => {
    try {
        if (req.file) {
            removeLocalFile(req.file.path);
        }

        if (req.files && typeof req.files === "object") {
            Object.values(req.files).forEach((fileField) => {
                if (Array.isArray(fileField)) {
                    fileField.forEach((file) => removeLocalFile(file.path));
                }
            });
        }
    } catch (error) {
        console.error("Error while removing image files:", error);
    }
};
