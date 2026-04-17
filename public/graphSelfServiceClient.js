// graphSelfServiceClient.js
// Microsoft Graph delegated self-service operations for the signed-in user.

function createGraphAuthHeaders(accessToken) {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
}

function normalizeGraphFieldList(value) {
  const items = Array.isArray(value) ? value : String(value || "").split(",");
  const unique = new Set();
  items.forEach((item) => {
    const cleaned = String(item || "").trim();
    if (cleaned) unique.add(cleaned);
  });
  return Array.from(unique);
}

function getDefaultGraphProfileFields() {
  return normalizeGraphFieldList(typeof GRAPH_PROFILE_SELECT_FIELDS !== "undefined" ? GRAPH_PROFILE_SELECT_FIELDS : []);
}

function buildGraphProfileEndpoint(selectFields) {
  const fields = normalizeGraphFieldList(selectFields);
  if (fields.length === 0) return GRAPH_SELF_SERVICE_ENDPOINTS.me;
  return `${GRAPH_SELF_SERVICE_ENDPOINTS.me}?$select=${fields.join(",")}`;
}

async function getGraphSelfServiceProfile(accessToken, options = {}) {
  const selectedFields = normalizeGraphFieldList(options.selectFields || getDefaultGraphProfileFields());
  const endpoint = buildGraphProfileEndpoint(selectedFields);
  const response = await axios.get(endpoint, {
    headers: createGraphAuthHeaders(accessToken),
  });
  return {
    data: response.data,
    selectedFields,
    endpoint,
  };
}

async function getGraphSelfServiceAuthMethods(accessToken) {
  const response = await axios.get(GRAPH_SELF_SERVICE_ENDPOINTS.authMethods, {
    headers: createGraphAuthHeaders(accessToken),
  });
  return response.data;
}

async function getGraphSelfServiceTapMethods(accessToken) {
  const response = await axios.get(GRAPH_SELF_SERVICE_ENDPOINTS.tapMethods, {
    headers: createGraphAuthHeaders(accessToken),
  });
  return response.data;
}

async function revokeGraphSelfServiceSessions(accessToken) {
  return axios.post(
    GRAPH_SELF_SERVICE_ENDPOINTS.revokeSessions,
    {},
    { headers: createGraphAuthHeaders(accessToken) }
  );
}

async function addGraphSelfServicePhoneMethod(accessToken, phoneNumber, phoneType) {
  return axios.post(
    GRAPH_SELF_SERVICE_ENDPOINTS.phoneMethods,
    { phoneNumber, phoneType },
    { headers: createGraphAuthHeaders(accessToken) }
  );
}

window.getGraphSelfServiceProfile = getGraphSelfServiceProfile;
window.getGraphSelfServiceAuthMethods = getGraphSelfServiceAuthMethods;
window.getGraphSelfServiceTapMethods = getGraphSelfServiceTapMethods;
window.revokeGraphSelfServiceSessions = revokeGraphSelfServiceSessions;
window.addGraphSelfServicePhoneMethod = addGraphSelfServicePhoneMethod;
window.getDefaultGraphProfileFields = getDefaultGraphProfileFields;