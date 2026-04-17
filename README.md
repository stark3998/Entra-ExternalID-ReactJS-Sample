# CodexJay External ID JavaScript Demo

A reusable sample web app for demonstrating Microsoft Entra External ID capabilities across different client conversations.

This project showcases three sign-in approaches in a single UI:

- Native Auth (email/password over Entra Native Auth APIs)
- MSAL Popup (hosted sign-in popup)
- MSAL Redirect (full-page hosted sign-in)

It also demonstrates MFA challenges and MFA method registration where supported by tenant policy.

## What This Demo Is For

- Client demos of authentication experience options
- Side-by-side comparison of native and hosted sign-in patterns
- Token inspection (access token, ID token, refresh token)
- Microsoft Graph authentication method listing and phone method registration

## What This Demo Is Not For

- Production-ready identity UX out of the box
- Full account lifecycle features (self-service sign-up, password reset, profile editing)
- Backend API authorization patterns

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
- `UserAuthenticationMethod.Read`
- `UserAuthMethod-Phone.ReadWrite`

## Quick Start

```bash
npm install
npm run start:env
npm run cors:env
```

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
- Users can switch locale at runtime via `setLocale('en')` or `setLocale('es')` in the browser console
- Add new languages by extending the `translations` object in `public/i18n.js`

### Themeing

The UI supports runtime theme presets for demos.

- Default theme comes from `THEME` in `.env`
- Supported values: `azure-portal`, `enterprise-blue`, `fintech-slate`
- Users can switch theme live from the header dropdown; the choice is persisted in browser storage

## Native Auth Flow Summary

1. `/oauth2/v2.0/initiate`
1. `/oauth2/v2.0/challenge`
1. `/oauth2/v2.0/token` (password grant)
1. If required, MFA branch:

- `/oauth2/v2.0/introspect`
- `/oauth2/v2.0/challenge` (method selection)
- `/oauth2/v2.0/token` (mfa_oob grant)

1. If registration is required, registration branch:

- `/register/v1.0/introspect`
- `/register/v1.0/challenge`
- `/register/v1.0/continue`
- `/oauth2/v2.0/token` (continuation token grant)

All Native Auth requests use `application/x-www-form-urlencoded`.

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
