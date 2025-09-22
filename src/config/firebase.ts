import admin from "firebase-admin";

interface ServiceAccount {
    projectId: string;
    clientEmail: string;
    privateKey: string;
}

// Type assertion for JSON import
const serviceAccountTyped: ServiceAccount = {
    projectId: process.env.FIREBASE_PROJECT_ID!,
    privateKey: process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, "\n"),
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
};

admin.initializeApp({
    credential: admin.credential.cert(serviceAccountTyped),
});

export default admin;
