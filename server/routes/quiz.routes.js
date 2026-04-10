const express = require("express");

const { requireAuth } = require("../middleware/auth.middleware");
const { getLeaderboard, saveQuizAttempt } = require("../services/attempt.service");
const { getQuizContent } = require("../services/quiz-content.service");

const router = express.Router();

router.get("/api/quiz-content", async (_req, res, next) => {
    try {
        const quizContent = await getQuizContent();
        res.json(quizContent);
    } catch (error) {
        console.error("Failed to load quiz content.", error);

        const routeError = new Error("Quiz content is unavailable right now. Please try again later.");
        routeError.status = 500;
        routeError.code = "quiz_content_unavailable";

        next(routeError);
    }
});

router.post("/api/quiz-attempts", requireAuth, async (req, res, next) => {
    try {
        const result = await saveQuizAttempt(req.user, req.body);

        res.status(result.duplicate ? 200 : 201).json({
            success: true,
            duplicate: result.duplicate,
            attempt: result.attempt
        });
    } catch (error) {
        next(error);
    }
});

router.get("/api/leaderboard", requireAuth, async (req, res, next) => {
    try {
        const leaderboard = await getLeaderboard(req.user.googleId);

        res.json(leaderboard);
    } catch (error) {
        next(error);
    }
});

module.exports = router;
