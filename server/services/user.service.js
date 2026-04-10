const { createFirestoreConfigError, getFirestore, isFirestoreConfigured } = require("../config/firebase");

const USERS_COLLECTION = "users";

function normalizeUserDocument(data) {
    return {
        googleId: data.googleId,
        name: data.name,
        email: data.email,
        picture: data.picture || null,
        department: data.department || null,
        createdAt: data.createdAt || null,
        updatedAt: data.updatedAt || null,
        lastLoginAt: data.lastLoginAt || null
    };
}

function createUserPayload(sessionUser, options = {}) {
    const nowIso = new Date().toISOString();
    const department = typeof options.department === "string" ? options.department.trim() : "";

    return {
        googleId: sessionUser.googleId,
        name: sessionUser.name,
        email: sessionUser.email,
        picture: sessionUser.picture || null,
        updatedAt: nowIso,
        lastLoginAt: nowIso,
        ...(department ? { department } : {})
    };
}

async function ensureUserRecord(sessionUser, options = {}) {
    if (!sessionUser?.googleId) {
        const error = new Error("Authenticated user is missing a Google identifier.");
        error.code = "user_identity_invalid";
        error.status = 400;
        throw error;
    }

    if (!isFirestoreConfigured()) {
        throw createFirestoreConfigError();
    }

    const db = getFirestore();
    const userRef = db.collection(USERS_COLLECTION).doc(sessionUser.googleId);
    const userSnapshot = await userRef.get();
    const payload = createUserPayload(sessionUser, options);

    if (!userSnapshot.exists) {
        payload.createdAt = new Date().toISOString();
    }

    await userRef.set(payload, { merge: true });

    const persistedSnapshot = await userRef.get();
    return normalizeUserDocument(persistedSnapshot.data());
}

async function getUserRecord(googleId) {
    if (!isFirestoreConfigured()) {
        throw createFirestoreConfigError();
    }

    const db = getFirestore();
    const userSnapshot = await db.collection(USERS_COLLECTION).doc(googleId).get();

    if (!userSnapshot.exists) {
        return null;
    }

    return normalizeUserDocument(userSnapshot.data());
}

module.exports = {
    ensureUserRecord,
    getUserRecord
};
