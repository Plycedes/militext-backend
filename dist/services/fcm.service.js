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
exports.sendFCMNotification = sendFCMNotification;
const firebase_1 = __importDefault(require("../config/firebase"));
function sendFCMNotification(fcmToken_1, senderName_1, messageText_1) {
    return __awaiter(this, arguments, void 0, function* (fcmToken, senderName, messageText, data = {}) {
        if (!fcmToken)
            return;
        const payload = {
            token: fcmToken,
            notification: {
                title: senderName || "New Message",
                body: messageText || "You have a new message",
            },
            data: Object.assign({ senderName,
                messageText }, data),
            android: {
                priority: "high",
                notification: {
                    channelId: "messages",
                    clickAction: "FLUTTER_NOTIFICATION_CLICK",
                },
            },
            apns: {
                headers: { "apns-priority": "10" },
                payload: { aps: { sound: "default", badge: 1 } },
            },
        };
        try {
            const response = yield firebase_1.default.messaging().send(payload);
            console.log("✅ FCM sent:", response);
        }
        catch (error) {
            console.error("❌ Error sending FCM:", error);
        }
    });
}
