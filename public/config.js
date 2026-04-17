// config.js
// Centralized configuration for MSAL and Native Auth

const runtimeConfig = window.__APP_CONFIG__ || {};

function parseCsvConfig(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

const DEFAULTS = {
  clientId: "YOUR_CLIENT_ID",
  tenantId: "YOUR_TENANT_ID",
  authority: "https://YOUR_TENANT_SUBDOMAIN.ciamlogin.com/YOUR_TENANT_ID",
  redirectUri: "http://localhost:8080",
  baseApiUrl: "http://localhost:3001/api",
  loginScopes: ["openid", "profile", "email", "User.Read", "UserAuthenticationMethod.Read", "UserAuthMethod-Phone.ReadWrite"],
  nativeAuthScopes: "openid offline_access User.Read UserAuthenticationMethod.Read UserAuthMethod-Phone.ReadWrite",
  nativeAuthCapabilities: "registration_required mfa_required",
  signInChallengeType: "password oob redirect",
  signUpChallengeType: "oob password redirect",
  resetPasswordChallengeType: "oob redirect",
  demoMode: false,
  enableOperatorMode: false,
  enableBetaGraph: false,
  graphProfileSelectFields: [
    "displayName",
    "givenName",
    "surname",
    "mail",
    "userPrincipalName",
    "identities",
    "creationType",
    "createdDateTime",
    "externalUserState",
    "externalUserStateChangeDateTime",
  ],
  signupRequiredAttributes: [],
  signupAttributeTemplate: "",
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
const DEMO_MODE_DEFAULT = String(runtimeConfig.DEMO_MODE).toLowerCase() === "true" || DEFAULTS.demoMode;
const ENABLE_OPERATOR_MODE = String(runtimeConfig.ENABLE_OPERATOR_MODE).toLowerCase() === "true" || DEFAULTS.enableOperatorMode;
const ENABLE_BETA_GRAPH = String(runtimeConfig.ENABLE_BETA_GRAPH).toLowerCase() === "true" || DEFAULTS.enableBetaGraph;

const NATIVE_AUTH = {
  scopes: runtimeConfig.NATIVE_AUTH_SCOPES || DEFAULTS.nativeAuthScopes,
  capabilities: runtimeConfig.NATIVE_AUTH_CAPABILITIES || DEFAULTS.nativeAuthCapabilities,
  signInChallengeType: runtimeConfig.NATIVE_AUTH_SIGNIN_CHALLENGE_TYPE || DEFAULTS.signInChallengeType,
  signUpChallengeType: runtimeConfig.NATIVE_AUTH_SIGNUP_CHALLENGE_TYPE || DEFAULTS.signUpChallengeType,
  resetPasswordChallengeType: runtimeConfig.NATIVE_AUTH_RESET_PASSWORD_CHALLENGE_TYPE || DEFAULTS.resetPasswordChallengeType,
};

const SIGNUP_CONFIG = {
  requiredAttributes: parseCsvConfig(runtimeConfig.SIGNUP_REQUIRED_ATTRIBUTES || DEFAULTS.signupRequiredAttributes.join(",")),
  attributeTemplate: String(runtimeConfig.SIGNUP_ATTRIBUTE_TEMPLATE || DEFAULTS.signupAttributeTemplate || ""),
};

const GRAPH_PROFILE_SELECT_FIELDS = parseCsvConfig(
  runtimeConfig.GRAPH_PROFILE_SELECT_FIELDS || DEFAULTS.graphProfileSelectFields.join(",")
);

// Endpoints for Native Auth APIs
const ENV = {
  REDIRECT_URI: msalConfig.auth.redirectUri,
  urlOauthInit: `${BASE_API_URL}/oauth2/v2.0/initiate`,
  urlOauthChallenge: `${BASE_API_URL}/oauth2/v2.0/challenge`,
  urlOauthToken: `${BASE_API_URL}/oauth2/v2.0/token`,
  urlOauthLogout: `${BASE_API_URL}/oauth2/v2.0/logout?post_logout_redirect_uri=${encodeURIComponent(msalConfig.auth.redirectUri)}`,
  urlOauthIntrospect: `${BASE_API_URL}/oauth2/v2.0/introspect`,
  urlSignupStart: `${BASE_API_URL}/signup/v1.0/start`,
  urlSignupChallenge: `${BASE_API_URL}/signup/v1.0/challenge`,
  urlSignupContinue: `${BASE_API_URL}/signup/v1.0/continue`,
  urlRegisterIntrospect: `${BASE_API_URL}/register/v1.0/introspect`,
  urlRegisterChallenge: `${BASE_API_URL}/register/v1.0/challenge`,
  urlRegisterContinue: `${BASE_API_URL}/register/v1.0/continue`,
  urlResetPasswordStart: `${BASE_API_URL}/resetpassword/v1.0/start`,
  urlResetPasswordChallenge: `${BASE_API_URL}/resetpassword/v1.0/challenge`,
  urlResetPasswordContinue: `${BASE_API_URL}/resetpassword/v1.0/continue`,
  urlResetPasswordSubmit: `${BASE_API_URL}/resetpassword/v1.0/submit`,
  urlResetPasswordPollCompletion: `${BASE_API_URL}/resetpassword/v1.0/poll_completion`,
};

const loginRequest = {
  scopes: runtimeConfig.LOGIN_SCOPES || DEFAULTS.loginScopes
};

const GRAPH_SELF_SERVICE_ENDPOINTS = {
  me: "https://graph.microsoft.com/v1.0/me",
  authMethods: "https://graph.microsoft.com/v1.0/me/authentication/methods",
  tapMethods: "https://graph.microsoft.com/v1.0/me/authentication/temporaryAccessPassMethods",
  revokeSessions: "https://graph.microsoft.com/v1.0/me/revokeSignInSessions",
  phoneMethods: "https://graph.microsoft.com/v1.0/me/authentication/phoneMethods",
};

const GRAPH_OPERATOR_ENDPOINTS = {
  userDetail: (userId) => `https://graph.microsoft.com/beta/users/${encodeURIComponent(userId)}?$select=id,displayName,givenName,surname,mail,userPrincipalName,identities,creationType,createdDateTime,lastPasswordChangeDateTime,signInActivity,externalUserState,externalUserStateChangeDateTime`,
  authRequirements: (userId) => `https://graph.microsoft.com/beta/users/${encodeURIComponent(userId)}/authentication/requirements`,
  signInPreferences: (userId) => `https://graph.microsoft.com/beta/users/${encodeURIComponent(userId)}/authentication/signInPreferences`,
  registrationDetails: "https://graph.microsoft.com/beta/reports/authenticationMethods/userRegistrationDetails",
  signInSummary: "https://graph.microsoft.com/beta/reports/authenticationMethods/userSignInsByAuthMethodSummary(period='d1')",
};

// Backward-compatible alias while the rest of the app migrates to split clients.
const GRAPH_ENDPOINTS = GRAPH_SELF_SERVICE_ENDPOINTS;
