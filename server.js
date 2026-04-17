/* eslint-disable no-console */

const express = require('express');
const path = require('path');
const proxyConfig = require('./proxy.config');

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
      LOGIN_SCOPES: loginScopes.join(','),
      ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS || '',
    },
  };
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