/* eslint-disable no-console */

const crypto = require('crypto');
const express = require('express');
const https = require('https');
const path = require('path');
const url = require('url');
const proxyConfig = require('../config/proxy.config');

const app = express();
const port = Number(process.env.APP_PORT || 8080);
const lookupAttempts = new Map();
const DEFAULT_LOOKUP_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_LOOKUP_MAX_ATTEMPTS = 5;
const proxyExtraHeaders = [
  'x-client-SKU',
  'x-client-VER',
  'x-client-OS',
  'x-client-CPU',
  'x-client-current-telemetry',
  'x-client-last-telemetry',
  'client-request-id',
];
//const msalBrowserLibrary = path.dirname(require.resolve('@azure/msal-browser/package.json'));
//const msalLibrary = path.resolve(path.dirname(require.resolve('@azure/msal-browser')), '..', 'dist');

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

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

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  return String(value).toLowerCase() === 'true';
}

function normalizeEnum(value, allowed, fallback) {
  const normalized = String(value || '').trim().toLowerCase();
  return allowed.has(normalized) ? normalized : fallback;
}

function buildProxyCorsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': `Content-Type, Authorization, ${proxyExtraHeaders.join(', ')}`,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
  };
}

function proxyNativeAuthRequest(req, res) {
  const reqUrl = url.parse(req.url);
  const targetDomain = url.parse(proxyConfig.proxy).hostname;
  const corsHeaders = buildProxyCorsHeaders(req.headers.origin);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders);
    res.end();
    return;
  }

  const targetUrl = `${proxyConfig.proxy}${reqUrl.pathname?.replace(proxyConfig.localApiPath, '')}${reqUrl.search || ''}`;
  const forwardedHeaders = {};

  for (const [key, value] of Object.entries(req.headers)) {
    if (key !== 'origin') {
      forwardedHeaders[key] = value;
    }
  }

  const proxyReq = https.request(
    targetUrl,
    {
      method: req.method,
      rejectUnauthorized: !proxyConfig.allowInsecureTls,
      headers: {
        ...forwardedHeaders,
        host: targetDomain,
      },
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode, {
        ...proxyRes.headers,
        ...corsHeaders,
      });

      proxyRes.pipe(res);
    },
  );

  proxyReq.on('error', (error) => {
    console.error('Error with the proxy request:', error);
    res.writeHead(500, {
      ...corsHeaders,
      'Content-Type': 'text/plain',
    });
    res.end('Proxy error.');
  });

  req.pipe(proxyReq);
}

function getLookupConfig() {
  return {
    enabled: parseBoolean(process.env.LOOKUP_RECOVERY_ENABLED, false),
    tenantId: process.env.LOOKUP_APP_TENANT_ID || process.env.TENANT_ID || proxyConfig.tenantId,
    clientId: process.env.LOOKUP_APP_CLIENT_ID || '',
    clientSecret: process.env.LOOKUP_APP_CLIENT_SECRET || '',
    graphScope: process.env.LOOKUP_GRAPH_SCOPE || 'https://graph.microsoft.com/.default',
    disclosureMode: normalizeEnum(process.env.LOOKUP_DISCLOSURE_MODE, new Set(['full-email', 'masked-email', 'generic-recovery-message']), 'masked-email'),
    phoneSource: normalizeEnum(process.env.LOOKUP_PHONE_SOURCE, new Set(['mobilephone', 'businessphones', 'profile']), 'mobilephone'),
    rateLimitWindowMs: Number(process.env.LOOKUP_RECOVERY_WINDOW_MS || DEFAULT_LOOKUP_WINDOW_MS),
    maxAttemptsPerWindow: Number(process.env.LOOKUP_RECOVERY_MAX_ATTEMPTS || DEFAULT_LOOKUP_MAX_ATTEMPTS),
  };
}

function normalizePhoneNumber(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) {
    return '';
  }

  const normalized = trimmed
    .replace(/[\s().-]/g, '')
    .replace(/^00/, '+');

  if (normalized.startsWith('+')) {
    return `+${normalized.slice(1).replace(/\D/g, '')}`;
  }

  return normalized.replace(/\D/g, '');
}

function hashLookupValue(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex').slice(0, 12);
}

function maskEmail(email) {
  const [localPart, domain] = String(email || '').split('@');
  if (!localPart || !domain) {
    return '';
  }

  const maskedLocal = `${localPart[0]}${'*'.repeat(Math.max(localPart.length - 1, 1))}`;
  const domainParts = domain.split('.');
  const domainName = domainParts.shift() || '';
  const maskedDomain = `${domainName[0] || '*'}${'*'.repeat(Math.max(domainName.length - 1, 1))}`;
  return `${maskedLocal}@${maskedDomain}${domainParts.length > 0 ? `.${domainParts.join('.')}` : ''}`;
}

function createLookupResponse(matchEmail, lookupConfig, fallbackReason = 'generic') {
  const genericMessage = 'If an account matches that phone number, recovery details are now available.';

  if (!matchEmail) {
    return {
      matched: false,
      disclosureMode: lookupConfig.disclosureMode,
      message: genericMessage,
      reason: fallbackReason,
    };
  }

  if (lookupConfig.disclosureMode === 'full-email') {
    return {
      matched: true,
      disclosureMode: lookupConfig.disclosureMode,
      email: matchEmail,
      message: `We found an account for that phone number: ${matchEmail}`,
    };
  }

  if (lookupConfig.disclosureMode === 'masked-email') {
    const masked = maskEmail(matchEmail);
    return {
      matched: true,
      disclosureMode: lookupConfig.disclosureMode,
      email: masked,
      message: `We found an account for that phone number: ${masked}`,
    };
  }

  return {
    matched: true,
    disclosureMode: lookupConfig.disclosureMode,
    message: genericMessage,
  };
}

function getLookupCandidatePhones(user, phoneSource) {
  const candidates = [];

  if ((phoneSource === 'mobilephone' || phoneSource === 'profile') && user.mobilePhone) {
    candidates.push(user.mobilePhone);
  }

  if ((phoneSource === 'businessphones' || phoneSource === 'profile') && Array.isArray(user.businessPhones)) {
    candidates.push(...user.businessPhones);
  }

  return candidates
    .map(normalizePhoneNumber)
    .filter(Boolean);
}

function resolveLookupEmail(user) {
  return user.mail || user.userPrincipalName || '';
}

async function fetchGraphAccessToken(lookupConfig) {
  const body = new URLSearchParams({
    client_id: lookupConfig.clientId,
    client_secret: lookupConfig.clientSecret,
    grant_type: 'client_credentials',
    scope: lookupConfig.graphScope,
  });

  const response = await fetch(`https://login.microsoftonline.com/${lookupConfig.tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  const payload = await response.json();
  if (!response.ok || !payload.access_token) {
    const error = new Error(payload.error_description || 'Failed to acquire Microsoft Graph access token.');
    error.details = payload;
    throw error;
  }

  return payload.access_token;
}

async function fetchUsersByPhone(normalizedPhone, lookupConfig) {
  const accessToken = await fetchGraphAccessToken(lookupConfig);
  const matches = [];
  let nextUrl = 'https://graph.microsoft.com/v1.0/users?$select=id,mail,userPrincipalName,mobilePhone,businessPhones&$top=999';

  while (nextUrl) {
    const response = await fetch(nextUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    });

    const payload = await response.json();
    if (!response.ok) {
      const error = new Error(payload.error?.message || 'Failed to query Microsoft Graph users.');
      error.details = payload;
      throw error;
    }

    for (const user of payload.value || []) {
      const candidatePhones = getLookupCandidatePhones(user, lookupConfig.phoneSource);
      if (candidatePhones.includes(normalizedPhone)) {
        matches.push({
          id: user.id,
          email: resolveLookupEmail(user),
        });
      }
    }

    nextUrl = payload['@odata.nextLink'] || '';
  }

  return matches.filter((match) => Boolean(match.email));
}

function evaluateLookupThrottle(request, lookupConfig) {
  const remoteAddress = request.ip || request.connection?.remoteAddress || 'unknown';
  const now = Date.now();
  const currentEntries = (lookupAttempts.get(remoteAddress) || [])
    .filter((timestamp) => now - timestamp < lookupConfig.rateLimitWindowMs);

  currentEntries.push(now);
  lookupAttempts.set(remoteAddress, currentEntries);

  return currentEntries.length > lookupConfig.maxAttemptsPerWindow;
}

async function lookupEmailByPhone(phoneNumber, lookupConfig) {
  const normalizedPhone = normalizePhoneNumber(phoneNumber);
  if (!normalizedPhone || normalizedPhone.length < 8) {
    return createLookupResponse('', lookupConfig, 'invalid');
  }

  const matches = await fetchUsersByPhone(normalizedPhone, lookupConfig);
  if (matches.length !== 1) {
    return createLookupResponse('', lookupConfig, matches.length > 1 ? 'duplicate' : 'not-found');
  }

  return createLookupResponse(matches[0].email, lookupConfig, 'match');
}

function validateConfig() {
  const tenantId = process.env.TENANT_ID || proxyConfig.tenantId;
  const clientId = process.env.CLIENT_ID || proxyConfig.clientId;
  const lookupConfig = getLookupConfig();
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

  if (lookupConfig.enabled) {
    if (isPlaceholder(lookupConfig.clientId)) {
      errors.push('LOOKUP_APP_CLIENT_ID is missing or still set to a placeholder value.');
    }

    if (isPlaceholder(lookupConfig.tenantId)) {
      errors.push('LOOKUP_APP_TENANT_ID is missing or still set to a placeholder value.');
    }

    if (isPlaceholder(lookupConfig.clientSecret)) {
      errors.push('LOOKUP_APP_CLIENT_SECRET is missing or still set to a placeholder value.');
    }
  }

  return { errors, warnings };
}

function getRequestOrigin(req) {
  const forwardedProto = String(req?.headers?.['x-forwarded-proto'] || '').split(',')[0].trim();
  const forwardedHost = String(req?.headers?.['x-forwarded-host'] || '').split(',')[0].trim();
  const host = req?.headers?.host || forwardedHost || '';
  const protocol = forwardedProto || req?.protocol || (host.startsWith('localhost') ? 'http' : 'https');

  if (!host) {
    return '';
  }

  return `${protocol}://${host}`;
}

function shouldUseRequestOrigin(configuredValue, requestOrigin) {
  const configured = String(configuredValue || '').trim();
  return Boolean(requestOrigin) && (!configured || /localhost/i.test(configured));
}

function getEffectiveConfig(req) {
  const requestOrigin = getRequestOrigin(req);
  const configuredAppOrigin = trimTrailingSlash(process.env.APP_ORIGIN || '');
  const appOrigin = trimTrailingSlash(
    shouldUseRequestOrigin(configuredAppOrigin, requestOrigin)
      ? requestOrigin
      : configuredAppOrigin || requestOrigin || `http://localhost:${port}`
  );
  const tenantId = process.env.TENANT_ID || proxyConfig.tenantId;
  const tenantSubdomain = process.env.TENANT_SUBDOMAIN || proxyConfig.tenantSubdomain;
  const authorityHost = process.env.ENTRA_AUTHORITY_HOST || proxyConfig.authorityHost;
  const authority = trimTrailingSlash(
    process.env.AUTHORITY || `https://${tenantSubdomain}.${authorityHost}/${tenantId}`
  );
  const clientId = process.env.CLIENT_ID || 'YOUR_CLIENT_ID';
  const configuredBaseApiUrl = trimTrailingSlash(process.env.PUBLIC_BASE_API_URL || '');
  const baseApiUrl = trimTrailingSlash(
    shouldUseRequestOrigin(configuredBaseApiUrl, requestOrigin)
      ? `${appOrigin}${proxyConfig.localApiPath}`
      : configuredBaseApiUrl || `${appOrigin}${proxyConfig.localApiPath}`
  );
  const loginScopes = (process.env.LOGIN_SCOPES || 'openid,profile,email,UserAuthenticationMethod.Read,UserAuthMethod-Phone.ReadWrite')
    .split(',')
    .map((scope) => scope.trim())
    .filter(Boolean);
  const configuredRedirectUri = trimTrailingSlash(process.env.REDIRECT_URI || '');
  const redirectUri = trimTrailingSlash(
    shouldUseRequestOrigin(configuredRedirectUri, requestOrigin)
      ? appOrigin
      : configuredRedirectUri || appOrigin
  );
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
  const signupEnabledAttributes = process.env.SIGNUP_ENABLED_ATTRIBUTES || '';
  const signupRequiredAttributes = process.env.SIGNUP_REQUIRED_ATTRIBUTES || '';
  const signupShowAdvancedJson = String(process.env.SIGNUP_SHOW_ADVANCED_JSON || 'false').toLowerCase() === 'true';
  const signupFieldOverrides = process.env.SIGNUP_FIELD_OVERRIDES || '';
  const signupAttributeTemplate = process.env.SIGNUP_ATTRIBUTE_TEMPLATE || '';
  const graphProfileSelectFields = process.env.GRAPH_PROFILE_SELECT_FIELDS || '';
  const lookupConfig = getLookupConfig();

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
      SIGNUP_ENABLED_ATTRIBUTES: signupEnabledAttributes,
      SIGNUP_REQUIRED_ATTRIBUTES: signupRequiredAttributes,
      SIGNUP_SHOW_ADVANCED_JSON: signupShowAdvancedJson,
      SIGNUP_FIELD_OVERRIDES: signupFieldOverrides,
      SIGNUP_ATTRIBUTE_TEMPLATE: signupAttributeTemplate,
      GRAPH_PROFILE_SELECT_FIELDS: graphProfileSelectFields,
      LOOKUP_RECOVERY_ENABLED: lookupConfig.enabled,
      LOOKUP_DISCLOSURE_MODE: lookupConfig.disclosureMode,
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
      SIGNUP_ENABLED_ATTRIBUTES: signupEnabledAttributes,
      SIGNUP_REQUIRED_ATTRIBUTES: signupRequiredAttributes,
      SIGNUP_SHOW_ADVANCED_JSON: String(signupShowAdvancedJson),
      SIGNUP_FIELD_OVERRIDES: signupFieldOverrides,
      SIGNUP_ATTRIBUTE_TEMPLATE: signupAttributeTemplate,
      GRAPH_PROFILE_SELECT_FIELDS: graphProfileSelectFields,
      LOGIN_SCOPES: loginScopes.join(','),
      ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS || '',
      LOOKUP_RECOVERY_ENABLED: String(lookupConfig.enabled),
      LOOKUP_DISCLOSURE_MODE: lookupConfig.disclosureMode,
      LOOKUP_PHONE_SOURCE: lookupConfig.phoneSource,
      LOOKUP_GRAPH_SCOPE: lookupConfig.graphScope,
      LOOKUP_APP_CLIENT_ID: lookupConfig.clientId,
      LOOKUP_APP_TENANT_ID: lookupConfig.tenantId,
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
  const runtimeConfig = getEffectiveConfig(_req).runtimeConfig;

  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.send(`window.__APP_CONFIG__ = ${JSON.stringify(runtimeConfig, null, 2)};`);
});

app.get('/settings-config.json', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(getEffectiveConfig(_req).settingsView);
});

app.use(proxyConfig.localApiPath, proxyNativeAuthRequest);

app.post('/account-recovery/email-by-phone', async (req, res) => {
  const lookupConfig = getLookupConfig();
  if (!lookupConfig.enabled) {
    res.status(404).json({
      matched: false,
      disclosureMode: lookupConfig.disclosureMode,
      message: 'Phone-based account recovery is not enabled.',
      reason: 'disabled',
    });
    return;
  }

  if (evaluateLookupThrottle(req, lookupConfig)) {
    const throttledResponse = createLookupResponse('', lookupConfig, 'throttled');
    console.warn(`[phone-recovery] throttled ip=${req.ip || 'unknown'}`);
    res.status(429).json(throttledResponse);
    return;
  }

  const phoneNumber = req.body?.phone_number || req.body?.phoneNumber || '';
  const phoneHash = hashLookupValue(normalizePhoneNumber(phoneNumber));

  try {
    const result = await lookupEmailByPhone(phoneNumber, lookupConfig);
    console.info(`[phone-recovery] outcome=${result.reason || 'match'} phoneHash=${phoneHash}`);
    res.json(result);
  } catch (error) {
    console.error(`[phone-recovery] failed phoneHash=${phoneHash}`, error.details || error.message || error);
    res.status(502).json(createLookupResponse('', lookupConfig, 'lookup-failed'));
  }
});

app.use(express.static('./public')); // app html
//app.use(express.static(msalLibrary)); // msal library

app.listen(port, function () {
  console.log(`Test app running at http://localhost:${port}!\n`);
});