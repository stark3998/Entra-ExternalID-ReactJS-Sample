// nativeAuth.js
// Native Auth login flow (email/password via Entra Native Auth APIs)
// Matches the "EEID Native Auth" Postman collection.
// Depends on: config.js, httpClient.js, ui.js

let TokenSignIn = {
    continuation_token: "",
    grant_type: "",
    password: "",
    oob: "",
};

function tr(key, params) {
    if (typeof window.t === "function") return window.t(key, params);
    return key;
}

// ---------------------------------------------------------------------------
// Main login orchestration
// ---------------------------------------------------------------------------
async function login() {
    interactionType = "native";
    const email = document.getElementById("emailText").value;
    const password = document.getElementById("passwordText").value;

    if (!email || !password) {
        alert(tr("msg.enterEmailPassword"));
        return;
    }

    try {
        console.log("Signing in with email:", email);

        // 1. Initiate
        const initRes = await signInStart(email);
        console.log("Sign-in initiated:", initRes);

        // 2. Challenge (password)
        const challengeRes = await signInChallenge(initRes.continuation_token);
        console.log("Sign-in challenge response:", challengeRes);

        // 3. Token (password)
        TokenSignIn.continuation_token = challengeRes.continuation_token;
        TokenSignIn.grant_type = "password";
        TokenSignIn.password = password;

        let tokenRes;
        try {
            tokenRes = await signInTokenRequest(TokenSignIn);
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
        console.error("Login error:", err);
        const message = err.error_description || err.message || JSON.stringify(err);
        alert(tr("msg.loginError", { message }));
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
        challenge_type: "password oob redirect",
        capabilities: "registration_required mfa_required",
    };
    return await postRequest(ENV.urlOauthInit, payloadExt);
}

// SignIn - Challenge
async function signInChallenge(token) {
    const payloadExt = {
        continuation_token: token,
        client_id: msalConfig.auth.clientId,
        challenge_type: "password oob redirect",
        capabilities: "registration_required mfa_required",
    };
    return await postRequest(ENV.urlOauthChallenge, payloadExt);
}

// SignIn - Challenge with MFA
async function signInChallengeMFA(token, mfaChallengeId) {
    const payloadExt = {
        continuation_token: token,
        client_id: msalConfig.auth.clientId,
        challenge_type: "password oob redirect",
        capabilities: "registration_required mfa_required",
    };
    if (mfaChallengeId) {
        payloadExt.id = mfaChallengeId;
    }
    return await postRequest(ENV.urlOauthChallenge, payloadExt);
}

// SignIn - Token (password grant)
async function signInTokenRequest(request, debug = false) {
    var payloadExt;
    if (debug) {
        payloadExt = {
            continuation_token: request.continuation_token,
            client_id: msalConfig.auth.clientId,
            challenge_type: "password oob redirect",
            grant_type: request.grant_type,
            scope: "openid offline_access",
            client_info: "true",
        };
    } else {
        payloadExt = {
            continuation_token: request.continuation_token,
            client_id: msalConfig.auth.clientId,
            challenge_type: "password oob redirect",
            grant_type: request.grant_type,
            scope: "openid offline_access UserAuthMethod-Phone.ReadWrite.All UserAuthenticationMethod.Read",
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

    return await postRequest(ENV.urlOauthToken, payloadExt);
}

// SignIn - Token with MFA (mfa_oob grant)
async function signInTokenMFA(request) {
    const payloadExt = {
        continuation_token: request.continuation_token,
        client_id: msalConfig.auth.clientId,
        challenge_type: "password oob redirect",
        scope: "openid offline_access api://48a52df3-eefa-4c31-aacb-7cc69ebc2166/access_as_user",
        grant_type: "mfa_oob",
        oob: request.oob,
    };
    return await postRequest(ENV.urlOauthToken, payloadExt);
}
async function signInTokenMFASpecific(request) {
    const payloadExt = {
        continuation_token: request.continuation_token,
        client_id: msalConfig.auth.clientId,
        challenge_type: "password oob redirect",
        scope: "openid profile",
        grant_type: "mfa_oob",
        oob: request.oob,
    };
    return await postRequest(ENV.urlOauthToken, payloadExt);
}

// SignIn - Introspect
async function signInIntrospect(token) {
    const payload = {
        continuation_token: token,
        client_id: msalConfig.auth.clientId,
    };
    return await postRequest(ENV.urlOauthIntrospect, payload);
}

// Registration - Introspect 
async function registerIntrospect(token) {
    try {        
        const res = await postRequest(ENV.urlRegisterIntrospect, {
        continuation_token: token,
        client_id: msalConfig.auth.clientId,
        });
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
        });
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
        });
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
    const request = {
        continuation_token: registrationContinueRes.continuation_token,
        grant_type: "continuation_token"        
    };
    // 5f. Token with MFA (call the non-MFA token endpoint though)
    const mfaTokenRes = await signInTokenRequest(request);
    console.log("Token response:", mfaTokenRes);
    renderNativeAuthenticatedUI(mfaTokenRes);
}