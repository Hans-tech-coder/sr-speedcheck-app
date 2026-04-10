const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;

function shouldLogAuthDebug() {
    return process.env.NODE_ENV !== "production";
}

function buildSafeUser(profile, email) {
    return {
        googleId: profile.id,
        name: profile.displayName || email.split("@")[0],
        email,
        picture: profile.photos?.[0]?.value || null
    };
}

function configurePassport() {
    const {
        GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET,
        GOOGLE_CALLBACK_URL,
        ALLOWED_GOOGLE_DOMAIN
    } = process.env;

    passport.serializeUser((user, done) => {
        done(null, user);
    });

    passport.deserializeUser((user, done) => {
        done(null, user);
    });

    const googleAuthEnabled = Boolean(
        GOOGLE_CLIENT_ID &&
        GOOGLE_CLIENT_SECRET &&
        GOOGLE_CALLBACK_URL &&
        ALLOWED_GOOGLE_DOMAIN
    );

    if (!googleAuthEnabled) {
        return {
            passport,
            googleAuthEnabled: false
        };
    }

    const allowedDomain = ALLOWED_GOOGLE_DOMAIN.trim().toLowerCase();

    if (shouldLogAuthDebug()) {
        console.log("[auth] Google OAuth enabled");
        console.log(`[auth] Configured callback URL: ${GOOGLE_CALLBACK_URL}`);
        console.log(`[auth] Allowed Google Workspace domain: ${allowedDomain}`);
    }

    passport.use(new GoogleStrategy(
        {
            clientID: GOOGLE_CLIENT_ID,
            clientSecret: GOOGLE_CLIENT_SECRET,
            callbackURL: GOOGLE_CALLBACK_URL
        },
        (_accessToken, _refreshToken, profile, done) => {
            const emailEntry = profile.emails?.find((entry) => entry.verified) || profile.emails?.[0];

            if (!emailEntry?.value) {
                return done(null, false, {
                    code: "email_unavailable",
                    message: "A Google account email address is required to sign in."
                });
            }

            const email = emailEntry.value.trim().toLowerCase();
            const [, emailDomain = ""] = email.split("@");

            if (emailDomain !== allowedDomain) {
                return done(null, false, {
                    code: "domain_not_allowed",
                    message: `Only ${allowedDomain} Google Workspace accounts can access this quiz.`
                });
            }

            return done(null, buildSafeUser(profile, email));
        }
    ));

    return {
        passport,
        googleAuthEnabled: true
    };
}

module.exports = configurePassport;
