/* eslint-disable no-console */

const express = require('express');
const path = require('path');
const proxyConfig = require('../config/proxy.config');

const app = express();
const port = Number(process.env.APP_PORT || 8080);
//const msalBrowserLibrary = path.dirname(require.resolve('@azure/msal-browser/package.json'));
//const msalLibrary = path.resolve(path.dirname(require.resolve('@azure/msal-browser')), '..', 'dist');

// preserves query parameters
function redirectToOrigin(req, res, next) {
  req.url = '/';
  next();
}

function trimTrailingSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}

function isPlaceholder(value) {
  return !value || /^YOUR_/i.test(String(value));
}

function isGuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

function validateConfig() {
  const tenantId = process.env.TENANT_ID || proxyConfig.tenantId;
  const clientId = process.env.CLIENT_ID || proxyConfig.clientId;
  const errors = [];
  const warnings = [];

  if (isPlaceholder(clientId)) {
    errors.push('CLIENT_ID is missing or still set to a placeholder value.');
  } else if (!isGuid(clientId)) {
    warnings.push('CLIENT_ID does not look like a GUID.');
  }

  if (isPlaceholder(tenantId)) {
    errors.push('TENANT_ID is missing or still set to a placeholder value.');
  } else if (!isGuid(tenantId)) {
    warnings.push('TENANT_ID does not look like a GUID.');
  }

  if (isPlaceholder(process.env.TENANT_SUBDOMAIN || proxyConfig.tenantSubdomain)) {
    errors.push('TENANT_SUBDOMAIN is missing or still set to a placeholder value.');
  }

  return { errors, warnings };
}

function getEffectiveConfig() {
  const appOrigin = process.env.APP_ORIGIN || `http://localhost:${port}`;
  const tenantId = process.env.TENANT_ID || proxyConfig.tenantId;
  const tenantSubdomain = process.env.TENANT_SUBDOMAIN || proxyConfig.tenantSubdomain;
  const authorityHost = process.env.ENTRA_AUTHORITY_HOST || proxyConfig.authorityHost;
  const authority = trimTrailingSlash(
    process.env.AUTHORITY || `https://${tenantSubdomain}.${authorityHost}/${tenantId}`
  );
  const clientId = process.env.CLIENT_ID || 'YOUR_CLIENT_ID';
  const baseApiUrl = trimTrailingSlash(
    process.env.PUBLIC_BASE_API_URL || `http://localhost:${proxyConfig.port}${proxyConfig.localApiPath}`
  );
  const loginScopes = (process.env.LOGIN_SCOPES || 'openid,profile,email,UserAuthenticationMethod.Read,UserAuthMethod-Phone.ReadWrite')
    .split(',')
    .map((scope) => scope.trim())
    .filter(Boolean);
  const redirectUri = process.env.REDIRECT_URI || appOrigin;
  const locale = process.env.LOCALE || 'en';
  const theme = process.env.THEME || 'azure-portal';
  const demoMode = String(process.env.DEMO_MODE || 'false').toLowerCase() === 'true';
  const enableOperatorMode = String(process.env.ENABLE_OPERATOR_MODE || 'false').toLowerCase() === 'true';
  const enableBetaGraph = String(process.env.ENABLE_BETA_GRAPH || 'false').toLowerCase() === 'true';
  const nativeAuthScopes = process.env.NATIVE_AUTH_SCOPES || 'openid offline_access User.Read UserAuthenticationMethod.Read UserAuthMethod-Phone.ReadWrite';
  const nativeAuthCapabilities = process.env.NATIVE_AUTH_CAPABILITIES || 'registration_required mfa_required';
  const signInChallengeType = process.env.NATIVE_AUTH_SIGNIN_CHALLENGE_TYPE || 'password oob redirect';
  const signUpChallengeType = process.env.NATIVE_AUTH_SIGNUP_CHALLENGE_TYPE || 'oob password redirect';
  const resetPasswordChallengeType = process.env.NATIVE_AUTH_RESET_PASSWORD_CHALLENGE_TYPE || 'oob redirect';
  const signupRequiredAttributes = process.env.SIGNUP_REQUIRED_ATTRIBUTES || '';
  const signupAttributeTemplate = process.env.SIGNUP_ATTRIBUTE_TEMPLATE || '';
  const graphProfileSelectFields = process.env.GRAPH_PROFILE_SELECT_FIELDS || '';

  return {
    runtimeConfig: {
      CLIENT_ID: clientId,
      TENANT_ID: tenantId,
      AUTHORITY: authority,
      REDIRECT_URI: redirectUri,
      BASE_API_URL: baseApiUrl,
      LOGIN_SCOPES: loginScopes,
      LOCALE: locale,
      THEME: theme,
      DEMO_MODE: demoMode,
      ENABLE_OPERATOR_MODE: enableOperatorMode,
      ENABLE_BETA_GRAPH: enableBetaGraph,
      NATIVE_AUTH_SCOPES: nativeAuthScopes,
      NATIVE_AUTH_CAPABILITIES: nativeAuthCapabilities,
      NATIVE_AUTH_SIGNIN_CHALLENGE_TYPE: signInChallengeType,
      NATIVE_AUTH_SIGNUP_CHALLENGE_TYPE: signUpChallengeType,
      NATIVE_AUTH_RESET_PASSWORD_CHALLENGE_TYPE: resetPasswordChallengeType,
      SIGNUP_REQUIRED_ATTRIBUTES: signupRequiredAttributes,
      SIGNUP_ATTRIBUTE_TEMPLATE: signupAttributeTemplate,
      GRAPH_PROFILE_SELECT_FIELDS: graphProfileSelectFields,
    },
    settingsView: {
      APP_PORT: String(port),
      APP_ORIGIN: appOrigin,
      CLIENT_ID: clientId,
      TENANT_ID: tenantId,
      TENANT_SUBDOMAIN: tenantSubdomain,
      ENTRA_AUTHORITY_HOST: authorityHost,
      AUTHORITY: authority,
      LOCAL_API_PATH: proxyConfig.localApiPath,
      CORS_PORT: String(proxyConfig.port),
      PROXY_TARGET: proxyConfig.target,
      PUBLIC_BASE_API_URL: baseApiUrl,
      REDIRECT_URI: redirectUri,
      LOCALE: locale,
      THEME: theme,
      DEMO_MODE: String(demoMode),
      ENABLE_OPERATOR_MODE: String(enableOperatorMode),
      ENABLE_BETA_GRAPH: String(enableBetaGraph),
      NATIVE_AUTH_SCOPES: nativeAuthScopes,
      NATIVE_AUTH_CAPABILITIES: nativeAuthCapabilities,
      NATIVE_AUTH_SIGNIN_CHALLENGE_TYPE: signInChallengeType,
      NATIVE_AUTH_SIGNUP_CHALLENGE_TYPE: signUpChallengeType,
      NATIVE_AUTH_RESET_PASSWORD_CHALLENGE_TYPE: resetPasswordChallengeType,
      SIGNUP_REQUIRED_ATTRIBUTES: signupRequiredAttributes,
      SIGNUP_ATTRIBUTE_TEMPLATE: signupAttributeTemplate,
      GRAPH_PROFILE_SELECT_FIELDS: graphProfileSelectFields,
      LOGIN_SCOPES: loginScopes.join(','),
      ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS || '',
    },
  };
}

const validation = validateConfig();
if (validation.warnings.length > 0) {
  validation.warnings.forEach((warning) => console.warn(`Configuration warning: ${warning}`));
}

if (validation.errors.length > 0) {
  console.error('Configuration validation failed:');
  validation.errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

app.get('/app-config.js', (_req, res) => {
  const runtimeConfig = getEffectiveConfig().runtimeConfig;

  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.send(`window.__APP_CONFIG__ = ${JSON.stringify(runtimeConfig, null, 2)};`);
});

app.get('/settings-config.json', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(getEffectiveConfig().settingsView);
});

app.use(express.static('./public')); // app html
//app.use(express.static(msalLibrary)); // msal library

app.listen(port, function () {
  console.log(`Test app running at http://localhost:${port}!\n`);
});