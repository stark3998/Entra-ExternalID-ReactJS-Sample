const DEFAULTS = {
    tenantSubdomain: "TakedaIDtst",
    tenantId: "23524f33-8f73-42a8-8246-12ab4e74d324",
    clientId: "48a52df3-eefa-4c31-aacb-7cc69ebc2166",
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
    tenantSubdomain,
    tenantId,
    authorityHost,
    clientId,
};

module.exports = config;