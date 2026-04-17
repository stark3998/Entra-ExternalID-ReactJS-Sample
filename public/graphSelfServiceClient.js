// graphSelfServiceClient.js
// Microsoft Graph delegated self-service operations for the signed-in user.

function createGraphAuthHeaders(accessToken) {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
}

async function getGraphSelfServiceProfile(accessToken) {
  const response = await axios.get(GRAPH_SELF_SERVICE_ENDPOINTS.me, {
    headers: createGraphAuthHeaders(accessToken),
  });
  return response.data;
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