// config.js
// Centralized configuration for MSAL and Native Auth

const runtimeConfig = window.__APP_CONFIG__ || {};

const DEFAULTS = {
  clientId: "YOUR_CLIENT_ID",
  tenantId: "YOUR_TENANT_ID",
  authority: "https://YOUR_TENANT_SUBDOMAIN.ciamlogin.com/YOUR_TENANT_ID",
  redirectUri: "http://localhost:8080",
  baseApiUrl: "http://localhost:3001/api",
  loginScopes: ["openid", "profile", "email", "UserAuthenticationMethod.Read", "UserAuthMethod-Phone.ReadWrite"],
};

function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

const resolvedAuthority = trimTrailingSlash(runtimeConfig.AUTHORITY || DEFAULTS.authority);
const resolvedBaseApiUrl = trimTrailingSlash(runtimeConfig.BASE_API_URL || DEFAULTS.baseApiUrl);

const msalConfig = {
  auth: {
    clientId: runtimeConfig.CLIENT_ID || DEFAULTS.clientId,
    tenantId: runtimeConfig.TENANT_ID || DEFAULTS.tenantId,
    authority: `${resolvedAuthority}/`,
    redirectUri: runtimeConfig.REDIRECT_URI || DEFAULTS.redirectUri,
  },
  cache: {
    cacheLocation: "localStorage",
    storeAuthStateInCookie: false,
  }
};

const BASE_API_URL = resolvedBaseApiUrl;

// Endpoints for Native Auth APIs
const ENV = {
  REDIRECT_URI: msalConfig.auth.redirectUri,
  urlOauthInit: `${BASE_API_URL}/oauth2/v2.0/initiate`,
  urlOauthChallenge: `${BASE_API_URL}/oauth2/v2.0/challenge`,
  urlOauthToken: `${BASE_API_URL}/oauth2/v2.0/token`,
  urlOauthLogout: `${BASE_API_URL}/oauth2/v2.0/logout?post_logout_redirect_uri=${encodeURIComponent(msalConfig.auth.redirectUri)}`,
  urlOauthIntrospect: `${BASE_API_URL}/oauth2/v2.0/introspect`,
  urlRegisterIntrospect: `${BASE_API_URL}/register/v1.0/introspect`,
  urlRegisterChallenge: `${BASE_API_URL}/register/v1.0/challenge`,
  urlRegisterContinue: `${BASE_API_URL}/register/v1.0/continue`,
};

const loginRequest = {
  scopes: runtimeConfig.LOGIN_SCOPES || DEFAULTS.loginScopes
};
