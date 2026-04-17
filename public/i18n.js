// i18n.js
// Lightweight client-side localization for static UI text and runtime messages.

(function initI18n() {
  const translations = {
    en: {
      "app.title": "CodexJay External ID Demo",
      "skip.signin": "Skip to sign-in form",
      "theme.label": "Theme",
      "theme.azurePortal": "Azure Portal",
      "theme.enterpriseBlue": "Enterprise Blue",
      "theme.fintechSlate": "Fintech Slate",
      "login.eyebrow": "CodexJay Identity Platform",
      "login.heroTitle": "Global-ready External ID authentication experience",
      "login.heroSubtitle": "Clean, modern sign-in flows for enterprise onboarding, partner access, and customer identity journeys.",
      "login.feature.native": "Native, popup, and redirect authentication patterns",
      "login.feature.mfa": "MFA challenge and method registration support",
      "login.feature.tokens": "Live token and auth-method visibility for demos",
      "login.panelTitle": "Sign in",
      "login.panelSubtitle": "Use a supported authentication option",
      "login.emailLabel": "Work email",
      "login.emailPlaceholder": "Work email",
      "login.passwordLabel": "Password",
      "login.passwordPlaceholder": "Password",
      "login.native": "Continue with Native Auth",
      "login.popup": "Continue with MSAL Popup",
      "login.redirect": "Continue with MSAL Redirect",
      "login.internal": "Continue with Internal Entra ID",
      "dialog.verifyIdentity": "Verify your identity",
      "dialog.chooseMethod": "Choose a verification method",
      "dialog.registerMfa": "Register MFA Method",
      "dialog.chooseRegisterMethod": "Choose a method to register",
      "dialog.phoneE164": "Phone Number (E.164 format):",
      "dialog.phoneFormat": "Format: +[country code][number] (e.g., +1 2025551234)",
      "dialog.email": "Email:",
      "dialog.continue": "Continue",
      "dialog.cancel": "Cancel",
      "dialog.enterCode": "Enter verification code",
      "dialog.codePrompt": "Enter the verification code:",
      "dialog.codePlaceholder": "Verification code*",
      "dialog.verify": "Verify",
      "dialog.addPhoneMethod": "Add Phone Method",
      "dialog.registerPhoneFactor": "Register a phone factor for sign-in",
      "dialog.phoneE164Short": "Phone Number (E.164)",
      "dialog.phoneType": "Phone Type",
      "dialog.phoneType.mobile": "Mobile",
      "dialog.phoneType.alternateMobile": "Alternate mobile",
      "dialog.phoneType.office": "Office",
      "dialog.addMethod": "Add method",
      "auth.welcome": "Welcome",
      "auth.hcp": "You are an HCP",
      "auth.nonHcp": "You are not an HCP",
      "auth.tokenDetails": "Token Details",
      "auth.accessToken": "Access Token",
      "auth.idToken": "ID Token",
      "auth.refreshToken": "Refresh Token",
      "auth.showToken": "Show Token Value",
      "auth.hideToken": "Hide Token Value",
      "auth.methods": "Registered Authentication Methods",
      "auth.addPhone": "+ Add Phone Method",
      "auth.loadingMethods": "Loading authentication methods...",
      "auth.settings": "Open Settings",
      "auth.signOut": "Sign out",
      "status.loading": "Loading...",
      "settings.title": "Environment Settings",
      "settings.subtitle": "Effective runtime values currently configured for this demo",
      "settings.variable": "Variable",
      "settings.value": "Value",
      "settings.updated": "Last refreshed",
      "settings.refresh": "Refresh",
      "settings.back": "Back to Login",
      "settings.empty": "No settings available.",
      "settings.loading": "Loading...",
      "settings.loadFailed": "Unable to load settings",
      "settings.section.app": "App",
      "settings.section.entra": "Entra",
      "settings.section.proxy": "Proxy",
      "settings.section.ui": "UI",
      "settings.section.other": "Other",
      "msg.enterEmailPassword": "Please enter both email and password.",
      "msg.loginError": "An error has occurred: {message}",
      "msg.noMfaMethods": "No MFA methods available for this account.",
      "msg.mfaCancelled": "MFA verification cancelled.",
      "msg.enterCodeVia": "Enter the verification code sent via {channel} to {hint}:",
      "msg.selectMfaMethod": "Please select an MFA method.",
      "msg.enterPhone": "Please enter a phone number.",
      "msg.invalidPhone": "Please enter a valid phone number in E.164 format (e.g., +1 2025551234).",
      "msg.noSession": "No active session. Please sign in first.",
      "msg.phoneAdded": "Phone authentication method added successfully!",
      "msg.phoneAddFailed": "Failed to add phone method: {message}",
      "msg.methodsNone": "No authentication methods found.",
      "msg.methodsLoadFailed": "Unable to load authentication methods. The access token may lack the required scope (UserAuthenticationMethod.Read).",
      "msg.loginFailed": "Login failed: {message}",
      "misc.unknownError": "Unknown error",
      "misc.user": "User",
      "auth.method.secretConfigured": "Secret configured",
      "auth.method.active": "Active",
      "auth.method.expired": "Expired"
    },
    es: {
      "app.title": "Demostración de External ID de CodexJay",
      "skip.signin": "Saltar al formulario de inicio de sesión",
      "theme.label": "Tema",
      "theme.azurePortal": "Portal de Azure",
      "theme.enterpriseBlue": "Azul Empresarial",
      "theme.fintechSlate": "Fintech Pizarra",
      "login.panelTitle": "Iniciar sesión",
      "login.panelSubtitle": "Utiliza una opción de autenticación compatible",
      "login.native": "Continuar con Native Auth",
      "login.popup": "Continuar con MSAL Popup",
      "login.redirect": "Continuar con MSAL Redirect",
      "auth.settings": "Abrir configuración",
      "auth.signOut": "Cerrar sesión",
      "status.loading": "Cargando...",
      "settings.section.app": "Aplicación",
      "settings.section.entra": "Entra",
      "settings.section.proxy": "Proxy",
      "settings.section.ui": "Interfaz"
    }
  };

  function getLocale() {
    const configured = (window.__APP_CONFIG__ && window.__APP_CONFIG__.LOCALE) || "";
    const fromStorage = localStorage.getItem("app_locale") || "";
    const fromBrowser = (navigator.language || "en").toLowerCase();
    const candidate = (fromStorage || configured || fromBrowser).toLowerCase();
    if (translations[candidate]) return candidate;
    const short = candidate.split("-")[0];
    return translations[short] ? short : "en";
  }

  let activeLocale = getLocale();

  function format(template, params) {
    if (!params) return template;
    return template.replace(/\{(\w+)\}/g, function replaceParam(_m, key) {
      return Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : "";
    });
  }

  function t(key, params) {
    const active = translations[activeLocale] || {};
    const fallback = translations.en || {};
    const template = active[key] || fallback[key] || key;
    return format(template, params);
  }

  function applyTranslations(root) {
    const scope = root || document;
    scope.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      if (key) el.textContent = t(key);
    });

    scope.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
      const key = el.getAttribute("data-i18n-placeholder");
      if (key) el.setAttribute("placeholder", t(key));
    });

    scope.querySelectorAll("[data-i18n-aria-label]").forEach((el) => {
      const key = el.getAttribute("data-i18n-aria-label");
      if (key) el.setAttribute("aria-label", t(key));
    });

    document.title = t("app.title");
    document.documentElement.setAttribute("lang", activeLocale);
  }

  window.t = t;
  window.getLocale = function getActiveLocale() {
    return activeLocale;
  };
  window.setLocale = function setLocale(locale) {
    const normalized = String(locale || "").toLowerCase();
    const next = translations[normalized] ? normalized : normalized.split("-")[0];
    activeLocale = translations[next] ? next : "en";
    localStorage.setItem("app_locale", activeLocale);
    applyTranslations();
  };
  window.applyTranslations = applyTranslations;

  document.addEventListener("DOMContentLoaded", function onReady() {
    applyTranslations();
  });
})();
