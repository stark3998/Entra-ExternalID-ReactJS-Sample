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
      "login.signup": "Create account",
      "login.forgotPassword": "Forgot password?",
      "login.internal": "Continue with Internal Entra ID",
      "demo.toggle": "Demo mode",
      "demo.warning": "Demo mode is enabled. Raw token values are visible and should only be used in controlled environments.",
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
      "dialog.close": "Close",
      "signup.title": "Create account",
      "signup.subtitle": "Register a customer account with Microsoft Entra Native Auth.",
      "signup.emailPlaceholder": "Email",
      "signup.passwordPlaceholder": "New password",
      "signup.confirmPasswordPlaceholder": "Confirm password",
      "signup.displayNamePlaceholder": "Display name (optional)",
      "signup.attributesPlaceholder": "Optional attributes JSON",
      "signup.submit": "Create account",
      "reset.title": "Reset password",
      "reset.subtitle": "Use Microsoft Entra Native Auth self-service password reset.",
      "reset.emailPlaceholder": "Email",
      "reset.passwordPlaceholder": "New password",
      "reset.confirmPasswordPlaceholder": "Confirm new password",
      "reset.submit": "Reset password",
      "diag.title": "Error diagnostics",
      "diag.copy": "Copy diagnostics",
      "diag.status": "Status",
      "diag.code": "Error code",
      "diag.suberror": "Suberror",
      "diag.flowStep": "Flow step",
      "diag.endpoint": "Endpoint",
      "diag.traceId": "Trace ID",
      "diag.correlationId": "Correlation ID",
      "diag.description": "Description",
      "diag.request": "Request payload",
      "diag.response": "Response payload",
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
      "auth.claimProvenance": "Claim Provenance",
      "auth.claimDiffTitle": "Claim diff",
      "auth.viewDiff": "View diff",
      "operator.title": "Operator Beta Insights",
      "operator.refresh": "Refresh operator data",
      "operator.intro": "This panel uses Microsoft Graph beta endpoints and requires operator mode plus elevated Graph permissions.",
      "operator.searchPlaceholder": "Search by object ID or UPN",
      "operator.searchAction": "Open user detail",
      "operator.historyTitle": "Recent operator searches",
      "operator.loading": "Loading operator insights...",
      "operator.userDetail": "User detail",
      "operator.authRequirements": "Authentication requirements",
      "operator.signInPreferences": "Sign-in preferences",
      "operator.registrationRecord": "Registration posture",
      "operator.methodAdoption": "Tenant method adoption",
      "operator.drawerTitle": "Operator user detail",
      "operator.searchRequired": "Enter a user object ID or UPN to open operator detail.",
      "operator.cached": "Loaded from cached beta results.",
      "operator.disabled": "Operator beta mode is disabled. Enable ENABLE_OPERATOR_MODE and ENABLE_BETA_GRAPH to show this panel.",
      "operator.missingUserId": "Operator beta insights require an object ID claim for the signed-in user.",
      "operator.permissionError": "Operator data could not be loaded. The current token may be missing Graph beta scopes or Entra admin role assignments.",
      "operator.empty": "No operator data available.",
      "operator.notFound": "No matching registration record was found for the current user.",
      "auth.tokenExpiresIn": "Expires in {value}",
      "auth.tokenExpired": "Expired",
      "auth.tokenCriticalWithRefresh": "Token is in the critical window. A refresh token is present; reauthenticate or refresh soon to avoid interruption.",
      "auth.tokenCriticalNoRefresh": "Token is in the critical window and no refresh token is available. Reauthenticate before it expires.",
      "auth.tokenCriticalMsal": "Token is nearing expiration. Silent refresh is available for the MSAL session, and you can refresh now if needed.",
      "auth.tokenCriticalMsalRefreshing": "Token is nearing expiration. A silent MSAL refresh is currently in progress.",
      "auth.tokenCriticalMsalFailed": "Silent MSAL refresh could not complete. Refresh again or sign in again before the token expires.",
      "auth.refreshSession": "Refresh session",
      "auth.signInAgain": "Sign in again",
      "auth.reauthPrompt": "Sign in again to continue this session.",
      "auth.refreshModeMsal": "Session mode: MSAL silent refresh",
      "auth.refreshModeNative": "Session mode: Native Auth refresh token",
      "auth.lastRefresh": "Last refresh",
      "auth.nextRefresh": "Next scheduled refresh",
      "auth.refreshNever": "Not yet refreshed",
      "auth.refreshOnDemand": "On-demand (manual refresh)",
      "auth.refreshNotScheduled": "Not scheduled",
      "auth.refreshDueNow": "Due now",
      "auth.profile": "Entra User Profile",
      "auth.profileClaims": "Complete Claims Snapshot",
      "auth.locale": "Locale",
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
      "settings.section.graph": "Graph",
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
      "msg.passwordsDoNotMatch": "The passwords do not match.",
      "msg.signupSuccess": "Account created successfully.",
      "msg.resetSuccess": "Password reset completed successfully.",
      "msg.invalidAttributes": "The sign-up attributes JSON is invalid.",
      "msg.missingRequiredAttributes": "The following sign-up attributes are required: {attributes}",
      "msg.enableDemoMode": "Enable Demo Mode to view raw token values.",
      "msg.demoModeEnabled": "Demo mode enabled.",
      "msg.demoModeDisabled": "Demo mode disabled.",
      "msg.diagnosticsCopied": "Diagnostics copied to clipboard.",
      "msg.msalSilentRefreshSuccess": "MSAL session refreshed silently.",
      "msg.msalSilentRefreshFailed": "MSAL silent refresh failed: {message}",
      "msg.nativeRefreshSuccess": "Native Auth session refreshed.",
      "msg.nativeRefreshFailed": "Native Auth refresh failed: {message}",
      "msg.nativeRefreshUnavailable": "No refresh token is available for this Native Auth session.",
      "msg.passwordResetInProgress": "Password reset in progress…",
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
      "login.signup": "Crear cuenta",
      "login.forgotPassword": "¿Olvidaste la contraseña?",
      "demo.toggle": "Modo de demostración",
      "auth.claimProvenance": "Procedencia de claims",
      "auth.claimDiffTitle": "Diferencias del claim",
      "auth.viewDiff": "Ver diferencias",
      "operator.title": "Información beta para operadores",
      "operator.refresh": "Actualizar datos de operador",
      "operator.intro": "Este panel usa puntos de conexión beta de Microsoft Graph y requiere modo operador más permisos elevados de Graph.",
      "operator.searchPlaceholder": "Buscar por identificador de objeto o UPN",
      "operator.searchAction": "Abrir detalle de usuario",
      "operator.historyTitle": "Búsquedas recientes de operador",
      "operator.loading": "Cargando información de operador...",
      "operator.userDetail": "Detalle del usuario",
      "operator.authRequirements": "Requisitos de autenticación",
      "operator.signInPreferences": "Preferencias de inicio de sesión",
      "operator.registrationRecord": "Estado de registro",
      "operator.methodAdoption": "Adopción de métodos en el inquilino",
      "operator.drawerTitle": "Detalle de usuario para operador",
      "operator.searchRequired": "Ingresa un identificador de objeto o UPN para abrir el detalle de operador.",
      "operator.cached": "Cargado desde resultados beta en caché.",
      "operator.disabled": "El modo beta de operador está deshabilitado. Habilita ENABLE_OPERATOR_MODE y ENABLE_BETA_GRAPH para mostrar este panel.",
      "operator.missingUserId": "La información beta de operador requiere un claim de identificador de objeto del usuario autenticado.",
      "operator.permissionError": "No se pudieron cargar los datos del operador. Es posible que el token actual no tenga los permisos beta de Graph o los roles de administración de Entra requeridos.",
      "operator.empty": "No hay datos de operador disponibles.",
      "operator.notFound": "No se encontró un registro de registro coincidente para el usuario actual.",
      "auth.tokenExpiresIn": "Expira en {value}",
      "auth.tokenExpired": "Expirado",
      "auth.tokenCriticalWithRefresh": "El token está en la ventana crítica. Hay un refresh token disponible; vuelve a autenticarte o actualiza pronto para evitar interrupciones.",
      "auth.tokenCriticalNoRefresh": "El token está en la ventana crítica y no hay refresh token disponible. Vuelve a autenticarte antes de que expire.",
      "auth.tokenCriticalMsal": "El token está cerca de expirar. Hay silent refresh disponible para la sesión MSAL y puedes actualizar ahora si es necesario.",
      "auth.tokenCriticalMsalRefreshing": "El token está cerca de expirar. Hay una actualización silenciosa de MSAL en curso.",
      "auth.tokenCriticalMsalFailed": "La actualización silenciosa de MSAL no pudo completarse. Actualiza de nuevo o inicia sesión otra vez antes de que expire el token.",
      "auth.refreshSession": "Actualizar sesión",
      "auth.signInAgain": "Iniciar sesión otra vez",
      "auth.reauthPrompt": "Inicia sesión otra vez para continuar con esta sesión.",
      "auth.refreshModeMsal": "Modo de sesión: actualización silenciosa de MSAL",
      "auth.refreshModeNative": "Modo de sesión: refresh token de Native Auth",
      "auth.lastRefresh": "Última actualización",
      "auth.nextRefresh": "Próxima actualización programada",
      "auth.refreshNever": "Aún no se actualiza",
      "auth.refreshOnDemand": "Bajo demanda (actualización manual)",
      "auth.refreshNotScheduled": "Sin programación",
      "auth.refreshDueNow": "Pendiente ahora",
      "auth.settings": "Abrir configuración",
      "msg.msalSilentRefreshSuccess": "La sesión de MSAL se actualizó silenciosamente.",
      "msg.msalSilentRefreshFailed": "La actualización silenciosa de MSAL falló: {message}",
      "msg.nativeRefreshSuccess": "La sesión de Native Auth se actualizó.",
      "msg.nativeRefreshFailed": "La actualización de Native Auth falló: {message}",
      "msg.nativeRefreshUnavailable": "No hay refresh token disponible para esta sesión de Native Auth.",
      "auth.profile": "Perfil de usuario de Entra",
      "auth.profileClaims": "Instantánea completa de claims",
      "auth.locale": "Configuración regional",
      "auth.signOut": "Cerrar sesión",
      "dialog.close": "Cerrar",
      "diag.title": "Diagnóstico de errores",
      "diag.copy": "Copiar diagnóstico",
      "status.loading": "Cargando...",
      "settings.section.app": "Aplicación",
      "settings.section.entra": "Entra",
      "settings.section.proxy": "Proxy",
      "settings.section.graph": "Graph",
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
