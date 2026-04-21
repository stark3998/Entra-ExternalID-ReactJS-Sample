const DEFAULTS = {
    tenantSubdomain: "codexjay",
    tenantId: "78a77549-78e5-49f7-a870-9efbb0d32d91",
    clientId: "90947f60-61f6-4c24-a192-8f5dcbf944ec",
    authorityHost: "ciamlogin.com",
    localApiPath: "/api",
    corsPort: 3001,
};

const tenantSubdomain = process.env.TENANT_SUBDOMAIN || DEFAULTS.tenantSubdomain;
const tenantId = process.env.TENANT_ID || DEFAULTS.tenantId;
const authorityHost = process.env.ENTRA_AUTHORITY_HOST || DEFAULTS.authorityHost;
const clientId = process.env.CLIENT_ID || DEFAULTS.clientId;

function trimTrailingSlash(value) {
    return String(value || "").replace(/\/+$/, "");
}

const derivedProxyTarget = `https://${tenantSubdomain}.${authorityHost}/${tenantId}`;

const config = {
    localApiPath: process.env.LOCAL_API_PATH || DEFAULTS.localApiPath,
    port: Number(process.env.CORS_PORT || DEFAULTS.corsPort),
    proxy: trimTrailingSlash(process.env.PROXY_TARGET || derivedProxyTarget),
    allowInsecureTls: String(process.env.ALLOW_INSECURE_TLS || "false").toLowerCase() === "true",
    tenantSubdomain,
    tenantId,
    authorityHost,
    clientId,
};

module.exports = config;