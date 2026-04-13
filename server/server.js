const path = require("path");

const cors = require("cors");
const dotenv = require("dotenv");
const express = require("express");
const passport = require("passport");
const session = require("express-session");

const configurePassport = require("./config/passport");
const adminRoutes = require("./routes/admin.routes");
const authRoutes = require("./routes/auth.routes");
const quizRoutes = require("./routes/quiz.routes");
const { attachSessionUser } = require("./middleware/auth.middleware");

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const app = express();
const port = process.env.PORT || 3000;
const publicDir = path.join(__dirname, "..", "public");
const isProduction = process.env.NODE_ENV === "production";

if (isProduction) {
    app.set("trust proxy", 1);
}

const authConfig = configurePassport();
app.locals.googleAuthEnabled = authConfig.googleAuthEnabled;

app.use(cors({
    origin: true,
    credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    name: "quiz.sid",
    secret: process.env.SESSION_SECRET || "your_session_secret",
    resave: false,
    saveUninitialized: false,
    proxy: isProduction,
    cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: isProduction
    }
}));

app.use(passport.initialize());
app.use(passport.session());
app.use(attachSessionUser);

app.get("/api/health", (_req, res) => {
    res.json({
        status: "ok",
        service: "quiz-app",
        timestamp: new Date().toISOString()
    });
});

app.use(adminRoutes);
app.use(quizRoutes);
app.use(authRoutes);

app.use("/api", (_req, res) => {
    res.status(404).json({
        status: "not_found",
        message: "API route not found."
    });
});

app.use(express.static(publicDir));

app.get("*", (_req, res) => {
    res.sendFile(path.join(publicDir, "index.html"));
});

app.use((err, req, res, _next) => {
    const status = err.status || 500;
    const isApiRequest = req.path.startsWith("/api");

    if (isApiRequest) {
        res.status(status).json({
            error: err.code || "server_error",
            message: err.message || "Unexpected server error."
        });
        return;
    }

    res.redirect(`/?authError=${encodeURIComponent(err.code || "server_error")}`);
});

app.listen(port, () => {
    console.log(`Quiz app server running at http://localhost:${port}`);
});
