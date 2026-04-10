const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const quizContentPath = path.join(__dirname, "..", "..", "data", "quiz-content.json");

function createValidationError(message) {
    const error = new Error(message);
    error.code = "quiz_content_invalid";
    return error;
}

function validateQuestion(question, departmentId, questionIds, index) {
    if (!question || typeof question !== "object" || Array.isArray(question)) {
        throw createValidationError(`Question ${index + 1} in department "${departmentId}" must be an object.`);
    }

    if (typeof question.id !== "string" || !question.id.trim()) {
        throw createValidationError(`Question ${index + 1} in department "${departmentId}" is missing a valid id.`);
    }

    if (questionIds.has(question.id)) {
        throw createValidationError(`Question id "${question.id}" is duplicated in department "${departmentId}".`);
    }

    if (typeof question.question !== "string" || !question.question.trim()) {
        throw createValidationError(`Question "${question.id}" in department "${departmentId}" must include question text.`);
    }

    if (!Array.isArray(question.options) || question.options.length < 2) {
        throw createValidationError(`Question "${question.id}" in department "${departmentId}" must have at least two options.`);
    }

    question.options.forEach((option, optionIndex) => {
        if (typeof option !== "string" || !option.trim()) {
            throw createValidationError(`Option ${optionIndex + 1} for question "${question.id}" in department "${departmentId}" must be a non-empty string.`);
        }
    });

    if (!Number.isInteger(question.correctAnswer) || question.correctAnswer < 0 || question.correctAnswer >= question.options.length) {
        throw createValidationError(`Question "${question.id}" in department "${departmentId}" has an invalid correctAnswer index.`);
    }

    questionIds.add(question.id);
}

function validateDepartment(department, departmentIds, index) {
    if (!department || typeof department !== "object" || Array.isArray(department)) {
        throw createValidationError(`Department ${index + 1} must be an object.`);
    }

    if (typeof department.id !== "string" || !department.id.trim()) {
        throw createValidationError(`Department ${index + 1} is missing a valid id.`);
    }

    if (departmentIds.has(department.id)) {
        throw createValidationError(`Department id "${department.id}" is duplicated.`);
    }

    if (typeof department.name !== "string" || !department.name.trim()) {
        throw createValidationError(`Department "${department.id}" must include a name.`);
    }

    if (typeof department.videoUrl !== "string") {
        throw createValidationError(`Department "${department.id}" must include videoUrl as a string.`);
    }

    if (!Array.isArray(department.questions) || department.questions.length === 0) {
        throw createValidationError(`Department "${department.id}" must include at least one question.`);
    }

    const questionIds = new Set();
    department.questions.forEach((question, questionIndex) => {
        validateQuestion(question, department.id, questionIds, questionIndex);
    });

    departmentIds.add(department.id);
}

function validateQuizContent(content) {
    if (!content || typeof content !== "object" || Array.isArray(content)) {
        throw createValidationError("Quiz content root must be an object.");
    }

    if (!Array.isArray(content.departments)) {
        throw createValidationError('Quiz content must include a "departments" array.');
    }

    const departmentIds = new Set();
    content.departments.forEach((department, index) => {
        validateDepartment(department, departmentIds, index);
    });
}

async function getQuizContent() {
    const rawContent = await fs.readFile(quizContentPath, "utf8");
    const quizContent = JSON.parse(rawContent);

    validateQuizContent(quizContent);

    quizContent.contentVersion = crypto
        .createHash("sha256")
        .update(rawContent)
        .digest("hex")
        .slice(0, 12);

    return quizContent;
}

module.exports = {
    getQuizContent
};
