const { getQuizContent } = require("./quiz-content.service");

function createScoringValidationError(message) {
    const error = new Error(message);
    error.code = "invalid_quiz_attempt";
    error.status = 400;
    return error;
}

function validateAnswersArray(answers) {
    if (!Array.isArray(answers) || answers.length === 0) {
        throw createScoringValidationError("answers must be a non-empty array.");
    }
}

function buildQuizIndex(quizContent) {
    const questionRecords = [];
    const questionIndex = new Map();

    quizContent.departments.forEach((department) => {
        department.questions.forEach((question) => {
            const record = {
                department,
                question
            };

            questionRecords.push(record);
            questionIndex.set(question.id, record);
        });
    });

    return {
        questionRecords,
        questionIndex
    };
}

function validateSelectedAnswer(selectedAnswer, question, submissionIndex) {
    if (!Number.isInteger(selectedAnswer) || selectedAnswer < 0 || selectedAnswer >= question.options.length) {
        throw createScoringValidationError(`answers item ${submissionIndex + 1} has an invalid selectedAnswer value.`);
    }
}

function validateIncorrectAttempts(incorrectAttempts, question, submissionIndex) {
    if (!Number.isInteger(incorrectAttempts) || incorrectAttempts < 0 || incorrectAttempts > question.options.length - 1) {
        throw createScoringValidationError(`answers item ${submissionIndex + 1} has an invalid incorrectAttempts value.`);
    }
}

function computeAwardedPoints(answeredCorrectly, incorrectAttempts) {
    if (answeredCorrectly) {
        return incorrectAttempts === 0 ? 2 : -incorrectAttempts;
    }

    return -(incorrectAttempts + 1);
}

async function scoreQuizSubmission(payload, providedQuizContent) {
    const quizContent = providedQuizContent || await getQuizContent();
    const { questionRecords, questionIndex } = buildQuizIndex(quizContent);
    const { answers } = payload || {};

    validateAnswersArray(answers);

    if (answers.length !== questionRecords.length) {
        throw createScoringValidationError("All quiz questions must be submitted exactly once.");
    }

    const seenQuestionIds = new Set();
    let score = 0;
    let totalCorrectAnswers = 0;

    const answersSummary = answers.map((answer, submissionIndex) => {
        if (!answer || typeof answer !== "object" || Array.isArray(answer)) {
            throw createScoringValidationError(`answers item ${submissionIndex + 1} is invalid.`);
        }

        const questionId = typeof answer.questionId === "string" ? answer.questionId.trim() : "";

        if (!questionId) {
            throw createScoringValidationError(`answers item ${submissionIndex + 1} is missing questionId.`);
        }

        if (seenQuestionIds.has(questionId)) {
            throw createScoringValidationError(`Question "${questionId}" was submitted more than once.`);
        }

        const questionRecord = questionIndex.get(questionId);

        if (!questionRecord) {
            throw createScoringValidationError(`Question "${questionId}" does not exist in the current quiz content.`);
        }

        seenQuestionIds.add(questionId);

        const { question, department } = questionRecord;
        const selectedAnswer = answer.selectedAnswer;
        const incorrectAttempts = Number.isInteger(answer.incorrectAttempts) ? answer.incorrectAttempts : 0;

        validateSelectedAnswer(selectedAnswer, question, submissionIndex);
        validateIncorrectAttempts(incorrectAttempts, question, submissionIndex);

        const answeredCorrectly = selectedAnswer === question.correctAnswer;
        const awardedPoints = computeAwardedPoints(answeredCorrectly, incorrectAttempts);

        if (answeredCorrectly) {
            totalCorrectAnswers += 1;
        }

        score += awardedPoints;

        return {
            departmentId: department.id,
            questionId: question.id,
            selectedAnswer,
            correctAnswer: question.correctAnswer,
            answeredCorrectly,
            incorrectAttempts,
            awardedPoints
        };
    });

    return {
        contentVersion: quizContent.contentVersion,
        totalQuestions: questionRecords.length,
        totalCorrectAnswers,
        score,
        answersSummary
    };
}

module.exports = {
    createScoringValidationError,
    scoreQuizSubmission
};
