// httpClient.js
// HTTP utilities for API calls

const axios = window.axios;
axios.defaults.baseURL = '/';
axios.defaults.headers.common['Accept'] = 'application/json';

const HTTP_DIAGNOSTICS = [];
const SENSITIVE_KEYS = new Set(["password", "oob", "new_password", "access_token", "id_token", "refresh_token"]);

function maskSensitiveFields(value) {
  if (Array.isArray(value)) {
    return value.map(maskSensitiveFields);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.keys(value).reduce((accumulator, key) => {
    const rawValue = value[key];
    accumulator[key] = SENSITIVE_KEYS.has(String(key).toLowerCase())
      ? "***"
      : maskSensitiveFields(rawValue);
    return accumulator;
  }, {});
}

function extractResponseDiagnostics(response, context = {}) {
  const headers = response && response.headers ? response.headers : {};
  const data = response && response.data ? response.data : {};

  return {
    flowName: context.flowName || "unknown",
    flowStep: context.flowStep || "unknown",
    endpoint: context.endpoint || response?.config?.url || "",
    method: (response?.config?.method || context.method || "post").toUpperCase(),
    status: response?.status || null,
    timestamp: new Date().toISOString(),
    durationMs: typeof context.startedAt === "number" ? Date.now() - context.startedAt : null,
    trace_id: data.trace_id || headers["x-ms-trace-id"] || headers["trace-id"] || "",
    correlation_id: data.correlation_id || headers["x-ms-correlation-id"] || headers["client-request-id"] || "",
    requestPayload: maskSensitiveFields(context.payload || {}),
    responsePayload: maskSensitiveFields(data),
  };
}

function pushHttpDiagnostic(diagnostic) {
  HTTP_DIAGNOSTICS.unshift(diagnostic);
  if (HTTP_DIAGNOSTICS.length > 20) {
    HTTP_DIAGNOSTICS.length = 20;
  }

  if (typeof window.pushErrorHistory === "function" && diagnostic.status && diagnostic.status >= 400) {
    window.pushErrorHistory(diagnostic);
  }
}

function normalizeAuthError(error, context = {}) {
  const response = error && error.response ? error.response : null;
  const diagnostics = extractResponseDiagnostics(response || {}, context);
  const data = response && response.data ? response.data : {};

  const normalized = {
    error: data.error || (response ? response.status : "NetworkError"),
    error_description: data.error_description || data.description || error.message || "Request failed",
    suberror: data.suberror || "",
    error_codes: data.error_codes || data.codes || [],
    timestamp: data.timestamp || diagnostics.timestamp,
    trace_id: diagnostics.trace_id,
    correlation_id: diagnostics.correlation_id,
    continuation_token: data.continuation_token || "",
    challenge_type: data.challenge_type || "",
    invalid_attributes: data.invalid_attributes || [],
    flowName: diagnostics.flowName,
    flowStep: diagnostics.flowStep,
    endpoint: diagnostics.endpoint,
    method: diagnostics.method,
    status: diagnostics.status || 0,
    requestPayload: diagnostics.requestPayload,
    responsePayload: diagnostics.responsePayload,
  };

  pushHttpDiagnostic({ ...diagnostics, ...normalized });
  return normalized;
}

window.getHttpDiagnostics = function getHttpDiagnostics() {
  return HTTP_DIAGNOSTICS.slice();
};

window.maskSensitiveFields = maskSensitiveFields;

const postRequest = async (url, payloadExt, context = {}) => {
  const requestContext = {
    method: "POST",
    endpoint: url,
    payload: payloadExt,
    startedAt: Date.now(),
    ...context,
  };

  try {
    const response = await axios.post(url, new URLSearchParams(payloadExt), {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      }
    });
    pushHttpDiagnostic(extractResponseDiagnostics(response, requestContext));
    return response.data;
  } catch (error) {
    throw normalizeAuthError(error, requestContext);
  }
};

const getRequest = async (url, context = {}) => {
  const requestContext = {
    method: "GET",
    endpoint: url,
    startedAt: Date.now(),
    ...context,
  };

  try {
    const response = await axios.get(url, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      }
    });
    pushHttpDiagnostic(extractResponseDiagnostics(response, requestContext));
    return response.data;
  } catch (error) {
    throw normalizeAuthError(error, requestContext);
  }
};
