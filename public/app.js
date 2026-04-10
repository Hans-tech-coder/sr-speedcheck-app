const authMessages = {
    domain_not_allowed: "This quiz is restricted to approved agency Google Workspace accounts.",
    email_unavailable: "Google did not return a usable email address for this account.",
    login_failed: "Sign-in did not complete. Please try again.",
    oauth_not_configured: "Google sign-in is not configured yet. Add the OAuth credentials in the server environment first.",
    server_error: "Mission Control hit a server issue while processing sign-in.",
    allowed_domain_not_configured: "The allowed Google Workspace domain has not been configured on the server."
};

let departmentsData = [];
let currentUser = null;
let playerName = "";
let playerDept = "";
let playerScore = 0;
let currentQuestionAttempts = 0;
let currentStationIndex = 0;
let currentQuestionIndex = 0;
let isQuestionAnswered = false;
let maxScore = 0;
let totalQuestionCount = 0;
let currentAttemptToken = "";
let answerSubmissions = [];

const mapViewport = document.getElementById("map-viewport");
const stationsContainer = document.getElementById("stations-container");
const rocketContainer = document.getElementById("rocket-container");

const hud = document.getElementById("hud");
const hudName = document.getElementById("hud-name");
const progressText = document.getElementById("progress-text");
const scoreText = document.getElementById("score-text");

const launchpad = document.getElementById("launchpad");
const voyagerDeptSelect = document.getElementById("voyager-dept");
const onboardError = document.getElementById("onboard-error");
const btnLfg = document.getElementById("btn-lfg");

const authStatus = document.getElementById("auth-status");
const signedOutView = document.getElementById("signed-out-view");
const signedInView = document.getElementById("signed-in-view");
const btnGoogleLogin = document.getElementById("btn-google-login");
const authName = document.getElementById("auth-name");
const authEmail = document.getElementById("auth-email");
const authAvatar = document.getElementById("auth-avatar");

const sessionControls = document.getElementById("session-controls");
const sessionName = document.getElementById("session-name");
const sessionEmail = document.getElementById("session-email");
const sessionAvatar = document.getElementById("session-avatar");
const btnAdminPortal = document.getElementById("btn-admin-portal");
const btnLogout = document.getElementById("btn-logout");

const transModal = document.getElementById("transmission-modal");
const transDeptName = document.getElementById("trans-dept-name");
const transmissionVideo = document.getElementById("transmission-video");
const overrideToggle = document.getElementById("override-toggle");
const btnBeginClearance = document.getElementById("btn-begin-clearance");

const clearancePanel = document.getElementById("clearance-panel");
const clearDeptName = document.getElementById("clearance-dept-name");
const qNum = document.getElementById("q-num");
const qTotal = document.getElementById("q-total");
const questionText = document.getElementById("question-text");
const optionsContainer = document.getElementById("options-container");
const feedbackMsg = document.getElementById("feedback-msg");
const btnNextAction = document.getElementById("btn-next-action");

function calculateMaxScore(departments) {
    return departments.reduce((total, department) => total + (department.questions.length * 2), 0);
}

function calculateTotalQuestionCount(departments) {
    return departments.reduce((total, department) => total + department.questions.length, 0);
}

function setQuizAvailability(isAvailable) {
    voyagerDeptSelect.disabled = !isAvailable;
    btnLfg.disabled = !isAvailable;
}

function initSetup() {
    voyagerDeptSelect.innerHTML = "";

    const defaultOption = document.createElement("option");
    defaultOption.value = "";
    defaultOption.innerText = "SELECT DEPARTMENT";
    defaultOption.disabled = true;
    defaultOption.selected = true;
    voyagerDeptSelect.appendChild(defaultOption);

    departmentsData.forEach((dept) => {
        const option = document.createElement("option");
        option.value = dept.id;
        option.innerText = dept.name;
        voyagerDeptSelect.appendChild(option);
    });

    setQuizAvailability(departmentsData.length > 0);
}

function getVoyagerName(user) {
    const sourceName = user?.name || user?.email?.split("@")[0] || "VOYAGER";
    return sourceName.toUpperCase().slice(0, 15);
}

function createAttemptToken() {
    if (window.crypto?.randomUUID) {
        return window.crypto.randomUUID().replace(/-/g, "_");
    }

    return `attempt_${Date.now()}_${Math.floor(Math.random() * 1000000)}`;
}

function getDepartmentById(departmentId) {
    return departmentsData.find((department) => department.id === departmentId) || null;
}

function getCurrentPlayerLeaderboardEntry() {
    const department = getDepartmentById(playerDept);

    return {
        displayName: playerName,
        department: department?.name || "Unknown Department",
        score: playerScore,
        totalQuestions: totalQuestionCount,
        completedAt: new Date().toISOString(),
        isCurrentUser: true
    };
}

function getCurrentQuestionMeta() {
    const department = departmentsData[currentStationIndex];
    const question = department?.questions[currentQuestionIndex];

    return {
        department,
        question
    };
}

function buildLeaderboardMarkup(leaderboardData) {
    let lbHTML = `<div class="leaderboard-container">
        <h2 class="retro-text lb-title">RACE TO GREATNESS: LEADERBOARD</h2>`;

    if (!leaderboardData.length) {
        lbHTML += `
            <p class="completion-subtitle">NO PERSISTED SCORES YET.</p>
        `;
        lbHTML += "</div>";
        return lbHTML;
    }

    leaderboardData.forEach((player) => {
        let percentage = maxScore > 0 ? (player.score / maxScore) * 100 : 0;

        if (percentage > 100) {
            percentage = 100;
        }

        if (percentage < 0) {
            percentage = 0;
        }

        const rowClass = player.isCurrentUser ? "lb-row current-player" : "lb-row";
        const label = player.displayName || player.name || "VOYAGER";

        lbHTML += `
            <div class="${rowClass}">
                <div class="lb-name">${label}</div>
                <div class="lb-track">
                    <div class="lb-rocket-icon" style="left: calc(${percentage}% - 15px);">
                        ${getSVGIcon()}
                    </div>
                </div>
                <div class="lb-score">${player.score} PTS</div>
            </div>
        `;
    });

    lbHTML += "</div>";
    return lbHTML;
}

function renderEndScreen(statusMessage, leaderboardData) {
    launchpad.innerHTML = `
        <h1 class="completion-title">MISSION ACCOMPLISHED</h1>
        <p class="completion-subtitle">ALL DEPARTMENTS CLEARED</p>
        <p class="completion-subtitle">${statusMessage}</p>
        ${buildLeaderboardMarkup(leaderboardData)}
    `;

    launchpad.style.justifyContent = "flex-start";
    launchpad.style.paddingTop = "50px";
    launchpad.classList.remove("hidden");
}

function mergeLeaderboardEntries(leaderboardPayload, fallbackEntry) {
    const combinedEntries = [];
    const seenLabels = new Set();
    const payloadEntries = Array.isArray(leaderboardPayload?.leaderboard) ? leaderboardPayload.leaderboard : [];
    const currentUserEntry = leaderboardPayload?.currentUserEntry || null;

    payloadEntries.forEach((entry) => {
        const key = `${entry.displayName || entry.name}-${entry.completedAt || ""}`;

        if (seenLabels.has(key)) {
            return;
        }

        seenLabels.add(key);
        combinedEntries.push(entry);
    });

    const entryToAppend = currentUserEntry || fallbackEntry;

    if (entryToAppend) {
        const key = `${entryToAppend.displayName || entryToAppend.name}-${entryToAppend.completedAt || ""}`;

        if (!seenLabels.has(key)) {
            combinedEntries.push(entryToAppend);
        }
    }

    return combinedEntries;
}

function setAuthStatus(message, variant = "info") {
    if (!message) {
        authStatus.innerText = "";
        authStatus.className = "auth-status hidden";
        return;
    }

    authStatus.innerText = message;
    authStatus.className = `auth-status auth-status--${variant}`;
}

function updateAvatar(element, picture, altText) {
    if (!picture) {
        element.removeAttribute("src");
        element.classList.add("hidden");
        return;
    }

    element.src = picture;
    element.alt = altText;
    element.classList.remove("hidden");
}

function showQuizContentLoadError(error) {
    console.error("Unable to load quiz content.", error);
    setQuizAvailability(false);
    onboardError.innerText = "MISSION DATA UNAVAILABLE. PLEASE TRY AGAIN LATER.";
    setAuthStatus("Mission data could not be loaded right now. Please refresh or contact Mission Control.", "error");
}

function renderSessionState() {
    const isAuthenticated = Boolean(currentUser);

    signedOutView.classList.toggle("hidden", isAuthenticated);
    signedInView.classList.toggle("hidden", !isAuthenticated);
    sessionControls.classList.toggle("hidden", !isAuthenticated);
    btnAdminPortal.classList.toggle("hidden", !(isAuthenticated && currentUser?.isAdmin));

    if (!isAuthenticated) {
        hud.classList.add("hidden");
        return;
    }

    authName.innerText = currentUser.name;
    authEmail.innerText = currentUser.email;
    sessionName.innerText = getVoyagerName(currentUser);
    sessionEmail.innerText = currentUser.email;
    updateAvatar(authAvatar, currentUser.picture, `${currentUser.name} avatar`);
    updateAvatar(sessionAvatar, currentUser.picture, `${currentUser.name} avatar`);
}

function getAuthErrorMessage() {
    const params = new URLSearchParams(window.location.search);
    const authError = params.get("authError");

    if (!authError) {
        return "";
    }

    params.delete("authError");
    const nextUrl = params.toString()
        ? `${window.location.pathname}?${params.toString()}`
        : window.location.pathname;
    window.history.replaceState({}, "", nextUrl);

    return authMessages[authError] || "Unable to complete sign-in with that Google account.";
}

async function loadSession() {
    const response = await fetch("/api/session", {
        headers: {
            Accept: "application/json"
        },
        credentials: "same-origin"
    });

    if (!response.ok) {
        throw new Error("session_request_failed");
    }

    const session = await response.json();
    currentUser = session.authenticated
        ? {
            ...session.user,
            ...(session.profile || {})
        }
        : null;
    renderSessionState();
}

function buildMediaEmbed(videoUrl, departmentName) {
    if (!videoUrl) {
        return null;
    }

    const trimmedUrl = videoUrl.trim();

    if (!trimmedUrl) {
        return null;
    }

    let parsedUrl;

    try {
        parsedUrl = new URL(trimmedUrl);
    } catch (_error) {
        return null;
    }

    const host = parsedUrl.hostname.toLowerCase();
    const pathname = parsedUrl.pathname;
    const lowerPathname = pathname.toLowerCase();

    if (lowerPathname.endsWith(".mp4") || lowerPathname.endsWith(".webm") || lowerPathname.endsWith(".ogg")) {
        return {
            tagName: "video",
            attributes: {
                src: trimmedUrl,
                controls: true,
                playsinline: true,
                preload: "metadata"
            }
        };
    }

    if (host === "youtu.be" || host.endsWith("youtube.com")) {
        const pathParts = pathname.split("/").filter(Boolean);
        let videoId = parsedUrl.searchParams.get("v");

        if (!videoId && host === "youtu.be") {
            videoId = pathParts[0];
        }

        if (!videoId && (pathParts[0] === "embed" || pathParts[0] === "shorts")) {
            videoId = pathParts[1];
        }

        if (videoId) {
            return {
                tagName: "iframe",
                attributes: {
                    src: `https://www.youtube.com/embed/${videoId}?rel=0`,
                    title: `${departmentName} transmission`,
                    allow: "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share",
                    allowfullscreen: true,
                    referrerpolicy: "strict-origin-when-cross-origin"
                }
            };
        }
    }

    if (host.endsWith("vimeo.com")) {
        const pathParts = pathname.split("/").filter(Boolean);
        const videoId = pathParts[pathParts.length - 1];

        if (videoId) {
            return {
                tagName: "iframe",
                attributes: {
                    src: `https://player.vimeo.com/video/${videoId}`,
                    title: `${departmentName} transmission`,
                    allow: "autoplay; fullscreen; picture-in-picture",
                    allowfullscreen: true
                }
            };
        }
    }

    return {
        tagName: "iframe",
        attributes: {
            src: trimmedUrl,
            title: `${departmentName} transmission`,
            allow: "autoplay; fullscreen; picture-in-picture",
            allowfullscreen: true,
            referrerpolicy: "strict-origin-when-cross-origin"
        }
    };
}

function renderTransmissionVideo(videoUrl, departmentName) {
    transmissionVideo.innerHTML = "";

    const mediaConfig = buildMediaEmbed(videoUrl, departmentName);

    if (mediaConfig) {
        const mediaElement = document.createElement(mediaConfig.tagName);
        mediaElement.className = "video-placeholder__media";

        Object.entries(mediaConfig.attributes).forEach(([attribute, value]) => {
            if (typeof value === "boolean") {
                if (value) {
                    mediaElement.setAttribute(attribute, "");
                }

                return;
            }

            mediaElement.setAttribute(attribute, value);
        });

        transmissionVideo.appendChild(mediaElement);
    } else {
        const fallback = document.createElement("div");
        fallback.className = "video-placeholder__fallback";
        fallback.innerText = "[ VIDEO FEED PLACEHOLDER ]";
        transmissionVideo.appendChild(fallback);
    }

    const scanline = document.createElement("div");
    scanline.className = "scanline";
    transmissionVideo.appendChild(scanline);
}

function normalizeQuestion(question, departmentId, questionIndex) {
    if (!question || typeof question !== "object" || Array.isArray(question)) {
        throw new Error(`Question ${questionIndex + 1} in department "${departmentId}" is invalid.`);
    }

    if (!Array.isArray(question.options) || question.options.length < 2) {
        throw new Error(`Question "${question.id || `${departmentId}-q${questionIndex + 1}`}" must include at least two options.`);
    }

    if (!Number.isInteger(question.correctAnswer) || question.correctAnswer < 0 || question.correctAnswer >= question.options.length) {
        throw new Error(`Question "${question.id || `${departmentId}-q${questionIndex + 1}`}" has an invalid correct answer index.`);
    }

    return {
        id: typeof question.id === "string" && question.id.trim() ? question.id.trim() : `${departmentId}-q${questionIndex + 1}`,
        question: typeof question.question === "string" ? question.question.trim() : "",
        options: question.options.map((option) => String(option)),
        correctAnswer: question.correctAnswer
    };
}

function normalizeQuizContent(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw new Error("Quiz content payload is invalid.");
    }

    if (!Array.isArray(payload.departments) || payload.departments.length === 0) {
        throw new Error("Quiz content must include at least one department.");
    }

    const seenDepartmentIds = new Set();

    return payload.departments.map((department, departmentIndex) => {
        if (!department || typeof department !== "object" || Array.isArray(department)) {
            throw new Error(`Department ${departmentIndex + 1} is invalid.`);
        }

        if (typeof department.id !== "string" || !department.id.trim()) {
            throw new Error(`Department ${departmentIndex + 1} is missing a valid id.`);
        }

        const departmentId = department.id.trim();

        if (seenDepartmentIds.has(departmentId)) {
            throw new Error(`Department id "${departmentId}" must be unique.`);
        }

        seenDepartmentIds.add(departmentId);

        if (typeof department.name !== "string" || !department.name.trim()) {
            throw new Error(`Department "${departmentId}" is missing a name.`);
        }

        if (!Array.isArray(department.questions) || department.questions.length === 0) {
            throw new Error(`Department "${departmentId}" must include at least one question.`);
        }

        return {
            id: departmentId,
            name: department.name.trim(),
            videoUrl: typeof department.videoUrl === "string" ? department.videoUrl.trim() : "",
            questions: department.questions.map((question, questionIndex) => normalizeQuestion(question, departmentId, questionIndex))
        };
    });
}

async function loadQuizContent() {
    const response = await fetch("/api/quiz-content", {
        headers: {
            Accept: "application/json"
        },
        credentials: "same-origin"
    });

    if (!response.ok) {
        let errorMessage = "quiz_content_request_failed";

        try {
            const errorPayload = await response.json();
            errorMessage = errorPayload.message || errorMessage;
        } catch (_error) {
            errorMessage = "quiz_content_request_failed";
        }

        throw new Error(errorMessage);
    }

    const quizContent = await response.json();
    departmentsData = normalizeQuizContent(quizContent);
    maxScore = calculateMaxScore(departmentsData);
    totalQuestionCount = calculateTotalQuestionCount(departmentsData);
}

async function submitQuizAttempt() {
    const response = await fetch("/api/quiz-attempts", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Accept: "application/json"
        },
        credentials: "same-origin",
        body: JSON.stringify({
            attemptToken: currentAttemptToken,
            departmentId: playerDept,
            answers: answerSubmissions
        })
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(payload.message || "quiz_attempt_save_failed");
    }

    return payload;
}

async function loadLeaderboard() {
    const response = await fetch("/api/leaderboard", {
        headers: {
            Accept: "application/json"
        },
        credentials: "same-origin"
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(payload.message || "leaderboard_request_failed");
    }

    return payload;
}

function resetGameState() {
    playerDept = "";
    playerScore = 0;
    currentQuestionAttempts = 0;
    currentStationIndex = 0;
    currentQuestionIndex = 0;
    isQuestionAnswered = false;
    currentAttemptToken = "";
    answerSubmissions = [];

    progressText.innerText = `0/${departmentsData.length}`;
    scoreText.innerText = "0";
    feedbackMsg.innerText = "";
    feedbackMsg.className = "feedback-msg";
    stationsContainer.innerHTML = "";
    rocketContainer.style.left = "50vw";
    launchpad.style.justifyContent = "center";
    launchpad.style.paddingTop = "20px";
    transModal.classList.add("hidden");
    clearancePanel.classList.add("hidden");
    btnBeginClearance.classList.add("hidden");
    btnNextAction.classList.add("hidden");
    overrideToggle.checked = false;
    mapViewport.scrollLeft = 0;
    renderTransmissionVideo("", "");
}

function startGame() {
    if (!currentUser) {
        setAuthStatus("Sign in with your agency Google account before joining the mission.", "error");
        return;
    }

    if (!departmentsData.length) {
        onboardError.innerText = "MISSION DATA UNAVAILABLE. PLEASE TRY AGAIN LATER.";
        return;
    }

    const dept = voyagerDeptSelect.value;

    if (!dept) {
        onboardError.innerText = "ERROR: DEPARTMENT REQUIRED.";
        return;
    }

    onboardError.innerText = "";
    resetGameState();

    playerDept = dept;
    playerName = getVoyagerName(currentUser);
    currentAttemptToken = createAttemptToken();
    hudName.innerText = playerName;

    launchpad.classList.add("hidden");
    hud.classList.remove("hidden");

    initMap();
    moveToStation(currentStationIndex);
}

function initMap() {
    stationsContainer.innerHTML = "";

    departmentsData.forEach((dept, index) => {
        const stationEl = document.createElement("div");
        stationEl.className = "station";
        stationEl.id = `station-${index}`;

        const num = index + 1;
        stationEl.innerHTML = `
            <div class="planet">${num}</div>
            <div class="station-label">${dept.name}</div>
        `;

        stationsContainer.appendChild(stationEl);
    });

    updateHUD();
}

function updateHUD() {
    progressText.innerText = `${currentStationIndex}/${departmentsData.length}`;
    scoreText.innerText = playerScore;
}

function moveToStation(index) {
    const stations = document.querySelectorAll(".station");

    if (index > 0) {
        stations[index - 1].classList.remove("active");
        stations[index - 1].classList.add("completed");
    }

    const currentStation = stations[index];
    currentStation.classList.add("active");

    const targetLeft = currentStation.offsetLeft + (currentStation.offsetWidth / 2);
    rocketContainer.style.left = `${targetLeft}px`;

    currentStation.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
    updateHUD();

    setTimeout(() => {
        showTransmission(index);
    }, 1600);
}

function showTransmission(index) {
    const dept = departmentsData[index];
    transDeptName.innerText = `DESTINATION: ${dept.name.toUpperCase()}`;
    renderTransmissionVideo(dept.videoUrl, dept.name);
    overrideToggle.checked = false;
    btnBeginClearance.classList.add("hidden");
    transModal.classList.remove("hidden");
}

function startClearancePhase() {
    currentQuestionIndex = 0;
    renderQuestion();
    clearancePanel.classList.remove("hidden");
}

function renderQuestion() {
    const dept = departmentsData[currentStationIndex];
    const questionData = dept.questions[currentQuestionIndex];

    clearDeptName.innerText = dept.name.toUpperCase();
    qNum.innerText = currentQuestionIndex + 1;
    qTotal.innerText = dept.questions.length;

    isQuestionAnswered = false;
    currentQuestionAttempts = 0;

    feedbackMsg.innerText = "";
    feedbackMsg.className = "feedback-msg";
    btnNextAction.classList.add("hidden");
    clearancePanel.classList.remove("flash-wrong", "flash-correct", "shake-animation");

    clearancePanel.style.backgroundColor = "var(--bg-panel)";
    clearancePanel.style.borderColor = "var(--bat)";

    questionText.innerText = questionData.question;
    optionsContainer.innerHTML = "";

    questionData.options.forEach((option, optionIndex) => {
        const button = document.createElement("button");
        button.className = "option-btn";
        button.innerText = option;
        button.addEventListener("click", () => handleAnswer(optionIndex, questionData.correctAnswer, button));
        optionsContainer.appendChild(button);
    });

    btnNextAction.innerText = currentQuestionIndex < dept.questions.length - 1
        ? "Load Next Question"
        : "Clearance Granted: Next Orbit";
}

function handleAnswer(selectedIndex, correctIndex, btnElement) {
    if (isQuestionAnswered || btnElement.disabled) {
        return;
    }

    clearancePanel.classList.remove("shake-animation", "flash-wrong", "flash-correct");
    void clearancePanel.offsetWidth;

    if (selectedIndex === correctIndex) {
        const { question } = getCurrentQuestionMeta();

        isQuestionAnswered = true;
        btnElement.classList.add("correct");

        if (currentQuestionAttempts === 0) {
            playerScore += 2;
            feedbackMsg.innerText = "PERFECT CLEARANCE. DATA VERIFIED. (+2 PTS)";
        } else {
            feedbackMsg.innerText = "ACCESS GRANTED. DATA VERIFIED.";
        }

        feedbackMsg.className = "feedback-msg msg-correct";
        clearancePanel.classList.add("flash-correct");
        btnNextAction.classList.remove("hidden");

        const allButtons = optionsContainer.querySelectorAll(".option-btn");
        allButtons.forEach((button) => {
            if (button !== btnElement) {
                button.style.opacity = "0.3";
            }

            button.disabled = true;
        });

        answerSubmissions.push({
            questionId: question.id,
            selectedAnswer: selectedIndex,
            incorrectAttempts: currentQuestionAttempts
        });

        updateHUD();
        return;
    }

    btnElement.classList.add("wrong");
    btnElement.disabled = true;
    currentQuestionAttempts += 1;
    playerScore -= 1;

    feedbackMsg.innerText = "FAFO: RECALIBRATE PROTOCOL. (-1 PT)";
    feedbackMsg.className = "feedback-msg msg-wrong";

    clearancePanel.classList.add("shake-animation", "flash-wrong");
    updateHUD();

    setTimeout(() => {
        clearancePanel.classList.remove("flash-wrong");
    }, 400);
}

function getSVGIcon() {
    return `
        <svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
            <path fill="var(--text-light)" d="M14 2h4v4h-4zm-2 4h8v2h-8zm-2 2h12v10H10zm-2 6h2v6H8zm14 0h2v6h-2zM8 20h16v2H8zm2 2h12v2H10zm2 2h8v2h-8zm2 2h4v2h-4z"/>
            <path fill="var(--juice)" d="M12 28h8v2h-8zM14 30h4v2h-4z"/>
            <path fill="var(--pond)" d="M14 10h4v4h-4z"/>
        </svg>
    `;
}

function showEndScreen() {
    updateHUD();
    hud.classList.add("hidden");
    const localEntry = getCurrentPlayerLeaderboardEntry();
    renderEndScreen("SAVING MISSION LOG...", [localEntry]);

    Promise.resolve()
        .then(async () => {
            let saveStatus = "MISSION LOG SAVED.";
            let savedAttempt = localEntry;

            try {
                const saveResult = await submitQuizAttempt();
                savedAttempt = saveResult.attempt || localEntry;
                playerScore = savedAttempt.score;

                if (saveResult.duplicate) {
                    saveStatus = "MISSION LOG ALREADY CAPTURED. REFRESHING LEADERBOARD...";
                } else {
                    saveStatus = "MISSION LOG SAVED. REFRESHING LEADERBOARD...";
                }
            } catch (error) {
                console.error("Unable to save quiz attempt.", error);
                saveStatus = "MISSION LOG SAVE FAILED. SHOWING LOCAL RESULT.";
                renderEndScreen(saveStatus, [savedAttempt]);
                return;
            }

            renderEndScreen(saveStatus, [savedAttempt]);

            try {
                const leaderboardPayload = await loadLeaderboard();
                const leaderboardData = mergeLeaderboardEntries(leaderboardPayload, savedAttempt);
                renderEndScreen("MISSION LOG SAVED. LEADERBOARD SYNCED.", leaderboardData);
            } catch (error) {
                console.error("Unable to load leaderboard.", error);
                renderEndScreen("MISSION LOG SAVED, BUT LEADERBOARD COULD NOT LOAD.", [savedAttempt]);
            }
        })
        .catch((error) => {
            console.error("Unexpected completion flow error.", error);
            renderEndScreen("MISSION COMPLETE. LOCAL RESULT AVAILABLE ONLY.", [localEntry]);
        });
}

async function logout() {
    btnLogout.disabled = true;

    try {
        const response = await fetch("/auth/logout", {
            method: "POST",
            credentials: "same-origin"
        });

        if (!response.ok) {
            throw new Error("logout_failed");
        }

        window.location.assign("/");
    } catch (_error) {
        btnLogout.disabled = false;
        setAuthStatus("Logout failed. Please try again.", "error");
    }
}

async function bootstrapApplication() {
    resetGameState();
    renderSessionState();
    setAuthStatus("LOADING MISSION DATA...", "info");

    try {
        await loadQuizContent();
        initSetup();
        resetGameState();
    } catch (error) {
        showQuizContentLoadError(error);
        return;
    }

    setAuthStatus("CHECKING AGENCY CREDENTIALS...", "info");

    try {
        await loadSession();
    } catch (_error) {
        setAuthStatus("Unable to verify the current session. Please reload and try again.", "error");
        return;
    }

    const authErrorMessage = getAuthErrorMessage();

    if (currentUser) {
        setAuthStatus("");
        return;
    }

    if (authErrorMessage) {
        setAuthStatus(authErrorMessage, "error");
        return;
    }

    setAuthStatus("Sign in with your agency Google Workspace account to enter Mission Control.", "info");
}

btnGoogleLogin.addEventListener("click", () => {
    window.location.assign("/auth/google");
});

btnLogout.addEventListener("click", () => {
    logout();
});

btnAdminPortal.addEventListener("click", () => {
    window.location.assign("/admin.html");
});

btnLfg.addEventListener("click", () => {
    startGame();
});

overrideToggle.addEventListener("change", (event) => {
    btnBeginClearance.classList.toggle("hidden", !event.target.checked);
});

btnBeginClearance.addEventListener("click", () => {
    transModal.classList.add("hidden");
    startClearancePhase();
});

btnNextAction.addEventListener("click", () => {
    const currentDepartment = departmentsData[currentStationIndex];

    if (currentQuestionIndex < currentDepartment.questions.length - 1) {
        currentQuestionIndex += 1;
        renderQuestion();
        return;
    }

    clearancePanel.classList.add("hidden");
    currentStationIndex += 1;

    if (currentStationIndex < departmentsData.length) {
        moveToStation(currentStationIndex);
        return;
    }

    showEndScreen();
});

bootstrapApplication();
