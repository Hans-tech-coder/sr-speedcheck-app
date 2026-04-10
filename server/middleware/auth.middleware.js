function attachSessionUser(req, res, next) {
    res.locals.sessionUser = req.user ?? null;
    next();
}

function requireAuth(req, res, next) {
    if (req.isAuthenticated?.() && req.user) {
        next();
        return;
    }

    res.status(401).json({
        authenticated: false,
        message: "Authentication required."
    });
}

module.exports = {
    attachSessionUser,
    requireAuth
};
