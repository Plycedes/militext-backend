import admin from "../config/firebase";

interface FCMData {
    [key: string]: string;
}

export async function sendFCMNotification(
    fcmToken: string,
    senderName: string,
    messageText: string,
    data: FCMData = {}
) {
    if (!fcmToken) return;

    const payload: admin.messaging.Message = {
        token: fcmToken,
        notification: {
            title: senderName || "New Message",
            body: messageText || "You have a new message",
        },
        data: {
            senderName,
            messageText,
            ...data,
        },
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
        const response = await admin.messaging().send(payload);
        console.log("✅ FCM sent:", response);
    } catch (error) {
        console.error("❌ Error sending FCM:", error);
    }
}
