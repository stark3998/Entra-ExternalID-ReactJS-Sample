// config.js
// Centralized configuration for MSAL and Native Auth

const runtimeConfig = window.__APP_CONFIG__ || {};

function parseCsvConfig(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseJsonConfig(value, fallback = {}) {
  const rawValue = String(value || "").trim();
  if (!rawValue) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(rawValue);
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch (_error) {
    return fallback;
  }
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
  signupEnabledAttributes: ["displayName"],
  signupRequiredAttributes: [],
  signupShowAdvancedJson: false,
  signupFieldOverrides: {},
  signupAttributeTemplate: "",
  lookupRecoveryEnabled: false,
  lookupDisclosureMode: 'masked-email',
};

const SIGNUP_SECTION_ORDER = ["personal", "contact", "address", "work", "other"];

const SIGNUP_FIELD_CATALOG = {
  displayName: {
    key: "displayName",
    labelKey: "signup.field.displayName.label",
    placeholderKey: "signup.field.displayName.placeholder",
    section: "personal",
    inputType: "text",
    autocomplete: "name",
  },
  givenName: {
    key: "givenName",
    labelKey: "signup.field.givenName.label",
    placeholderKey: "signup.field.givenName.placeholder",
    section: "personal",
    inputType: "text",
    autocomplete: "given-name",
  },
  surname: {
    key: "surname",
    labelKey: "signup.field.surname.label",
    placeholderKey: "signup.field.surname.placeholder",
    section: "personal",
    inputType: "text",
    autocomplete: "family-name",
  },
  username: {
    key: "username",
    labelKey: "signup.field.username.label",
    placeholderKey: "signup.field.username.placeholder",
    section: "contact",
    inputType: "text",
    autocomplete: "username",
  },
  city: {
    key: "city",
    labelKey: "signup.field.city.label",
    placeholderKey: "signup.field.city.placeholder",
    section: "address",
    inputType: "text",
    autocomplete: "address-level2",
  },
  country: {
    key: "country",
    labelKey: "signup.field.country.label",
    placeholderKey: "signup.field.country.placeholder",
    section: "address",
    inputType: "text",
    autocomplete: "country-name",
  },
  postalCode: {
    key: "postalCode",
    labelKey: "signup.field.postalCode.label",
    placeholderKey: "signup.field.postalCode.placeholder",
    section: "address",
    inputType: "text",
    autocomplete: "postal-code",
  },
  state: {
    key: "state",
    labelKey: "signup.field.state.label",
    placeholderKey: "signup.field.state.placeholder",
    section: "address",
    inputType: "text",
    autocomplete: "address-level1",
  },
  streetAddress: {
    key: "streetAddress",
    labelKey: "signup.field.streetAddress.label",
    placeholderKey: "signup.field.streetAddress.placeholder",
    section: "address",
    inputType: "text",
    autocomplete: "street-address",
  },
  jobTitle: {
    key: "jobTitle",
    labelKey: "signup.field.jobTitle.label",
    placeholderKey: "signup.field.jobTitle.placeholder",
    section: "work",
    inputType: "text",
    autocomplete: "organization-title",
  },
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
const LOOKUP_RECOVERY_ENABLED = String(runtimeConfig.LOOKUP_RECOVERY_ENABLED).toLowerCase() === 'true' || DEFAULTS.lookupRecoveryEnabled;
const LOOKUP_DISCLOSURE_MODE = String(runtimeConfig.LOOKUP_DISCLOSURE_MODE || DEFAULTS.lookupDisclosureMode);

const NATIVE_AUTH = {
  scopes: runtimeConfig.NATIVE_AUTH_SCOPES || DEFAULTS.nativeAuthScopes,
  capabilities: runtimeConfig.NATIVE_AUTH_CAPABILITIES || DEFAULTS.nativeAuthCapabilities,
  signInChallengeType: runtimeConfig.NATIVE_AUTH_SIGNIN_CHALLENGE_TYPE || DEFAULTS.signInChallengeType,
  signUpChallengeType: runtimeConfig.NATIVE_AUTH_SIGNUP_CHALLENGE_TYPE || DEFAULTS.signUpChallengeType,
  resetPasswordChallengeType: runtimeConfig.NATIVE_AUTH_RESET_PASSWORD_CHALLENGE_TYPE || DEFAULTS.resetPasswordChallengeType,
};

const SIGNUP_CONFIG = {
  enabledAttributes: parseCsvConfig(runtimeConfig.SIGNUP_ENABLED_ATTRIBUTES || DEFAULTS.signupEnabledAttributes.join(",")).filter((attributeName) => Object.prototype.hasOwnProperty.call(SIGNUP_FIELD_CATALOG, attributeName)),
  requiredAttributes: parseCsvConfig(runtimeConfig.SIGNUP_REQUIRED_ATTRIBUTES || DEFAULTS.signupRequiredAttributes.join(",")),
  showAdvancedJson: String(runtimeConfig.SIGNUP_SHOW_ADVANCED_JSON).toLowerCase() === "true" || DEFAULTS.signupShowAdvancedJson,
  fieldOverrides: parseJsonConfig(runtimeConfig.SIGNUP_FIELD_OVERRIDES, DEFAULTS.signupFieldOverrides),
  attributeTemplate: String(runtimeConfig.SIGNUP_ATTRIBUTE_TEMPLATE || DEFAULTS.signupAttributeTemplate || ""),
};

SIGNUP_CONFIG.fields = SIGNUP_CONFIG.enabledAttributes.map((attributeName) => {
  const baseDefinition = SIGNUP_FIELD_CATALOG[attributeName];
  const override = SIGNUP_CONFIG.fieldOverrides[attributeName] || {};
  return {
    ...baseDefinition,
    ...override,
    key: attributeName,
    section: override.section || baseDefinition.section,
  };
});

SIGNUP_CONFIG.sectionOrder = SIGNUP_SECTION_ORDER.slice();

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
  urlEmailRecoveryByPhone: '/account-recovery/email-by-phone',
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
