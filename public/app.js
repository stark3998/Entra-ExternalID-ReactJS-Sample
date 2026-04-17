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
  restoreSession();
});

async function logout() {
  if (interactionType === "native") {
    // Revoke sign-in sessions via Microsoft Graph before clearing local state
    const tokens = getSessionTokens();
    if (tokens.access_token) {
      try {
        await axios.post(
          "https://graph.microsoft.com/v1.0/me/revokeSignInSessions",
          {},
          {
            headers: {
              Authorization: `Bearer ${tokens.access_token}`,
              "Content-Type": "application/json",
            },
          }
        );
        console.log("Sign-in sessions revoked successfully.");
      } catch (err) {
        console.warn("Failed to revoke sign-in sessions:", err);
      }
    }
    clearSessionTokens();
    renderUnauthenticatedUI();
    interactionType = "";
    return;
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
