// graphOperatorClient.js
// Microsoft Graph beta/operator operations. Keep usage behind ENABLE_OPERATOR_MODE.

function assertOperatorGraphEnabled() {
  if (!ENABLE_OPERATOR_MODE || !ENABLE_BETA_GRAPH) {
    throw new Error("Operator Graph beta mode is disabled in runtime configuration.");
  }
}

function createOperatorGraphHeaders(accessToken) {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
}

async function getOperatorUserDetail(accessToken, userId) {
  assertOperatorGraphEnabled();
  const response = await axios.get(GRAPH_OPERATOR_ENDPOINTS.userDetail(userId), {
    headers: createOperatorGraphHeaders(accessToken),
  });
  return response.data;
}

async function getOperatorAuthRequirements(accessToken, userId) {
  assertOperatorGraphEnabled();
  const response = await axios.get(GRAPH_OPERATOR_ENDPOINTS.authRequirements(userId), {
    headers: createOperatorGraphHeaders(accessToken),
  });
  return response.data;
}

async function getOperatorSignInPreferences(accessToken, userId) {
  assertOperatorGraphEnabled();
  const response = await axios.get(GRAPH_OPERATOR_ENDPOINTS.signInPreferences(userId), {
    headers: createOperatorGraphHeaders(accessToken),
  });
  return response.data;
}

async function getOperatorRegistrationDetails(accessToken) {
  assertOperatorGraphEnabled();
  const response = await axios.get(GRAPH_OPERATOR_ENDPOINTS.registrationDetails, {
    headers: createOperatorGraphHeaders(accessToken),
  });
  return response.data;
}

async function getOperatorSignInSummary(accessToken) {
  assertOperatorGraphEnabled();
  const response = await axios.get(GRAPH_OPERATOR_ENDPOINTS.signInSummary, {
    headers: createOperatorGraphHeaders(accessToken),
  });
  return response.data;
}

window.getOperatorUserDetail = getOperatorUserDetail;
window.getOperatorAuthRequirements = getOperatorAuthRequirements;
window.getOperatorSignInPreferences = getOperatorSignInPreferences;
window.getOperatorRegistrationDetails = getOperatorRegistrationDetails;
window.getOperatorSignInSummary = getOperatorSignInSummary;