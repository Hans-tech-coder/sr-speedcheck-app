const { createFirestoreConfigError, getFirestore, isFirestoreConfigured } = require("../config/firebase");
const { getQuizContent } = require("./quiz-content.service");

const QUIZ_ATTEMPTS_COLLECTION = "quizAttempts";
const DEFAULT_ATTEMPTS_PAGE_SIZE = 25;
const MAX_ATTEMPTS_PAGE_SIZE = 100;
const DEFAULT_ADMIN_LEADERBOARD_LIMIT = 25;
const DEFAULT_ATTEMPTS_SORT_BY = "completedAt";
const DEFAULT_ATTEMPTS_SORT_ORDER = "desc";
const VALID_SORT_FIELDS = new Set(["completedAt", "score", "name"]);
const VALID_SORT_ORDERS = new Set(["asc", "desc"]);

function compareAttempts(left, right) {
    if (right.score !== left.score) {
        return right.score - left.score;
    }

    return left.completedAtMs - right.completedAtMs;
}

function normalizeAttemptDocument(attempt) {
    return {
        attemptId: attempt.attemptId,
        googleId: attempt.googleId,
        userId: attempt.userId || attempt.googleId,
        name: attempt.name,
        displayName: attempt.displayName || attempt.name,
        email: attempt.email,
        department: attempt.department,
        departmentId: attempt.departmentId,
        score: attempt.score,
        totalCorrectAnswers: attempt.totalCorrectAnswers,
        totalQuestions: attempt.totalQuestions,
        completedAt: attempt.completedAt,
        completedAtMs: attempt.completedAtMs,
        contentVersion: attempt.contentVersion || "",
        answersSummary: Array.isArray(attempt.answersSummary) ? attempt.answersSummary : []
    };
}

function createAdminQueryValidationError(message) {
    const error = new Error(message);
    error.code = "invalid_admin_attempts_query";
    error.status = 400;
    return error;
}

function normalizeComparableName(attempt) {
    return (attempt.displayName || attempt.name || "").trim().toLowerCase();
}

function parsePositiveInteger(value, fallback, label) {
    if (value === undefined || value === null || value === "") {
        return fallback;
    }

    const parsed = Number.parseInt(value, 10);

    if (!Number.isInteger(parsed) || parsed <= 0) {
        throw createAdminQueryValidationError(`${label} must be a positive integer.`);
    }

    return parsed;
}

function parseSortField(value) {
    if (value === undefined || value === null || value === "") {
        return DEFAULT_ATTEMPTS_SORT_BY;
    }

    if (!VALID_SORT_FIELDS.has(value)) {
        throw createAdminQueryValidationError(`sortBy must be one of: ${Array.from(VALID_SORT_FIELDS).join(", ")}.`);
    }

    return value;
}

function parseSortOrder(value) {
    if (value === undefined || value === null || value === "") {
        return DEFAULT_ATTEMPTS_SORT_ORDER;
    }

    if (!VALID_SORT_ORDERS.has(value)) {
        throw createAdminQueryValidationError(`sortOrder must be one of: ${Array.from(VALID_SORT_ORDERS).join(", ")}.`);
    }

    return value;
}

function parseDateBoundary(value, boundary) {
    if (value === undefined || value === null || value === "") {
        return null;
    }

    const trimmedValue = String(value).trim();

    if (!trimmedValue) {
        return null;
    }

    const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;

    if (dateOnlyPattern.test(trimmedValue)) {
        const date = new Date(`${trimmedValue}T00:00:00.000Z`);

        if (Number.isNaN(date.getTime())) {
            throw createAdminQueryValidationError(`${boundary === "start" ? "startDate" : "endDate"} is invalid.`);
        }

        if (boundary === "end") {
            date.setUTCDate(date.getUTCDate() + 1);
            date.setUTCMilliseconds(date.getUTCMilliseconds() - 1);
        }

        return date;
    }

    const parsedDate = new Date(trimmedValue);

    if (Number.isNaN(parsedDate.getTime())) {
        throw createAdminQueryValidationError(`${boundary === "start" ? "startDate" : "endDate"} is invalid.`);
    }

    return parsedDate;
}

function normalizeAttemptsQuery(options = {}) {
    const page = parsePositiveInteger(options.page, 1, "page");
    const pageSize = Math.min(
        parsePositiveInteger(options.pageSize, DEFAULT_ATTEMPTS_PAGE_SIZE, "pageSize"),
        MAX_ATTEMPTS_PAGE_SIZE
    );
    const sortBy = parseSortField(options.sortBy);
    const sortOrder = parseSortOrder(options.sortOrder);
    const search = typeof options.search === "string" ? options.search.trim().toLowerCase() : "";
    const department = typeof options.department === "string" ? options.department.trim().toLowerCase() : "";
    const startDate = parseDateBoundary(options.startDate, "start");
    const endDate = parseDateBoundary(options.endDate, "end");

    if (startDate && endDate && startDate.getTime() > endDate.getTime()) {
        throw createAdminQueryValidationError("startDate must be before or equal to endDate.");
    }

    return {
        page,
        pageSize,
        search,
        department,
        sortBy,
        sortOrder,
        startDate,
        endDate
    };
}

function matchesSearch(attempt, search) {
    if (!search) {
        return true;
    }

    const haystacks = [
        attempt.name,
        attempt.displayName,
        attempt.email
    ]
        .filter(Boolean)
        .map((value) => String(value).toLowerCase());

    return haystacks.some((value) => value.includes(search));
}

function matchesDepartment(attempt, department) {
    if (!department) {
        return true;
    }

    return [attempt.departmentId, attempt.department]
        .filter(Boolean)
        .map((value) => String(value).trim().toLowerCase())
        .includes(department);
}

function matchesDateRange(attempt, startDate, endDate) {
    if (!startDate && !endDate) {
        return true;
    }

    const completedAtMs = Number.isFinite(attempt.completedAtMs)
        ? attempt.completedAtMs
        : new Date(attempt.completedAt || "").getTime();

    if (Number.isNaN(completedAtMs)) {
        return false;
    }

    if (startDate && completedAtMs < startDate.getTime()) {
        return false;
    }

    if (endDate && completedAtMs > endDate.getTime()) {
        return false;
    }

    return true;
}

function sortAttempts(attempts, sortBy, sortOrder) {
    const direction = sortOrder === "asc" ? 1 : -1;

    return [...attempts].sort((left, right) => {
        if (sortBy === "score") {
            if (left.score !== right.score) {
                return (left.score - right.score) * direction;
            }

            return ((left.completedAtMs || 0) - (right.completedAtMs || 0)) * direction;
        }

        if (sortBy === "name") {
            const nameComparison = normalizeComparableName(left).localeCompare(normalizeComparableName(right));

            if (nameComparison !== 0) {
                return nameComparison * direction;
            }

            return ((left.completedAtMs || 0) - (right.completedAtMs || 0)) * direction;
        }

        const leftCompletedAtMs = left.completedAtMs || 0;
        const rightCompletedAtMs = right.completedAtMs || 0;

        if (leftCompletedAtMs !== rightCompletedAtMs) {
            return (leftCompletedAtMs - rightCompletedAtMs) * direction;
        }

        return (left.score - right.score) * direction;
    });
}

async function getAvailableDepartments(attempts = []) {
    try {
        const quizContent = await getQuizContent();

        if (Array.isArray(quizContent?.departments) && quizContent.departments.length) {
            return quizContent.departments.map((department) => ({
                id: department.id,
                name: department.name
            }));
        }
    } catch (_error) {
        // Fall back to Firestore-derived department values if quiz content is unavailable.
    }

    const seenDepartments = new Set();

    return attempts.reduce((departments, attempt) => {
        const departmentId = attempt.departmentId || "";
        const departmentName = attempt.department || attempt.departmentId || "Unknown Department";
        const key = `${departmentId}::${departmentName}`;

        if (seenDepartments.has(key)) {
            return departments;
        }

        seenDepartments.add(key);
        departments.push({
            id: departmentId,
            name: departmentName
        });
        return departments;
    }, []).sort((left, right) => left.name.localeCompare(right.name));
}

function escapeCsvValue(value) {
    if (value === null || value === undefined) {
        return "";
    }

    const stringValue = String(value);

    if (/[",\n]/.test(stringValue)) {
        return `"${stringValue.replace(/"/g, "\"\"")}"`;
    }

    return stringValue;
}

async function fetchAllAttempts() {
    if (!isFirestoreConfigured()) {
        throw createFirestoreConfigError();
    }

    const db = getFirestore();
    const snapshot = await db.collection(QUIZ_ATTEMPTS_COLLECTION).get();

    return snapshot.docs.map((doc) => normalizeAttemptDocument(doc.data()));
}

async function getAdminSummary() {
    const attempts = await fetchAllAttempts();

    if (!attempts.length) {
        return {
            totalParticipants: 0,
            totalAttempts: 0,
            averageScore: 0,
            highestScore: 0,
            latestCompletionAt: null
        };
    }

    const uniqueParticipants = new Set();
    let totalScore = 0;
    let highestScore = Number.NEGATIVE_INFINITY;
    let latestCompletionAt = attempts[0].completedAt;
    let latestCompletionAtMs = attempts[0].completedAtMs || 0;

    attempts.forEach((attempt) => {
        uniqueParticipants.add(attempt.googleId);
        totalScore += attempt.score;
        highestScore = Math.max(highestScore, attempt.score);

        if ((attempt.completedAtMs || 0) > latestCompletionAtMs) {
            latestCompletionAtMs = attempt.completedAtMs || 0;
            latestCompletionAt = attempt.completedAt;
        }
    });

    return {
        totalParticipants: uniqueParticipants.size,
        totalAttempts: attempts.length,
        averageScore: Number((totalScore / attempts.length).toFixed(2)),
        highestScore,
        latestCompletionAt
    };
}

async function listAdminAttempts(options = {}) {
    const query = normalizeAttemptsQuery(options);

    if (!isFirestoreConfigured()) {
        throw createFirestoreConfigError();
    }

    const allAttempts = await fetchAllAttempts();
    const filteredAttempts = allAttempts.filter((attempt) => (
        matchesSearch(attempt, query.search) &&
        matchesDepartment(attempt, query.department) &&
        matchesDateRange(attempt, query.startDate, query.endDate)
    ));
    const sortedAttempts = sortAttempts(filteredAttempts, query.sortBy, query.sortOrder);
    const totalItems = sortedAttempts.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / query.pageSize));
    const page = Math.min(query.page, totalPages);
    const startIndex = (page - 1) * query.pageSize;
    const items = sortedAttempts.slice(startIndex, startIndex + query.pageSize);
    const availableDepartments = await getAvailableDepartments(allAttempts);

    return {
        items,
        attempts: items,
        page,
        pageSize: query.pageSize,
        totalItems,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
        sortBy: query.sortBy,
        sortOrder: query.sortOrder,
        search: query.search,
        department: query.department,
        startDate: query.startDate ? query.startDate.toISOString() : null,
        endDate: query.endDate ? query.endDate.toISOString() : null,
        availableDepartments,
        pagination: {
            page,
            pageSize: query.pageSize,
            totalAttempts: totalItems,
            totalPages,
            hasNextPage: page < totalPages,
            hasPreviousPage: page > 1
        }
    };
}

async function getAdminAttemptById(attemptId) {
    if (!isFirestoreConfigured()) {
        throw createFirestoreConfigError();
    }

    if (typeof attemptId !== "string" || !attemptId.trim()) {
        const error = new Error("Attempt id is required.");
        error.code = "attempt_not_found";
        error.status = 404;
        throw error;
    }

    const db = getFirestore();
    const attemptSnapshot = await db.collection(QUIZ_ATTEMPTS_COLLECTION).doc(attemptId.trim()).get();

    if (!attemptSnapshot.exists) {
        const error = new Error("Attempt not found.");
        error.code = "attempt_not_found";
        error.status = 404;
        throw error;
    }

    return normalizeAttemptDocument(attemptSnapshot.data());
}

async function getAdminLeaderboard(limit = DEFAULT_ADMIN_LEADERBOARD_LIMIT) {
    const attempts = await fetchAllAttempts();
    const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : DEFAULT_ADMIN_LEADERBOARD_LIMIT;
    const uniqueAttempts = [];
    const seenUsers = new Set();

    attempts
        .sort(compareAttempts)
        .forEach((attempt) => {
            if (seenUsers.has(attempt.googleId) || uniqueAttempts.length >= safeLimit) {
                return;
            }

            seenUsers.add(attempt.googleId);
            uniqueAttempts.push(attempt);
        });

    return uniqueAttempts.map((attempt, index) => ({
        rank: index + 1,
        attemptId: attempt.attemptId,
        googleId: attempt.googleId,
        name: attempt.name,
        displayName: attempt.displayName,
        email: attempt.email,
        department: attempt.department,
        departmentId: attempt.departmentId,
        score: attempt.score,
        totalCorrectAnswers: attempt.totalCorrectAnswers,
        totalQuestions: attempt.totalQuestions,
        completedAt: attempt.completedAt,
        contentVersion: attempt.contentVersion
    }));
}

async function exportAttemptsCsv(options = {}) {
    const query = normalizeAttemptsQuery({
        ...options,
        page: 1,
        pageSize: MAX_ATTEMPTS_PAGE_SIZE
    });
    const attempts = sortAttempts((await fetchAllAttempts()).filter((attempt) => (
        matchesSearch(attempt, query.search) &&
        matchesDepartment(attempt, query.department) &&
        matchesDateRange(attempt, query.startDate, query.endDate)
    )), query.sortBy, query.sortOrder);
    const header = [
        "attemptId",
        "completedAt",
        "name",
        "email",
        "googleId",
        "department",
        "departmentId",
        "score",
        "totalCorrectAnswers",
        "totalQuestions",
        "contentVersion"
    ];

    const rows = attempts.map((attempt) => ([
            attempt.attemptId,
            attempt.completedAt,
            attempt.name,
            attempt.email,
            attempt.googleId,
            attempt.department,
            attempt.departmentId,
            attempt.score,
            attempt.totalCorrectAnswers,
            attempt.totalQuestions,
            attempt.contentVersion
        ].map(escapeCsvValue).join(",")));

    return [header.join(","), ...rows].join("\n");
}

module.exports = {
    exportAttemptsCsv,
    getAdminAttemptById,
    getAdminLeaderboard,
    getAdminSummary,
    listAdminAttempts
};
