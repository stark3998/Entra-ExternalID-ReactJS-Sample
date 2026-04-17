// msalAuth.js
// MSAL Browser authentication (Popup & Redirect flows)
// Depends on: config.js, ui.js

const { PublicClientApplication } = window.msal;

function tr(key, params) {
    if (typeof window.t === "function") return window.t(key, params);
    return key;
}

const msalInstance = new PublicClientApplication(msalConfig);

function handleResponse(resp) {
    if (resp !== null) {
        accountId = resp.account.homeAccountId;
        msalInstance.setActiveAccount(resp.account);
        renderAuthenticatedUI(resp.account);
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
        handleResponse(loginResponse);
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
