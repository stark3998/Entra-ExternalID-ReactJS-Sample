// msalAuth.js
// MSAL Browser authentication (Popup & Redirect flows)
// Depends on: config.js, ui.js

const { PublicClientApplication } = window.msal;

function tr(key, params) {
    if (typeof window.t === "function") return window.t(key, params);
    return key;
}

const msalInstance = new PublicClientApplication(msalConfig);
const MSAL_SILENT_REFRESH = {
    timerId: null,
    inFlight: null,
    status: "idle",
    lastError: null,
    retryCount: 0,
    lastRetryAt: null,
    maxRetries: 3,
    baseRetryDelayMs: 1000,
};

function setMsalSilentRefreshState(status, error) {
    MSAL_SILENT_REFRESH.status = status;
    MSAL_SILENT_REFRESH.lastError = error || null;
    if (typeof window.refreshTokenGuidance === "function") {
        window.refreshTokenGuidance();
    }
}

function clearMsalSilentRefreshTimer() {
    if (MSAL_SILENT_REFRESH.timerId) {
        window.clearTimeout(MSAL_SILENT_REFRESH.timerId);
        MSAL_SILENT_REFRESH.timerId = null;
    }
}

function hasMsalAccount() {
    return Boolean(msalInstance.getActiveAccount() || msalInstance.getAllAccounts()[0]);
}

function getMsalSilentRefreshState() {
    return {
        status: MSAL_SILENT_REFRESH.status,
        lastError: MSAL_SILENT_REFRESH.lastError,
    };
}

async function acquireMsalTokenSilent(account, options = {}) {
    return msalInstance.acquireTokenSilent({
        scopes: loginRequest.scopes,
        account,
        forceRefresh: Boolean(options.forceRefresh),
    });
}

function scheduleMsalSilentRefresh(accessToken, account) {
    clearMsalSilentRefreshTimer();
    MSAL_SILENT_REFRESH.retryCount = 0;
    if (!accessToken || typeof parseJwt !== "function") return;

    let decoded;
    try {
        decoded = parseJwt(accessToken);
    } catch (_err) {
        return;
    }

    if (!decoded || !decoded.exp) return;
    const refreshLeadMs = 5 * 60 * 1000;
    const delay = Math.max(5000, (decoded.exp * 1000) - Date.now() - refreshLeadMs);
    const nextRefreshAt = Date.now() + delay;
    if (typeof window.setRefreshScheduleIndicator === "function") {
        window.setRefreshScheduleIndicator({
            mode: "msal",
            strategy: "silent",
            nextRefreshAt,
            refreshSource: "scheduled",
        });
    }
    MSAL_SILENT_REFRESH.timerId = window.setTimeout(() => {
        refreshMsalSessionSilently({ account, reason: "scheduled", reportError: false }).catch((error) => {
            console.warn("Scheduled MSAL silent refresh failed:", error);
        });
    }, delay);
}

async function renderMsalAuthenticatedSession(account, tokenResponse) {
    if (!account) return;

    msalInstance.setActiveAccount(account);
    if (typeof window.setSessionInteractionType === "function") {
        const currentType = typeof window.getSessionInteractionType === "function" ? window.getSessionInteractionType() : "";
        window.setSessionInteractionType(currentType === "redirect" ? "redirect" : "popup");
    }

    renderAuthenticatedUI({
        account,
        idTokenClaims: tokenResponse.idTokenClaims || account.idTokenClaims || {},
        idToken: tokenResponse.idToken || "",
        accessToken: tokenResponse.accessToken || "",
    });

    scheduleMsalSilentRefresh(tokenResponse.accessToken, account);
}

async function refreshMsalSessionSilently(options = {}) {
    const account = options.account || msalInstance.getActiveAccount() || msalInstance.getAllAccounts()[0];
    if (!account) {
        throw new Error("No MSAL account available for silent refresh.");
    }

    if (MSAL_SILENT_REFRESH.inFlight) {
        return MSAL_SILENT_REFRESH.inFlight;
    }

    // Determine refresh source based on reason
    const refreshSource = options.reason === "scheduled" ? "scheduled" : "manual";

    setMsalSilentRefreshState("refreshing");
    MSAL_SILENT_REFRESH.inFlight = (async () => {
        try {
            const tokenResponse = await acquireMsalTokenSilent(account, options);
            await renderMsalAuthenticatedSession(account, tokenResponse);
            if (typeof window.setRefreshScheduleIndicator === "function") {
                window.setRefreshScheduleIndicator({
                    mode: "msal",
                    strategy: "silent",
                    lastRefreshAt: Date.now(),
                    refreshSource,
                });
            }
            // Reset retry counter on success
            MSAL_SILENT_REFRESH.retryCount = 0;
            setMsalSilentRefreshState("idle");
            setLoginNotice("info", tr("msg.msalSilentRefreshSuccess"));
            return tokenResponse;
        } catch (error) {
            // Retry logic: exponential backoff for transient errors
            const shouldRetry = MSAL_SILENT_REFRESH.retryCount < MSAL_SILENT_REFRESH.maxRetries
                && options.reason === "scheduled"
                && isTransientError(error);

            if (shouldRetry) {
                MSAL_SILENT_REFRESH.retryCount++;
                MSAL_SILENT_REFRESH.lastRetryAt = Date.now();
                const backoffMs = MSAL_SILENT_REFRESH.baseRetryDelayMs * Math.pow(2, MSAL_SILENT_REFRESH.retryCount - 1);
                console.warn(`MSAL silent refresh failed (attempt ${MSAL_SILENT_REFRESH.retryCount}), retrying in ${backoffMs}ms:`, error);
                
                MSAL_SILENT_REFRESH.inFlight = null;
                return new Promise((resolve, reject) => {
                    setTimeout(() => {
                        refreshMsalSessionSilently(options).then(resolve).catch(reject);
                    }, backoffMs);
                });
            }

            // Permanent failure after retries exhausted
            setMsalSilentRefreshState("failed", error);
            if (options.reportError !== false && typeof window.showErrorDiagnostics === "function") {
                window.showErrorDiagnostics({
                    error: "msal_silent_refresh_failed",
                    error_description: error?.message || String(error),
                    flowName: "msal",
                    flowStep: `acquireTokenSilent:${options.reason || "manual"}`,
                    endpoint: "acquireTokenSilent",
                    responsePayload: error,
                });
            }
            setLoginNotice("error", tr("msg.msalSilentRefreshFailed", { message: error?.message || String(error) }));
            throw error;
        } finally {
            MSAL_SILENT_REFRESH.inFlight = null;
        }
    })();

    return MSAL_SILENT_REFRESH.inFlight;
}

function isTransientError(error) {
    if (!error) return false;
    const message = String(error?.message || error).toLowerCase();
    const code = String(error?.errorCode || error?.code || "").toLowerCase();
    
    // Network/timeout errors are transient
    if (message.includes("network") || message.includes("timeout") || message.includes("econnrefused")) return true;
    if (code.includes("timeout") || code.includes("enotfound") || code.includes("econnrefused")) return true;
    
    // Specific MSAL transient errors
    if (code.includes("invalid_grant") && message.includes("expired")) return true;
    if (code === "interaction_required") return false; // Not transient - requires user interaction
    if (code === "consent_required") return false; // Not transient - requires user consent
    
    return false;
}

window.refreshMsalSessionSilently = refreshMsalSessionSilently;
window.clearMsalSilentRefreshTimer = clearMsalSilentRefreshTimer;
window.getMsalSilentRefreshState = getMsalSilentRefreshState;
window.hasMsalAccount = hasMsalAccount;
window.loginPopup = loginPopup;
window.loginRedirect = loginRedirect;

async function handleResponse(resp) {
    if (resp !== null) {
        accountId = resp.account.homeAccountId;
        msalInstance.setActiveAccount(resp.account);
        if (typeof window.setSessionInteractionType === "function") {
            window.setSessionInteractionType(interactionType || "popup");
        }
        if (typeof window.applyLocaleFromClaims === "function") {
            window.applyLocaleFromClaims(resp.idTokenClaims || resp.account?.idTokenClaims);
        }

        try {
            const tokenResponse = await acquireMsalTokenSilent(resp.account);
            await renderMsalAuthenticatedSession(resp.account, tokenResponse);
        } catch (tokenErr) {
            console.warn("Could not acquire MSAL access token for profile display:", tokenErr);
            await renderMsalAuthenticatedSession(resp.account, {
                idTokenClaims: resp.idTokenClaims || resp.account?.idTokenClaims || {},
                idToken: resp.idToken || "",
                accessToken: "",
            });
        }
    }
}

// Initialize MSAL and handle redirect responses
msalInstance.initialize().then(async () => {
    try {
        const response = await msalInstance.handleRedirectPromise();
        if (response) {
            await handleResponse(response);
            return;
        }

        if (typeof window.hasNativeSession === "function" && window.hasNativeSession()) {
            return;
        }

        const cachedAccount = msalInstance.getActiveAccount() || msalInstance.getAllAccounts()[0];
        if (cachedAccount) {
            await refreshMsalSessionSilently({ account: cachedAccount, reason: "restore", reportError: false });
        }
    } catch (err) {
        console.error(err);
    }
});

// Sign in using MSAL Popup
async function loginPopup() {
    try {
        interactionType = "popup";
        if (typeof window.setSessionInteractionType === "function") {
            window.setSessionInteractionType("popup");
        }
        const loginResponse = await msalInstance.loginPopup({
            ...loginRequest,
            redirectUri: msalConfig.auth.redirectUri + "/redirect.html",
        });
        await handleResponse(loginResponse);
    } catch (error) {
        renderUnauthenticatedUI();
        const message = error?.message || String(error);
        if (typeof window.showErrorDiagnostics === "function") {
            window.showErrorDiagnostics({
                error: "msal_popup_failed",
                error_description: message,
                flowName: "msal",
                flowStep: "loginPopup",
                endpoint: "loginPopup",
                responsePayload: error,
            });
        }
        setLoginNotice("error", tr("msg.loginFailed", { message }));
    }
}

// Sign in using MSAL Redirect
async function loginRedirect() {
    interactionType = "redirect";
    if (typeof window.setSessionInteractionType === "function") {
        window.setSessionInteractionType("redirect");
    }
    try {
        return msalInstance.loginRedirect(loginRequest);
    } catch (error) {
        renderUnauthenticatedUI();
        const message = error?.message || String(error);
        if (typeof window.showErrorDiagnostics === "function") {
            window.showErrorDiagnostics({
                error: "msal_redirect_failed",
                error_description: message,
                flowName: "msal",
                flowStep: "loginRedirect",
                endpoint: "loginRedirect",
                responsePayload: error,
            });
        }
        setLoginNotice("error", tr("msg.loginFailed", { message }));
    }
}
