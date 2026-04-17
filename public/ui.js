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
// Session token helpers (sessionStorage)
// ---------------------------------------------------------------------------
const SESSION_KEYS = {
    ACCESS_TOKEN: "nativeAuth_access_token",
    ID_TOKEN: "nativeAuth_id_token",
    REFRESH_TOKEN: "nativeAuth_refresh_token",
    INTERACTION_TYPE: "nativeAuth_interaction_type",
};

function tr(key, params) {
    if (typeof window.t === "function") return window.t(key, params);
    return key;
}

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

function renderComprehensiveUserProfile(context) {
    const profileDiv = document.getElementById("userProfileDiv");
    const highlights = document.getElementById("userProfileHighlights");
    const claimsBody = document.getElementById("profileClaimsBody");
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

    const userSummary = [
        { label: "Display Name", value: getPreferredClaim(mergedClaims, ["name", "displayName"]) || tr("misc.user") },
        { label: "Given Name", value: getPreferredClaim(mergedClaims, ["given_name"]) || "-" },
        { label: "Family Name", value: getPreferredClaim(mergedClaims, ["family_name"]) || "-" },
        { label: "Username", value: getPreferredClaim(mergedClaims, ["preferred_username", "unique_name", "upn", "email"]) || "-" },
        { label: tr("auth.locale"), value: locale || "-", locale: true },
        { label: "Tenant ID", value: getPreferredClaim(mergedClaims, ["tid", "tenantId"]) || "-" },
        { label: "Object ID", value: getPreferredClaim(mergedClaims, ["oid", "sub"]) || "-" },
        { label: "Authentication Method", value: getPreferredClaim(mergedClaims, ["amr", "acr"]) || "-" },
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
        },
        null,
        2
    );

    profileDiv.style.display = "block";
}

function storeSessionTokens(tokenResponse) {
    if (tokenResponse.access_token) sessionStorage.setItem(SESSION_KEYS.ACCESS_TOKEN, tokenResponse.access_token);
    if (tokenResponse.id_token) sessionStorage.setItem(SESSION_KEYS.ID_TOKEN, tokenResponse.id_token);
    if (tokenResponse.refresh_token) sessionStorage.setItem(SESSION_KEYS.REFRESH_TOKEN, tokenResponse.refresh_token);
    sessionStorage.setItem(SESSION_KEYS.INTERACTION_TYPE, "native");
}

function getSessionTokens() {
    return {
        access_token: sessionStorage.getItem(SESSION_KEYS.ACCESS_TOKEN),
        id_token: sessionStorage.getItem(SESSION_KEYS.ID_TOKEN),
        refresh_token: sessionStorage.getItem(SESSION_KEYS.REFRESH_TOKEN),
    };
}

function clearSessionTokens() {
    Object.values(SESSION_KEYS).forEach((key) => sessionStorage.removeItem(key));
}

function hasActiveSession() {
    return !!sessionStorage.getItem(SESSION_KEYS.ACCESS_TOKEN);
}

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

    const decodedToken = parseJwt(accessToken);
    const idToken = typeof tokenResponse === "object" ? tokenResponse.id_token : null;
    const decodedIdToken = idToken ? parseJwt(idToken) : null;

    applyLocaleFromClaims(decodedIdToken || decodedToken);

    console.log("Decoded token payload:", decodedToken);
    document.getElementById("authenticatedDiv").style.display = "block";
    document.getElementById("loginDiv").style.display = "none";
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
        sessionStorage.setItem("nativeAuth_user_email", decodedToken.upn);
    }

    // Display token details
    const tokens = typeof tokenResponse === "object" ? tokenResponse : getSessionTokens();
    displayTokenDetails(tokens);
    renderComprehensiveUserProfile({
        accessToken: tokens.access_token || accessToken,
        idToken: tokens.id_token || "",
        accountClaims: decodedIdToken || {},
    });

    // Fetch and display registered authentication methods
    fetchAndDisplayAuthMethods(tokens.access_token || accessToken);
}

function renderAuthenticatedUI(authResult) {
    const account = authResult && authResult.account ? authResult.account : authResult;
    document.getElementById("authenticatedDiv").style.display = "block";
    document.getElementById("loginDiv").style.display = "none";
    document.getElementById("firstName").innerText = (account && account.name) || tr("misc.user");

    const idTokenClaims = (authResult && authResult.idTokenClaims) || (account && account.idTokenClaims) || {};
    const accessToken = authResult && authResult.accessToken ? authResult.accessToken : "";
    const idToken = authResult && authResult.idToken ? authResult.idToken : "";

    displayTokenDetails({
        access_token: accessToken,
        id_token: idToken,
        refresh_token: "",
    });
    renderComprehensiveUserProfile({
        accessToken,
        idToken,
        accountClaims: idTokenClaims,
    });
}

function renderUnauthenticatedUI() {
    document.getElementById("authenticatedDiv").style.display = "none";
    document.getElementById("loginDiv").style.display = "block";
    document.getElementById("firstName").innerText = "";
}

// ---------------------------------------------------------------------------
// Restore session on page load (native auth only)
// ---------------------------------------------------------------------------
function restoreSession() {
    if (hasActiveSession()) {
        const tokens = getSessionTokens();
        interactionType = sessionStorage.getItem(SESSION_KEYS.INTERACTION_TYPE) || "native";
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
        document.getElementById("firstName").innerText = decodedToken.name || "User";
        displayTokenDetails(tokens);
        renderComprehensiveUserProfile({
            accessToken: tokens.access_token,
            idToken: tokens.id_token,
            accountClaims: tokens.id_token ? parseJwt(tokens.id_token) : {},
        });
        fetchAndDisplayAuthMethods(tokens.access_token);
        console.log("Session restored for:", decodedToken.name);
    }
}

// ---------------------------------------------------------------------------
// Token display helpers
// ---------------------------------------------------------------------------
function displayTokenDetails(tokens) {
    const detailsDiv = document.getElementById("tokenDetailsDiv");
    if (!detailsDiv) return;
    detailsDiv.style.display = "block";

    // Access Token
    if (tokens.access_token) {
        const decoded = parseJwt(tokens.access_token);
        renderTokenCard("accessTokenBody", "accessTokenScopes", decoded);
        const atRaw = document.getElementById("accessTokenRaw");
        if (atRaw) atRaw.textContent = tokens.access_token;
    }

    // ID Token
    if (tokens.id_token) {
        const decoded = parseJwt(tokens.id_token);
        renderTokenCard("idTokenBody", "idTokenScopes", decoded);
        const idRaw = document.getElementById("idTokenRaw");
        if (idRaw) idRaw.textContent = tokens.id_token;
    }

    // Refresh Token (opaque — just show as-is)
    const rtBody = document.getElementById("refreshTokenBody");
    if (rtBody) {
        rtBody.textContent = tokens.refresh_token || "(not issued)";
    }
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
        const response = await axios.get(
            "https://graph.microsoft.com/v1.0/me/authentication/methods",
            { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (loading) loading.style.display = "none";

        const methods = response.data.value || [];
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
        const userEmail = sessionStorage.getItem("nativeAuth_user_email");
        await axios.post(
            `https://graph.microsoft.com/v1.0/users/${userEmail}/authentication/phoneMethods`,
            { phoneNumber, phoneType },
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "application/json",
                },
            }
        );
        alert(tr("msg.phoneAdded"));
        // Refresh the auth methods list
        await fetchAndDisplayAuthMethods(accessToken);
    } catch (err) {
        console.error("Failed to add phone auth method:", err);
        const msg = err.response?.data?.error?.message || err.message || tr("misc.unknownError");
        alert(tr("msg.phoneAddFailed", { message: msg }));
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
