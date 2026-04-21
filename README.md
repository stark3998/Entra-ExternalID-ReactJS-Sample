# CodexJay External ID JavaScript Demo

A reusable sample web app for demonstrating Microsoft Entra External ID capabilities across different client conversations.

This project showcases three sign-in approaches in a single UI:

- Native Auth (email/password over Entra Native Auth APIs)
- MSAL Popup (hosted sign-in popup)
- MSAL Redirect (full-page hosted sign-in)

It also demonstrates self-service sign-up, self-service password reset, MFA challenges, MFA method registration, demo-mode token visibility, and operator-grade diagnostics where supported by tenant policy.

Latest customizations in this repo include:

- Env-driven dynamic sign-up field rendering (grouped sections + optional advanced JSON editor)
- Phone-based "forgot email" recovery using a backend Graph app-registration flow
- Runtime configuration endpoints for browser bootstrap and settings inspection
- Unified app+proxy startup/stop scripts with strict port cleanup
- Docker single-container run path exposing both app and proxy ports

## Index

- [Native Auth Flow Deep Dive](#native-auth-flow-deep-dive)
- [Postman Collection Deep Dive](#postman-collection-deep-dive)
- [What This Demo Is For](#what-this-demo-is-for)
- [What This Demo Is Not For](#what-this-demo-is-not-for)
- [Architecture Overview](#architecture-overview)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Fast Feature Checklist](#fast-feature-checklist)
- [Run Both Services Together](#run-both-services-together)
- [Docker Deployment](#docker-deployment)
- [Configuration](#configuration)
- [Environment Profiles](#environment-profiles)
- [Feature Customizations](#feature-customizations)
- [Phone-Based Email Recovery](#phone-based-email-recovery)
- [Sign-Up Layout Customization](#sign-up-layout-customization)
- [Manual End-to-End Test Playbook](#manual-end-to-end-test-playbook)
- [API Verification Commands](#api-verification-commands)
- [Phase 1 Operator Guide](#phase-1-operator-guide)
- [Smoke Tests](#smoke-tests)
- [Graph Client Split](#graph-client-split)
- [Startup Script Deep Dive](#startup-script-deep-dive)
- [Repository Deep Dive](#repository-deep-dive)
- [Demo Scripts](#demo-scripts)
- [Token Refresh Strategy](#token-refresh-strategy)
- [Session Behavior](#session-behavior)
- [Security Notes](#security-notes)
- [Troubleshooting](#troubleshooting)
- [Known Limitations](#known-limitations)
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
- For this reason, this repo uses [services/cors.js](services/cors.js) as a local forwarding proxy.
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

- Flow orchestration: [public/js/nativeAuth.js](public/js/nativeAuth.js)
- Method rendering and dialogs: [public/js/ui.js](public/js/ui.js)

### Strong Method Registration Branch

When `/oauth2/v2.0/token` indicates `suberror=registration_required`:

1. `/register/v1.0/introspect` to get enrollable methods.
2. `/register/v1.0/challenge` to send enrollment challenge.
3. `/register/v1.0/continue` to submit OTP or preverified continuation.
4. `/oauth2/v2.0/token` with `grant_type=continuation_token` to complete auth.

Repo mapping:

- Registration calls: [public/js/config.js](public/js/config.js)
- Registration flow handling: [public/js/nativeAuth.js](public/js/nativeAuth.js)

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

- [public/assets/EEID Native Auth.postman_collection.json](public/assets/EEID%20Native%20Auth.postman_collection.json)

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
- Fetch-based HTTP client wrappers for Native Auth and Graph calls

## Project Structure

```text
services/
  server.js              # Express static server (port 8080)
  cors.js                # Dev proxy (port 3001)
  cors_prod.js           # Production proxy variant
config/
  proxy.config.js        # Proxy target configuration
archive/
  cors_old.js            # Legacy proxy implementation (reference only)
package.json
public/
  index.html             # Main app UI
  css/app.css            # CodexJay styling and responsive layout
  js/config.js           # Entra/MSAL and API endpoint configuration
  js/httpClient.js       # HTTP helpers
  js/ui.js               # Session, token rendering, auth methods UI
  js/nativeAuth.js       # Native Auth + MFA + registration flow
  js/msalAuth.js         # MSAL popup and redirect flows
  js/app.js              # App orchestration and logout behavior
  redirect.html          # Redirect landing page for popup/redirect flows
  settings.html          # Runtime settings inspection page
  assets/EEID Native Auth.postman_collection.json
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
copy .env.example .env
npm run dev
```

Open `http://localhost:8080` after startup.

If you prefer separate processes:

```bash
npm run start:env
npm run cors:env
```

## Fast Feature Checklist

Use this section to quickly validate major capabilities after initial setup.

1. Open `http://localhost:8080` and confirm login UI renders.
2. Open sign-up dialog and verify dynamic fields appear.
3. Complete native sign-up with OTP challenge.
4. Sign in with native email/password and verify token panel populates.
5. Trigger reset password flow and complete `poll_completion` stage.
6. Run MSAL popup sign-in and verify authenticated dashboard.
7. Open settings page `http://localhost:8080/settings.html` and confirm runtime values.
8. If enabled, run forgot-email flow with phone recovery.
9. Run smoke tests: `npm test`.

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

- Self-service delegated client: [public/js/graphSelfServiceClient.js](public/js/graphSelfServiceClient.js)
- Operator beta client: [public/js/graphOperatorClient.js](public/js/graphOperatorClient.js)

Rules:

- End-user profile, auth-method inventory, TAP reads, phone-method registration, and session revocation stay in the self-service client.
- Beta reporting and operator lookups stay in the operator client and are guarded by `ENABLE_OPERATOR_MODE` and `ENABLE_BETA_GRAPH`.
- UI code should call the client functions instead of raw Graph URLs so the separation remains enforceable as more operator features are added.

## Run Both Services Together

This repo needs two local processes during development:

- App server (`services/server.js`) on `http://localhost:8080`
- CORS proxy (`services/cors.js`) on `http://localhost:3001`

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

## Docker Deployment

This repo now includes a single-container setup that runs both processes automatically:

- Frontend/app server on port `8080`
- CORS proxy on port `3001`

### Option 1: Docker Compose (Recommended)

```bash
docker compose up --build
```

Run detached:

```bash
docker compose up -d --build
```

Stop:

```bash
docker compose down
```

### Option 2: Docker CLI

Build image:

```bash
docker build -t external-id-demo:latest .
```

Run container:

```bash
docker run --rm -p 8080:8080 -p 3001:3001 --name external-id-demo external-id-demo:latest
```

### Environment Variables

`docker-compose.yml` loads runtime values from your local `.env` file using `env_file`.

To customize tenant/app values, update `.env` (or create one from `.env.example`) before running compose. Common values:

- `CLIENT_ID`
- `TENANT_ID`
- `TENANT_SUBDOMAIN`
- `PUBLIC_BASE_API_URL` (default: `http://localhost:3001/api`)

### Why two exposed ports?

The browser calls the proxy URL directly, so the proxy must be reachable from your host. This is why both `8080` (app) and `3001` (proxy) are published by default.

## Configuration

Configuration is template-driven through environment variables.

1. Create `.env` from `.env.example`
2. Replace only the placeholder values for the target client tenant/app
3. Start app/proxy using the `:env` scripts

```bash
copy .env.example .env
```

The frontend receives runtime config via `GET /app-config.js` from `services/server.js`, so onboarding does not require code edits.

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
- `ALLOW_INSECURE_TLS` (set only for local TLS-inspection troubleshooting)

Runtime config endpoints:

- `GET /app-config.js` (browser bootstrap payload in JS)
- `GET /settings-config.json` (effective runtime/env JSON)
- `GET /settings.html` (human-friendly settings UI)

For local development, `PUBLIC_BASE_API_URL` should usually point to `http://localhost:3001/api`.

## Environment Profiles

Recommended `.env` profiles for common scenarios.

### Profile A: Basic Native Auth Demo

- `ENABLE_OPERATOR_MODE=false`
- `ENABLE_BETA_GRAPH=false`
- `LOOKUP_RECOVERY_ENABLED=false`
- `SIGNUP_SHOW_ADVANCED_JSON=false`

### Profile B: Full Operator + Recovery Demo

- `ENABLE_OPERATOR_MODE=true`
- `ENABLE_BETA_GRAPH=true`
- `LOOKUP_RECOVERY_ENABLED=true`
- `LOOKUP_DISCLOSURE_MODE=masked-email` (or `full-email` for controlled demos)
- `SIGNUP_SHOW_ADVANCED_JSON=true`

### Profile C: Security-Conservative Demo

- `DEMO_MODE=false`
- `LOOKUP_DISCLOSURE_MODE=generic-recovery-message`
- Avoid `ALLOW_INSECURE_TLS=true` unless local TLS interception breaks requests
- Keep production secrets out of `.env.example`

## Feature Customizations

This repo is designed for no-code onboarding of new tenants and demo variants using `.env` values.

Feature toggles and behaviors:

- `DEMO_MODE`: controls token visibility defaults and demo UX behavior
- `ENABLE_OPERATOR_MODE`: enables operator-only diagnostics and controls
- `ENABLE_BETA_GRAPH`: enables beta Graph paths used by operator workflows
- `LOOKUP_RECOVERY_ENABLED`: enables backend phone-to-email recovery endpoint
- `LOOKUP_DISCLOSURE_MODE`: `full-email`, `masked-email`, or `generic-recovery-message`
- `LOOKUP_PHONE_SOURCE`: `mobilePhone`, `businessPhones`, or `profile`

## Phone-Based Email Recovery

The app implements a backend recovery endpoint that looks up users by phone in Microsoft Graph using an app registration (client credentials flow).

Endpoint:

- `POST /account-recovery/email-by-phone`

Required env settings:

- `LOOKUP_RECOVERY_ENABLED=true`
- `LOOKUP_APP_CLIENT_ID`
- `LOOKUP_APP_CLIENT_SECRET`
- `LOOKUP_APP_TENANT_ID`
- `LOOKUP_GRAPH_SCOPE` (default `https://graph.microsoft.com/.default`)

Expected Graph permission model:

- Application permission `User.Read.All` on the lookup app registration
- Admin consent granted in the target tenant

Operational notes:

- Requests are rate-limited in-memory per source IP
- Phone values are normalized before comparison
- Audit logs avoid raw phone/email values by using hashed identifiers
- Disclosure mode controls whether the response returns full email, masked email, or generic text

## Sign-Up Layout Customization

Sign-up fields are rendered dynamically from runtime configuration.

Primary env variables:

- `SIGNUP_ENABLED_ATTRIBUTES`: comma-separated Entra attribute names to render
- `SIGNUP_REQUIRED_ATTRIBUTES`: comma-separated attributes enforced before submit
- `SIGNUP_SHOW_ADVANCED_JSON`: enables advanced raw JSON editor in the dialog
- `SIGNUP_FIELD_OVERRIDES`: JSON object for per-field overrides (section, defaultValue, etc.)
- `SIGNUP_ATTRIBUTE_TEMPLATE`: JSON prefill for advanced attributes

Supported built-in sign-up attributes:

- `displayName`
- `givenName`
- `surname`
- `username`
- `city`
- `country`
- `postalCode`
- `state`
- `streetAddress`
- `jobTitle`

Example:

```dotenv
SIGNUP_ENABLED_ATTRIBUTES=displayName,givenName,surname,username,city,country,postalCode,state,streetAddress,jobTitle
SIGNUP_SHOW_ADVANCED_JSON=true
SIGNUP_REQUIRED_ATTRIBUTES=displayName
SIGNUP_FIELD_OVERRIDES={"postalCode":{"section":"address","defaultValue":"98052"}}
SIGNUP_ATTRIBUTE_TEMPLATE={"city":"Redmond"}
```

Behavior notes:

- The email address remains a dedicated sign-up field and is not part of attributes JSON
- Structured field values and advanced JSON are merged at submit time
- Advanced JSON keys override conflicting structured field keys

## Manual End-to-End Test Playbook

Run this sequence for a complete repository validation.

### 1. Stack startup

1. `npm run stop`
2. `npm run dev:plain`
3. Confirm app listener is up: `http://localhost:8080`
4. Confirm proxy listener is up: `http://localhost:3001`

### 2. Native sign-up with dynamic attributes

1. Click `Create account`.
2. Confirm configured dynamic fields are visible.
3. Enter email/password and optional attributes.
4. Complete OTP challenge.
5. Confirm post-sign-up token completion succeeds.

### 3. Native sign-in + refresh

1. Sign in with created account.
2. Confirm token panel shows access/id token metadata.
3. If refresh token is present, use refresh action and verify updated timestamps.

### 4. SSPR flow

1. Click reset password path.
2. Complete challenge and code.
3. Submit new password.
4. Confirm completion polling reaches `succeeded`.

### 5. Forgot-email recovery

1. Ensure `LOOKUP_RECOVERY_ENABLED=true`.
2. Use phone number dialog.
3. Verify response behavior matches disclosure mode.

### 6. MSAL hosted paths

1. Test popup login.
2. Test redirect login.
3. Confirm logout works for each interaction mode.

### 7. Config and diagnostics validation

1. Open `http://localhost:8080/settings.html`.
2. Verify key env values appear as expected.
3. Force a known error (bad OTP, wrong password) and verify diagnostics panel includes trace/correlation IDs.

## API Verification Commands

Use these commands from the repo root while services are running.

Check runtime config payload:

```powershell
curl.exe -s http://localhost:8080/app-config.js
```

Check settings JSON:

```powershell
curl.exe -s http://localhost:8080/settings-config.json
```

Check signup layout markup in served page:

```powershell
curl.exe -s http://localhost:8080 | Select-String -Pattern "signUpDynamicFields|signUpAdvancedAttributesWrapper|signUpAdvancedToggle|signUpAdvancedAttributesPanel" -Context 0,0 | Out-String
```

Check phone recovery endpoint:

```powershell
curl.exe -s -X POST "http://localhost:8080/account-recovery/email-by-phone" -H "Content-Type: application/x-www-form-urlencoded" --data-urlencode "phone_number=2066100282"
```

Run smoke suite:

```bash
npm test
```

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

UI text is centralized in `public/js/i18n.js` and loaded at runtime.

- Default locale comes from `LOCALE` in `.env`
- On successful login, the app attempts to read locale claims from Entra tokens (`preferred_language`, `locale`, `ui_locales`) and applies them dynamically
- Users can switch locale at runtime via `setLocale('en')` or `setLocale('es')` in the browser console
- Add new languages by extending the `translations` object in `public/js/i18n.js`

### Theming

The UI supports runtime theme presets for demos.

- Default theme comes from `THEME` in `.env`
- Supported values: `azure-portal`, `enterprise-blue`, `fintech-slate`
- Users can switch theme live from the header dropdown; the choice is persisted in browser storage

## Repository Deep Dive

### Runtime Components

- [`services/server.js`](services/server.js): Express host for static assets and runtime config endpoints (`/app-config.js`, `/settings-config.json`).
- [`services/cors.js`](services/cors.js): Development CORS proxy that forwards local `/api` calls to Entra tenant endpoints.
- [`services/cors_prod.js`](services/cors_prod.js): Stricter production-oriented CORS proxy variant with origin allowlist behavior.
- [`config/proxy.config.js`](config/proxy.config.js): Derives proxy target and ports from `.env` with sensible defaults.

### Frontend Composition

- [`public/index.html`](public/index.html): Main sign-in shell, auth panels, dialogs, and authenticated dashboard.
- [`public/css/app.css`](public/css/app.css): Global styling, responsive layout, theme variables, settings-page styles.
- [`public/js/app.js`](public/js/app.js): App bootstrap, theme initialization, session restore, and logout orchestration.
- [`public/js/config.js`](public/js/config.js): Resolves runtime config from `window.__APP_CONFIG__` into MSAL/native auth settings.
- [`public/js/httpClient.js`](public/js/httpClient.js): Shared HTTP request helpers.
- [`public/js/nativeAuth.js`](public/js/nativeAuth.js): Native auth and MFA challenge/registration logic.
- [`public/js/msalAuth.js`](public/js/msalAuth.js): Popup and redirect auth integration via MSAL Browser.
- [`public/js/ui.js`](public/js/ui.js): Session token persistence, token display rendering, and auth method UI behavior.
- [`public/js/i18n.js`](public/js/i18n.js): Client-side localization dictionary and translation application helper.
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

1. Browser requests `GET /app-config.js` from [`services/server.js`](services/server.js).
2. Runtime config is injected into `window.__APP_CONFIG__`.
3. [`public/js/config.js`](public/js/config.js) builds MSAL/native endpoints from runtime values.
4. Frontend sends native auth traffic to `PUBLIC_BASE_API_URL` (`/api` on local CORS proxy).
5. [`services/cors.js`](services/cors.js) forwards to configured Entra tenant endpoints.
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

## Demo Scripts

Use these ready-made scripts when presenting this repository to clients.

### 5-Minute Demo Script (Executive Overview)

Goal: quickly show breadth of auth experiences and runtime customization.

1. Start stack: `npm run dev:plain`.
2. Open app: `http://localhost:8080`.
3. Show the three entry points on one screen: Native Auth, MSAL Popup, and MSAL Redirect.
4. Open `Create account` dialog and point out dynamic sign-up fields.
5. Show `Advanced attributes` toggle and explain env-driven behavior.
6. Run quick sign-in (native or MSAL) and show token panel.
7. Open `http://localhost:8080/settings.html` to show runtime config with no code changes.
8. Optional close: show forgot-email phone recovery if enabled.

Talk track:

- "This app demonstrates multiple Entra auth patterns in one reusable shell."
- "Behavior and form fields are controlled by env values, not code edits."
- "Operators can validate effective runtime values from the built-in settings view."

### 15-Minute Demo Script (Technical Walkthrough)

Goal: show end-to-end feature depth, operational diagnostics, and testability.

1. Startup and health check: run `npm run stop`, then `npm run dev:plain`, and confirm app (`8080`) and proxy (`3001`) are active.
2. Sign-up flow walkthrough: open sign-up dialog, highlight configured fields (`SIGNUP_ENABLED_ATTRIBUTES`), and explain `SIGNUP_REQUIRED_ATTRIBUTES`, `SIGNUP_FIELD_OVERRIDES`, and JSON merge behavior.
3. Native auth sign-in and challenge handling: demonstrate challenge progression and token result, and explain continuation-token sequencing.
4. SSPR walkthrough: trigger reset password and explain challenge, submit, and `poll_completion` stages.
5. Phone-based email recovery (if enabled): show lookup dialog, explain disclosure modes (`full-email`, `masked-email`, `generic-recovery-message`), and emphasize backend app-registration security model.
6. Hosted auth comparison: run MSAL popup or redirect sign-in and compare hosted vs native UX and token handling.
7. Diagnostics and observability: force a controlled error (bad OTP/password) and show trace/correlation IDs in diagnostics.
8. Testability close: run `npm test`, explain smoke suite coverage, and show API checks from `API Verification Commands`.

Talk track:

- "Native auth and hosted auth coexist so teams can compare tradeoffs live."
- "The proxy and runtime config endpoints make local testing deterministic."
- "Recovery, diagnostics, and smoke tests make this suitable for repeatable demos and handoffs."

## Security Notes

- The development proxy is for local demos and should not be used as-is in production.
- Keep app registration secrets and sensitive config out of source control.
- Validate tenant/app registration permissions before client demos.

## Troubleshooting

### App appears to start, but stack command exits with code 1

- Cause: one child process exits (or stale listeners from another terminal remain), so stack supervisor exits.
- Fix:
  1. Run `npm run stop`
  2. Verify ports are free
  3. Run `npm run dev:plain` and watch `[APP]` and `[CORS]` logs

### Native auth browser requests fail with CORS error

- Verify proxy is running on `3001`.
- Verify `PUBLIC_BASE_API_URL=http://localhost:3001/api`.
- Confirm `services/cors.js` target tenant is correct.

### Runtime config does not reflect recent `.env` edits

- Ensure there are no duplicate keys later in `.env` overriding earlier values.
- Restart app/proxy after edits (`npm run stop`, then `npm run dev`).
- Confirm effective values in `http://localhost:8080/settings.html`.

### Phone recovery returns disabled response

- Ensure `LOOKUP_RECOVERY_ENABLED=true`.
- Confirm lookup app credentials are set.
- Confirm Graph app-permission `User.Read.All` and admin consent are in place.

### TLS/certificate errors to tenant endpoint in local corporate network

- Keep `ALLOW_INSECURE_TLS=false` by default.
- For local troubleshooting only, set `ALLOW_INSECURE_TLS=true` and restart.

## Known Limitations

- The local proxy is a development convenience and not a production gateway.
- Phone lookup throttling is in-memory and resets on process restart.
- Smoke tests are contract-level and do not replace browser E2E coverage.
- Some tenant policies can force `redirect` branch behavior even when native challenge types are supplied.
- Live browser automation/inspection in VS Code depends on local browser tool settings.

## Customizing For A New Client

1. Copy `.env.example` to `.env`
2. Fill in `CLIENT_ID`, `TENANT_ID`, and `TENANT_SUBDOMAIN`
3. Optionally set `PROXY_TARGET` if your endpoint is custom
4. Run `npm run start:env` and `npm run cors:env`
5. (Optional) adjust branding copy/theme in `public/index.html` and `public/css/app.css`

## Token Refresh Strategy

This demo implements automatic token renewal to maintain session continuity during operator demos and extended user interactions. Different renewal strategies apply depending on the authentication path.

### MSAL Session Renewal (Automatic Silent Refresh)

**Strategy:** Scheduled silent refresh with exponential backoff retry logic

**How it works:**

1. **Scheduler**: On successful MSAL login, the app automatically schedules the next silent refresh 5 minutes before token expiry.
2. **Automatic renewal**: At the scheduled time, the app calls `msalInstance.acquireTokenSilent()` without user interaction, acquiring a new access token using the cached account.
3. **Reschedule on success**: After a successful silent refresh, the next refresh is automatically rescheduled 5 minutes before the new token's expiry.
4. **Page restore**: If the user reloads the page, the app detects the cached MSAL account and attempts a silent refresh before presenting the login UI. This ensures uninterrupted operator narratives across page reloads.

**Error handling & retry:**

- If silent refresh fails with a **transient error** (network timeout, connection refused, etc.), the app automatically retries with exponential backoff (1s, 2s, 4s) up to 3 times before falling back to the token critical-window banner.
- If silent refresh fails with a **permanent error** (interaction required, consent required), the banner immediately offers manual refresh or re-auth options.
- All errors are logged with diagnostic information (error code, message, endpoint) for operator troubleshooting.

**Token guidance banner:**

- When a token enters the critical window (≤ 5 minutes remaining) and silent refresh is unavailable or has failed, a banner appears offering "Refresh session" (manual silent refresh) or "Sign in again" (re-auth) actions.

**Indicator telemetry:**

- The **Refresh Schedule Indicator** in the token panel displays:
  - **Mode**: "MSAL silent refresh"
  - **Last refresh**: Timestamp and source (scheduled, manual, or session restore)
  - **Next refresh**: Scheduled timestamp with live countdown timer (updates every 1 second)

**Operator demo benefits:**

- Tokens never expire during a live demo without the operator explicitly triggering re-auth
- Countdown timer shows when next automatic renewal will occur, demonstrating the scheduled approach
- If silent refresh fails, the banner explains fallback logic and offers manual recovery

### Native Auth Session Renewal (On-Demand Refresh Token Grant)

**Strategy:** Manual refresh via `refresh_token` grant type (no scheduled automation)

**How it works:**

1. **Token storage**: On successful email/password login, the app stores the issued `refresh_token` in sessionStorage.
2. **Manual refresh action**: When the user (or operator) clicks the "Refresh session" button in the token critical-window banner, the app posts a `refresh_token` grant request to `/oauth2/v2.0/token` with the stored refresh token.
3. **Token update**: On success, the app stores the new access token, ID token, and (if issued) a new refresh token, then re-renders the token panel.
4. **Session recovery**: Unlike MSAL, the app does not automatically restore a Native Auth session on page reload (refresh tokens are opaque and cannot be silently revalidated in-browser without a network call). The user must sign in again if the page reloads.

**Error handling:**

- If refresh fails, the banner offers a "Sign in again" button to initiate re-authentication.
- If no refresh token was issued by the tenant, the banner informs the operator that refresh is unavailable and manual re-auth is required.

**Token guidance banner:**

- Native Auth tokens show context-aware copy: "Token is in the critical window. A refresh token is present; reauthenticate or refresh soon to avoid interruption."
- Action buttons: "Refresh session" (if refresh token available) and "Sign in again".

**Indicator telemetry:**

- The **Refresh Schedule Indicator** in the token panel displays:
  - **Mode**: "Native Auth refresh token"
  - **Last refresh**: Timestamp and source (manual refresh or session restore on initial login)
  - **Next refresh**: "On-demand (manual refresh)" — no scheduled time since Native Auth uses on-demand refresh

**Operator demo benefits:**

- Demonstrates how to manually extend Native Auth sessions using refresh tokens
- Clearly shows when refresh is unavailable (no refresh token issued by tenant)
- Helps explain the difference between automatic (MSAL) and manual (Native Auth) renewal strategies

### Refresh Source Tags

The refresh indicator appends the refresh source to the "Last refresh" timestamp:

- **scheduled** — renewal triggered by the MSAL scheduler before token expiry
- **manual** — renewal triggered by the user clicking "Refresh session"
- **session restore** — initial session setup after login or page restore

This helps operators understand the chain of events and explain session lifecycle to learners.

### Testing Token Renewal

**To test MSAL silent refresh:**

1. Sign in with MSAL (popup or redirect).
2. Observe the "Refresh Schedule Indicator" showing mode "MSAL silent refresh" and a countdown in "Next refresh".
3. Wait 5 minutes (or adjust token lifetime in your tenant config to expire sooner).
4. Watch the indicator countdown reach zero and the "Last refresh" timestamp update with source "scheduled".
5. Check browser console (F12) for `"Scheduled MSAL silent refresh completed successfully"` message.

**To test Native Auth manual refresh:**

1. Sign in with Native Auth (email/password).
2. Observe the "Refresh Schedule Indicator" showing mode "Native Auth refresh token" and "Next refresh: On-demand (manual refresh)".
3. Navigate to the token panel and observe token expiry times.
4. When a token reaches critical window (≤ 5 minutes remaining), the banner appears with "Refresh session" button.
5. Click "Refresh session" and observe the "Last refresh" timestamp update with source "manual".
6. Console logs show `POST /oauth2/v2.0/token` with `grant_type=refresh_token`.

**To test refresh failure recovery:**

1. Sign in with MSAL.
2. Disable your network (F12 DevTools Network tab, offline mode).
3. Wait for the scheduled refresh to attempt (observe "refreshing" state in token guidance banner).
4. Observe the banner transition to "failed" and offer manual "Refresh session" button.
5. Re-enable network and click "Refresh session" to complete manual recovery.

## License

This sample is provided for demonstration purposes.
