// ui.js
// UI rendering, session management, and helper functions

// ---------------------------------------------------------------------------
// JWT helper
// ---------------------------------------------------------------------------
function parseJwt(token) {
    var base64Url = token.split(".")[1];
    var base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    var jsonPayload = decodeURIComponent(
        window
            .atob(base64)
            .split("")
            .map(function (c) {
                return "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2);
            })
            .join("")
    );
    return JSON.parse(jsonPayload);
}

// ---------------------------------------------------------------------------
// Session token helpers (persistent localStorage)
// ---------------------------------------------------------------------------
const SESSION_KEYS = {
    ACCESS_TOKEN: "nativeAuth_access_token",
    ID_TOKEN: "nativeAuth_id_token",
    REFRESH_TOKEN: "nativeAuth_refresh_token",
    INTERACTION_TYPE: "nativeAuth_interaction_type",
    DEMO_MODE: "nativeAuth_demo_mode",
    GRAPH_PROFILE_SELECT_FIELDS: "nativeAuth_graph_profile_select_fields",
    USER_MODE: "nativeAuth_user_mode",
    DOC_ACTIVE_TAB: "nativeAuth_doc_active_tab",
    GUIDED_JOURNEY_STATE: "nativeAuth_guided_journey_state",
    FLOW_COMPLETION_HISTORY: "nativeAuth_flow_completion_history",
};

const SESSION_STORAGE = window.localStorage;
const LEGACY_SESSION_STORAGE = window.sessionStorage;

function getSessionItem(key) {
    const persisted = SESSION_STORAGE.getItem(key);
    if (persisted !== null) return persisted;
    return LEGACY_SESSION_STORAGE.getItem(key);
}

function setSessionItem(key, value) {
    SESSION_STORAGE.setItem(key, value);
    LEGACY_SESSION_STORAGE.removeItem(key);
}

function removeSessionItem(key) {
    SESSION_STORAGE.removeItem(key);
    LEGACY_SESSION_STORAGE.removeItem(key);
}

function migrateLegacySessionStorage() {
    Object.values(SESSION_KEYS).forEach((key) => {
        if (SESSION_STORAGE.getItem(key) !== null) return;
        const legacyValue = LEGACY_SESSION_STORAGE.getItem(key);
        if (legacyValue !== null) {
            SESSION_STORAGE.setItem(key, legacyValue);
            LEGACY_SESSION_STORAGE.removeItem(key);
        }
    });
}

migrateLegacySessionStorage();

const ERROR_HISTORY = [];
let lastDiagnosticPayload = null;
const TOKEN_TIMER_IDS = {};
let latestOperatorRegistrationDetails = null;
const OPERATOR_CACHE = new Map();
const OPERATOR_CACHE_TTL_MS = 5 * 60 * 1000;
const OPERATOR_SEARCH_HISTORY_KEY = "operator_search_history";
const TOKEN_GUIDANCE_STATE = {
    accessTokenLifetime: false,
    idTokenLifetime: false,
};
const REFRESH_SCHEDULE_STATE = {
    mode: "",
    strategy: "",
    lastRefreshAt: null,
    nextRefreshAt: null,
    refreshSource: "", // "scheduled", "manual", "restore"
};

const GUIDED_JOURNEY_ORDER = ["native", "popup", "redirect"];
const GUIDED_JOURNEY_LABELS = {
    native: "Step 1: Native Auth",
    popup: "Step 2: MSAL Popup",
    redirect: "Step 3: MSAL Redirect",
};

function tr(key, params) {
    if (typeof window.t === "function") return window.t(key, params);
    return key;
}

function getDemoModeFallback() {
    return typeof DEMO_MODE_DEFAULT !== "undefined" ? DEMO_MODE_DEFAULT : false;
}

function isDemoModeEnabled() {
    const stored = getSessionItem(SESSION_KEYS.DEMO_MODE);
    if (stored === null) return getDemoModeFallback();
    return stored === "true";
}

function setDemoMode(value, options = {}) {
    const enabled = Boolean(value);
    setSessionItem(SESSION_KEYS.DEMO_MODE, enabled ? "true" : "false");

    const toggle = document.getElementById("demoModeToggle");
    if (toggle) {
        toggle.checked = enabled;
    }

    applyDemoModeState();

    if (!options.silent) {
        setLoginNotice("info", enabled ? tr("msg.demoModeEnabled") : tr("msg.demoModeDisabled"));
    }
}

function applyDemoModeState() {
    const enabled = isDemoModeEnabled();
    const rawToggles = document.querySelectorAll(".token-raw-toggle");
    rawToggles.forEach((element) => {
        element.style.display = enabled ? "block" : "none";
    });

    if (!enabled) {
        document.querySelectorAll(".token-raw").forEach((element) => {
            element.style.display = "none";
        });
    }

    const warning = document.getElementById("demoModeWarning");
    if (warning) {
        warning.style.display = enabled ? "block" : "none";
    }
}

function setLoginNotice(type, message) {
    const notice = document.getElementById("authNotice");
    if (!notice) return;

    if (!message) {
        notice.textContent = "";
        notice.className = "auth-notice is-hidden";
        return;
    }

    notice.textContent = message;
    notice.className = `auth-notice auth-notice-${type || "info"}`;
}

function clearLoginNotice() {
    setLoginNotice("", "");
}

const AUTH_FLOW_TIMELINE = {
    byFlow: {},
};
const FLOW_TIMELINE_LOG_LIMIT = 10;
const FLOW_COMPLETION_HISTORY_LIMIT = 10;

function formatDuration(ms) {
    const safeMs = Number.isFinite(ms) && ms > 0 ? ms : 0;
    if (safeMs < 1000) return `${Math.round(safeMs)}ms`;
    const seconds = safeMs / 1000;
    if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`;
    const minutes = Math.floor(seconds / 60);
    const remaining = Math.round(seconds % 60);
    return `${minutes}m ${remaining}s`;
}

function getFlowCompletionHistory() {
    const raw = getSessionItem(SESSION_KEYS.FLOW_COMPLETION_HISTORY);
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (_err) {
        return [];
    }
}

function setFlowCompletionHistory(history) {
    const normalized = Array.isArray(history) ? history.slice(0, FLOW_COMPLETION_HISTORY_LIMIT) : [];
    setSessionItem(SESSION_KEYS.FLOW_COMPLETION_HISTORY, JSON.stringify(normalized));
}

function persistCompletedFlow(entry) {
    if (!entry || !entry.flow) return;
    const history = getFlowCompletionHistory();
    history.unshift(entry);
    setFlowCompletionHistory(history);
}

function renderAuthFlowTimelineLog(flow, entries) {
    const panel = document.getElementById("authFlowTimelinePanel");
    if (!panel) return;

    const list = Array.isArray(entries) ? entries.slice(-FLOW_TIMELINE_LOG_LIMIT).reverse() : [];
    if (!flow || list.length === 0) {
        panel.innerHTML = "";
        panel.className = "auth-flow-log is-hidden";
        return;
    }

    panel.innerHTML = [
        `<div class="flow-log-title">Flow Timeline (${escapeHtml(flow)})</div>`,
        `<ol class="flow-log-list">${list.map((entry) => (`<li class="flow-log-item">` +
            `<span class="flow-log-stage">${escapeHtml(entry.step)}</span>` +
            `<span class="flow-log-meta">${escapeHtml(formatDuration(entry.elapsedMs))} total | ${escapeHtml(formatDuration(entry.stageMs))} stage</span>` +
            (entry.endpoint ? `<span class="flow-log-endpoint">${escapeHtml(entry.endpoint)}</span>` : "") +
            `</li>`)).join("")}</ol>`,
    ].join("");
    panel.className = "auth-flow-log";
}

function renderFlowCompletionSummary() {
    const panel = document.getElementById("flowCompletionSummary");
    if (!panel) return;

    const history = getFlowCompletionHistory();
    const latest = history[0];
    const previous = history[1];

    if (!latest) {
        panel.innerHTML = "";
        panel.className = "flow-comparison-summary is-hidden";
        return;
    }

    const latestCompleted = latest.completedAt ? new Date(latest.completedAt).toLocaleTimeString() : "-";
    const previousCompleted = previous && previous.completedAt ? new Date(previous.completedAt).toLocaleTimeString() : "-";
    const deltaMs = previous && Number.isFinite(previous.totalMs) ? latest.totalMs - previous.totalMs : null;
    const deltaLabel = deltaMs === null
        ? "No previous completed flow in this session."
        : `Delta vs previous: ${deltaMs >= 0 ? "+" : ""}${formatDuration(deltaMs)}.`;

    panel.innerHTML = [
        `<div class="flow-compare-title">Recent Flow Comparison</div>`,
        `<div class="flow-compare-grid">`,
        `<section class="flow-compare-card">` +
        `<div class="flow-compare-label">Latest</div>` +
        `<div class="flow-compare-flow">${escapeHtml(latest.flow)}</div>` +
        `<div class="flow-compare-time">${escapeHtml(formatDuration(latest.totalMs || 0))}</div>` +
        `<div class="flow-compare-meta">Completed ${escapeHtml(latestCompleted)} | Stages ${escapeHtml(String(latest.stageCount || 0))}</div>` +
        `</section>`,
        `<section class="flow-compare-card">` +
        `<div class="flow-compare-label">Previous</div>` +
        `<div class="flow-compare-flow">${escapeHtml(previous ? previous.flow : "-")}</div>` +
        `<div class="flow-compare-time">${escapeHtml(previous ? formatDuration(previous.totalMs || 0) : "-")}</div>` +
        `<div class="flow-compare-meta">Completed ${escapeHtml(previousCompleted)} | Stages ${escapeHtml(String(previous ? (previous.stageCount || 0) : 0))}</div>` +
        `</section>`,
        `</div>`,
        `<div class="flow-compare-delta">${escapeHtml(deltaLabel)}</div>`,
    ].join("");
    panel.className = "flow-comparison-summary";
}

function setAuthFlowStatus(payload = {}) {
    const panel = document.getElementById("authFlowStatusPanel");
    if (!panel) return;

    const flow = String(payload.flow || "Authentication");
    const step = String(payload.step || "Preparing");
    const next = payload.next ? String(payload.next) : "";
    const endpoint = payload.endpoint ? String(payload.endpoint) : "";
    const status = ["info", "success", "warning", "error"].includes(payload.status) ? payload.status : "info";
    const now = Date.now();

    if (payload.reset || !AUTH_FLOW_TIMELINE.byFlow[flow]) {
        AUTH_FLOW_TIMELINE.byFlow[flow] = {
            startedAt: now,
            lastStageAt: now,
            entries: [],
        };
    }

    const timeline = AUTH_FLOW_TIMELINE.byFlow[flow];
    const elapsedMs = Math.max(0, now - timeline.startedAt);
    const stageMs = Math.max(0, now - timeline.lastStageAt);
    timeline.lastStageAt = now;
    timeline.entries.push({ step, status, next, endpoint, elapsedMs, stageMs, at: now });
    if (timeline.entries.length > FLOW_TIMELINE_LOG_LIMIT) {
        timeline.entries = timeline.entries.slice(-FLOW_TIMELINE_LOG_LIMIT);
    }

    panel.innerHTML = [
        `<div class="flow-line-title">Flow: ${escapeHtml(flow)}</div>`,
        `<div class="flow-line-step">Stage: ${escapeHtml(step)}</div>`,
        `<div class="flow-line-metrics"><span class="flow-time-chip">Elapsed ${escapeHtml(formatDuration(elapsedMs))}</span><span class="flow-time-chip">Stage ${escapeHtml(formatDuration(stageMs))}</span></div>`,
        endpoint ? `<div class="flow-line-endpoint">Endpoint: ${escapeHtml(endpoint)}</div>` : "",
        next ? `<div class="flow-line-next">Next: ${escapeHtml(next)}</div>` : "",
    ].join("");
    panel.className = `auth-flow-status is-${status}`;
    renderAuthFlowTimelineLog(flow, timeline.entries);

    if (status === "success" || status === "error") {
        persistCompletedFlow({
            flow,
            status,
            totalMs: elapsedMs,
            completedAt: now,
            finalStep: step,
            endpoint,
            stageCount: timeline.entries.length,
        });
        renderFlowCompletionSummary();
        delete AUTH_FLOW_TIMELINE.byFlow[flow];
    }
}

function clearAuthFlowStatus() {
    const panel = document.getElementById("authFlowStatusPanel");
    const timelinePanel = document.getElementById("authFlowTimelinePanel");
    if (!panel) return;
    panel.innerHTML = "";
    panel.className = "auth-flow-status is-hidden";
    if (timelinePanel) {
        timelinePanel.innerHTML = "";
        timelinePanel.className = "auth-flow-log is-hidden";
    }
    AUTH_FLOW_TIMELINE.byFlow = {};
}

window.setAuthFlowStatus = setAuthFlowStatus;
window.clearAuthFlowStatus = clearAuthFlowStatus;

function getUserMode() {
    const stored = getSessionItem(SESSION_KEYS.USER_MODE);
    return stored === "end-user" ? "end-user" : "developer";
}

function setUserMode(mode) {
    const normalized = mode === "end-user" ? "end-user" : "developer";
    setSessionItem(SESSION_KEYS.USER_MODE, normalized);
    applyUserModeUI();
    return normalized;
}

function applyUserModeUI() {
    const mode = getUserMode();
    const homeDiv = document.getElementById("homeDiv");
    if (homeDiv) {
        homeDiv.setAttribute("data-user-mode", mode);
    }
    const developerBtn = document.getElementById("modeDeveloperBtn");
    const endUserBtn = document.getElementById("modeEndUserBtn");
    if (developerBtn) developerBtn.classList.toggle("is-active", mode === "developer");
    if (endUserBtn) endUserBtn.classList.toggle("is-active", mode === "end-user");
}

function chooseUserMode(mode) {
    const selected = setUserMode(mode);
    const notice = selected === "developer"
        ? "Developer mode enabled: full diagnostics and deep implementation details are visible."
        : "End User mode enabled: simplified learning path with less implementation detail.";
    setLoginNotice("info", notice);
    renderGuidedJourney();
}

window.chooseUserMode = chooseUserMode;

function getActiveDocTab() {
    const stored = getSessionItem(SESSION_KEYS.DOC_ACTIVE_TAB) || "native";
    return ["native", "popup", "redirect", "comparison"].includes(stored) ? stored : "native";
}

function openDocTab(tabName, options = {}) {
    const tab = ["native", "popup", "redirect", "comparison"].includes(tabName) ? tabName : "native";
    setSessionItem(SESSION_KEYS.DOC_ACTIVE_TAB, tab);

    document.querySelectorAll(".docs-tab-panel").forEach((panel) => {
        panel.classList.toggle("is-hidden", panel.getAttribute("data-doc-tab") !== tab);
    });
    document.querySelectorAll(".doc-tab-button").forEach((button) => {
        const isActive = button.id === `docTab${tab.charAt(0).toUpperCase()}${tab.slice(1)}`;
        button.classList.toggle("is-active", isActive);
        button.setAttribute("aria-selected", String(isActive));
    });

    if (options.scroll !== false) {
        const anchor = document.getElementById("docs-detailed");
        if (anchor) anchor.scrollIntoView({ behavior: "smooth", block: "start" });
    }
}

window.openDocTab = openDocTab;

function showDetailedDocsPage() {
    showHomePage();
    _setNavActive("details");
    openDocTab(getActiveDocTab());
}

window.showDetailedDocsPage = showDetailedDocsPage;

function exploreApiReference() {
    showHomePage();
    _setNavActive("docs");
    openDocTab("native", { scroll: false });

    const apiSection = document.getElementById("docs-api");
    const fallbackSection = document.getElementById("docs-overview");
    const apiVisible = apiSection && window.getComputedStyle(apiSection).display !== "none";

    if (apiVisible) {
        apiSection.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
    }

    if (fallbackSection) {
        fallbackSection.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    if (getUserMode() !== "developer") {
        setLoginNotice("info", "API reference details are in Developer Mode. Switch modes to view the full endpoint catalog.");
    }
}

window.exploreApiReference = exploreApiReference;

function normalizeGuidedJourneyState(rawState) {
    const validStates = new Set(["not-started", "in-progress", "completed", "skipped"]);
    const normalized = {};
    GUIDED_JOURNEY_ORDER.forEach((step) => {
        const candidate = rawState && rawState[step];
        normalized[step] = validStates.has(candidate) ? candidate : "not-started";
    });
    return normalized;
}

function getGuidedJourneyState() {
    try {
        const raw = getSessionItem(SESSION_KEYS.GUIDED_JOURNEY_STATE);
        if (!raw) return normalizeGuidedJourneyState({});
        return normalizeGuidedJourneyState(JSON.parse(raw));
    } catch (_err) {
        return normalizeGuidedJourneyState({});
    }
}

function setGuidedJourneyState(nextState) {
    const normalized = normalizeGuidedJourneyState(nextState || {});
    setSessionItem(SESSION_KEYS.GUIDED_JOURNEY_STATE, JSON.stringify(normalized));
    return normalized;
}

function getRecommendedGuidedStep(state) {
    const currentState = state || getGuidedJourneyState();
    for (const step of GUIDED_JOURNEY_ORDER) {
        if (currentState[step] !== "completed" && currentState[step] !== "skipped") {
            return step;
        }
    }
    return GUIDED_JOURNEY_ORDER[GUIDED_JOURNEY_ORDER.length - 1];
}

function renderGuidedJourney() {
    const container = document.getElementById("guidedJourneyList");
    if (!container) return;

    const state = getGuidedJourneyState();
    const recommended = getRecommendedGuidedStep(state);
    const recommendedIndex = GUIDED_JOURNEY_ORDER.indexOf(recommended);

    container.innerHTML = GUIDED_JOURNEY_ORDER.map((step, index) => {
        const stepState = state[step] || "not-started";
        const isRecommended = step === recommended;
        const isSoftLocked = index > recommendedIndex && stepState === "not-started";
        const statusText = {
            "not-started": isSoftLocked ? "Soft gated: You can still open or skip" : "Not started",
            "in-progress": "In progress",
            "completed": "Completed",
            "skipped": "Skipped",
        }[stepState] || "Not started";

        return (
            `<div class="guided-step ${isRecommended ? "is-recommended" : ""}" data-state="${isSoftLocked ? "locked" : stepState}">` +
            `<div class="guided-step-label">${escapeHtml(GUIDED_JOURNEY_LABELS[step])}</div>` +
            `<div class="guided-step-status state-${stepState}">${escapeHtml(statusText)}</div>` +
            `<div class="guided-step-actions">` +
            `<button type="button" class="btn-guided btn-guided-primary" onclick="openGuidedStep('${step}')">Open docs</button>` +
            `<button type="button" class="btn-guided" onclick="completeGuidedStep('${step}')">Mark complete</button>` +
            `<button type="button" class="btn-guided" onclick="skipGuidedStep('${step}')">Skip</button>` +
            `</div>` +
            `</div>`
        );
    }).join("");
}

function openGuidedStep(step) {
    const target = GUIDED_JOURNEY_ORDER.includes(step) ? step : "native";
    const state = getGuidedJourneyState();
    if (state[target] === "not-started") {
        state[target] = "in-progress";
        setGuidedJourneyState(state);
    }
    openDocTab(target);
    renderGuidedJourney();
}

function completeGuidedStep(step) {
    if (!GUIDED_JOURNEY_ORDER.includes(step)) return;
    const state = getGuidedJourneyState();
    state[step] = "completed";
    setGuidedJourneyState(state);
    renderGuidedJourney();
}

function skipGuidedStep(step) {
    if (!GUIDED_JOURNEY_ORDER.includes(step)) return;
    const state = getGuidedJourneyState();
    state[step] = "skipped";
    setGuidedJourneyState(state);
    renderGuidedJourney();
}

window.openGuidedStep = openGuidedStep;
window.completeGuidedStep = completeGuidedStep;
window.skipGuidedStep = skipGuidedStep;

function goToProductionChecklist() {
    showHomePage();
    _setNavActive("docs");
    openDocTab("native", { scroll: false });
    const checklist = document.getElementById("productionChecklist");
    if (checklist) {
        checklist.scrollIntoView({ behavior: "smooth", block: "start" });
    }
}

window.goToProductionChecklist = goToProductionChecklist;

function setSessionInteractionType(type) {
    interactionType = type || "";
    if (!type) {
        removeSessionItem(SESSION_KEYS.INTERACTION_TYPE);
        return;
    }
    setSessionItem(SESSION_KEYS.INTERACTION_TYPE, type);
}

function getSessionInteractionType() {
    return interactionType || getSessionItem(SESSION_KEYS.INTERACTION_TYPE) || (hasActiveSession() ? "native" : "");
}

window.setSessionInteractionType = setSessionInteractionType;
window.getSessionInteractionType = getSessionInteractionType;

function getOperatorSearchHistory() {
    try {
        return JSON.parse(localStorage.getItem(OPERATOR_SEARCH_HISTORY_KEY) || "[]");
    } catch (_err) {
        return [];
    }
}

function saveOperatorSearchHistory(history) {
    localStorage.setItem(OPERATOR_SEARCH_HISTORY_KEY, JSON.stringify(history.slice(0, 6)));
}

function addOperatorSearchHistory(identifier) {
    const value = String(identifier || "").trim();
    if (!value) return;
    const current = getOperatorSearchHistory().filter((item) => item !== value);
    current.unshift(value);
    saveOperatorSearchHistory(current);
    renderOperatorSearchHistory();
}

function renderOperatorSearchHistory() {
    const container = document.getElementById("operatorSearchHistory");
    if (!container) return;
    const history = getOperatorSearchHistory();
    if (history.length === 0) {
        container.innerHTML = "";
        container.style.display = "none";
        return;
    }

    container.innerHTML = [
        `<span class="field-help">${escapeHtml(tr("operator.historyTitle"))}</span>`,
        ...history.map((item) => `<button type="button" class="operator-history-chip" onclick="openOperatorUserDrawerFromHistory('${escapeHtml(item).replace(/'/g, "&#39;")}')">${escapeHtml(item)}</button>`),
    ].join("");
    container.style.display = "flex";
}

function getOperatorCacheEntry(identifier) {
    const entry = OPERATOR_CACHE.get(identifier);
    if (!entry) return null;
    if ((Date.now() - entry.cachedAt) > OPERATOR_CACHE_TTL_MS) {
        OPERATOR_CACHE.delete(identifier);
        return null;
    }
    return entry.data;
}

function setOperatorCacheEntry(identifier, data) {
    OPERATOR_CACHE.set(identifier, { cachedAt: Date.now(), data });
}

function renderTokenGuidance(message, actions = []) {
    const banner = document.getElementById("tokenGuidanceBanner");
    if (!banner) return;
    if (!message) {
        banner.innerHTML = "";
        banner.className = "token-guidance-banner is-hidden";
        return;
    }

    const actionsMarkup = actions.length > 0
        ? `<div class="token-guidance-actions">${actions.map((action) => `<button type="button" class="btn-token-guidance" onclick="${action.handler}()">${escapeHtml(action.label)}</button>`).join("")}</div>`
        : "";

    banner.innerHTML = `<div class="token-guidance-copy">${escapeHtml(message)}</div>${actionsMarkup}`;
    banner.className = "token-guidance-banner";
}

function refreshTokenGuidance() {
    const hasCriticalToken = Object.values(TOKEN_GUIDANCE_STATE).some(Boolean);
    if (!hasCriticalToken) {
        renderTokenGuidance("");
        return;
    }

    const interaction = getSessionInteractionType();
    if (interaction === "native") {
        const hasRefreshToken = Boolean(getSessionTokens().refresh_token);
        renderTokenGuidance(
            hasRefreshToken ? tr("auth.tokenCriticalWithRefresh") : tr("auth.tokenCriticalNoRefresh"),
            [
                hasRefreshToken ? { label: tr("auth.refreshSession"), handler: "refreshCurrentSession" } : null,
                { label: tr("auth.signInAgain"), handler: "reauthenticateCurrentSession" },
            ].filter(Boolean)
        );
        return;
    }

    if (typeof window.hasMsalAccount === "function" && window.hasMsalAccount()) {
        const state = typeof window.getMsalSilentRefreshState === "function"
            ? window.getMsalSilentRefreshState()
            : { status: "idle" };
        let message = tr("auth.tokenCriticalMsal");
        if (state.status === "refreshing") {
            message = tr("auth.tokenCriticalMsalRefreshing");
        } else if (state.status === "failed") {
            message = tr("auth.tokenCriticalMsalFailed");
        }

        renderTokenGuidance(message, [
            { label: tr("auth.refreshSession"), handler: "refreshCurrentSession" },
            { label: tr("auth.signInAgain"), handler: "reauthenticateCurrentSession" },
        ]);
        return;
    }

    renderTokenGuidance(tr("auth.tokenCriticalNoRefresh"), [
        { label: tr("auth.signInAgain"), handler: "reauthenticateCurrentSession" },
    ]);
}

window.refreshTokenGuidance = refreshTokenGuidance;

function formatRefreshTimestamp(value) {
    if (!value) return "";
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString();
}

function renderRefreshScheduleIndicator() {
    const container = document.getElementById("refreshScheduleIndicator");
    if (!container) return;

    if (!REFRESH_SCHEDULE_STATE.mode) {
        container.innerHTML = "";
        container.className = "refresh-schedule-indicator is-hidden";
        return;
    }

    const modeText = REFRESH_SCHEDULE_STATE.mode === "msal"
        ? tr("auth.refreshModeMsal")
        : tr("auth.refreshModeNative");

    let lastRefreshText = REFRESH_SCHEDULE_STATE.lastRefreshAt
        ? formatRefreshTimestamp(REFRESH_SCHEDULE_STATE.lastRefreshAt)
        : tr("auth.refreshNever");
    
    // Append refresh source suffix
    if (REFRESH_SCHEDULE_STATE.lastRefreshAt && REFRESH_SCHEDULE_STATE.refreshSource) {
        const sourceLabel = tr(`auth.refreshSource${REFRESH_SCHEDULE_STATE.refreshSource.charAt(0).toUpperCase() + REFRESH_SCHEDULE_STATE.refreshSource.slice(1)}`);
        lastRefreshText += ` (${sourceLabel})`;
    }

    let nextRefreshText = tr("auth.refreshNotScheduled");
    if (REFRESH_SCHEDULE_STATE.mode === "native") {
        nextRefreshText = tr("auth.refreshOnDemand");
    } else if (REFRESH_SCHEDULE_STATE.nextRefreshAt) {
        const nextDate = new Date(REFRESH_SCHEDULE_STATE.nextRefreshAt);
        const remaining = nextDate.getTime() - Date.now();
        if (remaining <= 0) {
            nextRefreshText = tr("auth.refreshDueNow");
        } else {
            nextRefreshText = `${formatRefreshTimestamp(nextDate)} (${formatDuration(remaining)})`;
        }
    }

    container.innerHTML = [
        `<div class="refresh-schedule-mode">${escapeHtml(modeText)}</div>`,
        `<div class="refresh-schedule-row"><span class="refresh-schedule-label">${escapeHtml(tr("auth.lastRefresh"))}:</span>${escapeHtml(lastRefreshText)}</div>`,
        `<div class="refresh-schedule-row"><span class="refresh-schedule-label">${escapeHtml(tr("auth.nextRefresh"))}:</span>${escapeHtml(nextRefreshText)}</div>`,
    ].join("");
    container.className = "refresh-schedule-indicator";
}

function setRefreshScheduleIndicator(updates = {}) {
    ["mode", "strategy", "lastRefreshAt", "nextRefreshAt", "refreshSource"].forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(updates, key)) {
            REFRESH_SCHEDULE_STATE[key] = updates[key];
        }
    });
    renderRefreshScheduleIndicator();
}

function clearRefreshScheduleIndicator() {
    REFRESH_SCHEDULE_STATE.mode = "";
    REFRESH_SCHEDULE_STATE.strategy = "";
    REFRESH_SCHEDULE_STATE.lastRefreshAt = null;
    REFRESH_SCHEDULE_STATE.nextRefreshAt = null;
    REFRESH_SCHEDULE_STATE.refreshSource = "";
    renderRefreshScheduleIndicator();
}

window.setRefreshScheduleIndicator = setRefreshScheduleIndicator;
window.clearRefreshScheduleIndicator = clearRefreshScheduleIndicator;

function formatOperatorValue(value) {
    if (value === null || value === undefined || value === "") return "-";
    if (typeof value === "boolean") return value ? "Yes" : "No";
    if (Array.isArray(value)) return value.length > 0 ? value.join(", ") : "-";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
}

function formatDuration(msRemaining) {
    if (msRemaining <= 0) return tr("auth.tokenExpired");
    const totalSeconds = Math.floor(msRemaining / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return [hours, minutes, seconds]
        .map((part) => String(part).padStart(2, "0"))
        .join(":");
}

function clearTokenLifetimeTimers() {
    Object.values(TOKEN_TIMER_IDS).forEach((id) => window.clearInterval(id));
    Object.keys(TOKEN_TIMER_IDS).forEach((key) => delete TOKEN_TIMER_IDS[key]);
    Object.keys(TOKEN_GUIDANCE_STATE).forEach((key) => {
        TOKEN_GUIDANCE_STATE[key] = false;
    });
    refreshTokenGuidance();
}

function updateTokenLifetime(elementId, token) {
    const element = document.getElementById(elementId);
    if (!element || !token) return;

    let decoded = null;
    try {
        decoded = parseJwt(token);
    } catch (_err) {
        element.className = "token-lifetime is-hidden";
        element.textContent = "";
        return;
    }

    if (!decoded.exp) {
        element.className = "token-lifetime is-hidden";
        element.textContent = "";
        return;
    }

    const render = () => {
        const remaining = (decoded.exp * 1000) - Date.now();
        const isCritical = remaining <= 5 * 60 * 1000 && remaining > 0;
        let state = "state-good";
        if (remaining <= 5 * 60 * 1000) {
            state = "state-critical";
        } else if (remaining <= 15 * 60 * 1000) {
            state = "state-warning";
        }

        element.textContent = tr("auth.tokenExpiresIn", { value: formatDuration(remaining) });
        element.className = `token-lifetime ${state}`;
        if (remaining <= 0) {
            element.textContent = tr("auth.tokenExpired");
        }

        if (TOKEN_GUIDANCE_STATE[elementId] !== isCritical) {
            TOKEN_GUIDANCE_STATE[elementId] = isCritical;
            refreshTokenGuidance();
        }

        if (REFRESH_SCHEDULE_STATE.mode === "msal" && REFRESH_SCHEDULE_STATE.nextRefreshAt) {
            renderRefreshScheduleIndicator();
        }
    };

    render();
    TOKEN_TIMER_IDS[elementId] = window.setInterval(render, 1000);
}

function buildClaimProvenance(accountClaims, accessClaims, idClaims) {
    const provenanceMap = new Map();
    [
        ["account", accountClaims],
        ["access", accessClaims],
        ["id", idClaims],
    ].forEach(([source, claims]) => {
        Object.entries(claims || {}).forEach(([key, value]) => {
            if (!provenanceMap.has(key)) {
                provenanceMap.set(key, { sources: [], values: {} });
            }
            const entry = provenanceMap.get(key);
            entry.sources.push(source);
            entry.values[source] = value;
        });
    });

    return Array.from(provenanceMap.entries())
        .map(([claim, entry]) => {
            const distinctValues = Array.from(new Set(Object.values(entry.values).map((value) => JSON.stringify(value))));
            return {
                claim,
                sources: entry.sources,
                sampleValue: Object.values(entry.values)[0],
                hasConflict: distinctValues.length > 1,
                values: entry.values,
            };
        })
        .sort((left, right) => left.claim.localeCompare(right.claim));
}

function openClaimDiffViewer(claimName, encodedValues) {
    const dialog = document.getElementById("claimDiffDialog");
    const title = document.getElementById("claimDiffTitle");
    const content = document.getElementById("claimDiffContent");
    if (!dialog || !title || !content) return;

    let values = {};
    try {
        values = JSON.parse(decodeURIComponent(encodedValues));
    } catch (_err) {
        values = {};
    }

    title.textContent = `${tr("auth.claimDiffTitle")}: ${claimName}`;
    content.innerHTML = Object.entries(values).map(([source, value]) => (
        `<div class="claim-diff-card">` +
        `<div class="claim-diff-source">${escapeHtml(source)}</div>` +
        `<pre class="claim-diff-value">${escapeHtml(JSON.stringify(value, null, 2))}</pre>` +
        `</div>`
    )).join("");
    dialog.showModal();
}

window.openClaimDiffViewer = openClaimDiffViewer;

function renderClaimProvenance(accountClaims, accessClaims, idClaims) {
    const container = document.getElementById("claimProvenanceDiv");
    const list = document.getElementById("claimProvenanceList");
    if (!container || !list) return;

    const provenance = buildClaimProvenance(accountClaims, accessClaims, idClaims).slice(0, 18);
    if (provenance.length === 0) {
        container.style.display = "none";
        return;
    }

    list.innerHTML = provenance.map((entry) => (
        `<div class="provenance-card">` +
        `<div class="provenance-claim">${escapeHtml(entry.claim)}</div>` +
        `<div class="provenance-sources">Sources: ${escapeHtml(entry.sources.join(", "))}</div>` +
        `<div class="provenance-value">Value: ${escapeHtml(formatOperatorValue(entry.sampleValue))}</div>` +
        (entry.hasConflict ? `<span class="provenance-conflict">Conflict</span><button type="button" class="provenance-action" onclick="openClaimDiffViewer('${escapeHtml(entry.claim).replace(/'/g, "&#39;")}', '${encodeURIComponent(JSON.stringify(entry.values))}')">${escapeHtml(tr("auth.viewDiff"))}</button>` : "") +
        `</div>`
    )).join("");
    container.style.display = "block";
}

function renderOperatorSignInSummary(summaryData) {
    const container = document.getElementById("operatorSignInSummary");
    if (!container) return;

    const rows = (summaryData && summaryData.value) || [];
    if (rows.length === 0) {
        container.innerHTML = `<div class="operator-summary-item"><span class="operator-summary-name">${escapeHtml(tr("operator.empty"))}</span></div>`;
        return;
    }

    container.innerHTML = rows.slice(0, 8).map((row) => {
        const label = row.authenticationMethod || row.signInMethod || row.method || row.id || "Unknown";
        const total = row.signInCount ?? row.totalSignIns ?? row.total ?? "-";
        const success = row.successfulSignInCount ?? row.successfulSignIns ?? row.succeeded ?? "-";
        return (
            `<div class="operator-summary-item">` +
            `<span class="operator-summary-name">${escapeHtml(String(label))}</span>` +
            `<span class="operator-summary-metric">Total: ${escapeHtml(String(total))}</span>` +
            `<span class="operator-summary-metric">Success: ${escapeHtml(String(success))}</span>` +
            `</div>`
        );
    }).join("");
}

function renderOperatorKvRows(elementId, entries) {
    const container = document.getElementById(elementId);
    if (!container) return;

    if (!entries || entries.length === 0) {
        container.innerHTML = `<div class="operator-kv-row"><span class="operator-kv-key">Info</span><span class="operator-kv-value">${escapeHtml(tr("operator.empty"))}</span></div>`;
        return;
    }

    container.innerHTML = entries.map((entry) => (
        `<div class="operator-kv-row">` +
        `<span class="operator-kv-key">${escapeHtml(entry.label)}</span>` +
        `<span class="operator-kv-value">${escapeHtml(formatOperatorValue(entry.value))}</span>` +
        `</div>`
    )).join("");
}

function setOperatorMessage(message, isError) {
    const messageEl = document.getElementById("operatorBetaMessage");
    if (!messageEl) return;

    if (!message) {
        messageEl.textContent = "";
        messageEl.className = "operator-message is-hidden";
        return;
    }

    messageEl.textContent = message;
    messageEl.className = isError ? "operator-message auth-notice-error" : "operator-message";
}

function getCurrentOperatorTarget(accountClaims) {
    const claims = accountClaims || {};
    return {
        userId: getPreferredClaim(claims, ["oid", "sub"]),
        userPrincipalName: getPreferredClaim(claims, ["preferred_username", "upn", "email"]),
    };
}

function findRegistrationRecord(registrationData, target) {
    const records = (registrationData && registrationData.value) || [];
    return records.find((record) => (
        record.id === target.userId ||
        record.userPrincipalName === target.userPrincipalName ||
        record.userDisplayName === target.userPrincipalName ||
        record.id === target.identifier ||
        record.userPrincipalName === target.identifier
    )) || null;
}

function buildOperatorTarget(identifier, accountClaims) {
    const current = getCurrentOperatorTarget(accountClaims || {});
    const rawIdentifier = String(identifier || "").trim();
    return {
        identifier: rawIdentifier || current.userId || current.userPrincipalName,
        userId: rawIdentifier || current.userId,
        userPrincipalName: rawIdentifier || current.userPrincipalName,
    };
}

async function openOperatorUserDrawer(targetIdentifier, accessToken, accountClaims) {
    const dialog = document.getElementById("operatorUserDrawer");
    const messageEl = document.getElementById("operatorDrawerMessage");
    const grid = document.getElementById("operatorDrawerGrid");
    const targetLabel = document.getElementById("operatorDrawerTarget");
    if (!dialog || !messageEl || !grid || !targetLabel) return;

    if (!ENABLE_OPERATOR_MODE || !ENABLE_BETA_GRAPH) {
        messageEl.textContent = tr("operator.disabled");
        messageEl.className = "operator-message auth-notice-error";
        grid.style.display = "none";
        dialog.showModal();
        return;
    }

    const target = buildOperatorTarget(targetIdentifier, accountClaims || {});
    if (!target.identifier) {
        messageEl.textContent = tr("operator.searchRequired");
        messageEl.className = "operator-message auth-notice-error";
        grid.style.display = "none";
        dialog.showModal();
        return;
    }

    targetLabel.textContent = target.identifier;
    messageEl.textContent = "";
    messageEl.className = "operator-message is-hidden";
    grid.style.display = "none";
    dialog.showModal();

    try {
        const cached = getOperatorCacheEntry(target.identifier);
        let registrationData;
        let userDetail;
        let authRequirements;
        let signInPreferences;

        if (cached) {
            ({ registrationData, userDetail, authRequirements, signInPreferences } = cached);
            messageEl.textContent = tr("operator.cached");
            messageEl.className = "operator-message";
        } else {
            registrationData = latestOperatorRegistrationDetails || await window.getOperatorRegistrationDetails(accessToken);
            [userDetail, authRequirements, signInPreferences] = await Promise.all([
                window.getOperatorUserDetail(accessToken, target.identifier),
                window.getOperatorAuthRequirements(accessToken, target.identifier),
                window.getOperatorSignInPreferences(accessToken, target.identifier),
            ]);
            setOperatorCacheEntry(target.identifier, {
                registrationData,
                userDetail,
                authRequirements,
                signInPreferences,
            });
        }
        const registrationRecord = findRegistrationRecord(registrationData, target);
        addOperatorSearchHistory(target.identifier);

        renderOperatorKvRows("operatorDrawerUserDetail", [
            { label: "Display name", value: userDetail.displayName },
            { label: "UPN", value: userDetail.userPrincipalName },
            { label: "Object ID", value: userDetail.id },
            { label: "Creation type", value: userDetail.creationType },
            { label: "External state", value: userDetail.externalUserState },
            { label: "Last sign-in", value: userDetail.signInActivity && userDetail.signInActivity.lastSuccessfulSignInDateTime },
        ]);
        renderOperatorKvRows("operatorDrawerAuthRequirements", [
            { label: "Per-user MFA state", value: authRequirements.perUserMfaState },
        ]);
        renderOperatorKvRows("operatorDrawerSignInPreferences", [
            { label: "Preferred secondary auth", value: signInPreferences.userPreferredMethodForSecondaryAuthentication },
            { label: "System preferred enabled", value: signInPreferences.isSystemPreferredAuthenticationMethodEnabled },
        ]);
        renderOperatorKvRows("operatorDrawerRegistrationDetails", registrationRecord ? [
            { label: "MFA registered", value: registrationRecord.isMfaRegistered },
            { label: "SSPR registered", value: registrationRecord.isSsprRegistered },
            { label: "Passwordless capable", value: registrationRecord.isPasswordlessCapable },
            { label: "Registered methods", value: registrationRecord.methodsRegistered },
        ] : [
            { label: "Info", value: tr("operator.notFound") },
        ]);
        grid.style.display = "grid";
    } catch (err) {
        messageEl.textContent = tr("operator.permissionError");
        messageEl.className = "operator-message auth-notice-error";
        pushErrorHistory(err.response?.data || err);
        showErrorDiagnostics(err.response?.data || err);
    }
}

async function refreshOperatorInsights(accessToken, accountClaims) {
    const panel = document.getElementById("operatorBetaDiv");
    const loading = document.getElementById("operatorBetaLoading");
    const grid = document.getElementById("operatorBetaGrid");
    if (!panel || !loading || !grid) return;

    panel.style.display = "block";
    grid.style.display = "none";
    renderOperatorSearchHistory();

    if (!ENABLE_OPERATOR_MODE || !ENABLE_BETA_GRAPH) {
        setOperatorMessage(tr("operator.disabled"), false);
        return;
    }

    const target = getCurrentOperatorTarget(accountClaims || {});
    if (!target.userId) {
        setOperatorMessage(tr("operator.missingUserId"), true);
        return;
    }

    if (!accessToken) {
        setOperatorMessage(tr("msg.noSession"), true);
        return;
    }

    loading.style.display = "block";
    setOperatorMessage("", false);

    try {
        const [userDetail, authRequirements, signInPreferences, registrationDetails, signInSummary] = await Promise.all([
            window.getOperatorUserDetail(accessToken, target.userId),
            window.getOperatorAuthRequirements(accessToken, target.userId),
            window.getOperatorSignInPreferences(accessToken, target.userId),
            window.getOperatorRegistrationDetails(accessToken),
            window.getOperatorSignInSummary(accessToken),
        ]);

        latestOperatorRegistrationDetails = registrationDetails;
        const registrationRecord = findRegistrationRecord(registrationDetails, target);

        renderOperatorKvRows("operatorUserDetail", [
            { label: "Display name", value: userDetail.displayName },
            { label: "UPN", value: userDetail.userPrincipalName },
            { label: "Created", value: userDetail.createdDateTime },
            { label: "Creation type", value: userDetail.creationType },
            { label: "External state", value: userDetail.externalUserState },
            { label: "Last password change", value: userDetail.lastPasswordChangeDateTime },
            { label: "Last sign-in", value: userDetail.signInActivity && userDetail.signInActivity.lastSignInDateTime },
        ]);

        renderOperatorKvRows("operatorAuthRequirements", [
            { label: "Per-user MFA state", value: authRequirements.perUserMfaState },
        ]);

        renderOperatorKvRows("operatorSignInPreferences", [
            { label: "Preferred secondary auth", value: signInPreferences.userPreferredMethodForSecondaryAuthentication },
            { label: "System preferred enabled", value: signInPreferences.isSystemPreferredAuthenticationMethodEnabled },
        ]);

        renderOperatorKvRows("operatorRegistrationDetails", registrationRecord ? [
            { label: "MFA registered", value: registrationRecord.isMfaRegistered },
            { label: "SSPR registered", value: registrationRecord.isSsprRegistered },
            { label: "Passwordless capable", value: registrationRecord.isPasswordlessCapable },
            { label: "Registered methods", value: registrationRecord.methodsRegistered },
        ] : [
            { label: "Info", value: tr("operator.notFound") },
        ]);

        renderOperatorSignInSummary(signInSummary);

        grid.style.display = "grid";
    } catch (err) {
        console.warn("Failed to load operator insights:", err);
        setOperatorMessage(tr("operator.permissionError"), true);
        pushErrorHistory(err.response?.data || err);
        showErrorDiagnostics(err.response?.data || err);
    } finally {
        loading.style.display = "none";
    }
}

const _refreshOperatorInsightsImpl = refreshOperatorInsights;
window.refreshOperatorInsights = function refreshOperatorInsightsFromWindow() {
    const tokens = getSessionTokens();
    const idToken = tokens.id_token ? parseJwt(tokens.id_token) : {};
    return _refreshOperatorInsightsImpl(tokens.access_token, idToken);
};

window.openOperatorUserDrawerFromSearch = function openOperatorUserDrawerFromSearch() {
    const tokens = getSessionTokens();
    const idToken = tokens.id_token ? parseJwt(tokens.id_token) : {};
    const input = document.getElementById("operatorUserSearchInput");
    const identifier = input ? input.value.trim() : "";
    renderOperatorSearchHistory();
    return openOperatorUserDrawer(identifier, tokens.access_token, idToken);
};

window.openOperatorUserDrawerFromHistory = function openOperatorUserDrawerFromHistory(identifier) {
    const tokens = getSessionTokens();
    const idToken = tokens.id_token ? parseJwt(tokens.id_token) : {};
    const input = document.getElementById("operatorUserSearchInput");
    if (input) input.value = identifier;
    return openOperatorUserDrawer(identifier, tokens.access_token, idToken);
};

function pushErrorHistory(entry) {
    ERROR_HISTORY.unshift(entry);
    if (ERROR_HISTORY.length > 10) {
        ERROR_HISTORY.length = 10;
    }
}

function buildDiagnosticPayload(error) {
    return {
        status: error.status || error.error || "Unknown",
        error: error.error || "Unknown",
        suberror: error.suberror || "",
        description: error.error_description || error.message || tr("misc.unknownError"),
        flowName: error.flowName || "native-auth",
        flowStep: error.flowStep || "unknown",
        endpoint: error.endpoint || "",
        method: error.method || "POST",
        timestamp: error.timestamp || new Date().toISOString(),
        trace_id: error.trace_id || "",
        correlation_id: error.correlation_id || "",
        requestPayload: error.requestPayload || {},
        responsePayload: error.responsePayload || {},
    };
}

function showErrorDiagnostics(error) {
    const dialog = document.getElementById("errorDialog");
    const panel = document.getElementById("errorDiagnosticsPanel");
    if (!dialog || !panel) {
        const message = error.error_description || error.message || tr("misc.unknownError");
        alert(message);
        return;
    }

    const payload = buildDiagnosticPayload(error);
    lastDiagnosticPayload = payload;

    panel.innerHTML = [
        `<div class="diagnostic-grid">`,
        `<div class="diagnostic-row"><span>${escapeHtml(tr("diag.status"))}</span><strong>${escapeHtml(String(payload.status))}</strong></div>`,
        `<div class="diagnostic-row"><span>${escapeHtml(tr("diag.code"))}</span><strong>${escapeHtml(String(payload.error))}</strong></div>`,
        `<div class="diagnostic-row"><span>${escapeHtml(tr("diag.suberror"))}</span><strong>${escapeHtml(String(payload.suberror || "-"))}</strong></div>`,
        `<div class="diagnostic-row"><span>${escapeHtml(tr("diag.flowStep"))}</span><strong>${escapeHtml(String(payload.flowStep))}</strong></div>`,
        `<div class="diagnostic-row"><span>${escapeHtml(tr("diag.endpoint"))}</span><strong>${escapeHtml(String(payload.endpoint))}</strong></div>`,
        `<div class="diagnostic-row"><span>${escapeHtml(tr("diag.traceId"))}</span><strong>${escapeHtml(String(payload.trace_id || "-"))}</strong></div>`,
        `<div class="diagnostic-row"><span>${escapeHtml(tr("diag.correlationId"))}</span><strong>${escapeHtml(String(payload.correlation_id || "-"))}</strong></div>`,
        `</div>`,
        `<div class="diagnostic-block"><h3>${escapeHtml(tr("diag.description"))}</h3><pre class="diagnostic-pre">${escapeHtml(payload.description)}</pre></div>`,
        `<div class="diagnostic-block"><h3>${escapeHtml(tr("diag.request"))}</h3><pre class="diagnostic-pre">${escapeHtml(JSON.stringify(payload.requestPayload, null, 2))}</pre></div>`,
        `<div class="diagnostic-block"><h3>${escapeHtml(tr("diag.response"))}</h3><pre class="diagnostic-pre">${escapeHtml(JSON.stringify(payload.responsePayload, null, 2))}</pre></div>`,
    ].join("");

    if (!dialog.open) {
        dialog.showModal();
    }
}

async function copyErrorDiagnostics() {
    if (!lastDiagnosticPayload) return;
    await navigator.clipboard.writeText(JSON.stringify(lastDiagnosticPayload, null, 2));
    setLoginNotice("info", tr("msg.diagnosticsCopied"));
}

window.pushErrorHistory = pushErrorHistory;
window.showErrorDiagnostics = showErrorDiagnostics;
window.copyErrorDiagnostics = copyErrorDiagnostics;
window.setDemoMode = setDemoMode;
window.isDemoModeEnabled = isDemoModeEnabled;

function getLocaleFromClaims(claims) {
    if (!claims || typeof claims !== "object") return null;

    const rawCandidates = [
        claims.preferred_language,
        claims.locale,
        claims.ui_locales,
        claims.lang,
        claims.language,
        claims.extension_locale,
    ];

    for (const value of rawCandidates) {
        if (typeof value !== "string") continue;
        const normalized = value.trim();
        if (!normalized) continue;
        // ui_locales can be a space-delimited list; prefer the first locale.
        return normalized.split(/\s+/)[0];
    }

    return null;
}

function applyLocaleFromClaims(claims) {
    const locale = getLocaleFromClaims(claims);
    if (!locale || typeof window.setLocale !== "function") return;

    window.setLocale(locale);
}

window.applyLocaleFromClaims = applyLocaleFromClaims;

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

function getPreferredClaim(claims, keys) {
    for (const key of keys) {
        const value = claims && claims[key];
        if (value !== null && value !== undefined && value !== "") return value;
    }
    return "";
}

function parseFieldList(value) {
    const parts = Array.isArray(value) ? value : String(value || "").split(",");
    const unique = new Set();
    parts.forEach((part) => {
        const cleaned = String(part || "").trim();
        if (cleaned) unique.add(cleaned);
    });
    return Array.from(unique);
}

function getGraphProfileSelectFields() {
    const stored = getSessionItem(SESSION_KEYS.GRAPH_PROFILE_SELECT_FIELDS);
    if (stored) return parseFieldList(stored);
    if (typeof window.getDefaultGraphProfileFields === "function") {
        return parseFieldList(window.getDefaultGraphProfileFields());
    }
    return [];
}

function setGraphProfileSelectFields(value) {
    const fields = parseFieldList(value);
    if (fields.length === 0) {
        removeSessionItem(SESSION_KEYS.GRAPH_PROFILE_SELECT_FIELDS);
    } else {
        setSessionItem(SESSION_KEYS.GRAPH_PROFILE_SELECT_FIELDS, fields.join(","));
    }
    return fields;
}

function syncGraphProfileFieldInput() {
    const input = document.getElementById("graphProfileSelectFields");
    if (!input || document.activeElement === input) return;
    input.value = getGraphProfileSelectFields().join(", ");
}

function renderComprehensiveUserProfile(context) {
    const profileDiv = document.getElementById("userProfileDiv");
    const highlights = document.getElementById("userProfileHighlights");
    const claimsBody = document.getElementById("profileClaimsBody");
    const graphRawBody = document.getElementById("graphProfileRawBody");
    const graphRequestMeta = document.getElementById("graphProfileRequestMeta");
    if (!profileDiv || !highlights || !claimsBody) return;

    const accessToken = context && context.accessToken;
    const idToken = context && context.idToken;
    const accountClaims = (context && context.accountClaims) || {};

    let accessClaims = {};
    let idClaims = {};
    try {
        accessClaims = accessToken ? parseJwt(accessToken) : {};
    } catch (_err) {
        accessClaims = {};
    }
    try {
        idClaims = idToken ? parseJwt(idToken) : {};
    } catch (_err) {
        idClaims = {};
    }
    const mergedClaims = {
        ...accountClaims,
        ...accessClaims,
        ...idClaims,
    };

    const locale = getLocaleFromClaims(mergedClaims) || (typeof window.getLocale === "function" ? window.getLocale() : "en");

    const graphProfile = (context && context.graphProfile) || {};
    const graphProfileMeta = (context && context.graphProfileMeta) || {};
    const tapMethods = (context && context.tapMethods) || [];

    const userSummary = [
        { label: "Display Name", value: getPreferredClaim(mergedClaims, ["name", "displayName"]) || tr("misc.user") },
        { label: "Given Name", value: getPreferredClaim(mergedClaims, ["given_name"]) || "-" },
        { label: "Family Name", value: getPreferredClaim(mergedClaims, ["family_name"]) || "-" },
        { label: "Username", value: getPreferredClaim(mergedClaims, ["preferred_username", "unique_name", "upn", "email"]) || "-" },
        { label: tr("auth.locale"), value: locale || "-", locale: true },
        { label: "Tenant ID", value: getPreferredClaim(mergedClaims, ["tid", "tenantId"]) || "-" },
        { label: "Object ID", value: getPreferredClaim(mergedClaims, ["oid", "sub"]) || "-" },
        { label: "Authentication Method", value: getPreferredClaim(mergedClaims, ["amr", "acr"]) || "-" },
        { label: "External User State", value: graphProfile.externalUserState || "-" },
        { label: "Account Created", value: graphProfile.createdDateTime || "-" },
        { label: "TAP Methods", value: tapMethods.length > 0 ? String(tapMethods.length) : "0" },
    ];

    highlights.innerHTML = userSummary.map((item) => {
        const value = Array.isArray(item.value) ? item.value.join(", ") : String(item.value);
        const valueClass = item.locale ? "profile-chip-value is-locale" : "profile-chip-value";
        return (
            `<div class="profile-chip">` +
            `<span class="profile-chip-label">${escapeHtml(item.label)}</span>` +
            `<span class="${valueClass}">${escapeHtml(value)}</span>` +
            `</div>`
        );
    }).join("");

    claimsBody.textContent = JSON.stringify(
        {
            locale,
            id_token_claims: idClaims,
            access_token_claims: accessClaims,
            account_claims: accountClaims,
            merged_claims: mergedClaims,
            graph_profile: graphProfile,
            tap_methods: tapMethods,
        },
        null,
        2
    );

    if (graphRawBody) {
        graphRawBody.textContent = JSON.stringify(graphProfile || {}, null, 2);
    }
    if (graphRequestMeta) {
        const endpoint = graphProfileMeta.endpoint || "";
        const selected = parseFieldList(graphProfileMeta.selectedFields || getGraphProfileSelectFields());
        if (!endpoint && selected.length === 0) {
            graphRequestMeta.classList.add("is-hidden");
            graphRequestMeta.textContent = "";
        } else {
            const metaLines = [];
            if (selected.length > 0) metaLines.push(`$select: ${selected.join(", ")}`);
            if (endpoint) metaLines.push(`Endpoint: ${endpoint}`);
            graphRequestMeta.textContent = metaLines.join(" | ");
            graphRequestMeta.classList.remove("is-hidden");
        }
    }

    syncGraphProfileFieldInput();

    renderClaimProvenance(accountClaims, accessClaims, idClaims);

    profileDiv.style.display = "block";
}

function storeSessionTokens(tokenResponse) {
    if (tokenResponse.access_token) setSessionItem(SESSION_KEYS.ACCESS_TOKEN, tokenResponse.access_token);
    if (tokenResponse.id_token) setSessionItem(SESSION_KEYS.ID_TOKEN, tokenResponse.id_token);
    if (tokenResponse.refresh_token) setSessionItem(SESSION_KEYS.REFRESH_TOKEN, tokenResponse.refresh_token);
    setSessionItem(SESSION_KEYS.INTERACTION_TYPE, "native");
}

function getSessionTokens() {
    return {
        access_token: getSessionItem(SESSION_KEYS.ACCESS_TOKEN),
        id_token: getSessionItem(SESSION_KEYS.ID_TOKEN),
        refresh_token: getSessionItem(SESSION_KEYS.REFRESH_TOKEN),
    };
}

function clearSessionTokens() {
    clearTokenLifetimeTimers();
    removeSessionItem(SESSION_KEYS.ACCESS_TOKEN);
    removeSessionItem(SESSION_KEYS.ID_TOKEN);
    removeSessionItem(SESSION_KEYS.REFRESH_TOKEN);
    removeSessionItem(SESSION_KEYS.INTERACTION_TYPE);
    interactionType = "";
    clearRefreshScheduleIndicator();
}

function hasActiveSession() {
    return !!getSessionItem(SESSION_KEYS.ACCESS_TOKEN);
}

window.hasNativeSession = hasActiveSession;

async function refreshCurrentSession() {
    const currentInteraction = getSessionInteractionType();
    if (currentInteraction === "native" && typeof window.refreshNativeAuthSession === "function") {
        return window.refreshNativeAuthSession();
    }
    if (typeof window.hasMsalAccount === "function" && window.hasMsalAccount() && typeof window.refreshMsalSessionSilently === "function") {
        return window.refreshMsalSessionSilently({ forceRefresh: true, reason: "manual" });
    }
    setLoginNotice("info", tr("msg.noSession"));
    return null;
}

function reauthenticateCurrentSession() {
    const currentInteraction = getSessionInteractionType();
    if (currentInteraction === "native" && typeof window.promptNativeReauthentication === "function") {
        return window.promptNativeReauthentication();
    }

    if (typeof window.hasMsalAccount === "function" && window.hasMsalAccount()) {
        const lastMode = getSessionItem(SESSION_KEYS.INTERACTION_TYPE) || "popup";
        if (lastMode === "redirect" && typeof window.loginRedirect === "function") {
            return window.loginRedirect();
        }
        if (typeof window.loginPopup === "function") {
            return window.loginPopup();
        }
    }

    renderUnauthenticatedUI();
    setLoginNotice("info", tr("auth.reauthPrompt"));
    return null;
}

window.refreshCurrentSession = refreshCurrentSession;
window.reauthenticateCurrentSession = reauthenticateCurrentSession;

// ---------------------------------------------------------------------------
// UI rendering
// ---------------------------------------------------------------------------
function renderNativeAuthenticatedUI(tokenResponse) {
    // Accept either a full token response object or a raw access_token string
    const accessToken = typeof tokenResponse === "string" ? tokenResponse : tokenResponse.access_token;

    // Persist tokens for the session
    if (typeof tokenResponse === "object") {
        storeSessionTokens(tokenResponse);
    }
    setSessionInteractionType("native");
    setRefreshScheduleIndicator({ mode: "native", strategy: "on-demand", nextRefreshAt: null, refreshSource: "restore" });

    const decodedToken = parseJwt(accessToken);
    const idToken = typeof tokenResponse === "object" ? tokenResponse.id_token : null;
    const decodedIdToken = idToken ? parseJwt(idToken) : null;

    applyLocaleFromClaims(decodedIdToken || decodedToken);

    clearLoginNotice();
    clearAuthFlowStatus();
    console.log("Decoded token payload:", decodedToken);
    document.getElementById("authenticatedDiv").style.display = "block";
    document.getElementById("loginDiv").style.display = "none";
    const _homeNative = document.getElementById("homeDiv"); if (_homeNative) _homeNative.style.display = "none";
    _setNavActive("");
    setNavbarAuthCtas(true);
    const familyName = (decodedIdToken && decodedIdToken.family_name) || decodedToken.family_name || "";
    const givenName = (decodedIdToken && decodedIdToken.given_name) || decodedToken.given_name || "";
    const uniqueName =
        (decodedIdToken && (decodedIdToken.unique_name || decodedIdToken.preferred_username || decodedIdToken.email)) ||
        decodedToken.unique_name ||
        decodedToken.preferred_username ||
        decodedToken.email ||
        "User";
    const displayName = `${familyName}, ${givenName}`.replace(/^\s*,\s*$/, "").trim();
    document.getElementById("firstName").innerText = `${displayName || tr("misc.user")} [${uniqueName}]`;

    // Store user email in session
    if (decodedToken.upn) {
        setSessionItem("nativeAuth_user_email", decodedToken.upn);
    }

    // Display token details
    const tokens = typeof tokenResponse === "object" ? tokenResponse : getSessionTokens();
    displayTokenDetails(tokens);
    applyDemoModeState();
    renderFlowCompletionSummary();
    renderComprehensiveUserProfile({
        accessToken: tokens.access_token || accessToken,
        idToken: tokens.id_token || "",
        accountClaims: decodedIdToken || {},
    });

    // Fetch and display registered authentication methods
    fetchAndDisplayAuthMethods(tokens.access_token || accessToken);
    enrichProfileWithGraphSelfService(tokens.access_token || accessToken, decodedIdToken || {});
    refreshOperatorInsights(tokens.access_token || accessToken, decodedIdToken || {});
}

function renderAuthenticatedUI(authResult) {
    const account = authResult && authResult.account ? authResult.account : authResult;
    document.getElementById("authenticatedDiv").style.display = "block";
    document.getElementById("loginDiv").style.display = "none";
    const _homeMsal = document.getElementById("homeDiv"); if (_homeMsal) _homeMsal.style.display = "none";
    _setNavActive("");
    setNavbarAuthCtas(true);
    document.getElementById("firstName").innerText = (account && account.name) || tr("misc.user");

    const idTokenClaims = (authResult && authResult.idTokenClaims) || (account && account.idTokenClaims) || {};
    const accessToken = authResult && authResult.accessToken ? authResult.accessToken : "";
    const idToken = authResult && authResult.idToken ? authResult.idToken : "";

    if (typeof window.hasMsalAccount === "function" && window.hasMsalAccount()) {
        setRefreshScheduleIndicator({ mode: "msal", strategy: "silent" });
    }

    clearLoginNotice();
    clearAuthFlowStatus();
    displayTokenDetails({
        access_token: accessToken,
        id_token: idToken,
        refresh_token: "",
    });
    renderFlowCompletionSummary();
    renderComprehensiveUserProfile({
        accessToken,
        idToken,
        accountClaims: idTokenClaims,
    });
    applyDemoModeState();
    if (accessToken) {
        fetchAndDisplayAuthMethods(accessToken);
        enrichProfileWithGraphSelfService(accessToken, idTokenClaims);
        refreshOperatorInsights(accessToken, idTokenClaims);
    }
}

// ---------------------------------------------------------------------------
// View management: home / login / authenticated
// ---------------------------------------------------------------------------
function showHomePage() {
    const homeDiv = document.getElementById("homeDiv");
    const loginDiv = document.getElementById("loginDiv");
    const authDiv  = document.getElementById("authenticatedDiv");
    if (homeDiv)  homeDiv.style.display    = "block";
    if (loginDiv) loginDiv.style.display   = "none";
    if (authDiv)  authDiv.style.display    = "none";
    _setNavActive("home");
    applyUserModeUI();
    openDocTab(getActiveDocTab(), { scroll: false });
    renderGuidedJourney();
    clearAuthFlowStatus();
    setNavbarAuthCtas(hasAnyActiveSession());
}

function showLoginPage() {
    if (hasAnyActiveSession()) {
        const homeDiv = document.getElementById("homeDiv");
        const loginDiv = document.getElementById("loginDiv");
        const authDiv  = document.getElementById("authenticatedDiv");
        if (homeDiv)  homeDiv.style.display    = "none";
        if (loginDiv) loginDiv.style.display   = "none";
        if (authDiv)  authDiv.style.display    = "block";
        _setNavActive("");
        setNavbarAuthCtas(true);
        return;
    }

    const homeDiv = document.getElementById("homeDiv");
    const loginDiv = document.getElementById("loginDiv");
    const authDiv  = document.getElementById("authenticatedDiv");
    if (homeDiv)  homeDiv.style.display    = "none";
    if (loginDiv) loginDiv.style.display   = "block";
    if (authDiv)  authDiv.style.display    = "none";
    clearAuthFlowStatus();
    setNavbarAuthCtas(false);
    _setNavActive("login");
    window.scrollTo({ top: 0, behavior: "smooth" });
}

function hasAnyActiveSession() {
    const nativeSession = typeof hasActiveSession === "function" && hasActiveSession();
    const msalSession = typeof window.hasMsalAccount === "function" && window.hasMsalAccount();
    return Boolean(nativeSession || msalSession);
}

function setNavbarAuthCtas(isAuthenticated) {
    const signInDesktop = document.getElementById("navSignInBtn");
    const signInMobile = document.getElementById("navSignInBtnMobile");
    const exploreDesktop = document.getElementById("navExploreApiBtn");
    const exploreMobile = document.getElementById("navExploreApiBtnMobile");

    if (signInDesktop) {
        signInDesktop.style.display = isAuthenticated ? "none" : "inline-block";
    }
    if (signInMobile) {
        signInMobile.classList.toggle("is-hidden", isAuthenticated);
    }
    if (exploreDesktop) {
        exploreDesktop.classList.toggle("is-hidden", !isAuthenticated);
        exploreDesktop.style.display = isAuthenticated ? "inline-block" : "none";
    }
    if (exploreMobile) {
        exploreMobile.classList.toggle("is-hidden", !isAuthenticated);
    }
}

function scrollToDocsSection() {
    const homeDiv = document.getElementById("homeDiv");
    if (!homeDiv || homeDiv.style.display === "none") {
        showHomePage();
        setTimeout(() => {
            openDocTab("native");
            const target = document.getElementById("docs-overview");
            if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 100);
    } else {
        openDocTab("native", { scroll: false });
        const target = document.getElementById("docs-overview");
        if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    _setNavActive("docs");
}

function toggleNavMenu() {
    const menu = document.getElementById("navMobileMenu");
    const btn  = document.getElementById("navHamburger");
    if (!menu) return;
    const isHidden = menu.classList.contains("is-hidden");
    menu.classList.toggle("is-hidden", !isHidden);
    if (btn) btn.setAttribute("aria-expanded", String(isHidden));
}

function toggleApiCard(id) {
    const card = document.getElementById(id);
    if (card) card.classList.toggle("is-open");
}

function _setNavActive(section) {
    document.querySelectorAll(".navbar-link").forEach(link => {
        link.classList.toggle("is-active", link.getAttribute("data-nav") === section);
    });
}

function renderUnauthenticatedUI() {
    clearTokenLifetimeTimers();
    clearRefreshScheduleIndicator();
    clearAuthFlowStatus();
    document.getElementById("authenticatedDiv").style.display = "none";
    document.getElementById("loginDiv").style.display = "block";
    const homeDiv = document.getElementById("homeDiv");
    if (homeDiv) homeDiv.style.display = "none";
    document.getElementById("firstName").innerText = "";
    renderOperatorSearchHistory();
    applyDemoModeState();
    _setNavActive("login");
    setNavbarAuthCtas(false);
}

// ---------------------------------------------------------------------------
// Restore session on page load (native auth only)
// ---------------------------------------------------------------------------
function restoreSession() {
    if (hasActiveSession()) {
        const tokens = getSessionTokens();
        interactionType = getSessionItem(SESSION_KEYS.INTERACTION_TYPE) || "native";
        const decodedToken = parseJwt(tokens.access_token);
        if (tokens.id_token) {
            try {
                applyLocaleFromClaims(parseJwt(tokens.id_token));
            } catch (_err) {
                // Ignore locale parsing errors and continue with current locale.
            }
        }
        document.getElementById("authenticatedDiv").style.display = "block";
        document.getElementById("loginDiv").style.display = "none";
        const _homeRestore = document.getElementById("homeDiv"); if (_homeRestore) _homeRestore.style.display = "none";
        _setNavActive("");
        setNavbarAuthCtas(true);
        document.getElementById("firstName").innerText = decodedToken.name || "User";
        displayTokenDetails(tokens);
        applyDemoModeState();
        renderFlowCompletionSummary();
        renderComprehensiveUserProfile({
            accessToken: tokens.access_token,
            idToken: tokens.id_token,
            accountClaims: tokens.id_token ? parseJwt(tokens.id_token) : {},
        });
        fetchAndDisplayAuthMethods(tokens.access_token);
        enrichProfileWithGraphSelfService(tokens.access_token, tokens.id_token ? parseJwt(tokens.id_token) : {});
        refreshOperatorInsights(tokens.access_token, tokens.id_token ? parseJwt(tokens.id_token) : {});
        console.log("Session restored for:", decodedToken.name);
    } else {
        // No active session: show homepage as default landing view
        showHomePage();
    }
}

async function enrichProfileWithGraphSelfService(accessToken, accountClaims) {
    if (!accessToken || typeof window.getGraphSelfServiceProfile !== "function") {
        return;
    }

    try {
        const selectedFields = getGraphProfileSelectFields();
        const [graphProfile, tapResponse] = await Promise.all([
            window.getGraphSelfServiceProfile(accessToken, { selectFields: selectedFields }),
            window.getGraphSelfServiceTapMethods(accessToken),
        ]);

        renderComprehensiveUserProfile({
            accessToken,
            idToken: getSessionTokens().id_token,
            accountClaims: accountClaims || {},
            graphProfile: (graphProfile && graphProfile.data) || {},
            graphProfileMeta: {
                selectedFields: (graphProfile && graphProfile.selectedFields) || selectedFields,
                endpoint: graphProfile && graphProfile.endpoint,
            },
            tapMethods: (tapResponse && tapResponse.value) || [],
        });
    } catch (err) {
        pushErrorHistory(err.response?.data || err);
    }
}

function applyGraphProfileFieldSelection() {
    const input = document.getElementById("graphProfileSelectFields");
    if (!input) return;

    const fields = setGraphProfileSelectFields(input.value);
    input.value = fields.join(", ");

    const tokens = getSessionTokens();
    if (!tokens.access_token) {
        setLoginNotice("info", tr("msg.noSession"));
        return;
    }

    const claims = tokens.id_token ? parseJwt(tokens.id_token) : {};
    enrichProfileWithGraphSelfService(tokens.access_token, claims);
}

window.applyGraphProfileFieldSelection = applyGraphProfileFieldSelection;

// ---------------------------------------------------------------------------
// Token display helpers
// ---------------------------------------------------------------------------
function displayTokenDetails(tokens) {
    const detailsDiv = document.getElementById("tokenDetailsDiv");
    if (!detailsDiv) return;
    detailsDiv.style.display = "block";
    clearTokenLifetimeTimers();

    // Access Token
    if (tokens.access_token) {
        const decoded = parseJwt(tokens.access_token);
        renderTokenCard("accessTokenBody", "accessTokenScopes", decoded);
        const atRaw = document.getElementById("accessTokenRaw");
        if (atRaw) atRaw.textContent = tokens.access_token;
        updateTokenLifetime("accessTokenLifetime", tokens.access_token);
    }

    // ID Token
    if (tokens.id_token) {
        const decoded = parseJwt(tokens.id_token);
        renderTokenCard("idTokenBody", "idTokenScopes", decoded);
        const idRaw = document.getElementById("idTokenRaw");
        if (idRaw) idRaw.textContent = tokens.id_token;
        updateTokenLifetime("idTokenLifetime", tokens.id_token);
    }

    // Refresh Token (opaque — just show as-is)
    const rtBody = document.getElementById("refreshTokenBody");
    if (rtBody) {
        rtBody.textContent = tokens.refresh_token || "(not issued)";
    }

    if (!tokens.access_token && !tokens.id_token) {
        refreshTokenGuidance();
    }

    applyDemoModeState();
}

function renderTokenCard(bodyId, scopesId, decoded) {
    const bodyEl = document.getElementById(bodyId);
    const scopesEl = document.getElementById(scopesId);
    if (bodyEl) {
        bodyEl.textContent = JSON.stringify(decoded, null, 2);
    }
    if (scopesEl && decoded.scp) {
        const scopes = decoded.scp.split(" ");
        scopesEl.innerHTML =
            '<span class="token-scope-label">Scopes:</span>' +
            scopes.map((s) => `<span class="token-scope-badge">${s}</span>`).join("");
    } else if (scopesEl) {
        // No scp claim — show other relevant claims for ID tokens
        const displayClaims = ["aud", "iss", "sub", "name", "preferred_username", "email", "oid"];
        const found = displayClaims.filter((c) => decoded[c]);
        if (found.length > 0) {
            scopesEl.innerHTML =
                '<span class="token-scope-label">Claims:</span>' +
                found.map((c) => `<span class="token-scope-badge">${c}</span>`).join("");
        }
    }
}

function toggleTokenBody(elementId) {
    const el = document.getElementById(elementId);
    if (!el) return;
    const isHidden = window.getComputedStyle(el).display === "none";
    el.style.display = isHidden ? "block" : "none";
    // Rotate the toggle arrow
    const header = el.previousElementSibling || el.parentElement.querySelector(".token-card-header");
    if (header) {
        header.setAttribute("aria-expanded", isHidden ? "true" : "false");
        const toggle = header.querySelector(".token-toggle");
        if (toggle) toggle.style.transform = isHidden ? "rotate(180deg)" : "";
    }
}

function toggleRawToken(elementId, btn) {
    if (!isDemoModeEnabled()) {
        setLoginNotice("info", tr("msg.enableDemoMode"));
        return;
    }

    const el = document.getElementById(elementId);
    if (!el) return;
    const isHidden = window.getComputedStyle(el).display === "none";
    el.style.display = isHidden ? "block" : "none";
    if (btn) btn.textContent = isHidden ? tr("auth.hideToken") : tr("auth.showToken");
}

// ---------------------------------------------------------------------------
// Authentication Methods (Graph API)
// ---------------------------------------------------------------------------
const AUTH_METHOD_LABELS = {
    "#microsoft.graph.passwordAuthenticationMethod": { label: "Password", icon: "PW" },
    "#microsoft.graph.phoneAuthenticationMethod": { label: "Phone", icon: "PH" },
    "#microsoft.graph.emailAuthenticationMethod": { label: "Email", icon: "EM" },
    "#microsoft.graph.fido2AuthenticationMethod": { label: "FIDO2 Security Key", icon: "F2" },
    "#microsoft.graph.microsoftAuthenticatorAuthenticationMethod": { label: "Microsoft Authenticator", icon: "MA" },
    "#microsoft.graph.windowsHelloForBusinessAuthenticationMethod": { label: "Windows Hello", icon: "WH" },
    "#microsoft.graph.temporaryAccessPassAuthenticationMethod": { label: "Temporary Access Pass", icon: "TP" },
    "#microsoft.graph.softwareOathAuthenticationMethod": { label: "Software OATH Token", icon: "OA" },
};

async function fetchAndDisplayAuthMethods(accessToken) {
    const container = document.getElementById("authMethodsDiv");
    const loading = document.getElementById("authMethodsLoading");
    const list = document.getElementById("authMethodsList");
    if (!container) return;

    container.style.display = "block";
    if (loading) loading.style.display = "block";
    if (list) list.innerHTML = "";

    try {
        const response = await window.getGraphSelfServiceAuthMethods(accessToken);
        if (loading) loading.style.display = "none";

        const methods = response.value || [];
        if (methods.length === 0) {
            list.innerHTML = `<div class="auth-methods-error">${tr("msg.methodsNone")}</div>`;
            return;
        }

        methods.forEach((method) => {
            const odataType = method["@odata.type"] || "";
            const meta = AUTH_METHOD_LABELS[odataType] || { label: odataType.replace("#microsoft.graph.", "").replace("AuthenticationMethod", ""), icon: "ID" };

            const detail = buildMethodDetail(method, odataType);

            const card = document.createElement("div");
            card.className = "auth-method-card";
            card.innerHTML =
                `<div class="auth-method-icon">${meta.icon}</div>` +
                `<div class="auth-method-info">` +
                `<div class="auth-method-type">${meta.label}</div>` +
                (detail ? `<div class="auth-method-detail">${detail}</div>` : "") +
                `<div class="auth-method-id">ID: ${method.id}</div>` +
                `</div>`;
            list.appendChild(card);
        });
    } catch (err) {
        console.warn("Failed to fetch authentication methods:", err);
        pushErrorHistory(err.response?.data || err);
        if (loading) loading.style.display = "none";
        if (list) {
            list.innerHTML = `<div class="auth-methods-error">${tr("msg.methodsLoadFailed")}</div>`;
        }
    }
}

// ---------------------------------------------------------------------------
// Add Phone Authentication Method
// ---------------------------------------------------------------------------
function openAddPhoneDialog() {
    const dialog = document.getElementById("addPhoneDialog");
    if (!dialog) return;
    document.getElementById("phoneNumberInputAuthMethod").value = "";
    document.getElementById("phoneTypeSelect").value = "mobile";
    dialog.showModal();

    return new Promise((resolve) => {
        const confirmBtn = document.getElementById("addPhoneConfirmBtn");
        const cancelBtn = document.getElementById("addPhoneCancel");

        function cleanup() {
            confirmBtn.removeEventListener("click", onConfirm);
            cancelBtn.removeEventListener("click", onCancel);
            dialog.removeEventListener("close", onClose);
        }

        function onConfirm(e) {
            e.preventDefault();
            const phoneNumber = document.getElementById("phoneNumberInputAuthMethod").value.trim();
            const phoneType = document.getElementById("phoneTypeSelect").value;
            if (!phoneNumber) {
                alert(tr("msg.enterPhone"));
                return;
            }
            dialog.close();
            cleanup();
            addPhoneAuthMethod(phoneNumber, phoneType).then(resolve);
        }

        function onCancel() {
            dialog.close();
            cleanup();
            resolve();
        }

        function onClose() {
            cleanup();
            resolve();
        }

        confirmBtn.addEventListener("click", onConfirm);
        cancelBtn.addEventListener("click", onCancel);
        dialog.addEventListener("close", onClose);
    });
}

async function addPhoneAuthMethod(phoneNumber, phoneType) {
    const tokens = getSessionTokens();
    const accessToken = tokens.access_token;
    if (!accessToken) {
        alert(tr("msg.noSession"));
        return;
    }

    try {
        await window.addGraphSelfServicePhoneMethod(accessToken, phoneNumber, phoneType);
        alert(tr("msg.phoneAdded"));
        // Refresh the auth methods list
        await fetchAndDisplayAuthMethods(accessToken);
    } catch (err) {
        console.error("Failed to add phone auth method:", err);
        const msg = err.response?.data?.error?.message || err.message || tr("misc.unknownError");
        setLoginNotice("error", tr("msg.phoneAddFailed", { message: msg }));
        showErrorDiagnostics(err.response?.data || err);
    }
}

function buildMethodDetail(method, odataType) {
    switch (odataType) {
        case "#microsoft.graph.phoneAuthenticationMethod":
            return `${method.phoneType || "Phone"}: ${method.phoneNumber || ""}`;
        case "#microsoft.graph.emailAuthenticationMethod":
            return method.emailAddress || "";
        case "#microsoft.graph.fido2AuthenticationMethod":
            return `${method.displayName || ""}${method.model ? " — " + method.model : ""}`;
        case "#microsoft.graph.microsoftAuthenticatorAuthenticationMethod":
            return `${method.displayName || ""}${method.deviceTag ? " (" + method.deviceTag + ")" : ""}`;
        case "#microsoft.graph.windowsHelloForBusinessAuthenticationMethod":
            return `${method.displayName || ""}${method.keyStrength ? " — strength: " + method.keyStrength : ""}`;
        case "#microsoft.graph.softwareOathAuthenticationMethod":
            return method.secretKey ? tr("auth.method.secretConfigured") : "";
        case "#microsoft.graph.temporaryAccessPassAuthenticationMethod":
            return method.isUsable ? tr("auth.method.active") : tr("auth.method.expired");
        default:
            return method.displayName || "";
    }
}
