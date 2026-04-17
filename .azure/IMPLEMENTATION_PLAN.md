# Entra Identity One-Stop Solution - Implementation Plan

**Date:** April 17, 2026  
**Status:** Planned  
**Estimated Duration:** 12-16 weeks (phased)  

---

## Executive Summary

This document outlines a comprehensive roadmap to transform the ExternalID-ReactJS-Example into a **one-stop Entra identity and authentication solution** with enterprise-grade features, operator workflows, and deep identity introspection.

The plan is organized in three phases:
- **Phase 1 (MVP, Weeks 1-4):** Core identity flows (sign-up, SSPR, security, error handling)
- **Phase 2 (Depth, Weeks 5-10):** Rich identity explorer, policies, Graph integration
- **Phase 3 (Enterprise, Weeks 11-16):** Observability, hardening, automation, guided workflows

---

## Phase 1: Core Identity Flows & Security (Weeks 1-4)

### Goals
- Complete the identity trinity: sign-in ✅, sign-up ⬜, sign-out/SSPR ⬜
- Hardened token and session handling
- Enterprise-grade error reporting and troubleshooting
- Foundation for all future features

### 1.1 Sign-Up Flow (New Capability)

**Files to Modify/Create:**
- `public/nativeAuth.js` – Add sign-up handlers and flow orchestration
- `public/index.html` – Add sign-up UI tab/dialog and controls
- `public/config.js` – Add sign-up endpoints
- `public/ui.js` – Add sign-up success rendering

**Spec:**
1. **signUpStart()**: POST to `/signup/v1.0/start` with `client_id`, `username`, `challenge_type`, and optionally `password` plus required `attributes`
2. **signUpChallenge()**: POST to `/signup/v1.0/challenge` with the returned `continuation_token` and supported challenge types such as `oob password redirect`
3. **signUpContinue()**: POST to `/signup/v1.0/continue` to submit the OOB code, any remaining required attributes, and password if it was not already submitted during `/start`
4. **signUpToken()**: POST to `/oauth2/v2.0/token` using the final `continuation_token` to issue ID and access tokens for automatic post-sign-up sign-in
5. **Branch handling**: Detect `redirect`, `user_already_exists`, attribute validation failures, and password policy suberrors and pivot flow or show inline remediation

**Native API contract details:**
- `/signup/v1.0/start`
  - Required: `client_id`, `username`, `challenge_type`
  - Optional: `password`, `attributes`, `capabilities`
  - Success: returns `continuation_token`
  - Important errors: `user_already_exists`, `invalid_request`, `invalid_client`, `unsupported_challenge_type`, `invalid_grant`
- `/signup/v1.0/challenge`
  - Required: `client_id`, `continuation_token`
  - Optional: `challenge_type`
  - Success: typically returns `challenge_type: oob`, `continuation_token`, `challenge_channel`, `challenge_target_label`, `code_length`, `interval`
- `/signup/v1.0/continue`
  - Required: `client_id`, `continuation_token`
  - Conditional: `grant_type=password` plus `password`, or `grant_type=oob` plus `oob`, and optionally remaining `attributes`
  - Success: returns another `continuation_token` until requirements are satisfied
- `/oauth2/v2.0/token`
  - Required: `client_id`, `continuation_token`, flow-specific grant fields
  - Success: returns `access_token`, `id_token`, and optionally `refresh_token`

**Deliverables:**
- Sign-up tab in login view with email + password input
- Sign-up method discovery dialog (email/SMS)
- Sign-up OOB code prompt
- Successful sign-up renders authenticated view (same as native sign-in)
- Error/retry logic for invalid codes, expired tokens

**Testing:**
- Happy path: email → password → MFA method select → OOB entry → success
- Branch: MFA already registered, fall back to sign-in
- Error: Expired token, invalid code, network retry

---

### 1.2 SSPR (Self-Service Password Reset) Flow (New Capability)

**Files to Modify/Create:**
- `public/nativeAuth.js` – Add SSPR handlers
- `public/index.html` – Add "Forgot Password?" link and SSPR dialog
- `public/config.js` – Add SSPR endpoints
- `public/ui.js` – Add SSPR completion rendering

**Spec:**
1. **resetPasswordStart()**: POST to `/resetpassword/v1.0/start` with `client_id`, `username`, and `challenge_type=oob redirect`
2. **resetPasswordChallenge()**: POST to `/resetpassword/v1.0/challenge` with the returned `continuation_token` to issue an email or SMS OOB challenge
3. **resetPasswordContinue()**: POST to `/resetpassword/v1.0/continue` with `grant_type=oob` and `oob` to validate the one-time passcode
4. **resetPasswordSubmit()**: POST to `/resetpassword/v1.0/submit` with `new_password` and the latest `continuation_token`
5. **resetPasswordPollCompletion()**: POST to `/resetpassword/v1.0/poll_completion` until the reset request returns `status: succeeded`
6. **Optional auto sign-in**: POST to `/oauth2/v2.0/token` with the continuation token returned from `poll_completion`

**Native API contract details:**
- `/resetpassword/v1.0/start`
  - Required: `client_id`, `username`, `challenge_type`
  - Success: returns `continuation_token`
  - Supported challenge types: `oob`, `redirect`
- `/resetpassword/v1.0/challenge`
  - Required: `client_id`, `continuation_token`, `challenge_type`
  - Success: issues the challenge to a preferred recovery credential and returns a new `continuation_token`
- `/resetpassword/v1.0/continue`
  - Required: `client_id`, `continuation_token`, `grant_type=oob`, `oob`
  - Success: returns `expires_in` and a new `continuation_token` for the submit step
- `/resetpassword/v1.0/submit`
  - Required: `client_id`, `continuation_token`, `new_password`
  - Success: returns a new `continuation_token` and `poll_interval`
- `/resetpassword/v1.0/poll_completion`
  - Required: `client_id`, `continuation_token`
  - Success: returns `status` and a continuation token; when `status=succeeded`, that token can be used with `/oauth2/v2.0/token`

**Deliverables:**
- "Forgot Password?" link on login form
- SSPR dialog with email entry
- Native reset-password challenge selection and resend handling
- OOB code + new password entry
- Polling state after submit until completion succeeds or fails
- Success message with optional auto sign-in or return-to-login behavior
- Validation: password complexity rules, OOB expiration, retry logic

**Testing:**
- Happy path: email → challenge → OOB entry → new password → poll completion → success
- Error: Email not found, OOB expired, weak password

---

### 1.3 Token & Session Security

**Files to Modify:**
- `public/config.js` – Expand cache options
- `public/msalAuth.js` – Switch to sessionStorage for MSAL cache
- `public/ui.js` – Add demo mode toggle controlling token visibility
- `public/app.css` – Add demo mode label/warning

**Changes:**
1. **MSAL cache**: Move from `localStorage` (persistent) to `sessionStorage` (single tab/session only)
   - Rationale: Better default security, still retains across page reloads within the same browser tab
   - Keep `storeAuthStateInCookie: false` for SPA
   
2. **Demo Mode Toggle**: Add checkbox in settings/UI
   - When **OFF** (default): Raw tokens hidden, only decoded claims shown
   - When **ON** (explicit): Show full raw tokens + copy-to-clipboard buttons
   - Persist toggle in `sessionStorage`
   
3. **Token Display Control**:
   - By default, hide raw token bodies (show decoded only)
   - "Show Raw Token" button appears only when demo mode ON
   - Add warning: "Raw tokens contain sensitive credentials"

**Code Locations:**
```javascript
// In public/msalAuth.js, change:
cache: {
  cacheLocation: "sessionStorage", // was "localStorage"
  storeAuthStateInCookie: false,
}

// In public/ui.js, add:
function isDemoModeEnabled() {
  return sessionStorage.getItem("demoMode") === "true";
}

// Toggle raw token visibility based on demo mode
```

**Deliverables:**
- Settings page includes "Demo Mode" toggle with warning
- Raw tokens hidden by default, shown only in demo mode
- Decoded claims always visible
- Audit log note: "Demo Mode toggled by user"

---

### 1.4 Error Handling & Operator Diagnostics

**Files to Modify/Create:**
- `public/httpClient.js` – Enhance with error capture and trace IDs
- `public/nativeAuth.js` – Capture all error responses with context
- `public/ui.js` – Add error panel with rich diagnostics
- `public/index.html` – Add error panel dialog
- `public/app.css` – Style error panel

**Error Panel Fields:**
```
┌─ Error Diagnostics ──────────────────────────────────────┐
│ 🔴 Error Status:       400 Bad Request                    │
│ 🔑 Error Code:         mfa_required                       │
│ 📝 Error Description:  MFA challenge required             │
│ 🌐 API Endpoint:       /oauth2/v2.0/token                │
│ 📍 Flow Step:          Token Request (MFA)               │
│ ⏱️  Timestamp:          2026-04-17 14:32:15 UTC          │
│ 📊 Trace ID:           aa1bb22c-3344-5566-778899aabbcc  │
│ 🔗 Correlation ID:     xx99yy88zz77ww66vv55uu44tt33     │
│ 💾 Request Payload:    {continuation_token: "***", ...}  │
│ 📤 Response Payload:   {suberror: "mfa_required", ...}   │
│    
│  [Retry] [Copy Diagnostics] [Contact Support]             │
└──────────────────────────────────────────────────────────┘
```

**Implementation:**
1. **httpClient.js**: Intercept all responses (success and error)
   - Extract trace_id, correlation_id from response headers
   - Log request/response body (mask sensitive fields like passwords)
   - Add timestamp and flow step context

2. **nativeAuth.js**: Wrap each API call with error context
   ```javascript
   try {
     const res = await signInStart(email);
   } catch (err) {
     err.flowStep = "Sign-In Initiate";
     err.endpoint = ENV.urlOauthInit;
     throw err;
   }
   ```

3. **ui.js**: Add error panel function
   ```javascript
   function showErrorDiagnostics(error, flowStep, endpoint) {
     // Build panel with all fields above
     // Make copyable for support handoff
   }
   ```

4. **index.html**: Add error dialog
   ```html
   <dialog id="errorDialog" class="error-dialog">
     <div id="errorDiagnosticsPanel"></div>
     <button onclick="copyErrorDiagnostics()">Copy Diagnostics</button>
     <button onclick="document.getElementById('errorDialog').close()">Close</button>
   </dialog>
   ```

**Deliverables:**
- All authentication errors show operator-friendly panel with trace IDs
- Correlation ID shown for multi-step requests
- Copy-to-clipboard for support/logs
- Error history (last 10 errors) stored and retrievable

**Testing:**
- Trigger mfa_required error → panel shows all fields
- Trigger network timeout → shows endpoint and retry suggestion
- Verify trace IDs are unique per request

---

### 1.5 File-by-File Implementation Sequence

Implement Phase 1 in the following order. This sequence is dependency-aware, minimizes rework, and keeps the UI changes behind stable API/config contracts.

#### Step 1: `public/config.js`

**Why first**
- All Native Auth and Graph-facing flows depend on endpoint constants, scopes, feature flags, and cache settings defined here.

**Changes**
- Add sign-up endpoints:
  - `urlSignupStart`
  - `urlSignupChallenge`
  - `urlSignupContinue`
- Add SSPR endpoints:
  - `urlResetPasswordStart`
  - `urlResetPasswordChallenge`
  - `urlResetPasswordContinue`
  - `urlResetPasswordSubmit`
  - `urlResetPasswordPollCompletion`
- Add feature flags and defaults:
  - `DEMO_MODE_DEFAULT`
  - `ENABLE_OPERATOR_MODE`
  - `ENABLE_BETA_GRAPH`
- Split Graph scopes into buckets:
  - baseline auth scopes
  - self-service Graph scopes
  - optional operator scopes
- Change MSAL cache defaults to Phase 1 target values if still defined here.

**Output contract**
- All downstream files should read from a single configuration surface and not hard-code URLs or scopes.

**Done when**
- No endpoint URL is hard-coded in `public/nativeAuth.js` or `public/ui.js`.
- Config clearly separates native auth, Graph self-service, and operator/beta concerns.

#### Step 2: `public/httpClient.js`

**Why second**
- Every auth flow and Graph call needs a consistent HTTP wrapper before new features are added.

**Changes**
- Create or extend a normalized POST helper for form-urlencoded Entra calls.
- Add standardized request metadata:
  - `flowName`
  - `flowStep`
  - `endpoint`
  - `startedAt`
- Extract diagnostics from success and error responses:
  - `trace_id`
  - `correlation_id`
  - status code
  - response body
- Mask sensitive request fields before logging:
  - `password`
  - `oob`
  - raw tokens
- Return a normalized error object with all fields needed by the UI.

**Phase 1 helper functions to add**
- `postForm(endpoint, payload, context)`
- `maskSensitiveFields(payload)`
- `normalizeAuthError(error, context)`
- `extractResponseDiagnostics(response)`

**Done when**
- Native auth callers can throw one consistent error shape.
- Error panel requirements can be fulfilled without additional parsing logic in every caller.

#### Step 3: `public/nativeAuth.js`

**Why third**
- This file owns the core orchestration logic and should be refactored only after config and transport are stable.

**Changes**
- Refactor existing sign-in methods to use the normalized HTTP client.
- Add a dedicated sign-up flow implementation:
  - `signUp()`
  - `signUpStart()`
  - `signUpChallenge()`
  - `signUpContinue()`
  - `signUpToken()`
- Add a dedicated SSPR flow implementation:
  - `resetPassword()`
  - `resetPasswordStart()`
  - `resetPasswordChallenge()`
  - `resetPasswordContinue()`
  - `resetPasswordSubmit()`
  - `resetPasswordPollCompletion()`
- Keep registration-required logic separate from sign-up logic.
- Attach `flowStep` and `endpoint` context to all caught errors before surfacing them.
- Add state containers for in-progress sign-up and reset flows so continuation tokens are not mixed with sign-in state.

**Refactor target**
- Separate orchestration from primitive API calls.
- Avoid sharing mutable globals like `TokenSignIn` across unrelated flows.

**Done when**
- Sign-in, sign-up, MFA registration, and SSPR are separate orchestration branches.
- No flow depends on repurposing another flow’s continuation-token state.
- The reset-password flow follows `start -> challenge -> continue -> submit -> poll_completion -> optional token`.

#### Step 4: `public/ui.js`

**Why fourth**
- Once transport and flow orchestration are stable, wire the rendering and session-state logic.

**Changes**
- Add Demo Mode state helpers:
  - `isDemoModeEnabled()`
  - `setDemoMode(value)`
- Add raw token visibility controls based on demo mode.
- Add error diagnostics helpers:
  - `showErrorDiagnostics(error)`
  - `copyErrorDiagnostics()`
  - `pushErrorHistory(error)`
- Add sign-up completion UI and SSPR completion UI.
- Add a lightweight event/history store for Phase 1 diagnostics.
- Keep token rendering and profile rendering separate from auth-flow orchestration.

**UI responsibilities in Phase 1**
- Render authenticated state
- Render unauthenticated state
- Render sign-up success or conflict state
- Render SSPR completion and return-to-login state
- Render diagnostics dialog content

**Done when**
- The UI can render every Phase 1 branch without custom `alert()` fallbacks being the only experience.
- Raw tokens are hidden unless demo mode is enabled.

#### Step 5: `public/index.html`

**Why fifth**
- After the UI contract exists, add the required DOM for new flows and diagnostics.

**Changes**
- Add sign-up entry points:
  - tab, button, or alternate form state
- Add SSPR entry points:
  - “Forgot Password?” trigger
  - reset dialog or dedicated panel
- Add missing form fields for sign-up attributes if required by your user flow.
- Add error diagnostics dialog markup.
- Add demo mode toggle surface if it belongs in the main app rather than settings only.

**DOM elements to add**
- `#signUpDialog` or equivalent sign-up panel
- `#forgotPasswordDialog` or equivalent reset panel
- `#errorDialog`
- `#errorDiagnosticsPanel`
- optional `#demoModeToggle`

**Done when**
- No JS feature depends on dynamically creating core modal structure at runtime.
- All new flows have dedicated DOM anchors.

#### Step 6: `public/app.css`

**Why sixth**
- Style after the DOM structure is stable.

**Changes**
- Add styles for:
  - sign-up panels
  - forgot-password panels
  - error dialog and diagnostics layout
  - demo mode warning badge
  - hidden-vs-visible raw token states
- Ensure new dialogs match the existing white, centered design system.
- Add compact responsive layout rules so Phase 1 features remain usable on smaller screens.

**Done when**
- All new controls feel visually integrated with the existing app.
- Diagnostics content is readable without layout overflow.

#### Step 7: `public/msalAuth.js`

**Why seventh**
- This is a focused security/config cleanup step after the main native-auth flows are in place.

**Changes**
- Switch MSAL cache location to `sessionStorage`.
- Ensure silent token acquisition uses the new scope buckets from config.
- Respect demo mode when passing tokens to UI for raw display.
- Keep locale-from-claims logic intact.

**Done when**
- MSAL session behavior matches the new Phase 1 security posture.
- Redirect and popup flows still render into the same authenticated UI model.

#### Step 8: `server.js`

**Why eighth**
- Server-side validation should land after the client-side config model is finalized.

**Changes**
- Add startup validation for required identity settings:
  - `CLIENT_ID`
  - `TENANT_ID`
  - `AUTHORITY` or its derived components
  - redirect URI consistency
- Add Phase 1 runtime config flags:
  - demo mode default
  - operator mode enabled/disabled
  - beta Graph enabled/disabled
- Fail fast on placeholders and malformed values.

**Done when**
- `npm start` fails with actionable config messages instead of partially starting with broken auth settings.

#### Step 9: `.env.example`

**Why ninth**
- The env template should reflect the final Phase 1 config surface after implementation choices are settled.

**Changes**
- Add or document:
  - `DEMO_MODE`
  - `ENABLE_OPERATOR_MODE`
  - `ENABLE_BETA_GRAPH`
  - any SSPR- or sign-up-specific config toggles
  - any Graph scope or CORS flags introduced in Phase 1
- Group variables by runtime concern:
  - App
  - Entra Native Auth
  - Graph
  - UI / Demo

**Done when**
- A new operator can configure the entire Phase 1 experience from `.env.example` without guessing hidden flags.

#### Step 10: `tests/phase1.smoke.test.js`

**Why tenth**
- Tests should validate the finished Phase 1 flow contract, not drive the initial implementation structure.

**Changes**
- Add smoke coverage for:
  - existing sign-in happy path
  - MFA-required branch
  - registration-required branch
  - sign-up happy path
  - SSPR happy path
  - demo mode token visibility
  - diagnostics dialog appearance on auth failure

**Done when**
- The Phase 1 flows can be validated with one repeatable smoke run.

#### Step 11: `README.md`

**Why last**
- Documentation should capture the implemented behavior, not the intended behavior.

**Changes**
- Add a Phase 1 operator guide section with:
  - sign-up flow sequence
  - SSPR flow sequence
  - demo mode explanation
  - diagnostics panel usage
  - required scopes and app-registration settings

**Done when**
- A new developer can run and exercise all Phase 1 flows without reading source first.

### Recommended Commit / Delivery Slices

Use these slices even if you do not create git commits for each one.

1. **Config and HTTP foundation**
   - `public/config.js`
   - `public/httpClient.js`
   - `server.js`
   - `.env.example`
2. **Sign-up and SSPR orchestration**
   - `public/nativeAuth.js`
3. **Phase 1 UI surfaces**
   - `public/ui.js`
   - `public/index.html`
   - `public/app.css`
4. **MSAL security alignment**
   - `public/msalAuth.js`
5. **Validation and docs**
   - `tests/phase1.smoke.test.js`
   - `README.md`

### Phase 1 Exit Criteria

Phase 1 is complete only when all of the following are true:
- Sign-up uses `/signup/v1.0/*` and issues tokens successfully.
- SSPR has a usable end-to-end flow with success and error states.
- Demo mode governs raw token visibility.
- MSAL uses `sessionStorage`.
- Error diagnostics show trace ID, correlation ID, flow step, endpoint, and masked request/response data.
- Config validation fails early for broken identity setup.
- Smoke tests cover all major branches.

---

### 1.6 Test & Validate Phase 1

**Files to Create:**
- `tests/phase1.smoke.test.js` – Selenium/Puppeteer script for basic flows

**Smoke Tests:**
1. Native Sign-In (email/password happy path)
2. Sign-In + MFA (OOB branch)
3. Sign-In + Registration (registration_required branch)
4. Sign-Up (new capability)
5. SSPR (new capability)
6. Error panel visibility (bad password)
7. Demo Mode toggle (raw token visibility)

**Documentation:**
- Add "Getting Started → Running Tests" section to README
- Document test environment setup

---

## Phase 2: Identity Depth & Policies (Weeks 5-10)

### Goals
- Transform profile view into identity explorer
- Add policy simulation and capability negotiation
- Integrate Graph API for richer identity operations
- Support operators in understanding user state

### 2.1 Token Lifetime & Expiration Tracking

**Files to Modify:**
- `public/ui.js` – Add token expiration logic
- `public/app.css` – Add countdown timer styles

**Implementation:**
At login, for each token:
1. Parse `exp` (expiration timestamp) claim
2. Calculate remaining lifetime
3. Show countdown timer: `⏱️ Expires in 47m 23s`
4. Update every 5 seconds
5. Change color: green (>10min) → yellow (5-10min) → red (<5min)
6. Alert when <2min remaining

**Code:**
```javascript
function getTokenExpiration(token) {
  const decoded = parseJwt(token);
  const expiresAt = decoded.exp * 1000; // ms
  return new Date(expiresAt);
}

function startExpirationTimer(tokenId, token) {
  setInterval(() => {
    const expiresAt = getTokenExpiration(token);
    const now = Date.now();
    const remaining = expiresAt - now;
    
    if (remaining <= 0) {
      showAlert("Token expired. Please re-authenticate.");
      return;
    }
    
    const color = remaining < 120000 ? "red" : remaining < 600000 ? "yellow" : "green";
    updateTimerDisplay(tokenId, remaining, color);
  }, 5000);
}
```

**Deliverables:**
- Each token card shows `⏱️ Expires in HH:MM:SS`
- Color-coded urgency indicator
- Automatic re-auth prompt at expiration

---

### 2.2 Claim Provenance & Diff Viewer

**Files to Modify:**
- `public/ui.js` – Add claim source tracking and diff logic
- `public/index.html` – Add provenance viewer UI
- `public/app.css` – Style provenance cards

**Implementation:**
After parsing id_token, access_token, and account claims, create a map:
```javascript
const claimProvenance = {
  "sub": ["id_token", "account"],
  "name": ["id_token"],
  "scp": ["access_token"],
  "aud": ["id_token", "access_token"],
  // ...
};
```

**UI:**
```
┌─ Claim Provenance ───────────────────┐
│ Hover claim to see where it came from │
│                                       │
│ sub:    [from: id_token, account]    │
│ name:   [from: id_token]             │
│ aud:    [from: id_token, access...]  │
│ scp:    [from: access_token]         │
│                                       │
│ [View Diff: ID vs Access]            │
└───────────────────────────────────────┘
```

**Deliverables:**
- Claim browser with source attribution
- Diff viewer comparing id_token vs access_token
- Highlight conflicts (same claim, different value)

---

### 2.3 Group, Role & Entitlement Summary

**Files to Modify:**
- `public/ui.js` – Add group/role extraction
- `public/index.html` – Add groups/roles section
- `public/app.css` – Style groups/roles cards

**Implementation:**
Extract and summarize:
- `groups`: Array of group object IDs
- `roles`: Array of app role names
- `wids`: Workload identities
- `app_displayname`: Application display name

**UI:**
```
┌─ Groups & Roles ───────────────────────┐
│ Groups (2):                             │
│  • Sales Team Group (uuid-123)         │
│  • Global Admins (uuid-456)            │
│                                         │
│ App Roles (3):                         │
│  • admin                               │
│  • editor                              │
│  • viewer                              │
│                                         │
│ Workload Identities:                   │
│  • (none)                              │
└─────────────────────────────────────────┘
```

**Deliverables:**
- Groups section with count and object IDs
- Roles section with app roles
- Entitlement summary

---

### 2.4 Graph API Integration: Profile & Session Status

**Files to Modify/Create:**
- `public/ui.js` – Add Graph self-service and operator data clients
- `public/index.html` – Add Graph actions, operator mode, and reporting sections
- `public/config.js` – Add Graph scopes, beta flags, and operator-mode config

**Graph API model:**
This app should split Graph functionality into two lanes.

1. **Delegated self-service lane** for the signed-in end user in the SPA.
2. **Admin/operations lane** for richer beta diagnostics and tenant controls that require elevated delegated scopes or a backend helper.

Do not treat these as one token shape. The current browser token should only call low-risk self-service endpoints. Beta admin/reporting APIs should be isolated behind an explicit operator mode.

**Delegated self-service endpoints:**
1. **GET /v1.0/me?$select=displayName,givenName,surname,mail,userPrincipalName,identities,creationType,createdDateTime,externalUserState,externalUserStateChangeDateTime**
2. **GET /v1.0/me/authentication/methods**
3. **GET /v1.0/me/authentication/temporaryAccessPassMethods**
4. **POST /v1.0/me/revokeSignInSessions**

**Admin/operations beta endpoints:**
1. **GET /beta/users/{id}?$select=id,displayName,givenName,surname,mail,userPrincipalName,identities,creationType,createdDateTime,lastPasswordChangeDateTime,signInActivity,externalUserState,externalUserStateChangeDateTime**
2. **GET /beta/users/{id}/authentication/requirements**
3. **GET /beta/users/{id}/authentication/signInPreferences**
4. **PATCH /beta/users/{id}/authentication/signInPreferences**
5. **GET /beta/reports/authenticationMethods/userRegistrationDetails**
6. **GET /beta/reports/authenticationMethods/userSignInsByAuthMethodSummary(period='d1')**

**Implementation:**
```javascript
async function getGraphProfile(accessToken) {
  const response = await axios.get(
    "https://graph.microsoft.com/v1.0/me?$select=displayName,givenName,surname,mail,userPrincipalName,identities,creationType,createdDateTime,externalUserState,externalUserStateChangeDateTime",
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  return response.data;
}

async function getSelfMethods(accessToken) {
  const response = await axios.get(
    "https://graph.microsoft.com/v1.0/me/authentication/methods",
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  return response.data;
}

async function revokeOwnSessions(accessToken) {
  return axios.post(
    "https://graph.microsoft.com/v1.0/me/revokeSignInSessions",
    {},
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
}

async function getAdminIdentityDetail(operatorToken, userId) {
  const select = [
    "id",
    "displayName",
    "givenName",
    "surname",
    "mail",
    "userPrincipalName",
    "identities",
    "creationType",
    "createdDateTime",
    "lastPasswordChangeDateTime",
    "signInActivity",
    "externalUserState",
    "externalUserStateChangeDateTime"
  ].join(",");

  const response = await axios.get(
    `https://graph.microsoft.com/beta/users/${encodeURIComponent(userId)}?$select=${select}`,
    { headers: { Authorization: `Bearer ${operatorToken}` } }
  );
  return response.data;
}
```

**UI:**
```
┌─ Graph API Profile ──────────────────┐
│ Job Title:               Engineer     │
│ Department:              Platform     │
│ Mobile Phone:            +1 555 1234  │
│ Last Sign-In:            Apr 17 2:15p │
│ Last Sign-In IP:         203.0.113.42 │
│                                       │
│ [Revoke All Sessions] [Refresh]      │
└──────────────────────────────────────┘
```

**Deliverables:**
- Profile enrichment from Graph
- Self-service auth methods and TAP visibility
- Beta operator card with `signInActivity`, identity type metadata, and MFA state
- Session management UI using revoke-all semantics
- Real-time sync with Graph data

**Permission model:**
- End-user lane:
  - `openid`, `profile`, `email`
  - `User.Read`
  - `UserAuthenticationMethod.Read`
  - `User.RevokeSessions.All` only if you want self-service revoke
- Operator lane:
  - `User.Read.All` or `Directory.Read.All`
  - `UserAuthenticationMethod.Read.All` or `UserAuthenticationMethod.ReadWrite.All`
  - reporting-related scopes as required for `/beta/reports/*`
  - supported Entra admin role, typically `Authentication Administrator` or `Privileged Authentication Administrator` for method-management features

---

### 2.5 Policy Simulation Packs (Pre-Configured Scenarios)

**Files to Modify/Create:**
- `public/config.js` – Add scenario definitions
- `public/settings.html` – Add scenario selector
- `public/ui.js` – Add scenario apply logic
- `.env.example` – Add POLICY_SCENARIO env var

**Scenario Definitions:**
```javascript
const POLICY_SCENARIOS = {
  "password_only": {
    name: "Password Only (No MFA)",
    description: "User signs in with email and password, no additional factors",
    capabilities: "challenge_type: password",
    expectedFlow: ["initiate", "challenge", "token"],
  },
  "password_plus_mfa": {
    name: "Password + MFA Required",
    description: "User provides password, then must complete MFA challenge",
    capabilities: "mfa_required",
    expectedFlow: ["initiate", "challenge", "challenge_mfa", "token_mfa"],
  },
  "registration_required": {
    name: "Registration Required",
    description: "User must register an MFA method before first sign-in",
    capabilities: "registration_required",
    expectedFlow: ["initiate", "challenge", "register_introspect", "register_challenge", "token"],
  },
  "redirect_fallback": {
    name: "Redirect Fallback",
    description: "Native Auth unavailable, redirect to MSAL",
    capabilities: "challenge_type: redirect",
    expectedFlow: ["initiate", "redirect"],
  },
  "passwordless_oob": {
    name: "Passwordless (OOB Only)",
    description: "User signs in with email and OOB code (no password)",
    capabilities: "oob",
    expectedFlow: ["initiate", "challenge_oob", "token_oob"],
  },
};
```

**Settings UI:**
```
┌─ Policy Scenarios ──────────────────────────┐
│ Select a scenario to test different policies │
│                                              │
│ ○ Password Only (No MFA)                    │
│ ○ Password + MFA Required                   │
│ ○ Registration Required                     │
│ ○ Redirect Fallback                        │
│ ● Passwordless (OOB Only)                  │
│                                              │
│         [Apply Scenario]                    │
│                                              │
│ Expected Flow:                              │
│  1. initiate                               │
│  2. challenge                              │
│  3. token                                  │
│                                              │
│  [View Full Scenario Details]              │
└────────────────────────────────────────────┘
```

**Implementation:**
- Store selected scenario in `sessionStorage`
- Pass `capabilities` to each API call's `capabilities` field
- Log expected vs actual flow step
- Show inline feedback: "✅ Step 1 matches expected flow"

**Deliverables:**
- 5+ pre-configured scenarios
- Scenario selector in settings
- Flow validation (expected vs actual)
- Scenario explanation text

---

### 2.6 Capability Negotiation Controls

**Files to Modify:**
- `public/nativeAuth.js` – Make capabilities configurable
- `public/config.js` – Add capabilities override
- `public/settings.html` – Add capabilities toggle UI

**Implementation:**
```javascript
// Current: hard-coded capabilities
const capabilities = "registration_required mfa_required";

// New: make configurable
function getCapabilities() {
  const overrides = sessionStorage.getItem("capabilitiesOverride");
  if (overrides) return overrides;
  return "registration_required mfa_required"; // default
}

// In UI:
// Toggles for: [✓] registration_required [✓] mfa_required [✓] redirect
```

**UI in Settings:**
```
┌─ Capability Negotiation ──────────────┐
│ Override default capabilities:         │
│                                       │
│ ☑ registration_required               │
│ ☑ mfa_required                        │
│ ☐ redirect                            │
│ ☐ passwordless                        │
│                                       │
│        [Apply] [Reset to Defaults]    │
└───────────────────────────────────────┘
```

**Deliverables:**
- Capability override toggles in settings
- Persist overrides in sessionStorage
- Show active capabilities in auth summary

---

### 2.7 Update Postman Collection with Scenarios

**Files to Modify:**
- `public/EEID Native Auth.postman_collection.json` – Add scenario folders

**Postman Structure:**
```
EEID Native Auth/
  ├─ Sign-In (password_only scenario)
  │   ├─ POST /initiate
  │   ├─ POST /challenge
  │   └─ POST /token
  ├─ Sign-In + MFA (password_plus_mfa scenario)
  │   ├─ POST /initiate
  │   ├─ POST /challenge
  │   ├─ POST /introspect
  │   ├─ POST /challenge (MFA)
  │   └─ POST /token (MFA)
  ├─ Registration Required
  ├─ Sign-Up
  ├─ SSPR
  └─ Capability Negotiation Examples
      ├─ capabilities: "mfa_required"
      ├─ capabilities: "registration_required redirect"
```

**Deliverables:**
- Organized scenario folders in Postman
- Sample payloads for each path
- Environment variable substitution docs

---

## Phase 3: Enterprise Hardening & Automation (Weeks 11-16)

### Goals
- Production-ready CORS and network security
- Observability and audit trail
- Configuration governance
- Guided demo mode for sales/training
- Automated regression testing

### 3.1 Replace Wildcard CORS with Allowlist

**Files to Modify:**
- `cors.js` – Implement allowlist-based CORS
- `cors_prod.js` – Production CORS profile
- `proxy.config.js` – Add CORS config section
- `.env.example` – Add CORS_ORIGINS env var

**Current Code (cors.js):**
```javascript
"Access-Control-Allow-Origin": "*", // ⚠️ Everything allowed
```

**New Approach:**
```javascript
// cors.js
const CORS_ALLOWLIST = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",").map((s) => s.trim())
  : ["http://localhost:8080"]; // secure default

function getCorsHeaders(origin) {
  if (CORS_ALLOWLIST.includes(origin) || CORS_ALLOWLIST.includes("*")) {
    return {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, ...",
      "Access-Control-Max-Age": "86400",
    };
  }
  // Reject if not in allowlist
  return null;
}

// Applied:
if (req.method === "OPTIONS") {
  const corsHeaders = getCorsHeaders(req.headers.origin);
  if (!corsHeaders) {
    res.writeHead(403);
    res.end();
    return;
  }
  res.writeHead(204, corsHeaders);
  res.end();
}
```

**Environment Config:**
```bash
# .env.example
CORS_ORIGINS=http://localhost:8080,http://localhost:3001,https://demo.codexjay.com
```

**Deliverables:**
- CORS allowlist (default: localhost only)
- Deny-by-default for unknown origins
- Clear error messages for blocked requests

**Profiles:**
- **Local Dev**: `http://localhost:*`
- **Secure Demo**: Explicit whitelist
- **Production**: Locked allowlist with CDN origin

---

### 3.2 Flow Timeline & Audit Trail

**Files to Modify/Create:**
- `public/httpClient.js` – Enhanced logging
- `public/ui.js` – Add timeline panel
- `public/index.html` – Add timeline dialog
- `public/app.css` – Style timeline

**Implementation:**
Log every API call:
```javascript
const FLOW_TIMELINE = [];

function recordFlowEvent(event) {
  FLOW_TIMELINE.push({
    timestamp: new Date().toISOString(),
    type: event.type, // "api_call", "user_action", "error", "branch"
    endpoint: event.endpoint,
    method: event.method,
    status: event.status,
    duration: event.duration, // ms
    payloadShape: event.payloadShape, // keys only, masked
    responseStatus: event.responseStatus,
    traceId: event.traceId,
  });
}
```

**Timeline UI Dialog:**
```
┌─ Flow Timeline ──────────────────────────────────────┐
│ [Open Timeline]                                      │
│                                                      │
│ Timeline of all API calls and user actions:         │
│                                                      │
│ 2026-04-17 14:30:15 ⏱️  API Call (45ms)             │
│   POST /oauth2/v2.0/initiate                       │
│   Status: 200 OK                                    │
│   Payload: {username, client_id, challenge_type}  │
│   Trace: aa1bb22c-3344...                         │
│                                                      │
│ 2026-04-17 14:30:17 👤 User Action                  │
│   Selected MFA method: SMS                          │
│                                                      │
│ 2026-04-17 14:30:18 ⏱️  API Call (82ms)             │
│   POST /oauth2/v2.0/challenge                      │
│   Status: 200 OK                                    │
│   ...                                               │
│                                                      │
│          [Export as JSON] [Clear Timeline]          │
└──────────────────────────────────────────────────────┘
```

**Deliverables:**
- Chronological log of all API calls
- User action markers (MFA method selected, OOB entered, etc.)
- Trace IDs for correlation
- Export/copy for support

---

### 3.3 Startup Configuration Validation

**Files to Modify:**
- `server.js` – Add config validation on startup

**Validation Rules:**
```javascript
function validateConfig() {
  const errors = [];
  
  // Required configs
  if (!process.env.CLIENT_ID || process.env.CLIENT_ID === "YOUR_CLIENT_ID") {
    errors.push("❌ CLIENT_ID not set or is placeholder");
  }
  
  if (!process.env.TENANT_ID || process.env.TENANT_ID === "YOUR_TENANT_ID") {
    errors.push("❌ TENANT_ID not set or is placeholder");
  }
  
  // Format validation
  if (process.env.CLIENT_ID && !isValidGuid(process.env.CLIENT_ID)) {
    errors.push("⚠️  CLIENT_ID does not look like a valid GUID");
  }
  
  // Consistency
  if (process.env.LOCALE && !["en", "es", "fr", "de"].includes(process.env.LOCALE)) {
    errors.push("⚠️  LOCALE not in supported list: en, es, fr, de");
  }
  
  return errors;
}

// On startup:
const errors = validateConfig();
if (errors.length > 0) {
  console.error("\n🚨 Configuration Validation Failed:\n");
  errors.forEach((e) => console.error(e));
  console.error("\n📖 See .env.example and README for setup instructions.\n");
  process.exit(1);
}
```

**Startup Message:**
```
✅ Configuration Valid

App Port:          8080
APP Origin:        http://localhost:8080
Client ID:         a1b2c3d4-e5f6-7890-...
Tenant ID:         x1y2z3a4-b5c6-7890-...
Authority:         https://ciam...
Locale:            en
Theme:             azure-portal
CORS Allowlist:    http://localhost:8080, http://localhost:3001

Ready to start!
```

**Deliverables:**
- Fail-fast on missing/invalid config
- Clear error messages with remediation steps
- Validation summary at startup

---

### 3.4 Environment Profile Configs

**Files to Modify/Create:**
- `.env.local` (dev, unsecured)
- `.env.secure` (secure demo, allowlist)
- `.env.prod` (production-like, hardened)
- `.env.example` (template)
- `package.json` – Add profile-aware startup scripts

**.env Profiles:**

**`.env.local` (Development)**
```bash
APP_PORT=8080
APP_ORIGIN=http://localhost:8080
CLIENT_ID=YOUR_CLIENT_ID
TENANT_ID=YOUR_TENANT_ID
CORS_ORIGINS=http://localhost:*
DEMO_MODE=true
```

**`.env.secure` (Secure Demo)**
```bash
APP_PORT=443
APP_ORIGIN=https://demo.codexjay.com
CLIENT_ID=<demo-tenant-client-id>
TENANT_ID=<demo-tenant-id>
CORS_ORIGINS=https://demo.codexjay.com
DEMO_MODE=false
```

**`.env.prod` (Production-Like)**
```bash
APP_PORT=443
APP_ORIGIN=https://identity.codexjay.com
CLIENT_ID=<prod-client-id>
TENANT_ID=<prod-tenant-id>
CORS_ORIGINS=https://identity.codexjay.com
DEMO_MODE=false
NODE_ENV=production
ENABLE_ERROR_PANEL=false
```

**package.json Scripts:**
```json
{
  "scripts": {
    "start": "node server.js",
    "start:local": "dotenv -e .env.local npm start",
    "start:secure": "dotenv -e .env.secure npm start",
    "start:prod": "dotenv -e .env.prod npm start",
    "start:stack:local": "node scripts/start-stack.js local",
    "start:stack:secure": "node scripts/start-stack.js secure"
  }
}
```

**Deliverables:**
- Profile-based env files
- Profile-aware startup scripts
- Validation per profile

---

### 3.5 Guided Demo Mode Overlay

**Files to Modify/Create:**
- `public/index.html` – Add guided demo modal
- `public/ui.js` – Add guided tour logic
- `public/app.css` – Style guided tour
- `public/config.js` – Add guided tour config

**Demo Scenario (Example):**
```
┌─ Guided Demo: Native Auth Sign-In ─────────────────┐
│                                                    │
│ Step 1 of 5: Sign-In with Email & Password       │
│ ════════════════════════════════════════════════  │
│                                                    │
│ Let's walk through a Native Auth sign-in flow.    │
│ This demonstrates how Entra's Native Auth APIs    │
│ provide a seamless, native sign-in experience.    │
│                                                    │
│ 📝 Enter your email and password:                 │
│    [demo@contoso.com             ]               │
│    [••••••••••••••••••           ]               │
│                                                    │
│ What's happening behind the scenes:              │
│ • POST /oauth2/v2.0/initiate sends email         │
│ • Server discovers available auth methods        │
│ • Continuation token preserves flow state        │
│                                                    │
│ 💡 Tip: Watch the "Flow Timeline" to see all API │
│         calls and responses in real-time.        │
│                                                    │
│          [Start] [← Back] [Skip Tutorial] [Next →]│
└────────────────────────────────────────────────────┘

Step 2 of 5: Enter Verification Code
Step 3 of 5: Review Token Claims
Step 4 of 5: Inspect Session State
Step 5 of 5: Explore Identity Dashboard
```

**Implementation:**
```javascript
const GUIDED_TOUR = {
  "native_signin": [
    {
      step: 1,
      title: "Sign-In with Email & Password",
      description: "...",
      actions: ["focus email field", "prompt email entry"],
      apiCalls: ["POST /oauth2/v2.0/initiate"],
      tips: ["Watch Flow Timeline"],
      onNext: () => { /* proceed */ }
    },
    // ... more steps
  ]
};

function startGuidedTour(tourName) {
  // Show overlay with step-by-step instructions
  // Highlight relevant UI elements
  // Log tour progress
}
```

**Deliverables:**
- 3-5 guided tours (sign-in, sign-up, SSPR, MFA, registration)
- Step-by-step overlay with context
- API call highlighting
- Tips and explanations
- Progress tracking

---

### 3.6 Automated Integration Tests

**Files to Create:**
- `tests/integration.test.js` – Main test suite
- `tests/scenarios.test.js` – Policy scenario tests
- `tests/settings.test.js` – Settings/config tests
- `.github/workflows/test.yml` – CI/CD integration

**Test Framework: Jest + Puppeteer**

**Test Categories:**

1. **Authentication Flow Tests**
   - [ ] Native Sign-In (happy path)
   - [ ] Native Sign-In + MFA
   - [ ] Native Sign-In + Registration
   - [ ] Sign-Up
   - [ ] SSPR
   - [ ] MSAL Popup
   - [ ] MSAL Redirect

2. **Error Handling Tests**
   - [ ] Invalid email format
   - [ ] Wrong password
   - [ ] Expired OOB code
   - [ ] Expired continuation token
   - [ ] Network timeout (with retry)
   - [ ] Rate limiting (429)

3. **Token & Session Tests**
   - [ ] Token expiration countdown
   - [ ] Token refresh on expiration
   - [ ] Session persistence (page reload)
   - [ ] Demo mode toggle
   - [ ] Token visibility control

4. **Policy Scenario Tests**
   - [ ] Password only (no MFA)
   - [ ] MFA required
   - [ ] Registration required
   - [ ] Redirect fallback
   - [ ] Passwordless OOB

5. **UI & Settings Tests**
   - [ ] Settings page loads
   - [ ] Environment variables display
   - [ ] Scenario selector works
   - [ ] Locale switching works
   - [ ] Theme switching works

6. **Integrations Tests**
   - [ ] Graph API profile fetch
   - [ ] Graph API sign-in activity
   - [ ] Auth methods endpoint
   - [ ] CORS allowlist enforcement

**Example Test:**
```javascript
// tests/integration.test.js
describe("Native Sign-In Flow", () => {
  it("should sign in with email and password", async () => {
    const page = await browser.newPage();
    await page.goto("http://localhost:8080");
    
    // Enter email and password
    await page.type("#emailText", "testuser@contoso.com");
    await page.type("#passwordText", "TestPassword123!");
    await page.click("#signInButton");
    
    // Wait for authenticated UI
    await page.waitForSelector("#authenticatedDiv", { visible: true });
    
    // Verify tokens are displayed
    const accessToken = await page.textContent("#accessTokenRaw");
    expect(accessToken).toBeTruthy();
    expect(accessToken.split(".").length).toBe(3); // JWT format
  });

  it("should handle MFA branch on mfa_required", async () => {
    const page = await browser.newPage();
    await page.goto("http://localhost:8080");
    
    await page.type("#emailText", "mfa.user@contoso.com");
    await page.type("#passwordText", "MFAPassword123!");
    await page.click("#signInButton");
    
    // Wait for MFA method dialog
    await page.waitForSelector("#mfaMethodDialog", { visible: true });
    
    // Select SMS method
    await page.click(".mfa-method-btn");
    
    // Wait for OOB code prompt
    await page.waitForSelector("#codeDialog", { visible: true });
    expect(await page.textContent("#codeDialogLabel")).toContain("SMS");
  });
});
```

**Deliverables:**
- 30+ automated tests covering all flows
- Jest test runner config
- CI/CD GitHub Actions workflow
- Test report generation (HTML)
- Pre-commit hooks for test validation

---

### 3.7 Documentation & Training

**Files to Create/Modify:**
- `README.md` – Expand with all new features
- `FLOWS.md` – Flow diagrams and walk-throughs
- `SCENARIOS.md` – Policy scenario guide
- `OPERATOR_GUIDE.md` – Operator runbook
- `TROUBLESHOOTING.md` – Error codes and remediation

**README Sections to Add:**
- Getting Started (updated)
- New Features Overview (sign-up, SSPR, Graph integration)
- Configuration Profiles (local/secure/prod)
- Guided Demo Modes
- Testing & CI/CD
- Observability & Audit Trail
- Troubleshooting & Support
- Postman Collection Deep Dive (expanded)

**Deliverables:**
- Comprehensive feature documentation
- Operator runbook with troubleshooting
- Flow diagrams (Mermaid)
- API cheat sheets (updated)
- FAQ and common issues

---

## Implementation Timeline

| Phase | Weeks | Focus | Key Deliverables |
|-------|-------|-------|------------------|
| **Phase 1** | 1-4 | Core Identity + Security | Sign-up, SSPR, Error Panel, Demo Mode, Tests |
| **Phase 2** | 5-10 | Identity Depth + Policies | Token Lifetime, Claim Diff, Graph API, Scenarios, Postman |
| **Phase 3** | 11-16 | Enterprise + Automation | CORS Hardening, Audit Trail, Config Validation, Guided Tour, E2E Tests |

---

## Success Metrics

After completion:
- ✅ **5 authentication paths** fully implemented and documented (sign-in, sign-up, SSPR, MFA, registration)
- ✅ **30+ automated tests** with >85% code coverage
- ✅ **Zero placeholders** in documentation; all flows explained
- ✅ **Operator-first**: Error panel, audit trail, timeline all production-ready
- ✅ **Enterprise-ready**: CORS allowlist, config validation, profile-based env, integration tests
- ✅ **Demo-ready**: Guided tours, scenario selector, policy toggles
- ✅ **Performance**: All flows < 2 second (excluding network)

---

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Policy/capabilities differ from tenant config | Test against multiple tenant policies; document tenant setup |
| SSPR/Sign-up endpoints unavailable in target tenant | Provide fallback docs; gate features with capability checks |
| Graph API scope limitations | Request admin consent early; provide scopes doc |
| Test flakiness (network timeouts) | Implement retry logic; use mock API option |
| Token expiration during long demo | Add silent refresh; prompt re-auth before expiration |

---

## API Deep Dive

This section expands the roadmap into concrete API surfaces, payload contracts, permission boundaries, and implementation constraints.

### A. Native Authentication APIs

#### A.1 Sign-In Flow

**Base pattern**
- `POST /oauth2/v2.0/initiate`
- `POST /oauth2/v2.0/challenge`
- `POST /oauth2/v2.0/token`
- Optional: `POST /oauth2/v2.0/introspect`

**`POST /oauth2/v2.0/initiate`**
- Purpose: start sign-in and get a continuation token
- Required form fields:
  - `client_id`
  - `username`
- Optional but recommended:
  - `challenge_type=password oob redirect`
  - `capabilities=registration_required mfa_required`
- Success response:
  - `continuation_token`
- Branches:
  - If the app is missing a required capability, the service can pivot toward `challenge_type: redirect`

**`POST /oauth2/v2.0/challenge`**
- Purpose: let Entra choose the first or next factor
- Required form fields:
  - `client_id`
  - `continuation_token`
- Optional:
  - `challenge_type`
  - `id` when selecting a specific MFA method returned from introspect
- Success response examples:
  - Password path continuation
  - `challenge_type: oob` with `binding_method`, `challenge_channel`, `challenge_target_label`, `code_length`
  - `challenge_type: redirect`

**`POST /oauth2/v2.0/token`**
- Purpose: exchange submitted proof for tokens
- Common inputs:
  - `client_id`
  - `continuation_token`
  - `grant_type`
  - `scope`
- Grant variants:
  - `grant_type=password` with `password`
  - `grant_type=oob` with `oob`
  - `grant_type=mfa_oob` with `oob`
- Important suberrors:
  - `mfa_required`
  - `registration_required`
  - `invalid_oob_value`
- Success response:
  - `access_token`
  - `id_token`
  - optional `refresh_token`

**`POST /oauth2/v2.0/introspect`**
- Purpose: retrieve the user’s registered strong authentication methods after `mfa_required`
- Required form fields:
  - `client_id`
  - `continuation_token`
- Success response:
  - `continuation_token`
  - `methods[]` with method identifiers and challenge channels

**Implementation notes for this repo**
- Keep `public/nativeAuth.js` as the orchestration layer only.
- Move request building and response normalization into `public/httpClient.js` or a small `nativeAuthClient` wrapper.
- Normalize all auth responses into a single internal shape:

```javascript
{
  stage: "initiate|challenge|token|introspect|register|signup|sspr",
  continuationToken: "...",
  challengeType: "password|oob|redirect|preverified",
  methods: [],
  tokens: null,
  error: null,
  traceId: null,
  correlationId: null
}
```

#### A.2 Sign-Up Flow

**Base pattern**
- `POST /signup/v1.0/start`
- `POST /signup/v1.0/challenge`
- `POST /signup/v1.0/continue`
- `POST /oauth2/v2.0/token`

**`POST /signup/v1.0/start`**
- Purpose: start sign-up and optionally front-load password plus attributes
- Required:
  - `client_id`
  - `username`
  - `challenge_type=oob password redirect`
- Optional:
  - `password`
  - `attributes={...}` as JSON string
  - `capabilities`
- Important errors:
  - `user_already_exists`
  - `invalid_grant` with `password_too_weak`, `password_banned`, `password_recently_used`, `password_too_short`, `password_too_long`
  - `invalid_attributes` and `suberror=attribute_validation_failed`

**`POST /signup/v1.0/challenge`**
- Purpose: trigger OOB verification for sign-up
- Response fields to surface in UI:
  - `interval`
  - `challenge_target_label`
  - `code_length`

**`POST /signup/v1.0/continue`**
- Purpose: submit OTP or remaining attributes/password until the user object is complete
- Required inputs vary by stage:
  - `grant_type=oob` and `oob`
  - or `grant_type=password` and `password`
  - plus missing `attributes`

**Recommended UX**
- Step 1: email and password
- Step 2: required attributes discovered from config or user flow metadata
- Step 3: OTP verification
- Step 4: token issuance and authenticated landing page

#### A.3 Strong Authentication Registration

**Base pattern**
- `POST /register/v1.0/introspect`
- `POST /register/v1.0/challenge`
- `POST /register/v1.0/continue`
- then back to `POST /oauth2/v2.0/token`

**`POST /register/v1.0/introspect`**
- Purpose: discover which strong methods can be enrolled
- Response:
  - `methods[]`
  - `continuation_token`

**`POST /register/v1.0/challenge`**
- Purpose: bind the selected method and send OTP if needed
- Required:
  - `client_id`
  - `continuation_token`
  - `challenge_type=oob`
  - `challenge_target`
- Optional:
  - `challenge_channel=email|sms`
- Success responses:
  - `challenge_type=oob`
  - or `challenge_type=preverified` when the factor was already proven during the prior flow

**`POST /register/v1.0/continue`**
- Purpose: submit the code and finalize registration
- Required:
  - `client_id`
  - `continuation_token`
  - `grant_type=oob`
  - `oob`

#### A.4 Self-Service Password Reset

**Base pattern**
- `POST /resetpassword/v1.0/start`
- `POST /resetpassword/v1.0/challenge`
- `POST /resetpassword/v1.0/continue`
- `POST /resetpassword/v1.0/submit`
- `POST /resetpassword/v1.0/poll_completion`
- optional `POST /oauth2/v2.0/token`

Use the native auth SSPR flow as its own orchestration branch instead of mixing it with sign-up or sign-in code paths.

**`POST /resetpassword/v1.0/start`**
- Purpose: validate the username and begin the reset flow
- Required:
  - `client_id`
  - `username`
  - `challenge_type=oob redirect`
- Success:
  - returns `continuation_token`
- Branches:
  - can return redirect if the client does not support the required challenge path

**`POST /resetpassword/v1.0/challenge`**
- Purpose: issue an OOB challenge to a preferred recovery credential
- Required:
  - `client_id`
  - `continuation_token`
  - `challenge_type=oob redirect`
- Success:
  - returns a new `continuation_token`
  - identifies the challenge channel and timing metadata

**`POST /resetpassword/v1.0/continue`**
- Purpose: validate the one-time passcode
- Required:
  - `client_id`
  - `continuation_token`
  - `grant_type=oob`
  - `oob`
- Success:
  - returns `expires_in`
  - returns a new `continuation_token` for submit
- Important errors:
  - `invalid_grant`
  - `invalid_oob_value`
  - `expired_token`

**`POST /resetpassword/v1.0/submit`**
- Purpose: submit the new password
- Required:
  - `client_id`
  - `continuation_token`
  - `new_password`
- Success:
  - returns `continuation_token`
  - returns `poll_interval`

**`POST /resetpassword/v1.0/poll_completion`**
- Purpose: determine whether the reset operation has completed
- Required:
  - `client_id`
  - `continuation_token`
- Success:
  - returns `status`
  - returns a continuation token
  - when `status=succeeded`, that continuation token can be used to obtain tokens from `/oauth2/v2.0/token`

**Implementation guidance**
- Create a dedicated `resetPasswordFlow` object in `public/nativeAuth.js`.
- Reuse the same OOB entry UI but give SSPR its own error catalog and retry semantics.
- Add a distinct submit-and-poll phase instead of trying to complete reset in a single continue call.
- Capture and surface:
  - invalid email
  - expired OTP
  - password policy failures
  - throttling and retry-after behavior
  - poll timeout or terminal failed status

**UI guidance**
- Step 1: collect email
- Step 2: trigger challenge and show masked recovery channel
- Step 3: collect OTP
- Step 4: collect and confirm new password
- Step 5: show polling/progress state until complete
- Step 6: either auto sign-in or return to sign-in screen

### B. Microsoft Graph API Strategy

#### B.1 Why use beta in this app

Use `beta` only where it unlocks materially better operator visibility or admin controls. Keep user-self-service calls on `v1.0` unless the feature is beta-only.

**Rule of thumb**
- `v1.0` for end-user profile, enrolled methods, TAP visibility, revoke sessions
- `beta` for operator diagnostics, per-user MFA state, sign-in preferences, reports, External ID admin surfaces

#### B.2 Self-Service Graph Endpoints to implement first

**`GET /v1.0/me?$select=...`**
- Use for the authenticated profile summary card
- Candidate properties:
  - `displayName`
  - `givenName`
  - `surname`
  - `mail`
  - `userPrincipalName`
  - `identities`
  - `creationType`
  - `createdDateTime`
  - `externalUserState`
  - `externalUserStateChangeDateTime`

**`GET /v1.0/me/authentication/methods`**
- Use for enrolled factor inventory
- Map `@odata.type` to friendly cards in `public/ui.js`
- Show created time where available

**`GET /v1.0/me/authentication/temporaryAccessPassMethods`**
- Use for passwordless onboarding visibility
- Only one TAP can exist, so render as a single stateful card

**`POST /v1.0/me/revokeSignInSessions`**
- Use for emergency self-service “sign me out everywhere” control
- Show warning that revocation can take a few minutes and does not revoke external-user sessions in their home tenant

#### B.3 Operator Beta Endpoints

These should sit behind an explicit operator mode toggle and likely a backend helper because the SPA should not broadly hold admin tokens.

**`GET /beta/users/{id}?$select=...,signInActivity,...`**
- Best source for the operator profile drawer
- `signInActivity` gives last interactive, non-interactive, and successful sign-in timestamps
- Also pull `identities` and `creationType` to explain whether the account is local, federated, social, or alias-based

**`GET /beta/users/{id}/authentication/requirements`**
- Use to show per-user MFA state
- Good for “why did this flow branch into MFA?” operator reasoning

**`GET /beta/users/{id}/authentication/signInPreferences`**
- Use to display the user’s preferred secondary factor and whether system-preferred auth is enabled

**`PATCH /beta/users/{id}/authentication/signInPreferences`**
- Optional admin feature for labs and demos
- Do not enable by default in production-like profiles

**`GET /beta/reports/authenticationMethods/userRegistrationDetails`**
- Use for registration posture dashboards
- Ideal fields to summarize:
  - `isMfaRegistered`
  - `isSsprRegistered`
  - `isPasswordlessCapable`
  - registered method inventory

**`GET /beta/reports/authenticationMethods/userSignInsByAuthMethodSummary(period='d1')`**
- Use for tenant-level demo reporting on sign-in method adoption
- This is not per-user self-service data; keep it in operator dashboards only

#### B.4 External ID Beta Admin APIs

These APIs are what turn the app from an auth demo into an External ID operations console.

**`authenticationEventsFlow`**
- Purpose: manage External ID user flows and self-service sign-up experiences in external tenants
- Use case in this app: operator page that shows which authentication flow is active and which attributes are collected

**`signInIdentifierBase`**
- Beta-only value: alias and username sign-in support
- Use case: manage and display alternative sign-in identifiers for customer accounts

**`identityProviderBase`**
- Use case: list configured social, OIDC, Apple, SAML, or WS-Fed providers and show which ones are enabled for the tenant

**`authenticationEventListener` + `customAuthenticationExtension`**
- Use case: plug in custom business logic before or after attribute collection or other auth checkpoints
- Strong fit for enterprise-grade fraud, enrichment, or CRM validation demos

**`fraudProtectionProvider`**
- Use case: show whether anti-bot and fraud protection providers are integrated into sign-up
- Good future differentiator if this app is meant to be a one-stop identity demo platform

**`organizationalBranding`**
- Use case: synchronize branding metadata with the app’s own theme presets
- Beta-specific app-based branding scenarios are a good fit for your theme and locale work

### C. Recommended Technical Architecture

#### C.1 Token separation

Implement three token tiers:

1. **Native auth token** for External ID user session and your protected APIs
2. **Delegated Graph token** for self-service `/me` and auth-method reads
3. **Operator/admin token** for beta admin APIs and reporting

Do not overload one access token for all three purposes.

#### C.2 Client modules

Refactor into these service modules:
- `public/nativeAuthClient.js`
- `public/graphSelfServiceClient.js`
- `public/graphOperatorClient.js`
- `public/errorDiagnostics.js`
- `public/flowTimeline.js`

#### C.3 UI surfaces

Map APIs to distinct UI surfaces:
- **User dashboard**
  - tokens
  - claims
  - profile
  - auth methods
  - revoke sessions
- **Operator console**
  - beta profile view
  - MFA requirements
  - sign-in preferences
  - registration posture reports
  - External ID configuration inventory
- **Admin configuration**
  - identity providers
  - branding
  - user flows
  - custom auth extensions

### D. Permission and Consent Plan

Keep the consent plan explicit in the implementation.

**Baseline delegated scopes**
- `openid`
- `profile`
- `email`
- `User.Read`

**Self-service extended scopes**
- `UserAuthenticationMethod.Read`
- `User.RevokeSessions.All`

**Operator delegated/admin scopes**
- `User.Read.All`
- `Directory.Read.All`
- `UserAuthenticationMethod.Read.All`
- `UserAuthenticationMethod.ReadWrite.All`
- reporting-related permissions as required by the chosen beta reports

**Operational warning**
- Some beta APIs also require specific Entra admin roles even when scopes are present.
- The app should detect insufficient privileges and render a role/scopes remediation panel instead of a raw Graph error.

### E. Corrections To Carry Into Implementation

- Do not implement sign-up with `/register/v1.0/*`; use `/signup/v1.0/*`.
- Do not design around `GET /me/signInActivity`; use `GET /beta/users/{id}?$select=signInActivity` in operator mode.
- Do not design around `GET /me/sessions` or `DELETE /me/sessions/{id}`; use `POST /me/revokeSignInSessions` for the supported session invalidation model.
- Keep beta Graph APIs behind explicit feature flags and separate permission flows.

---

## Appendix: File-by-File Checklist

### Phase 1
- [ ] `public/nativeAuth.js` – Add sign-up, SSPR handlers
- [ ] `public/index.html` – Add sign-up/SSPR UI tabs
- [ ] `public/config.js` – Add sign-up/SSPR endpoints
- [ ] `public/ui.js` – Error panel, demo mode toggle
- [ ] `public/httpClient.js` – Enhance error capture + trace IDs
- [ ] `public/app.css` – Error panel + demo mode styles
- [ ] `public/msalAuth.js` – Switch to sessionStorage cache
- [ ] `server.js` – Add config validation
- [ ] `.env.example` – Add demo mode, CORS config
- [ ] `tests/phase1.smoke.test.js` – Basic smoke tests

### Phase 2
- [ ] `public/ui.js` – Token lifetime, claim diff, groups/roles
- [ ] `public/index.html` – Provenance, groups sections
- [ ] `public/app.css` – Provenance + groups styles
- [ ] `public/config.js` – Add Graph scopes + scenarios
- [ ] `public/settings.html` – Scenario selector, capability toggles
- [ ] `public/EEID Native Auth.postman_collection.json` – Scenario folders
- [ ] `README.md` – Update with all features

### Phase 3
- [ ] `cors.js` – Allowlist-based CORS
- [ ] `cors_prod.js` – Production profile
- [ ] `proxy.config.js` – CORS config section
- [ ] `public/ui.js` – Flow timeline panel
- [ ] `public/index.html` – Timeline dialog
- [ ] `public/app.css` – Timeline styles
- [ ] `server.js` – Startup validation
- [ ] `.env.local`, `.env.secure`, `.env.prod` – Profile configs
- [ ] `package.json` – Profile-aware scripts
- [ ] `public/ui.js` – Guided demo mode
- [ ] `tests/integration.test.js` – Full test suite
- [ ] `.github/workflows/test.yml` – CI/CD
- [ ] `FLOWS.md`, `SCENARIOS.md`, `OPERATOR_GUIDE.md` – Documentation

---

**Next Step:** Review this plan, confirm priorities, and begin Phase 1 implementation.
