// app.js
// Main orchestrator — loads after config.js, httpClient.js, ui.js, msalAuth.js, nativeAuth.js
// Tracks which login method was used and handles logout accordingly.

let interactionType = "";
const THEME_STORAGE_KEY = "app_theme";
const DEFAULT_THEME = "azure-portal";
const SUPPORTED_THEMES = ["azure-portal", "enterprise-blue", "fintech-slate"];

function applyTheme(theme) {
  const selectedTheme = SUPPORTED_THEMES.includes(theme) ? theme : DEFAULT_THEME;
  document.body.setAttribute("data-theme", selectedTheme);
  localStorage.setItem(THEME_STORAGE_KEY, selectedTheme);

  const themeSelect = document.getElementById("themeSelect");
  if (themeSelect && themeSelect.value !== selectedTheme) {
    themeSelect.value = selectedTheme;
  }
}

function initThemeSwitcher() {
  const configuredTheme = (window.__APP_CONFIG__ && window.__APP_CONFIG__.THEME) || "";
  const savedTheme = localStorage.getItem(THEME_STORAGE_KEY) || configuredTheme || DEFAULT_THEME;
  applyTheme(savedTheme);

  const themeSelect = document.getElementById("themeSelect");
  if (!themeSelect) return;

  themeSelect.addEventListener("change", (event) => {
    applyTheme(event.target.value);
  });
}

// Restore a previous native auth session on page load
document.addEventListener("DOMContentLoaded", () => {
  initThemeSwitcher();
  if (typeof window.setDemoMode === "function") {
    window.setDemoMode(window.isDemoModeEnabled(), { silent: true });
  }
  restoreSession();
});

async function logout() {
  if (interactionType === "native") {
    // Revoke sign-in sessions via Microsoft Graph before clearing local state
    const tokens = getSessionTokens();
    if (tokens.access_token) {
      try {
        await window.revokeGraphSelfServiceSessions(tokens.access_token);
        console.log("Sign-in sessions revoked successfully.");
      } catch (err) {
        console.warn("Failed to revoke sign-in sessions:", err);
        if (typeof window.showErrorDiagnostics === "function") {
          window.showErrorDiagnostics(err.response?.data || err);
        }
      }
    }
    clearSessionTokens();
    renderUnauthenticatedUI();
    interactionType = "";
    return;
  }
  if (typeof window.clearMsalSilentRefreshTimer === "function") {
    window.clearMsalSilentRefreshTimer();
  }
  if (typeof window.clearRefreshScheduleIndicator === "function") {
    window.clearRefreshScheduleIndicator();
  }
  if (typeof window.setSessionInteractionType === "function") {
    window.setSessionInteractionType("");
  }
  const logoutRequest = {
    account: msalInstance.getAllAccounts()[0],
  };
  console.log("Logging out user:", logoutRequest.account);
  if (interactionType === "popup") {
    msalInstance.logoutPopup(logoutRequest);
  } else {
    msalInstance.logoutRedirect(logoutRequest);
  }
  renderUnauthenticatedUI();
}
