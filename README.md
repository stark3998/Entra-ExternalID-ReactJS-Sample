# CodexJay External ID JavaScript Demo

A reusable sample web app for demonstrating Microsoft Entra External ID capabilities across different client conversations.

This project showcases three sign-in approaches in a single UI:

- Native Auth (email/password over Entra Native Auth APIs)
- MSAL Popup (hosted sign-in popup)
- MSAL Redirect (full-page hosted sign-in)

It also demonstrates self-service sign-up, self-service password reset, MFA challenges, MFA method registration, demo-mode token visibility, and operator-grade diagnostics where supported by tenant policy.

## Index

- [Native Auth Flow Deep Dive](#native-auth-flow-deep-dive)
- [Postman Collection Deep Dive](#postman-collection-deep-dive)
- [What This Demo Is For](#what-this-demo-is-for)
- [What This Demo Is Not For](#what-this-demo-is-not-for)
- [Architecture Overview](#architecture-overview)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Run Both Services Together](#run-both-services-together)
- [Configuration](#configuration)
- [Phase 1 Operator Guide](#phase-1-operator-guide)
- [Smoke Tests](#smoke-tests)
- [Graph Client Split](#graph-client-split)
- [Startup Script Deep Dive](#startup-script-deep-dive)
- [Repository Deep Dive](#repository-deep-dive)
- [Session Behavior](#session-behavior)
- [Security Notes](#security-notes)
- [Customizing For A New Client](#customizing-for-a-new-client)
- [License](#license)

## Native Auth Flow Deep Dive

This project implements Microsoft Entra External ID Native Authentication using
raw HTTP endpoints (through the local proxy), aligned with the official API
reference:

- [Native authentication API reference](https://learn.microsoft.com/en-us/entra/identity-platform/reference-native-authentication-api?tabs=emailOtp)

Important platform notes from the reference:

- Native Auth APIs are designed for external tenants.
- Native Auth endpoints do not support browser CORS directly.
- For this reason, this repo uses [cors.js](cors.js) as a local forwarding proxy.
- All Native Auth requests are sent as `application/x-www-form-urlencoded`.

### API-by-API Cheat Sheet

| Endpoint | Required params (common) | Common success fields | Common suberrors / notes |
| --- | --- | --- | --- |
| `/oauth2/v2.0/initiate` | `client_id`, `username`, `challenge_type` (include `redirect`) | `continuation_token` or `challenge_type=redirect` | `nativeauthapi_disabled` (via `invalid_client`), `user_not_found` |
| `/oauth2/v2.0/challenge` | `client_id`, `continuation_token`, `challenge_type` (and optional `id` for MFA) | `challenge_type` (`password` or `oob`), `continuation_token`, `challenge_channel`, `challenge_target_label`, `code_length` | `unsupported_challenge_type` if `redirect` is missing |
| `/oauth2/v2.0/token` | `client_id`, `continuation_token`, `grant_type`, `scope`, and credential (`password` or `oob`) | `access_token`, `id_token`, `refresh_token`, `expires_in`, `scope` | `mfa_required`, `registration_required`, `invalid_oob_value` |
| `/oauth2/v2.0/introspect` | `client_id`, `continuation_token` | `continuation_token`, `methods[]` (`id`, `challenge_type`, `challenge_channel`, `login_hint`) | Use before MFA challenge when token flow indicates `mfa_required` |
| `/register/v1.0/introspect` | `client_id`, `continuation_token` | `continuation_token`, `methods[]` (enrollable factors) | Start registration flow when token flow indicates `registration_required` |
| `/register/v1.0/challenge` | `client_id`, `continuation_token`, `challenge_type`, `challenge_target` (and optional `challenge_channel`) | `continuation_token`, `challenge_type` (`oob` or `preverified`) | `provider_blocked_by_admin`, `provider_blocked_by_rep` (phone/SMS risk controls) |
| `/register/v1.0/continue` | `client_id`, `continuation_token`, `grant_type` (`oob` or `continuation_token`), and `oob` when required | `continuation_token` | `invalid_oob_value` |

Notes for operators:

- Always propagate the latest `continuation_token` to the next call.
- Capture `trace_id` and `correlation_id` on failures for diagnostics.
- Treat `challenge_type=redirect` as a required fallback path, not a hard error.

### Core Concepts

1. Continuation token
1. Challenge types
1. Grant types
1. Redirect fallback

Continuation token:

- Most endpoints return `continuation_token`.
- You must pass it to the next endpoint in the same flow.
- Tokens are short-lived and endpoint-sequence specific.

Challenge types used in practice:

- `password`
- `oob` (one-time passcode)
- `redirect` (required fallback path)

Grant types used by the token/continue endpoints:

- `password`
- `oob`
- `mfa_oob`
- `attributes`
- `continuation_token`

Redirect fallback behavior:

- If app capabilities or challenge support are insufficient, the API can return
  `challenge_type=redirect`.
- Treat this as a successful control response that requires switching to
  web-based auth.

### Sign-In Flow (Implemented in This Repo)

This is the primary native flow in this demo.

Step 1: Initiate

- Endpoint: `/oauth2/v2.0/initiate`
- Purpose: start sign-in and get `continuation_token`.
- Request includes `client_id`, `username`, and `challenge_type` list.
- The challenge list should include `redirect` to allow compliant fallback.

Step 2: Challenge selection

- Endpoint: `/oauth2/v2.0/challenge`
- Purpose: let Entra select the required method for this user/session.
- Typical outcomes:
  - `challenge_type=password`
  - `challenge_type=oob` plus metadata (`challenge_channel`, masked target,
    `code_length`)
  - `challenge_type=redirect`

Step 3: Token request

- Endpoint: `/oauth2/v2.0/token`
- Purpose: verify supplied credential and issue tokens.
- Common request patterns:
  - Password first factor: `grant_type=password` + `password`
  - Email OTP first factor: `grant_type=oob` + `oob`
  - MFA second factor: `grant_type=mfa_oob` + `oob`
- Success can include:
  - `access_token`
  - `id_token` (requires `openid` scope)
  - `refresh_token` (requires `offline_access` scope)

### MFA Extension Branch

When `/oauth2/v2.0/token` returns `invalid_grant` with `suberror=mfa_required`:

1. Call `/oauth2/v2.0/introspect` with the continuation token.
2. Present returned strong-auth methods to the user.
3. Call `/oauth2/v2.0/challenge` with selected method `id`.
4. Collect OTP and call `/oauth2/v2.0/token` with `grant_type=mfa_oob`.

Repo mapping:

- Flow orchestration: [public/nativeAuth.js](public/nativeAuth.js)
- Method rendering and dialogs: [public/ui.js](public/ui.js)

### Strong Method Registration Branch

When `/oauth2/v2.0/token` indicates `suberror=registration_required`:

1. `/register/v1.0/introspect` to get enrollable methods.
2. `/register/v1.0/challenge` to send enrollment challenge.
3. `/register/v1.0/continue` to submit OTP or preverified continuation.
4. `/oauth2/v2.0/token` with `grant_type=continuation_token` to complete auth.

Repo mapping:

- Registration calls: [public/config.js](public/config.js)
- Registration flow handling: [public/nativeAuth.js](public/nativeAuth.js)

### Capabilities and Fallback

The reference supports optional capability signaling in initiation/challenge
requests:

- `mfa_required`
- `registration_required`

If a required capability is not advertised by the client, Entra can return
redirect with reason information and require browser-based flow.

### Error Contract and Troubleshooting

Native Auth error responses commonly include:

- `error`
- `error_description`
- `error_codes`
- `timestamp`
- `trace_id`
- `correlation_id`
- `suberror` (scenario-specific)

Operational guidance:

1. Log and preserve `trace_id` and `correlation_id` for support diagnostics.
2. Handle `expired_token` by restarting the current flow.
3. Handle `invalid_oob_value` with bounded retry UX.
4. Handle password policy suberrors such as `password_too_weak` explicitly.
5. Handle `challenge_type=redirect` as a control path, not a transport failure.

### Sign-Up and SSPR in the Reference

The Microsoft reference also documents:

- Sign-up endpoints under `/signup/v1.0/*`
- SSPR endpoints under `/resetpassword/v1.0/*`

This repo now includes baseline sign-up and SSPR flows using the documented
continuation-token and redirect-fallback patterns.

## Postman Collection Deep Dive

Collection file:

- [public/EEID Native Auth.postman_collection.json](public/EEID%20Native%20Auth.postman_collection.json)

This collection provides a manual, request-by-request Native Auth test harness
for email/password sign-in and MFA completion against Entra External ID
endpoints.

### Purpose and Scope

- Exercises direct Native Auth endpoints from Postman.
- Validates continuation token progression between calls.
- Covers both first-factor sign-in and second-factor MFA token exchange.
- Uses collection variables so operators can run the same flow across tenants.

Note:

- The browser app in this repo uses a local proxy because Native Auth endpoints
  don't support browser CORS.
- Postman calls are not browser-origin constrained in the same way, so this
  collection targets tenant endpoints directly.

### Variables Used

Required setup variables:

- `tenant_name`: tenant subdomain used in `https://{tenant_name}.ciamlogin.com`.
- `tenant_id`: tenant path segment used in endpoint URLs.
- `client_id_new`: app registration client ID.
- `username`: customer user email/username for sign-in.
- `password`: first-factor password (email/password flow).

Flow state variables:

- `continuation_token`: updated after most requests by collection test scripts.
- `mfa_challenge_id`: selected method `id` from introspect result for MFA challenge.

### Request Sequence and Behavior

1. `Signin - Initiate`

- Endpoint: `/oauth2/v2.0/initiate`
- Sends: `client_id`, `challenge_type=password oob redirect`, `username`, capabilities.
- On success test script stores `continuation_token`.

1. `SignIn - Challenge`

- Endpoint: `/oauth2/v2.0/challenge`
- Sends: `client_id`, `challenge_type`, capabilities, `continuation_token`.
- Selects required method and returns next continuation token.

1. `SignIn - Token`

- Endpoint: `/oauth2/v2.0/token`
- Sends: `grant_type=password`, `password`, `scope=openid offline_access`, plus continuation token.
- Successful path returns security tokens.
- Conditional path can return `mfa_required` or `registration_required`.

1. `SignIn - Intrsopect` (collection item name contains this typo)

- Endpoint: `/oauth2/v2.0/introspect`
- Sends: `client_id`, `continuation_token`.
- Returns registered strong-auth methods and a fresh continuation token.

1. `SignIn - Challenge with MFA`

- Endpoint: `/oauth2/v2.0/challenge`
- Sends: `client_id`, `continuation_token`, `id={{mfa_challenge_id}}`.
- Triggers delivery of MFA out-of-band challenge code.

1. `SignIn - Token with MFA`

- Endpoint: `/oauth2/v2.0/token`
- Sends: `grant_type=mfa_oob`, `oob=<otp>`, `scope=openid offline_access`, continuation token.
- On success returns final token set.

### Built-In Test Scripts in the Collection

Most requests include a simple test script that reads JSON response and sets:

- `pm.collectionVariables.set("continuation_token", jsonData.continuation_token)`

Operational implication:

- Run requests in order so `continuation_token` is always current.
- If a request fails with token-related errors, restart from initiate.

### Operator Runbook

1. Populate required variables in the collection.
2. Run `Signin - Initiate`.
3. Run `SignIn - Challenge`.
4. Run `SignIn - Token`.
5. If response indicates MFA is required, run `SignIn - Intrsopect`.
6. Set `mfa_challenge_id` from the chosen method ID in introspect response.
7. Run `SignIn - Challenge with MFA`.
8. Enter the received OTP into the `oob` field in `SignIn - Token with MFA`.
9. Run `SignIn - Token with MFA`.

### Important Notes and Safety

- Include `redirect` in `challenge_type` to stay aligned with API requirements.
- Capture and retain `trace_id` and `correlation_id` from error responses.
- Avoid storing real secrets/tokens in exported collection files.
- The `SignIn - Token with MFA` request currently contains sample disabled fields
  for refresh token experimentation; keep them disabled unless explicitly needed.

## What This Demo Is For

- Client demos of authentication experience options
- Side-by-side comparison of native and hosted sign-in patterns
- Token inspection (access token, ID token, refresh token)
- Microsoft Graph authentication method listing and phone method registration
- Operator diagnostics with masked request/response payloads and trace IDs
- Tenant-specific sign-up attribute enforcement through runtime config

## What This Demo Is Not For

- Production-ready identity UX out of the box
- Backend API authorization patterns
- Privileged Graph beta operations directly from an end-user delegated token

## Architecture Overview

- Static frontend served by Express
- Local proxy for Native Auth API calls in development
- MSAL Browser for popup/redirect flows
- Axios for Native Auth and Graph calls

## Project Structure

```text
server.js                # Express static server (port 8080)
cors.js                  # Dev proxy (port 3001)
cors_prod.js             # Production proxy variant
proxy.config.js          # Proxy target configuration
package.json
public/
  index.html             # Main app UI
  app.css                # CodexJay styling and responsive layout
  config.js              # Entra/MSAL and API endpoint configuration
  httpClient.js          # HTTP helpers
  ui.js                  # Session, token rendering, auth methods UI
  nativeAuth.js          # Native Auth + MFA + registration flow
  msalAuth.js            # MSAL popup and redirect flows
  app.js                 # App orchestration and logout behavior
  redirect.html          # Redirect landing page for popup/redirect flows
```

## Prerequisites

- Node.js 16+
- A Microsoft Entra External ID tenant
- An app registration with the required delegated scopes

Recommended delegated scopes for this sample:

- `openid`
- `profile`
- `email`
- `User.Read`
- `UserAuthenticationMethod.Read`
- `UserAuthMethod-Phone.ReadWrite`

## Quick Start

```bash
npm install
npm run start:env
npm run cors:env
```

## Phase 1 Operator Guide

### Sign-up flow

The sign-up path now uses the Microsoft Native Auth sign-up endpoints:

1. `/signup/v1.0/start`
2. `/signup/v1.0/challenge`
3. `/signup/v1.0/continue`
4. `/oauth2/v2.0/token` with `grant_type=continuation_token`

Operational notes:

- The app always captures the latest `continuation_token` and carries it forward.
- If the tenant demands a browser-hosted fallback, the app surfaces a diagnostics panel instead of silently failing.
- Tenant-specific required attributes can be enforced with `SIGNUP_REQUIRED_ATTRIBUTES`.
- A prefilled attribute JSON template can be supplied with `SIGNUP_ATTRIBUTE_TEMPLATE`.

Example:

```bash
SIGNUP_REQUIRED_ATTRIBUTES=postalCode,city
SIGNUP_ATTRIBUTE_TEMPLATE={"postalCode":"98052","city":"Redmond"}
```

### SSPR flow

The reset-password path now uses:

1. `/resetpassword/v1.0/start`
2. `/resetpassword/v1.0/challenge`
3. `/resetpassword/v1.0/continue`
4. `/resetpassword/v1.0/submit`
5. `/resetpassword/v1.0/poll_completion`
6. `/oauth2/v2.0/token` for post-reset automatic sign-in

Operational notes:

- The app polls until the reset returns `status=succeeded` or a terminal failure.
- Password-policy failures are preserved in the diagnostics payload.
- Reset flow errors should be handled using `trace_id` and `correlation_id` from the diagnostics panel.

### Demo mode and diagnostics

- Raw token values are hidden by default.
- Demo mode stores its state in `sessionStorage` and only affects the current browser session.
- The diagnostics dialog captures:
  - endpoint
  - flow step
  - status and suberror
  - trace and correlation IDs
  - masked request and response payloads

### Real tenant validation

This repo currently ships without a local `.env`, so the sample cannot exercise a real tenant until you provide actual values for `CLIENT_ID`, `TENANT_ID`, and `TENANT_SUBDOMAIN`.

To validate against a tenant:

1. Create a `.env` from [.env.example](.env.example).
2. Set the Entra tenant and app registration values.
3. Add any tenant-required sign-up attributes.
4. Run `npm run start:env` and `npm run cors:env`.
5. Exercise sign-up and reset-password from the browser UI.

## Smoke Tests

Phase 1 now includes a lightweight smoke suite in [tests/phase1.smoke.test.js](tests/phase1.smoke.test.js).

Run it with:

```bash
npm test
```

The smoke suite validates:

- Phase 1 endpoint configuration
- runtime-enforced sign-up attribute requirements
- sign-up request shaping
- reset-password submit and poll behavior
- demo mode session behavior

This is a contract-level smoke suite, not a full browser end-to-end harness. It is designed to catch regressions in the implemented Phase 1 flow helpers without adding new test dependencies.

## Graph Client Split

Phase 2 has started by separating Graph code into two lanes:

- Self-service delegated client: [public/graphSelfServiceClient.js](public/graphSelfServiceClient.js)
- Operator beta client: [public/graphOperatorClient.js](public/graphOperatorClient.js)

Rules:

- End-user profile, auth-method inventory, TAP reads, phone-method registration, and session revocation stay in the self-service client.
- Beta reporting and operator lookups stay in the operator client and are guarded by `ENABLE_OPERATOR_MODE` and `ENABLE_BETA_GRAPH`.
- UI code should call the client functions instead of raw Graph URLs so the separation remains enforceable as more operator features are added.

## Run Both Services Together

This repo needs two local processes during development:

- App server (`server.js`) on `http://localhost:8080`
- CORS proxy (`cors.js`) on `http://localhost:3001`

Use one of the options below.

### Option 1: Unified Startup Command (Recommended)

```bash
npm run dev
```

What it does:

- Kills listeners on the app and proxy ports before startup
- Runs `npm run start:env`
- Runs `npm run cors:env`
- Streams both logs in one terminal with process prefixes
- Handles Ctrl+C by shutting down both child processes

`start:env` scripts use `--env-file-if-exists=.env`, so startup still works with defaults if `.env` is not present.

Strict stop command:

```bash
npm run stop
```

This command kills active listeners on the configured app/proxy ports.

Plain log mode (no ANSI colors):

```bash
npm run dev:plain
```

### Option 2: Start Services Separately

```bash
npm run start:env
npm run cors:env
```

Use this mode if you prefer one terminal per process.

Each start command performs a pre-launch port cleanup first.

### Option 3: VS Code Tasks

This repo now includes [`.vscode/tasks.json`](.vscode/tasks.json) with ready-to-run tasks:

- `Start App Server (.env)`
- `Start CORS Proxy (.env)`
- `Start Demo Stack`
- `Stop Demo Stack`

How to run:

1. In VS Code, open Run Task.
2. Select `Start Demo Stack` for one-task startup.
3. Or run the app/proxy tasks individually.
4. Use `Stop Demo Stack` to perform strict teardown.

Open:

- App: `http://localhost:8080`
- Proxy: `http://localhost:3001`
- Settings page: `http://localhost:8080/settings.html`

## Configuration

Configuration is template-driven through environment variables.

1. Create `.env` from `.env.example`
2. Replace only the placeholder values for the target client tenant/app
3. Start app/proxy using the `:env` scripts

```bash
copy .env.example .env
```

The frontend receives runtime config via `GET /app-config.js` from `server.js`, so onboarding does not require code edits.

You can view the effective configured environment values in the built-in settings page:

- `GET /settings.html` (UI)
- `GET /settings-config.json` (raw JSON)

Key environment variables:

- `CLIENT_ID`
- `TENANT_ID`
- `TENANT_SUBDOMAIN`
- `ENTRA_AUTHORITY_HOST`
- `PROXY_TARGET` (optional override)
- `PUBLIC_BASE_API_URL`
- `REDIRECT_URI`
- `LOGIN_SCOPES`
- `LOCALE` (for UI language, default `en`)
- `THEME` (default UI theme: `azure-portal`, `enterprise-blue`, `fintech-slate`)

For local development, `PUBLIC_BASE_API_URL` should usually point to `http://localhost:3001/api`.

## Startup Script Deep Dive

The unified launcher is implemented in [`scripts/start-stack.js`](scripts/start-stack.js).

Port cleanup helpers are implemented in [`scripts/port-utils.js`](scripts/port-utils.js),
[`scripts/kill-ports.js`](scripts/kill-ports.js), and [`scripts/stop-stack.js`](scripts/stop-stack.js).

Responsibilities:

- Detects target ports from `.env`/defaults (`APP_PORT`, `CORS_PORT`)
- Kills existing listeners before launch to avoid stale-process conflicts
- Spawns the app server and CORS proxy as child processes
- Prefixes output as `[APP]` and `[CORS]`
- Exits the full stack if either process exits unexpectedly
- Gracefully terminates both processes on `SIGINT` / `SIGTERM`

This gives deterministic local behavior for demos and reduces mistakes from forgetting to start the proxy.

### Localization

UI text is centralized in `public/i18n.js` and loaded at runtime.

- Default locale comes from `LOCALE` in `.env`
- On successful login, the app attempts to read locale claims from Entra tokens (`preferred_language`, `locale`, `ui_locales`) and applies them dynamically
- Users can switch locale at runtime via `setLocale('en')` or `setLocale('es')` in the browser console
- Add new languages by extending the `translations` object in `public/i18n.js`

### Themeing

The UI supports runtime theme presets for demos.

- Default theme comes from `THEME` in `.env`
- Supported values: `azure-portal`, `enterprise-blue`, `fintech-slate`
- Users can switch theme live from the header dropdown; the choice is persisted in browser storage

## Repository Deep Dive

### Runtime Components

- [`server.js`](server.js): Express host for static assets and runtime config endpoints (`/app-config.js`, `/settings-config.json`).
- [`cors.js`](cors.js): Development CORS proxy that forwards local `/api` calls to Entra tenant endpoints.
- [`cors_prod.js`](cors_prod.js): Stricter production-oriented CORS proxy variant with origin allowlist behavior.
- [`proxy.config.js`](proxy.config.js): Derives proxy target and ports from `.env` with sensible defaults.

### Frontend Composition

- [`public/index.html`](public/index.html): Main sign-in shell, auth panels, dialogs, and authenticated dashboard.
- [`public/app.css`](public/app.css): Global styling, responsive layout, theme variables, settings-page styles.
- [`public/app.js`](public/app.js): App bootstrap, theme initialization, session restore, and logout orchestration.
- [`public/config.js`](public/config.js): Resolves runtime config from `window.__APP_CONFIG__` into MSAL/native auth settings.
- [`public/httpClient.js`](public/httpClient.js): Shared HTTP request helpers.
- [`public/nativeAuth.js`](public/nativeAuth.js): Native auth and MFA challenge/registration logic.
- [`public/msalAuth.js`](public/msalAuth.js): Popup and redirect auth integration via MSAL Browser.
- [`public/ui.js`](public/ui.js): Session token persistence, token display rendering, and auth method UI behavior.
- [`public/i18n.js`](public/i18n.js): Client-side localization dictionary and translation application helper.
- [`public/settings.html`](public/settings.html): Settings UI showing effective environment-driven values grouped by section.
- [`public/redirect.html`](public/redirect.html): Redirect callback page for MSAL redirect flow.

### Developer Tooling

- [`package.json`](package.json): npm scripts for app, proxy, env-driven starts, and combined stack startup.
- [`scripts/start-stack.js`](scripts/start-stack.js): unified stack startup with pre-launch port cleanup.
- [`scripts/stop-stack.js`](scripts/stop-stack.js): strict stop command to tear down listeners on app/proxy ports.
- [`scripts/kill-ports.js`](scripts/kill-ports.js): reusable utility command for port cleanup.
- [`scripts/port-utils.js`](scripts/port-utils.js): shared port detection + process termination logic.
- [`.env.example`](.env.example): Template for tenant/client onboarding by variable substitution only.
- [`.vscode/tasks.json`](.vscode/tasks.json): VS Code run tasks for app, proxy, and unified stack.

### Request/Config Flow

1. Browser requests `GET /app-config.js` from [`server.js`](server.js).
2. Runtime config is injected into `window.__APP_CONFIG__`.
3. [`public/config.js`](public/config.js) builds MSAL/native endpoints from runtime values.
4. Frontend sends native auth traffic to `PUBLIC_BASE_API_URL` (`/api` on local CORS proxy).
5. [`cors.js`](cors.js) forwards to configured Entra tenant endpoints.
6. Settings page requests `GET /settings-config.json` to display effective env values.

## Session Behavior

Native Auth tokens are stored in `sessionStorage` and restored on page load.

Stored keys:

- `nativeAuth_access_token`
- `nativeAuth_id_token`
- `nativeAuth_refresh_token`
- `nativeAuth_interaction_type`

Logout behavior:

- Native flow: calls `POST https://graph.microsoft.com/v1.0/me/revokeSignInSessions` then clears session storage
- MSAL flows: uses `logoutPopup()` or `logoutRedirect()` based on interaction type

## Security Notes

- The development proxy is for local demos and should not be used as-is in production.
- Keep app registration secrets and sensitive config out of source control.
- Validate tenant/app registration permissions before client demos.

## Customizing For A New Client

1. Copy `.env.example` to `.env`
2. Fill in `CLIENT_ID`, `TENANT_ID`, and `TENANT_SUBDOMAIN`
3. Optionally set `PROXY_TARGET` if your endpoint is custom
4. Run `npm run start:env` and `npm run cors:env`
5. (Optional) adjust branding copy/theme in `public/index.html` and `public/app.css`

## License

This sample is provided for demonstration purposes.
