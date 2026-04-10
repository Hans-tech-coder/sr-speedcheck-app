const adminStatus = document.getElementById("admin-status");
const adminUserCard = document.getElementById("admin-user-card");
const adminUserName = document.getElementById("admin-user-name");
const adminUserEmail = document.getElementById("admin-user-email");
const adminContent = document.getElementById("admin-content");
const btnExportCsv = document.getElementById("btn-export-csv");
const btnRefreshAttempts = document.getElementById("btn-refresh-attempts");
const btnPrevPage = document.getElementById("btn-prev-page");
const btnNextPage = document.getElementById("btn-next-page");
const btnResetFilters = document.getElementById("btn-reset-filters");
const attemptsPageLabel = document.getElementById("attempts-page-label");
const attemptsResultsMeta = document.getElementById("attempts-results-meta");
const attemptsTableBody = document.getElementById("attempts-table-body");
const adminLeaderboard = document.getElementById("admin-leaderboard");

const filtersForm = document.getElementById("attempt-filters-form");
const attemptSearch = document.getElementById("attempt-search");
const attemptDepartment = document.getElementById("attempt-department");
const attemptSortBy = document.getElementById("attempt-sort-by");
const attemptSortOrder = document.getElementById("attempt-sort-order");
const attemptPageSize = document.getElementById("attempt-page-size");
const attemptStartDate = document.getElementById("attempt-start-date");
const attemptEndDate = document.getElementById("attempt-end-date");

const summaryParticipants = document.getElementById("summary-participants");
const summaryAttempts = document.getElementById("summary-attempts");
const summaryAverage = document.getElementById("summary-average");
const summaryTop = document.getElementById("summary-top");
const summaryLatest = document.getElementById("summary-latest");

const attemptDetailEmpty = document.getElementById("attempt-detail-empty");
const attemptDetail = document.getElementById("attempt-detail");
const detailAttemptId = document.getElementById("detail-attempt-id");
const detailName = document.getElementById("detail-name");
const detailEmail = document.getElementById("detail-email");
const detailDepartment = document.getElementById("detail-department");
const detailScore = document.getElementById("detail-score");
const detailCorrect = document.getElementById("detail-correct");
const detailCompleted = document.getElementById("detail-completed");
const detailVersion = document.getElementById("detail-version");
const attemptDetailBody = document.getElementById("attempt-detail-body");

const DEFAULT_FILTERS = {
    search: "",
    department: "",
    sortBy: "completedAt",
    sortOrder: "desc",
    pageSize: 20,
    startDate: "",
    endDate: ""
};

const state = {
    page: 1,
    selectedAttemptId: "",
    pagination: null,
    availableDepartments: [],
    filters: {
        ...DEFAULT_FILTERS
    }
};

function setStatus(message, variant = "info") {
    adminStatus.innerText = message;
    adminStatus.className = `admin-status admin-status--${variant}`;
}

function formatDate(value) {
    if (!value) {
        return "N/A";
    }

    return new Date(value).toLocaleString();
}

function syncFilterInputs() {
    attemptSearch.value = state.filters.search;
    attemptDepartment.value = state.filters.department;
    attemptSortBy.value = state.filters.sortBy;
    attemptSortOrder.value = state.filters.sortOrder;
    attemptPageSize.value = String(state.filters.pageSize);
    attemptStartDate.value = state.filters.startDate;
    attemptEndDate.value = state.filters.endDate;
}

function getAttemptsQueryParams() {
    const params = new URLSearchParams({
        page: String(state.page),
        pageSize: String(state.filters.pageSize),
        sortBy: state.filters.sortBy,
        sortOrder: state.filters.sortOrder
    });

    if (state.filters.search) {
        params.set("search", state.filters.search);
    }

    if (state.filters.department) {
        params.set("department", state.filters.department);
    }

    if (state.filters.startDate) {
        params.set("startDate", state.filters.startDate);
    }

    if (state.filters.endDate) {
        params.set("endDate", state.filters.endDate);
    }

    return params;
}

function readFiltersFromInputs() {
    return {
        search: attemptSearch.value.trim(),
        department: attemptDepartment.value,
        sortBy: attemptSortBy.value,
        sortOrder: attemptSortOrder.value,
        pageSize: Number.parseInt(attemptPageSize.value, 10) || DEFAULT_FILTERS.pageSize,
        startDate: attemptStartDate.value,
        endDate: attemptEndDate.value
    };
}

function updateFilters(nextFilters, options = {}) {
    state.filters = {
        ...state.filters,
        ...nextFilters
    };

    if (!options.preservePage) {
        state.page = 1;
    }

    syncFilterInputs();
}

async function fetchJson(url) {
    const response = await fetch(url, {
        headers: {
            Accept: "application/json"
        },
        credentials: "same-origin"
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
        const error = new Error(payload.message || "request_failed");
        error.status = response.status;
        throw error;
    }

    return payload;
}

function renderSummary(summary) {
    summaryParticipants.innerText = summary.totalParticipants ?? 0;
    summaryAttempts.innerText = summary.totalAttempts ?? 0;
    summaryAverage.innerText = summary.averageScore ?? 0;
    summaryTop.innerText = summary.highestScore ?? 0;
    summaryLatest.innerText = summary.latestCompletionAt ? formatDate(summary.latestCompletionAt) : "No attempts yet";
}

function renderDepartmentOptions(departments) {
    const currentValue = state.filters.department;
    const normalizedDepartments = Array.isArray(departments) ? departments : [];

    attemptDepartment.innerHTML = `
        <option value="">All Departments</option>
        ${normalizedDepartments.map((department) => `
            <option value="${department.id}">${department.name}</option>
        `).join("")}
    `;

    const hasCurrentValue = normalizedDepartments.some((department) => department.id === currentValue);
    attemptDepartment.value = hasCurrentValue ? currentValue : "";

    if (!hasCurrentValue && currentValue) {
        state.filters.department = "";
    }
}

function renderAttemptsMeta(result, itemCount) {
    const totalItems = result.totalItems ?? 0;

    if (!totalItems) {
        attemptsResultsMeta.innerText = state.filters.search || state.filters.department || state.filters.startDate || state.filters.endDate
            ? "No attempts match the current filters."
            : "No attempts found yet.";
        return;
    }

    const startItem = ((result.page || 1) - 1) * (result.pageSize || state.filters.pageSize) + 1;
    const endItem = startItem + itemCount - 1;
    attemptsResultsMeta.innerText = `Showing ${startItem}-${endItem} of ${totalItems} attempts`;
}

function renderAttempts(result) {
    const attempts = Array.isArray(result.items) ? result.items : (result.attempts || []);
    state.pagination = {
        page: result.page || 1,
        pageSize: result.pageSize || state.filters.pageSize,
        totalItems: result.totalItems || 0,
        totalPages: result.totalPages || 1,
        hasNextPage: Boolean(result.hasNextPage),
        hasPreviousPage: Boolean(result.hasPreviousPage)
    };
    state.page = state.pagination.page;
    state.filters.pageSize = state.pagination.pageSize;
    state.availableDepartments = result.availableDepartments || state.availableDepartments;

    renderDepartmentOptions(state.availableDepartments);
    renderAttemptsMeta(result, attempts.length);

    if (!attempts.length) {
        attemptsTableBody.innerHTML = `<tr><td colspan="6">No attempts found.</td></tr>`;
    } else {
        attemptsTableBody.innerHTML = attempts.map((attempt) => `
            <tr data-attempt-id="${attempt.attemptId}" class="${attempt.attemptId === state.selectedAttemptId ? "is-selected" : ""}">
                <td>${attempt.displayName || attempt.name}</td>
                <td>${attempt.email}</td>
                <td>${attempt.department}</td>
                <td>${attempt.score}</td>
                <td>${attempt.totalCorrectAnswers}/${attempt.totalQuestions}</td>
                <td>${formatDate(attempt.completedAt)}</td>
            </tr>
        `).join("");
    }

    attemptsPageLabel.innerText = `Page ${state.pagination.page} of ${state.pagination.totalPages}`;
    btnPrevPage.disabled = !state.pagination.hasPreviousPage;
    btnNextPage.disabled = !state.pagination.hasNextPage;

    attemptsTableBody.querySelectorAll("tr[data-attempt-id]").forEach((row) => {
        row.addEventListener("click", () => {
            loadAttemptDetail(row.dataset.attemptId);
        });
    });
}

function renderLeaderboard(items) {
    if (!items.length) {
        adminLeaderboard.innerHTML = `<div class="leaderboard-empty">No leaderboard entries yet.</div>`;
        return;
    }

    adminLeaderboard.innerHTML = items.map((item) => `
        <div class="leaderboard-row">
            <div class="leaderboard-rank">#${item.rank}</div>
            <div>
                <div class="leaderboard-name">${item.displayName || item.name}</div>
                <div class="leaderboard-meta">${item.email} • ${item.department} • ${formatDate(item.completedAt)}</div>
            </div>
            <div class="leaderboard-score">${item.score} PTS</div>
        </div>
    `).join("");
}

function renderAttemptDetail(attempt) {
    state.selectedAttemptId = attempt.attemptId;
    attemptDetailEmpty.classList.add("hidden");
    attemptDetail.classList.remove("hidden");
    detailAttemptId.innerText = attempt.attemptId;
    detailName.innerText = attempt.displayName || attempt.name;
    detailEmail.innerText = attempt.email;
    detailDepartment.innerText = `${attempt.department} (${attempt.departmentId})`;
    detailScore.innerText = `${attempt.score} pts`;
    detailCorrect.innerText = `${attempt.totalCorrectAnswers}/${attempt.totalQuestions}`;
    detailCompleted.innerText = formatDate(attempt.completedAt);
    detailVersion.innerText = attempt.contentVersion || "N/A";

    const answers = Array.isArray(attempt.answersSummary) ? attempt.answersSummary : [];

    attemptDetailBody.innerHTML = answers.length
        ? answers.map((answer) => `
            <tr>
                <td>${answer.questionId}</td>
                <td>${answer.departmentId}</td>
                <td>${answer.selectedAnswer}</td>
                <td>${answer.correctAnswer}</td>
                <td>${answer.answeredCorrectly ? "Correct" : "Wrong"}</td>
                <td>${answer.awardedPoints}</td>
            </tr>
        `).join("")
        : `<tr><td colspan="6">No answer summary stored for this attempt.</td></tr>`;
}

async function loadAdminSession() {
    const payload = await fetchJson("/api/me");

    adminUserName.innerText = payload.user.name;
    adminUserEmail.innerText = payload.user.email;
    adminUserCard.classList.remove("hidden");
}

async function loadSummary() {
    const summary = await fetchJson("/api/admin/summary");
    renderSummary(summary);
}

async function loadAttempts() {
    const query = getAttemptsQueryParams();
    const result = await fetchJson(`/api/admin/attempts?${query.toString()}`);
    renderAttempts(result);
}

async function loadLeaderboard() {
    const result = await fetchJson("/api/admin/leaderboard");
    renderLeaderboard(result.leaderboard || []);
}

async function loadAttemptDetail(attemptId) {
    try {
        setStatus("Loading attempt detail...", "info");
        const result = await fetchJson(`/api/admin/attempts/${encodeURIComponent(attemptId)}`);
        renderAttemptDetail(result.attempt);
        await loadAttempts();
        setStatus("Admin telemetry ready.", "success");
    } catch (error) {
        console.error("Failed to load attempt detail.", error);
        setStatus(error.message || "Unable to load attempt detail.", "error");
    }
}

async function refreshAttempts(statusMessage = "Refreshing attempts...") {
    setStatus(statusMessage, "info");

    try {
        await loadAttempts();
        setStatus("Admin telemetry ready.", "success");
    } catch (error) {
        console.error("Failed to load attempts.", error);
        setStatus(error.message || "Unable to load attempts right now.", "error");
    }
}

async function refreshAdminDashboard() {
    setStatus("Loading admin telemetry...", "info");

    try {
        await loadAdminSession();
        await Promise.all([
            loadSummary(),
            loadAttempts(),
            loadLeaderboard()
        ]);
        adminContent.classList.remove("hidden");
        setStatus("Admin telemetry ready.", "success");
    } catch (error) {
        console.error("Failed to load admin dashboard.", error);

        if (error.status === 401) {
            setStatus("Sign in with an authorized admin account to access this page.", "error");
            return;
        }

        if (error.status === 403) {
            setStatus("Your account is signed in, but it is not authorized for admin monitoring.", "error");
            return;
        }

        setStatus(error.message || "Unable to load admin dashboard right now.", "error");
    }
}

function exportCsvWithCurrentFilters() {
    const query = getAttemptsQueryParams();
    query.delete("page");
    query.delete("pageSize");
    window.location.assign(`/api/admin/export/csv?${query.toString()}`);
}

filtersForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    updateFilters(readFiltersFromInputs());
    await refreshAttempts("Applying filters...");
});

[attemptDepartment, attemptSortBy, attemptSortOrder, attemptPageSize, attemptStartDate, attemptEndDate].forEach((element) => {
    element.addEventListener("change", async () => {
        updateFilters(readFiltersFromInputs());
        await refreshAttempts("Applying filters...");
    });
});

btnRefreshAttempts.addEventListener("click", async () => {
    await refreshAdminDashboard();
});

btnPrevPage.addEventListener("click", async () => {
    if (state.pagination?.hasPreviousPage) {
        state.page -= 1;
        await refreshAttempts("Loading previous page...");
    }
});

btnNextPage.addEventListener("click", async () => {
    if (state.pagination?.hasNextPage) {
        state.page += 1;
        await refreshAttempts("Loading next page...");
    }
});

btnResetFilters.addEventListener("click", async () => {
    updateFilters({ ...DEFAULT_FILTERS });
    await refreshAttempts("Resetting filters...");
});

btnExportCsv.addEventListener("click", () => {
    exportCsvWithCurrentFilters();
});

syncFilterInputs();
refreshAdminDashboard();
