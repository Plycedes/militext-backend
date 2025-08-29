import fs from "fs";
import { JsonObject, JsonArray } from "../types/jsonTypes";
import { MulterRequest } from "../middlewares/multer.middleware";

export const filterObjectKeys = (
    fieldsArray: string[],
    objectsArray: JsonObject[]
): JsonObject[] => {
    return structuredClone(objectsArray).map((originalObj) => {
        let obj: JsonObject = {};
        structuredClone(fieldsArray)?.forEach((field) => {
            if (field.trim() in originalObj) {
                obj[field] = originalObj[field];
            }
        });
        return Object.keys(obj).length > 0 ? obj : originalObj;
    });
};

export const getPaginatedPayload = (dataArray: JsonArray, page: number, limit: number) => {
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

export const getStaticFilePath = (req: MulterRequest, fileName: string): string => {
    return `${req.protocol}://${req.get("host")}/images/${fileName}`;
};

export const getLocalPath = (fileName: string): string => {
    return `public/images/${fileName}`;
};

export const removeLocalFile = (localPath: string): void => {
    fs.unlink(localPath, (err) => {
        if (err) {
            console.error("Error while removing local files:", err);
        } else {
            console.log("Removed local:", localPath);
        }
    });
};

export const removedUnusedMulterImageFilesOnError = (req: any): void => {
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

export const getMongoosePaginationOptions = ({
    page = 1,
    limit = 10,
    customLabels = {},
}: {
    page?: number;
    limit?: number;
    customLabels?: JsonObject;
}) => {
    return {
        page: Math.max(page, 1),
        limit: Math.max(limit, 1),
        pagination: true,
        customLabels: {
            pagingCounter: "serialNumberStartFrom",
            ...customLabels,
        },
    };
};

export const getRandomNumber = (max: number): number => {
    return Math.floor(Math.random() * max);
};
