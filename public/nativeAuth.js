// nativeAuth.js
// Native Auth login flow (email/password via Entra Native Auth APIs)
// Matches the "EEID Native Auth" Postman collection.
// Depends on: config.js, httpClient.js, ui.js

const FLOW_STATE = {
    signIn: {},
    signUp: {},
    resetPassword: {},
};

function tr(key, params) {
    if (typeof window.t === "function") return window.t(key, params);
    return key;
}

async function refreshNativeAuthSession() {
    const tokens = getSessionTokens();
    if (!tokens.refresh_token) {
        setLoginNotice("error", tr("msg.nativeRefreshUnavailable"));
        return null;
    }

    try {
        clearLoginNotice();
        const tokenRes = await postRequest(ENV.urlOauthToken, {
            client_id: msalConfig.auth.clientId,
            grant_type: "refresh_token",
            refresh_token: tokens.refresh_token,
            scope: NATIVE_AUTH.scopes,
            client_info: "true",
        }, { flowName: "native-auth", flowStep: "token:refresh_token" });
        renderNativeAuthenticatedUI(tokenRes);
        if (typeof window.setRefreshScheduleIndicator === "function") {
            window.setRefreshScheduleIndicator({
                mode: "native",
                strategy: "on-demand",
                lastRefreshAt: Date.now(),
                nextRefreshAt: null,
                refreshSource: "manual",
            });
        }
        setLoginNotice("info", tr("msg.nativeRefreshSuccess"));
        return tokenRes;
    } catch (err) {
        setLoginNotice("error", tr("msg.nativeRefreshFailed", { message: err.error_description || err.message || tr("misc.unknownError") }));
        showErrorDiagnostics(err);
        throw err;
    }
}

function promptNativeReauthentication() {
    const tokens = getSessionTokens();
    let email = "";
    try {
        if (tokens.id_token) {
            const claims = parseJwt(tokens.id_token);
            email = claims.preferred_username || claims.email || claims.upn || "";
        }
    } catch (_err) {
        email = "";
    }

    clearSessionTokens();
    renderUnauthenticatedUI();
    const emailInput = document.getElementById("emailText");
    if (emailInput && email) {
        emailInput.value = email;
    }
    setLoginNotice("info", tr("auth.reauthPrompt"));
}

window.refreshNativeAuthSession = refreshNativeAuthSession;
window.promptNativeReauthentication = promptNativeReauthentication;

// ---------------------------------------------------------------------------
// Main login orchestration
// ---------------------------------------------------------------------------
async function login() {
    interactionType = "native";
    if (typeof window.setSessionInteractionType === "function") {
        window.setSessionInteractionType("native");
    }
    const email = document.getElementById("emailText").value;
    const password = document.getElementById("passwordText").value;

    if (!email || !password) {
        alert(tr("msg.enterEmailPassword"));
        return;
    }

    try {
        clearLoginNotice();

        // 1. Initiate
        const initRes = await signInStart(email);
        FLOW_STATE.signIn = { email };

        // 2. Challenge (password)
        const challengeRes = await signInChallenge(initRes.continuation_token);

        // 3. Token (password)
        FLOW_STATE.signIn.continuation_token = challengeRes.continuation_token;

        let tokenRes;
        try {
            tokenRes = await signInTokenRequest({
                continuation_token: challengeRes.continuation_token,
                grant_type: "password",
                password,
            });
        } catch (tokenErr) {
            // The token endpoint returns 400 with suberror "mfa_required"
            // and a continuation_token when MFA is needed.
            if (tokenErr.suberror === "mfa_required" && tokenErr.continuation_token) {
                console.log("MFA required (suberror: mfa_required), entering MFA flow…");
                await handleMfaFlow(tokenErr.continuation_token);
                return;
            }
            // If the Token API returns a "registration_required" suberror, 
            // it means the user needs to register an MFA method before they can sign in. 
            // The response will include a continuation_token that we can use to drive the registration flow.
            else if (tokenErr.suberror === "registration_required" && tokenErr.continuation_token) {
                console.log("Registration required (suberror: registration_required).");
                await handleRegistrationFlow(tokenErr.continuation_token);
                return;
            }
            // Not an MFA error — re-throw so the outer catch handles it.
            throw tokenErr;
        }

        // If we got here, no MFA was needed.
        renderNativeAuthenticatedUI(tokenRes);

    } catch (err) {
        const message = err.error_description || err.message || JSON.stringify(err);
        setLoginNotice("error", tr("msg.loginError", { message }));
        showErrorDiagnostics(err);
    }
}

function mergeSignUpAttributes(rawJson, displayName) {
    let attributes = {};
    if (rawJson) {
        try {
            attributes = JSON.parse(rawJson);
        } catch (_err) {
            throw new Error(tr("msg.invalidAttributes"));
        }
    }
    if (displayName) {
        attributes.displayName = displayName;
    }
    return Object.keys(attributes).length > 0 ? attributes : null;
}

function getMissingRequiredSignUpAttributes(attributes) {
    const requiredAttributes = (SIGNUP_CONFIG && SIGNUP_CONFIG.requiredAttributes) || [];
    if (requiredAttributes.length === 0) return [];

    const attributeBag = attributes || {};
    return requiredAttributes.filter((key) => {
        const value = attributeBag[key];
        return value === null || value === undefined || String(value).trim() === "";
    });
}

function updateSignUpAttributeHint() {
    const hint = document.getElementById("signUpAttributesHint");
    if (!hint) return;

    const parts = [];
    if (SIGNUP_CONFIG.requiredAttributes.length > 0) {
        parts.push(`Required attributes: ${SIGNUP_CONFIG.requiredAttributes.join(", ")}`);
    }
    if (SIGNUP_CONFIG.attributeTemplate) {
        parts.push("Tenant attribute template loaded from runtime config.");
    }

    if (parts.length === 0) {
        hint.textContent = "";
        hint.classList.add("is-hidden");
        return;
    }

    hint.textContent = parts.join(" ");
    hint.classList.remove("is-hidden");
}

function openDialog(dialogId, onConfirm) {
    const dialog = document.getElementById(dialogId);
    if (!dialog) return;
    dialog.showModal();

    return new Promise((resolve) => {
        const confirmBtn = dialog.querySelector("button[type='submit']");
        const cancelBtn = dialog.querySelector("button[type='reset']");

        async function confirmHandler(event) {
            event.preventDefault();
            try {
                await onConfirm();
                cleanup();
                dialog.close();
                resolve(true);
            } catch (error) {
                setLoginNotice("error", error.message || tr("misc.unknownError"));
            }
        }

        function cleanup() {
            confirmBtn.removeEventListener("click", confirmHandler);
            cancelBtn.removeEventListener("click", cancelHandler);
        }

        function cancelHandler() {
            cleanup();
            dialog.close();
            resolve(false);
        }

        confirmBtn.addEventListener("click", confirmHandler);
        cancelBtn.addEventListener("click", cancelHandler);
    });
}

function openSignUpDialog() {
    ["signUpEmail", "signUpPassword", "signUpPasswordConfirm", "signUpDisplayName"].forEach((id) => {
        const element = document.getElementById(id);
        if (element) element.value = "";
    });

    const attributesInput = document.getElementById("signUpAttributesJson");
    if (attributesInput) {
        attributesInput.value = SIGNUP_CONFIG.attributeTemplate || "";
    }

    updateSignUpAttributeHint();

    return openDialog("signUpDialog", async () => {
        const email = document.getElementById("signUpEmail").value.trim();
        const password = document.getElementById("signUpPassword").value;
        const confirmPassword = document.getElementById("signUpPasswordConfirm").value;
        const displayName = document.getElementById("signUpDisplayName").value.trim();
        const rawAttributes = document.getElementById("signUpAttributesJson").value.trim();

        if (!email || !password) {
            throw new Error(tr("msg.enterEmailPassword"));
        }
        if (password !== confirmPassword) {
            throw new Error(tr("msg.passwordsDoNotMatch"));
        }

        const attributes = mergeSignUpAttributes(rawAttributes, displayName);
        const missingAttributes = getMissingRequiredSignUpAttributes(attributes);
        if (missingAttributes.length > 0) {
            throw new Error(tr("msg.missingRequiredAttributes", { attributes: missingAttributes.join(", ") }));
        }

        await signUp({ email, password, attributes });
    });
}

function openResetPasswordDialog() {
    ["resetPasswordEmail", "resetPasswordNew", "resetPasswordConfirm"].forEach((id) => {
        const element = document.getElementById(id);
        if (element) element.value = "";
    });

    return openDialog("resetPasswordDialog", async () => {
        const email = document.getElementById("resetPasswordEmail").value.trim();
        const newPassword = document.getElementById("resetPasswordNew").value;
        const confirmPassword = document.getElementById("resetPasswordConfirm").value;
        if (!email || !newPassword) {
            throw new Error(tr("msg.enterEmailPassword"));
        }
        if (newPassword !== confirmPassword) {
            throw new Error(tr("msg.passwordsDoNotMatch"));
        }

        await resetPassword({ email, newPassword });
    });
}

window.openSignUpDialog = openSignUpDialog;
window.openResetPasswordDialog = openResetPasswordDialog;

async function signUp({ email, password, attributes }) {
    interactionType = "native";
    clearLoginNotice();

    try {
        const startRes = await signUpStart(email, password, attributes);
        const challengeRes = await signUpChallenge(startRes.continuation_token);

        if (challengeRes.challenge_type === "redirect") {
            throw {
                error: "redirect_required",
                error_description: tr("msg.loginFailed", { message: "The tenant requested a browser-based sign-up flow." }),
                flowName: "signup",
                flowStep: "challenge",
                endpoint: ENV.urlSignupChallenge,
                responsePayload: challengeRes,
            };
        }

        const oobCode = await promptForOobCode(
            tr("msg.enterCodeVia", {
                channel: challengeRes.challenge_channel || "email",
                hint: challengeRes.challenge_target_label || email,
            })
        );
        if (!oobCode) {
            setLoginNotice("info", tr("msg.mfaCancelled"));
            return;
        }

        const continueRes = await signUpContinue({
            continuation_token: challengeRes.continuation_token,
            grant_type: "oob",
            oob: oobCode,
        });

        const tokenRes = await issueContinuationTokens(continueRes.continuation_token, email);
        setLoginNotice("success", tr("msg.signupSuccess"));
        renderNativeAuthenticatedUI(tokenRes);
    } catch (err) {
        setLoginNotice("error", err.error_description || err.message || tr("misc.unknownError"));
        showErrorDiagnostics(err);
        throw err;
    }
}

function waitFor(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function resetPassword({ email, newPassword }) {
    interactionType = "native";
    clearLoginNotice();

    try {
        const startRes = await resetPasswordStart(email);
        const challengeRes = await resetPasswordChallenge(startRes.continuation_token);

        const oobCode = await promptForOobCode(
            tr("msg.enterCodeVia", {
                channel: challengeRes.challenge_channel || "email",
                hint: challengeRes.challenge_target_label || email,
            })
        );
        if (!oobCode) {
            setLoginNotice("info", tr("msg.mfaCancelled"));
            return;
        }

        const continueRes = await resetPasswordContinue({
            continuation_token: challengeRes.continuation_token,
            grant_type: "oob",
            oob: oobCode,
        });

        const submitRes = await resetPasswordSubmit(continueRes.continuation_token, newPassword);
        setLoginNotice("info", tr("msg.passwordResetInProgress"));

        const completionRes = await pollResetPasswordCompletion(submitRes.continuation_token, submitRes.poll_interval || 2);
        const tokenRes = await issueContinuationTokens(completionRes.continuation_token, email);
        setLoginNotice("success", tr("msg.resetSuccess"));
        renderNativeAuthenticatedUI(tokenRes);
    } catch (err) {
        setLoginNotice("error", err.error_description || err.message || tr("misc.unknownError"));
        showErrorDiagnostics(err);
        throw err;
    }
}

// ---------------------------------------------------------------------------
// MFA flow helper
// ---------------------------------------------------------------------------
async function handleMfaFlow(continuationToken) {
    // 4a. Introspect — discover available MFA challenge methods
    const introspectRes = await signInIntrospect(continuationToken);
    console.log("Introspect response:", introspectRes);

    const methods = introspectRes.methods || [];
    if (methods.length === 0) {
        alert(tr("msg.noMfaMethods"));
        return;
    }

    // 4b. Let the user pick an MFA method (or auto-select if only one)
    let selectedMethod;
    if (methods.length === 1) {
        selectedMethod = methods[0];
    } else {
        selectedMethod = await promptForMfaMethod(methods);
    }

    if (!selectedMethod) {
        alert(tr("msg.mfaCancelled"));
        return;
    }

    console.log("Selected MFA method:", selectedMethod);

    // 4c. Challenge with MFA — triggers the OOB code delivery
    const mfaChallengeRes = await signInChallengeMFA(
        introspectRes.continuation_token || continuationToken,
        selectedMethod.id
    );
    console.log("MFA challenge response:", mfaChallengeRes);

    // 4d. Prompt user for the OOB code
    const channelLabel = selectedMethod.challenge_channel === "sms" ? "SMS" : "email";
    const oobCode = await promptForOobCode(
        tr("msg.enterCodeVia", { channel: channelLabel, hint: selectedMethod.login_hint })
    );
    if (!oobCode) {
        alert(tr("msg.mfaCancelled"));
        return;
    }

    // 4e. Token with MFA
    const mfaTokenRes = await signInTokenMFA({
        continuation_token: mfaChallengeRes.continuation_token,
        oob: oobCode,
    });
    console.log("MFA token response:", mfaTokenRes);

    // const mfaTokenResSpecific = await signInTokenMFASpecific({
    //     continuation_token: mfaChallengeRes.continuation_token,
    //     oob: oobCode,
    // });
    // console.log("MFA token Specifc response:", mfaTokenResSpecific);
    renderNativeAuthenticatedUI(mfaTokenRes);
}

// ---------------------------------------------------------------------------
// MFA method selection prompt
// ---------------------------------------------------------------------------
function promptForMfaMethod(methods) {
    return new Promise((resolve) => {
        const dialog = document.getElementById("mfaMethodDialog");
        const listContainer = document.getElementById("mfaMethodList");
        const cancelBtn = document.getElementById("mfaMethodCancel");

        // Build a button for each method
        listContainer.innerHTML = "";
        methods.forEach((method) => {
            const channelLabel = method.challenge_channel === "sms" ? "SMS" : "Email";
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "mfa-method-btn";
            btn.innerHTML =
                `<span class="mfa-method-channel">${channelLabel}</span>` +
                `<span class="mfa-method-hint">${method.login_hint}</span>`;
            btn.addEventListener("click", () => {
                cleanup();
                resolve(method);
            });
            listContainer.appendChild(btn);
        });

        const onCancel = () => {
            cleanup();
            resolve(null);
        };
        const cleanup = () => {
            cancelBtn.removeEventListener("click", onCancel);
            if (dialog.open) dialog.close();
        };

        cancelBtn.addEventListener("click", onCancel);
        dialog.showModal();
    });
}
// ---------------------------------------------------------------------------
// MFA method registration prompt
// ---------------------------------------------------------------------------
function promptForMfaRegistration(methods) {
    return new Promise((resolve) => {
        const dialog = document.getElementById("mfaRegistrationDialog");
        const listContainer = document.getElementById("mfaRegistrationList");
        const submitBtn = document.getElementById("mfaRegistrationSubmit");
        const cancelBtn = document.getElementById("mfaRegistrationCancel");
        const phoneNumberContainer = document.getElementById("phoneNumberContainer");
        const phoneNumberInput = document.getElementById("phoneNumberInput");
        const emailDisplayContainer = document.getElementById("emailDisplayContainer");
        const emailDisplay = document.getElementById("emailDisplay");

        // Build a radio button for each method
        listContainer.innerHTML = "";
        let selectedMethod = null;

        methods.forEach((method, index) => {
            const channelLabel = method.challenge_channel === "sms" ? "SMS" : "Email";
            const radioId = `mfaRadio_${index}`;
            
            const radioContainer = document.createElement("div");
            radioContainer.className = "form-check";
            radioContainer.style.marginBottom = "10px";
            
            const radioInput = document.createElement("input");
            radioInput.type = "radio";
            radioInput.className = "form-check-input";
            radioInput.name = "mfaMethod";
            radioInput.id = radioId;
            radioInput.value = index;
            
            const label = document.createElement("label");
            label.className = "form-check-label";
            label.htmlFor = radioId;
            label.innerHTML = `<strong>${channelLabel}</strong>`;
            
            radioInput.addEventListener("change", () => {
                selectedMethod = method;
                
                // Show/hide appropriate input based on channel
                if (method.challenge_channel === "sms") {
                    phoneNumberContainer.style.display = "block";
                    emailDisplayContainer.style.display = "none";
                    phoneNumberInput.value = "";
                    phoneNumberInput.focus();
                } else {
                    phoneNumberContainer.style.display = "none";
                    emailDisplayContainer.style.display = "block";
                    emailDisplay.textContent = method.login_hint || "N/A";
                }
            });
            
            radioContainer.appendChild(radioInput);
            radioContainer.appendChild(label);
            listContainer.appendChild(radioContainer);
        });

        const onSubmit = (e) => {
            e.preventDefault();
            
            if (!selectedMethod) {
                alert(tr("msg.selectMfaMethod"));
                return;
            }
            
            // Validate phone number for SMS
            if (selectedMethod.challenge_channel === "sms") {
                const phoneNumber = phoneNumberInput.value.trim();
                const e164Pattern = /^\+\d{1,3}\s\d+(x\d+)?$/;
                
                if (!phoneNumber) {
                    alert(tr("msg.enterPhone"));
                    return;
                }
                
                if (!e164Pattern.test(phoneNumber)) {
                    alert(tr("msg.invalidPhone"));
                    return;
                }
                
                // Add phone number to the method object
                selectedMethod.phoneNumber = phoneNumber;
            }
            
            cleanup();
            resolve(selectedMethod);
        };

        const onCancel = () => {
            cleanup();
            resolve(null);
        };

        const cleanup = () => {
            submitBtn.removeEventListener("click", onSubmit);
            cancelBtn.removeEventListener("click", onCancel);
            phoneNumberContainer.style.display = "none";
            emailDisplayContainer.style.display = "none";
            phoneNumberInput.value = "";
            if (dialog.open) dialog.close();
        };

        submitBtn.addEventListener("click", onSubmit);
        cancelBtn.addEventListener("click", onCancel);
        dialog.showModal();
    });
}
// ---------------------------------------------------------------------------
// OOB code prompt
// ---------------------------------------------------------------------------
function promptForOobCode(labelText) {
    return new Promise((resolve) => {
        const dialog = document.getElementById("codeDialog");
        const label = document.getElementById("codeDialogLabel");
        const input = document.getElementById("verificationCode");
        const confirmBtn = document.getElementById("confirmBtn");
        const cancelBtn = document.getElementById("cancel");

        label.textContent = labelText || "Enter the verification code:";
        if (!labelText) {
            label.textContent = tr("dialog.codePrompt");
        }
        input.value = "";
        dialog.showModal();

        const onConfirm = () => {
            cleanup();
            resolve(input.value.trim());
        };
        const onCancel = () => {
            cleanup();
            resolve(null);
        };
        const cleanup = () => {
            confirmBtn.removeEventListener("click", onConfirm);
            cancelBtn.removeEventListener("click", onCancel);
            if (dialog.open) dialog.close();
        };

        confirmBtn.addEventListener("click", onConfirm);
        cancelBtn.addEventListener("click", onCancel);
    });
}

// ---------------------------------------------------------------------------
// API helpers — payloads aligned with the EEID Postman collection
// ---------------------------------------------------------------------------

// Signin - Initiate
async function signInStart(username) {
    const payloadExt = {
        username,
        client_id: msalConfig.auth.clientId,
        challenge_type: NATIVE_AUTH.signInChallengeType,
        capabilities: NATIVE_AUTH.capabilities,
    };
    return await postRequest(ENV.urlOauthInit, payloadExt, { flowName: "signin", flowStep: "initiate" });
}

// SignIn - Challenge
async function signInChallenge(token) {
    const payloadExt = {
        continuation_token: token,
        client_id: msalConfig.auth.clientId,
        challenge_type: NATIVE_AUTH.signInChallengeType,
        capabilities: NATIVE_AUTH.capabilities,
    };
    return await postRequest(ENV.urlOauthChallenge, payloadExt, { flowName: "signin", flowStep: "challenge" });
}

// SignIn - Challenge with MFA
async function signInChallengeMFA(token, mfaChallengeId) {
    const payloadExt = {
        continuation_token: token,
        client_id: msalConfig.auth.clientId,
        challenge_type: NATIVE_AUTH.signInChallengeType,
        capabilities: NATIVE_AUTH.capabilities,
    };
    if (mfaChallengeId) {
        payloadExt.id = mfaChallengeId;
    }
    return await postRequest(ENV.urlOauthChallenge, payloadExt, { flowName: "signin", flowStep: "mfa-challenge" });
}

// SignIn - Token (password grant)
async function signInTokenRequest(request, debug = false) {
    var payloadExt;
    if (debug) {
        payloadExt = {
            continuation_token: request.continuation_token,
            client_id: msalConfig.auth.clientId,
            challenge_type: NATIVE_AUTH.signInChallengeType,
            grant_type: request.grant_type,
            scope: NATIVE_AUTH.scopes,
            client_info: "true",
        };
    } else {
        payloadExt = {
            continuation_token: request.continuation_token,
            client_id: msalConfig.auth.clientId,
            challenge_type: NATIVE_AUTH.signInChallengeType,
            grant_type: request.grant_type,
            scope: NATIVE_AUTH.scopes,
            claims: JSON.stringify({ access_token: { acrs: { value: "c4", essential: true } } }),
            client_info: "true",
        };
    }

    if (request.grant_type === "password") {
        payloadExt.password = request.password;
    }

    if (request.grant_type === "oob") {
        payloadExt.oob = request.oob;
    }

    return await postRequest(ENV.urlOauthToken, payloadExt, { flowName: "signin", flowStep: `token:${request.grant_type}` });
}

// SignIn - Token with MFA (mfa_oob grant)
async function signInTokenMFA(request) {
    const payloadExt = {
        continuation_token: request.continuation_token,
        client_id: msalConfig.auth.clientId,
        challenge_type: NATIVE_AUTH.signInChallengeType,
        scope: NATIVE_AUTH.scopes,
        grant_type: "mfa_oob",
        oob: request.oob,
    };
    return await postRequest(ENV.urlOauthToken, payloadExt, { flowName: "signin", flowStep: "token:mfa_oob" });
}
async function signInTokenMFASpecific(request) {
    const payloadExt = {
        continuation_token: request.continuation_token,
        client_id: msalConfig.auth.clientId,
        challenge_type: NATIVE_AUTH.signInChallengeType,
        scope: "openid profile",
        grant_type: "mfa_oob",
        oob: request.oob,
    };
    return await postRequest(ENV.urlOauthToken, payloadExt, { flowName: "signin", flowStep: "token:mfa_oob_specific" });
}

async function issueContinuationTokens(continuationToken, username) {
    return await postRequest(ENV.urlOauthToken, {
        continuation_token: continuationToken,
        client_id: msalConfig.auth.clientId,
        challenge_type: NATIVE_AUTH.signInChallengeType,
        grant_type: "continuation_token",
        scope: NATIVE_AUTH.scopes,
        client_info: "true",
        username,
    }, { flowName: "native-auth", flowStep: "token:continuation_token" });
}

// SignIn - Introspect
async function signInIntrospect(token) {
    const payload = {
        continuation_token: token,
        client_id: msalConfig.auth.clientId,
    };
    return await postRequest(ENV.urlOauthIntrospect, payload, { flowName: "signin", flowStep: "introspect" });
}

async function signUpStart(username, password, attributes) {
    const payload = {
        client_id: msalConfig.auth.clientId,
        username,
        challenge_type: NATIVE_AUTH.signUpChallengeType,
        capabilities: NATIVE_AUTH.capabilities,
    };

    if (password) payload.password = password;
    if (attributes) payload.attributes = JSON.stringify(attributes);

    return await postRequest(ENV.urlSignupStart, payload, { flowName: "signup", flowStep: "start" });
}

async function signUpChallenge(continuationToken) {
    return await postRequest(ENV.urlSignupChallenge, {
        continuation_token: continuationToken,
        client_id: msalConfig.auth.clientId,
        challenge_type: NATIVE_AUTH.signUpChallengeType,
    }, { flowName: "signup", flowStep: "challenge" });
}

async function signUpContinue(request) {
    const payload = {
        continuation_token: request.continuation_token,
        client_id: msalConfig.auth.clientId,
        grant_type: request.grant_type,
    };

    if (request.password) payload.password = request.password;
    if (request.oob) payload.oob = request.oob;
    if (request.attributes) payload.attributes = JSON.stringify(request.attributes);

    return await postRequest(ENV.urlSignupContinue, payload, { flowName: "signup", flowStep: `continue:${request.grant_type}` });
}

async function resetPasswordStart(username) {
    return await postRequest(ENV.urlResetPasswordStart, {
        client_id: msalConfig.auth.clientId,
        username,
        challenge_type: NATIVE_AUTH.resetPasswordChallengeType,
    }, { flowName: "reset-password", flowStep: "start" });
}

async function resetPasswordChallenge(continuationToken) {
    return await postRequest(ENV.urlResetPasswordChallenge, {
        continuation_token: continuationToken,
        client_id: msalConfig.auth.clientId,
        challenge_type: NATIVE_AUTH.resetPasswordChallengeType,
    }, { flowName: "reset-password", flowStep: "challenge" });
}

async function resetPasswordContinue(request) {
    return await postRequest(ENV.urlResetPasswordContinue, {
        continuation_token: request.continuation_token,
        client_id: msalConfig.auth.clientId,
        grant_type: request.grant_type,
        oob: request.oob,
    }, { flowName: "reset-password", flowStep: "continue:oob" });
}

async function resetPasswordSubmit(continuationToken, newPassword) {
    return await postRequest(ENV.urlResetPasswordSubmit, {
        continuation_token: continuationToken,
        client_id: msalConfig.auth.clientId,
        new_password: newPassword,
    }, { flowName: "reset-password", flowStep: "submit" });
}

async function resetPasswordPollCompletion(continuationToken) {
    return await postRequest(ENV.urlResetPasswordPollCompletion, {
        continuation_token: continuationToken,
        client_id: msalConfig.auth.clientId,
    }, { flowName: "reset-password", flowStep: "poll_completion" });
}

async function pollResetPasswordCompletion(continuationToken, pollIntervalSeconds) {
    let token = continuationToken;
    for (let attempt = 0; attempt < 12; attempt += 1) {
        await waitFor(Math.max(1, pollIntervalSeconds || 2) * 1000);
        const response = await resetPasswordPollCompletion(token);
        if (response.status === "succeeded") {
            return response;
        }
        if (response.status === "failed") {
            throw {
                error: "reset_password_failed",
                error_description: tr("msg.loginError", { message: "Password reset failed." }),
                flowName: "reset-password",
                flowStep: "poll_completion",
                endpoint: ENV.urlResetPasswordPollCompletion,
                responsePayload: response,
            };
        }
        token = response.continuation_token || token;
    }

    throw {
        error: "reset_password_timeout",
        error_description: tr("msg.loginError", { message: "Password reset did not complete in time." }),
        flowName: "reset-password",
        flowStep: "poll_completion",
        endpoint: ENV.urlResetPasswordPollCompletion,
    };
}

// Registration - Introspect 
async function registerIntrospect(token) {
    try {        
        const res = await postRequest(ENV.urlRegisterIntrospect, {
        continuation_token: token,
        client_id: msalConfig.auth.clientId,
        }, { flowName: "registration", flowStep: "introspect" });
        return res;
    } catch (err) {
        console.error("Register introspect error:", err);
        return [];
    }    
}
// Registration - Challenge
async function registerChallenge(token, methodId, phoneNumber) {
    try {        
        const res = await postRequest(ENV.urlRegisterChallenge, {
        continuation_token: token,
        client_id: msalConfig.auth.clientId,
        challenge_type: "oob",
        challenge_channel: methodId,
        challenge_target: phoneNumber || undefined
        }, { flowName: "registration", flowStep: "challenge" });
        return res || {};
    } catch (err) {
        console.error("Register challenge error:", err);
        throw err;
    }    
}
// Registration - Continue
async function registerContinue(token, code) {
      try {        
        const res = await postRequest(ENV.urlRegisterContinue, {
        continuation_token: token,
        client_id: msalConfig.auth.clientId,
        grant_type: "oob",
        oob: code
        }, { flowName: "registration", flowStep: "continue:oob" });
        return res || {};
    } catch (err) {
        console.error("Register continue error:", err);
        throw err;
    }    
}

// Handle MFA Registration 
async function handleRegistrationFlow(continuationToken ) {
    // 5a. Introspect — discover available MFA challenge methods
    const introspectReg = await registerIntrospect(continuationToken);
    console.log("Introspect response:", introspectReg);

    const methods = introspectReg.methods || [];
    if (methods.length === 0) {
        alert("No MFA methods available for this account.");
        return;
    }

    // 5b. Let the user pick an MFA method (or auto-select if only one)
    let selectedMethod;
    if (methods.length === 1) {
        selectedMethod = methods[0];
        // For single method, still prompt for phone number if it's SMS
        if (selectedMethod.challenge_channel === "sms") {
            selectedMethod = await promptForMfaRegistration([selectedMethod]);
        }
    } else {
        selectedMethod = await promptForMfaRegistration(methods);
    }

    if (!selectedMethod) {
        alert("MFA registration cancelled.");
        return;
    }

    console.log("Selected MFA method:", selectedMethod);

    // 5c. Challenge with MFA — triggers the OOB code delivery
    const mfaChallengeReg = await registerChallenge(
        introspectReg.continuation_token || continuationToken,
        selectedMethod.challenge_channel,
        selectedMethod.challenge_channel === "sms" ? selectedMethod.phoneNumber : selectedMethod.login_hint
       
    );
    console.log("MFA challenge response:", mfaChallengeReg);

    // 5d. Prompt user for the OOB code    
    const channelLabel = selectedMethod.challenge_channel === "sms" ? "SMS" : "email";
    const targetHint = selectedMethod.phoneNumber || selectedMethod.login_hint;
    const oobCode = await promptForOobCode(
        `Enter the verification code sent via ${channelLabel} to ${targetHint}:`
    );
    if (!oobCode) {
        alert("MFA verification cancelled.");
        return;
    }

    // 5e. Continue registration with the OOB code
    const registrationContinueRes = await registerContinue(mfaChallengeReg.continuation_token, oobCode);
    console.log("Registration continue response:", registrationContinueRes);

    // Build the request for the token endpoint
    const mfaTokenRes = await issueContinuationTokens(registrationContinueRes.continuation_token, FLOW_STATE.signIn.email || "");
    console.log("Token response:", mfaTokenRes);
    renderNativeAuthenticatedUI(mfaTokenRes);
}

function loginInternal() {
    setLoginNotice("info", "Internal Entra ID flow is not enabled in this sample.");
}