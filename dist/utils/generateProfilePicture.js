"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateProfilePicture = void 0;
const canvas_1 = require("canvas");
const fs_1 = __importDefault(require("fs"));
const uuid_1 = require("uuid");
const cloudinary_1 = require("./cloudinary");
const generateProfilePicture = (username) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const initials = username
            .split(" ")
            .map((word) => word[0].toUpperCase())
            .join("");
        const uniqueId = (0, uuid_1.v4)();
        const filePath = `./public/images/${uniqueId}${username}.png`;
        const canvas = (0, canvas_1.createCanvas)(128, 128);
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = `#${Math.floor(Math.random() * 16777215).toString(16)}`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.font = "bold 64px Arial";
        ctx.fillStyle = "#FFFFFF";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(initials, canvas.width / 2, canvas.height / 2);
        const buffer = canvas.toBuffer("image/png");
        fs_1.default.writeFileSync(filePath, buffer);
        const pfp = yield (0, cloudinary_1.uploadOnCloudinary)(filePath);
        return pfp;
    }
    catch (error) {
        console.log("Error generating profile image");
        throw error;
    }
});
exports.generateProfilePicture = generateProfilePicture;
