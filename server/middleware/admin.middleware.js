function getAllowedAdminEmails() {
    const rawValue = process.env.ALLOWED_ADMIN_EMAILS || "";

    return rawValue
        .split(",")
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean);
}

function isAdminUser(user) {
    if (!user?.email) {
        return false;
    }

    const allowedAdminEmails = getAllowedAdminEmails();

    return allowedAdminEmails.includes(user.email.trim().toLowerCase());
}

function buildAdminAccessResponse(status, message) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Admin Access</title>
    <style>
        body {
            margin: 0;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 24px;
            background: #0d0d0d;
            color: #ffffff;
            font-family: Arial, sans-serif;
        }
        .panel {
            max-width: 640px;
            padding: 32px;
            border: 2px solid rgba(255,255,255,0.12);
            border-radius: 16px;
            background: rgba(26, 26, 26, 0.96);
            text-align: center;
        }
        h1 {
            margin-top: 0;
            color: #ffd400;
        }
        p {
            line-height: 1.6;
            color: #f3f3f3;
        }
        a {
            display: inline-block;
            margin-top: 18px;
            color: #53b0c9;
            text-decoration: none;
            font-weight: 700;
        }
    </style>
</head>
<body>
    <div class="panel">
        <h1>${status === 401 ? "Sign In Required" : "Access Restricted"}</h1>
        <p>${message}</p>
        <a href="/">Return to Mission Control</a>
    </div>
</body>
</html>`;
}

function sendAdminAccessDenied(req, res, status, message) {
    const isApiRequest = req.path.startsWith("/api");

    if (isApiRequest) {
        res.status(status).json({
            authenticated: Boolean(req.isAuthenticated?.() && req.user),
            authorized: false,
            message
        });
        return;
    }

    res.status(status).send(buildAdminAccessResponse(status, message));
}

function requireAdmin(req, res, next) {
    if (!(req.isAuthenticated?.() && req.user)) {
        sendAdminAccessDenied(req, res, 401, "Sign in with an authorized admin account to access the admin console.");
        return;
    }

    if (!isAdminUser(req.user)) {
        sendAdminAccessDenied(req, res, 403, "Your account is signed in, but it is not allowed to access admin monitoring tools.");
        return;
    }

    next();
}

module.exports = {
    getAllowedAdminEmails,
    isAdminUser,
    requireAdmin
};
