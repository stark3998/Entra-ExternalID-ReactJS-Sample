// msalAuth.js
// MSAL Browser authentication (Popup & Redirect flows)
// Depends on: config.js, ui.js

const { PublicClientApplication } = window.msal;

function tr(key, params) {
    if (typeof window.t === "function") return window.t(key, params);
    return key;
}

const msalInstance = new PublicClientApplication(msalConfig);

async function handleResponse(resp) {
    if (resp !== null) {
        accountId = resp.account.homeAccountId;
        msalInstance.setActiveAccount(resp.account);
        if (typeof window.applyLocaleFromClaims === "function") {
            window.applyLocaleFromClaims(resp.idTokenClaims || resp.account?.idTokenClaims);
        }

        let accessToken = "";
        try {
            const tokenResponse = await msalInstance.acquireTokenSilent({
                scopes: loginRequest.scopes,
                account: resp.account,
            });
            accessToken = tokenResponse && tokenResponse.accessToken ? tokenResponse.accessToken : "";
        } catch (tokenErr) {
            console.warn("Could not acquire MSAL access token for profile display:", tokenErr);
        }

        renderAuthenticatedUI({
            account: resp.account,
            idTokenClaims: resp.idTokenClaims || resp.account?.idTokenClaims || {},
            idToken: resp.idToken || "",
            accessToken,
        });
    }
}

// Initialize MSAL and handle redirect responses
msalInstance.initialize().then(() => {
    msalInstance.handleRedirectPromise().then(handleResponse).catch(err => {
        console.error(err);
    });
});

// Sign in using MSAL Popup
async function loginPopup() {
    try {
        interactionType = "popup";
        const loginResponse = await msalInstance.loginPopup({
            loginRequest,
            redirectUri: msalConfig.auth.redirectUri + "/redirect.html",
        });
        await handleResponse(loginResponse);
    } catch (error) {
        renderUnauthenticatedUI();
        const message = error?.message || String(error);
        alert(tr("msg.loginFailed", { message }));
    }
}

// Sign in using MSAL Redirect
async function loginRedirect() {
    interactionType = "redirect";
    try {
        return msalInstance.loginRedirect(loginRequest);
    } catch (error) {
        renderUnauthenticatedUI();
        const message = error?.message || String(error);
        alert(tr("msg.loginFailed", { message }));
    }
}
