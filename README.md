# Quiz App

This project refactors the original single-file quiz into a maintainable full-stack structure while keeping the current browser-only game logic intact.

## Structure

```text
quiz-app/
├── data/
│   └── quiz-content.json
├── public/
│   ├── admin.css
│   ├── admin.html
│   ├── admin.js
│   ├── app.js
│   ├── index.html
│   └── styles.css
├── server/
│   ├── config/
│   │   ├── firebase.js
│   │   └── passport.js
│   ├── middleware/
│   │   ├── admin.middleware.js
│   │   └── auth.middleware.js
│   ├── routes/
│   │   ├── admin.routes.js
│   │   ├── auth.routes.js
│   │   └── quiz.routes.js
│   ├── services/
│   │   ├── admin.service.js
│   │   ├── attempt.service.js
│   │   ├── quiz-content.service.js
│   │   ├── scoring.service.js
│   │   └── user.service.js
│   └── server.js
├── .env
├── .env.example
├── package.json
└── README.md
```

## What Changed

- Moved inline HTML, CSS, and JavaScript into separate files under `public/`.
- Added an Express server that serves the frontend from `public/`.
- Added session middleware and Google Workspace SSO on the existing Express + Passport architecture.
- Moved quiz departments, questions, answers, and video URLs into `data/quiz-content.json`.
- Added `GET /api/quiz-content` so the frontend loads quiz content dynamically from the backend.
- Added backend-only Firestore persistence with Firebase Admin SDK for users, quiz attempts, and the leaderboard source.
- Updated the frontend to save completed quiz attempts to the backend and load the leaderboard from Firestore.
- Added an admin-only monitoring dashboard with summary metrics, attempt review, leaderboard inspection, and CSV export.

## Environment

The project includes `.env` and `.env.example` with placeholders for future auth work:

```env
PORT=3000
SESSION_SECRET=replace_with_strong_secret
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback
ALLOWED_GOOGLE_DOMAIN=youragency.com
ALLOWED_ADMIN_EMAILS=admin1@youragency.com,admin2@youragency.com
GOOGLE_APPLICATION_CREDENTIALS=
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
NODE_ENV=development
```

Firestore credentials can be provided in one of two ways:

1. Recommended for local development: set `GOOGLE_APPLICATION_CREDENTIALS` to a Firebase service account JSON file path.
2. Alternative: set `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PRIVATE_KEY` directly in the environment.

If both are absent, login and quiz play still work, but Firestore-backed endpoints such as attempt saving and leaderboard reads will return a clear configuration error.

Admin access is controlled with `ALLOWED_ADMIN_EMAILS`. Only authenticated users whose email appears in that comma-separated allowlist can access `/admin.html` and `/api/admin/*`.

## Google SSO Setup

1. Create a Google OAuth 2.0 Web application credential in Google Cloud.
2. Add `http://localhost:3000/auth/google/callback` to the authorized redirect URIs in Google Cloud Console.
3. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `ALLOWED_GOOGLE_DOMAIN` in `.env`.
4. For production, change `GOOGLE_CALLBACK_URL` to your HTTPS callback URL and run behind HTTPS so secure cookies can be enabled safely.

## Run Locally

1. Install dependencies:

```bash
npm install
```

2. Start the development server:

```bash
npm run dev
```

3. Open:

```text
http://localhost:3000
```

## Firestore Setup

1. Create or choose a Firebase project connected to your Google Cloud project.
2. Enable Firestore in Native mode.
3. Create a service account with Firestore access.
4. Pick one credential method:

Using `GOOGLE_APPLICATION_CREDENTIALS`

```bash
export GOOGLE_APPLICATION_CREDENTIALS="/absolute/path/to/service-account.json"
```

Using inline environment variables

```env
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxx@your-project-id.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

5. Restart the Express server after setting credentials.

## Firestore Schema

Collection: `users`

- Document ID: `googleId`
- Fields: `googleId`, `name`, `email`, `picture`, `department`, `createdAt`, `updatedAt`, `lastLoginAt`

Collection: `quizAttempts`

- Document ID: `${googleId}_${attemptToken}`
- Fields: `attemptId`, `attemptToken`, `googleId`, `userId`, `email`, `name`, `displayName`, `department`, `departmentId`, `score`, `totalQuestions`, `totalCorrectAnswers`, `completedAt`, `completedAtMs`, `createdAt`, `updatedAt`, `answersSummary`, `contentVersion`

## Admin Monitoring

Admin users can open:

```text
http://localhost:3000/admin.html
```

Features included:

- Summary metrics for participants, attempts, average score, highest score, and latest completion
- Searchable and filterable attempt review with server-side pagination
- Full attempt detail inspection including backend-computed `answersSummary`
- Admin leaderboard review with richer participant fields
- CSV export of persisted results, including active attempt filters

## Persistence Flow

1. User signs in with Google Workspace.
2. `GET /api/session` syncs the authenticated session user into Firestore when Firestore is configured.
3. The user completes the quiz in the existing frontend flow.
4. The frontend sends the completed answer payload to `POST /api/quiz-attempts`.
5. The backend derives identity from the authenticated session, validates the submitted answers against the authoritative quiz content, computes the final score and correct-answer totals, updates the user record, and stores a Firestore `quizAttempts` document.
6. The frontend requests `GET /api/leaderboard`.
7. The backend reads persisted attempts from Firestore, ranks them by highest score and earliest completion time, and returns leaderboard rows for the UI.

## Available Endpoints

- `GET /api/health` returns a basic server health response.
- `GET /api/session` returns the current authenticated session plus Firestore sync status.
- `GET /api/me` returns the authenticated user's persisted profile.
- `GET /api/quiz-content` returns the JSON-backed quiz content used by the frontend.
- `POST /api/quiz-attempts` validates submitted answers and saves a backend-computed quiz attempt for the authenticated user.
- `GET /api/leaderboard` returns leaderboard data sourced from Firestore.
- `GET /api/admin/summary` returns admin-only summary metrics.
- `GET /api/admin/attempts` returns paginated admin-only attempt results with search, department filters, sorting, and optional date range filters.
- `GET /api/admin/attempts/:attemptId` returns detailed attempt inspection data.
- `GET /api/admin/leaderboard` returns admin-only leaderboard review data.
- `GET /api/admin/export/csv` exports persisted attempt results as CSV.
- `GET /auth/google` starts Google Workspace SSO.
- `GET /auth/google/callback` completes the Google Workspace callback flow.
- `POST /auth/logout` ends the current authenticated session.

## Google OAuth Redirect URI

Use this exact redirect URI in Google Cloud Console for local development:

```text
http://localhost:3000/auth/google/callback
```

## Admin Attempts API

`GET /api/admin/attempts` supports these query parameters:

- `page` positive integer, defaults to `1`
- `pageSize` positive integer, defaults to `25`, capped at `100`
- `search` case-insensitive substring match against participant name, display name, or email
- `department` exact match against `departmentId` or department name
- `sortBy` one of `completedAt`, `score`, or `name`
- `sortOrder` one of `asc` or `desc`
- `startDate` optional ISO date or `YYYY-MM-DD`
- `endDate` optional ISO date or `YYYY-MM-DD`

The response includes:

- `items`
- `page`
- `pageSize`
- `totalItems`
- `totalPages`
- `hasNextPage`
- `hasPreviousPage`
- `availableDepartments`

CSV export can use the same filter and sort parameters through `GET /api/admin/export/csv`.

## Admin Attempts Notes

- Search is implemented in the backend service layer after reading Firestore attempts so admins can search flexibly by name and email without adding a dedicated search system.
- Department filtering, sorting, and pagination are still returned from the backend, so the admin UI no longer paginates or slices rows in the browser on its own.
- This keeps the implementation maintainable for the current project scale, but very large datasets may eventually benefit from tighter Firestore query/index optimization or a dedicated search layer.
- No new Firestore composite indexes were required for this phase because flexible filtering and sorting are handled in application code after the Firestore read.

## Editing Quiz Content

Non-developers only need to edit `data/quiz-content.json`.

- Add or update a department inside the top-level `departments` array.
- Give every department a unique `id`, a human-readable `name`, and a `videoUrl`.
- Leave `videoUrl` as an empty string to keep the current placeholder screen, or use a YouTube, Vimeo, or direct MP4 URL to show a real video.
- Add questions inside each department's `questions` array.
- Each question needs an `id`, `question`, `options`, and `correctAnswer`.
- `correctAnswer` must be the zero-based index of the correct option in the `options` array.

Example:

```json
{
  "id": "technology",
  "name": "Technology",
  "videoUrl": "https://www.youtube.com/watch?v=example",
  "questions": [
    {
      "id": "technology-q1",
      "question": "What drives our core architecture?",
      "options": ["Cloud", "Paper", "Magic", "Hopes"],
      "correctAnswer": 0
    }
  ]
}
```

## Future Extension Points

- Track in-progress attempts server-side for stronger anti-replay and anti-tamper controls.
- Add stricter anti-cheat controls around attempt creation and replay detection.
- Replace JSON quiz content with a CMS or admin-managed content source when needed.
- Protect future API routes with the shared auth middleware.
