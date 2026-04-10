const path = require("path");

const express = require("express");

const { requireAdmin } = require("../middleware/admin.middleware");
const {
    exportAttemptsCsv,
    getAdminAttemptById,
    getAdminLeaderboard,
    getAdminSummary,
    listAdminAttempts
} = require("../services/admin.service");

const router = express.Router();
const adminHtmlPath = path.join(__dirname, "..", "..", "public", "admin.html");

router.get("/admin", requireAdmin, (_req, res) => {
    res.redirect("/admin.html");
});

router.get("/admin.html", requireAdmin, (_req, res) => {
    res.sendFile(adminHtmlPath);
});

router.get("/api/admin/summary", requireAdmin, async (_req, res, next) => {
    try {
        const summary = await getAdminSummary();
        res.json(summary);
    } catch (error) {
        next(error);
    }
});

router.get("/api/admin/attempts", requireAdmin, async (req, res, next) => {
    try {
        const result = await listAdminAttempts({
            page: req.query.page,
            pageSize: req.query.pageSize,
            search: req.query.search,
            department: req.query.department,
            sortBy: req.query.sortBy,
            sortOrder: req.query.sortOrder,
            startDate: req.query.startDate,
            endDate: req.query.endDate
        });

        res.json(result);
    } catch (error) {
        next(error);
    }
});

router.get("/api/admin/attempts/:attemptId", requireAdmin, async (req, res, next) => {
    try {
        const attempt = await getAdminAttemptById(req.params.attemptId);
        res.json({ attempt });
    } catch (error) {
        next(error);
    }
});

router.get("/api/admin/leaderboard", requireAdmin, async (_req, res, next) => {
    try {
        const leaderboard = await getAdminLeaderboard();
        res.json({ leaderboard });
    } catch (error) {
        next(error);
    }
});

router.get("/api/admin/export/csv", requireAdmin, async (req, res, next) => {
    try {
        const csv = await exportAttemptsCsv({
            search: req.query.search,
            department: req.query.department,
            sortBy: req.query.sortBy,
            sortOrder: req.query.sortOrder,
            startDate: req.query.startDate,
            endDate: req.query.endDate
        });

        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="quiz-results-${new Date().toISOString().slice(0, 10)}.csv"`);
        res.send(csv);
    } catch (error) {
        next(error);
    }
});

module.exports = router;
