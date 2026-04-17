const DEFAULTS = {
    tenantSubdomain: "YOUR_TENANT_SUBDOMAIN",
    tenantId: "YOUR_TENANT_ID",
    authorityHost: "ciamlogin.com",
    localApiPath: "/api",
    corsPort: 3001,
};

const tenantSubdomain = process.env.TENANT_SUBDOMAIN || DEFAULTS.tenantSubdomain;
const tenantId = process.env.TENANT_ID || DEFAULTS.tenantId;
const authorityHost = process.env.ENTRA_AUTHORITY_HOST || DEFAULTS.authorityHost;

function trimTrailingSlash(value) {
    return String(value || "").replace(/\/+$/, "");
}

const derivedProxyTarget = `https://${tenantSubdomain}.${authorityHost}/${tenantId}`;

const config = {
    localApiPath: process.env.LOCAL_API_PATH || DEFAULTS.localApiPath,
    port: Number(process.env.CORS_PORT || DEFAULTS.corsPort),
    proxy: trimTrailingSlash(process.env.PROXY_TARGET || derivedProxyTarget),
    tenantSubdomain,
    tenantId,
    authorityHost,
};

module.exports = config;