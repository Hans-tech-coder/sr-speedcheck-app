const express = require("express");
const passport = require("passport");

const { getFirestoreStatus } = require("../config/firebase");
const { isAdminUser } = require("../middleware/admin.middleware");
const { requireAuth } = require("../middleware/auth.middleware");
const { ensureUserRecord } = require("../services/user.service");

const router = express.Router();
const sessionCookieName = "quiz.sid";

function logAuthDebug(message, details) {
    if (process.env.NODE_ENV === "production") {
        return;
    }

    if (details) {
        console.log(`[auth] ${message}`, details);
        return;
    }

    console.log(`[auth] ${message}`);
}

function buildAuthErrorRedirect(code) {
    const errorCode = code || "login_failed";
    return `/?authError=${encodeURIComponent(errorCode)}`;
}

function destroySession(req, res, redirectCode) {
    req.logout(() => {
        req.session.destroy(() => {
            res.clearCookie(sessionCookieName);
            res.redirect(buildAuthErrorRedirect(redirectCode));
        });
    });
}

async function syncSessionUser(req) {
    const firestoreStatus = getFirestoreStatus();

    if (!req.isAuthenticated?.() || !req.user) {
        return {
            profile: null,
            persistence: {
                ...firestoreStatus,
                synced: false
            }
        };
    }

    if (!firestoreStatus.configured) {
        return {
            profile: null,
            persistence: {
                ...firestoreStatus,
                synced: false
            }
        };
    }

    try {
        const profile = await ensureUserRecord(req.user);

        return {
            profile,
            persistence: {
                ...firestoreStatus,
                synced: true
            }
        };
    } catch (error) {
        console.error("Failed to sync authenticated user to Firestore.", error);

        return {
            profile: null,
            persistence: {
                ...firestoreStatus,
                synced: false,
                error: error.message
            }
        };
    }
}

router.get("/api/session", async (req, res) => {
    const user = req.user ?? null;
    const syncState = await syncSessionUser(req);

    res.json({
        authenticated: Boolean(req.isAuthenticated?.() && user),
        user: user ? {
            ...user,
            isAdmin: isAdminUser(user)
        } : null,
        profile: syncState.profile,
        persistence: syncState.persistence,
        provider: "google-workspace"
    });
});

router.get("/api/me", requireAuth, async (req, res, next) => {
    try {
        const syncState = await syncSessionUser(req);

        res.json({
            authenticated: true,
            user: {
                ...req.user,
                ...(syncState.profile || {}),
                isAdmin: isAdminUser(req.user)
            },
            persistence: syncState.persistence
        });
    } catch (error) {
        next(error);
    }
});

router.get("/auth/google", (req, res, next) => {
    if (!req.app.locals.googleAuthEnabled) {
        res.redirect(buildAuthErrorRedirect("oauth_not_configured"));
        return;
    }

    const allowedDomain = process.env.ALLOWED_GOOGLE_DOMAIN || undefined;
    logAuthDebug("Starting Google OAuth flow.", {
        entryPath: req.originalUrl,
        callbackURL: process.env.GOOGLE_CALLBACK_URL,
        allowedDomain
    });

    passport.authenticate("google", {
        scope: ["profile", "email"],
        prompt: "select_account",
        hd: allowedDomain
    })(req, res, next);
});

router.get("/auth/google/callback", (req, res, next) => {
    if (!req.app.locals.googleAuthEnabled) {
        res.redirect(buildAuthErrorRedirect("oauth_not_configured"));
        return;
    }

    logAuthDebug("Received Google OAuth callback.", {
        callbackPath: req.originalUrl,
        query: req.query
    });

    passport.authenticate("google", (err, user, info) => {
        if (err) {
            logAuthDebug("Google OAuth callback returned an error.", {
                code: err.code || "login_failed",
                message: err.message
            });
            const code = err.code || "login_failed";
            return res.redirect(buildAuthErrorRedirect(code));
        }

        if (!user) {
            logAuthDebug("Google OAuth callback did not return a user.", info || {});
            return destroySession(req, res, info?.code || "login_failed");
        }

        req.session.regenerate((sessionError) => {
            if (sessionError) {
                logAuthDebug("Session regeneration failed after Google OAuth callback.", {
                    message: sessionError.message
                });
                return next(sessionError);
            }

            req.logIn(user, (loginError) => {
                if (loginError) {
                    logAuthDebug("Login failed after Google OAuth callback.", {
                        message: loginError.message
                    });
                    return next(loginError);
                }

                logAuthDebug("Google OAuth login completed successfully.", {
                    email: user.email
                });
                return res.redirect("/");
            });
        });
    })(req, res, next);
});

router.post("/auth/logout", (req, res, next) => {
    req.logout((logoutError) => {
        if (logoutError) {
            return next(logoutError);
        }

        req.session.destroy((sessionError) => {
            if (sessionError) {
                return next(sessionError);
            }

            res.clearCookie(sessionCookieName);
            res.json({
                success: true
            });
        });
    });
});

module.exports = router;
