const { createFirestoreConfigError, getFirestore, isFirestoreConfigured } = require("../config/firebase");
const { createScoringValidationError, scoreQuizSubmission } = require("./scoring.service");
const { ensureUserRecord } = require("./user.service");
const { getQuizContent } = require("./quiz-content.service");

const QUIZ_ATTEMPTS_COLLECTION = "quizAttempts";
const MAX_LEADERBOARD_ROWS = 10;
const LEADERBOARD_FETCH_MULTIPLIER = 10;

function buildVoyagerName(name, email) {
    const sourceName = name || email?.split("@")[0] || "VOYAGER";
    return sourceName.toUpperCase().slice(0, 15);
}

function maskEmail(email) {
    if (!email || !email.includes("@")) {
        return "";
    }

    const [localPart, domain] = email.split("@");
    const safeLocal = localPart.length <= 2
        ? `${localPart[0] || "*"}*`
        : `${localPart.slice(0, 2)}${"*".repeat(Math.max(localPart.length - 2, 1))}`;

    return `${safeLocal}@${domain}`;
}

function sanitizeAttemptToken(attemptToken) {
    if (typeof attemptToken !== "string" || !attemptToken.trim()) {
        throw createScoringValidationError("Attempt token is required.");
    }

    const normalizedToken = attemptToken.trim();

    if (!/^[A-Za-z0-9_-]{8,120}$/.test(normalizedToken)) {
        throw createScoringValidationError("Attempt token is invalid.");
    }

    return normalizedToken;
}

function buildQuizContentIndex(quizContent) {
    const departmentsById = new Map();

    quizContent.departments.forEach((department) => {
        departmentsById.set(department.id, department);
    });

    return {
        departmentsById
    };
}

function normalizeLeaderboardEntry(attempt, rank, currentUserGoogleId) {
    return {
        rank,
        name: attempt.name,
        displayName: attempt.displayName || buildVoyagerName(attempt.name, attempt.email),
        maskedEmail: maskEmail(attempt.email),
        department: attempt.department,
        score: attempt.score,
        totalQuestions: attempt.totalQuestions,
        totalCorrectAnswers: attempt.totalCorrectAnswers,
        completedAt: attempt.completedAt,
        isCurrentUser: attempt.googleId === currentUserGoogleId
    };
}

function compareAttempts(left, right) {
    if (right.score !== left.score) {
        return right.score - left.score;
    }

    return left.completedAtMs - right.completedAtMs;
}

async function saveQuizAttempt(sessionUser, payload) {
    if (!isFirestoreConfigured()) {
        throw createFirestoreConfigError();
    }

    const attemptToken = sanitizeAttemptToken(payload?.attemptToken);
    const quizContent = await getQuizContent();
    const quizIndex = buildQuizContentIndex(quizContent);
    const departmentId = typeof payload?.departmentId === "string" ? payload.departmentId.trim() : "";

    if (!departmentId || !quizIndex.departmentsById.has(departmentId)) {
        throw createScoringValidationError("departmentId is missing or invalid.");
    }

    const department = quizIndex.departmentsById.get(departmentId);
    const scoredAttempt = await scoreQuizSubmission(payload, quizContent);
    const now = new Date();
    const nowIso = now.toISOString();
    const attemptId = `${sessionUser.googleId}_${attemptToken}`;

    await ensureUserRecord(sessionUser, { department: department.name });

    const db = getFirestore();
    const attemptRef = db.collection(QUIZ_ATTEMPTS_COLLECTION).doc(attemptId);
    const existingAttempt = await attemptRef.get();

    if (existingAttempt.exists) {
        const existingData = existingAttempt.data();

        return {
            duplicate: true,
            attempt: {
                id: attemptId,
                ...normalizeLeaderboardEntry(existingData, null, sessionUser.googleId)
            }
        };
    }

    const attemptDocument = {
        attemptId,
        attemptToken,
        googleId: sessionUser.googleId,
        userId: sessionUser.googleId,
        email: sessionUser.email,
        name: sessionUser.name,
        displayName: buildVoyagerName(sessionUser.name, sessionUser.email),
        department: department.name,
        departmentId: department.id,
        score: scoredAttempt.score,
        totalQuestions: scoredAttempt.totalQuestions,
        totalCorrectAnswers: scoredAttempt.totalCorrectAnswers,
        completedAt: nowIso,
        completedAtMs: now.getTime(),
        createdAt: nowIso,
        updatedAt: nowIso,
        answersSummary: scoredAttempt.answersSummary,
        contentVersion: scoredAttempt.contentVersion || quizContent.contentVersion
    };

    await attemptRef.set(attemptDocument);

    return {
        duplicate: false,
        attempt: {
            id: attemptId,
            ...normalizeLeaderboardEntry(attemptDocument, null, sessionUser.googleId)
        }
    };
}

async function getLeaderboard(currentUserGoogleId, limit = MAX_LEADERBOARD_ROWS) {
    if (!isFirestoreConfigured()) {
        throw createFirestoreConfigError();
    }

    const safeLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, MAX_LEADERBOARD_ROWS) : MAX_LEADERBOARD_ROWS;
    const fetchLimit = safeLimit * LEADERBOARD_FETCH_MULTIPLIER;
    const db = getFirestore();
    const attemptsSnapshot = await db.collection(QUIZ_ATTEMPTS_COLLECTION)
        .orderBy("score", "desc")
        .limit(fetchLimit)
        .get();

    const attempts = attemptsSnapshot.docs.map((doc) => doc.data()).sort(compareAttempts);
    const uniqueAttempts = [];
    const seenUsers = new Set();

    attempts.forEach((attempt) => {
        if (seenUsers.has(attempt.googleId) || uniqueAttempts.length >= safeLimit) {
            return;
        }

        seenUsers.add(attempt.googleId);
        uniqueAttempts.push(attempt);
    });

    const leaderboard = uniqueAttempts.map((attempt, index) => normalizeLeaderboardEntry(attempt, index + 1, currentUserGoogleId));

    const currentUserAttemptsSnapshot = await db.collection(QUIZ_ATTEMPTS_COLLECTION)
        .where("googleId", "==", currentUserGoogleId)
        .get();

    const currentUserAttempts = currentUserAttemptsSnapshot.docs.map((doc) => doc.data()).sort(compareAttempts);
    const currentUserBestAttempt = currentUserAttempts[0]
        ? normalizeLeaderboardEntry(currentUserAttempts[0], null, currentUserGoogleId)
        : null;

    return {
        leaderboard,
        currentUserEntry: currentUserBestAttempt
    };
}

module.exports = {
    getLeaderboard,
    saveQuizAttempt
};
