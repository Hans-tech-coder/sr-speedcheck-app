const admin = require("firebase-admin");

let firebaseInitError = null;

function createFirestoreConfigError() {
    const error = new Error("Firestore is not configured on the server.");
    error.code = "firestore_not_configured";
    error.status = 503;
    return error;
}

function hasInlineServiceAccountConfig() {
    return Boolean(
        process.env.FIREBASE_PROJECT_ID &&
        process.env.FIREBASE_CLIENT_EMAIL &&
        process.env.FIREBASE_PRIVATE_KEY
    );
}

function buildServiceAccountCredential() {
    const {
        FIREBASE_PROJECT_ID,
        FIREBASE_CLIENT_EMAIL,
        FIREBASE_PRIVATE_KEY
    } = process.env;

    if (!hasInlineServiceAccountConfig()) {
        return null;
    }

    try {
        return admin.credential.cert({
            projectId: FIREBASE_PROJECT_ID,
            clientEmail: FIREBASE_CLIENT_EMAIL,
            privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n")
        });
    } catch (error) {
        firebaseInitError = error;
        return null;
    }
}

function hasGoogleApplicationCredentials() {
    return Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS);
}

function getFirestoreStatus() {
    const hasInlineCredentials = hasInlineServiceAccountConfig();

    if (hasInlineCredentials) {
        return {
            configured: true,
            mode: "service_account_env",
            error: firebaseInitError?.message || null
        };
    }

    if (hasGoogleApplicationCredentials()) {
        return {
            configured: true,
            mode: "google_application_credentials",
            error: firebaseInitError?.message || null
        };
    }

    return {
        configured: false,
        mode: "missing",
        error: null
    };
}

function initializeFirebaseApp() {
    if (admin.apps.length > 0) {
        return admin.app();
    }

    const inlineCredential = buildServiceAccountCredential();

    if (inlineCredential) {
        try {
            const app = admin.initializeApp({
                credential: inlineCredential,
                projectId: process.env.FIREBASE_PROJECT_ID
            });
            firebaseInitError = null;
            return app;
        } catch (error) {
            firebaseInitError = error;
            throw error;
        }
    }

    if (hasGoogleApplicationCredentials()) {
        try {
            const app = admin.initializeApp({
                credential: admin.credential.applicationDefault()
            });
            firebaseInitError = null;
            return app;
        } catch (error) {
            firebaseInitError = error;
            throw error;
        }
    }

    throw createFirestoreConfigError();
}

function getFirestore() {
    const app = initializeFirebaseApp();
    return admin.firestore(app);
}

function isFirestoreConfigured() {
    return getFirestoreStatus().configured;
}

module.exports = {
    createFirestoreConfigError,
    getFirestore,
    getFirestoreStatus,
    isFirestoreConfigured
};
