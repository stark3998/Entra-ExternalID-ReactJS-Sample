"use strict";

const http = require("http");
const https = require("https");
const { URL } = require("url");
const proxyConfig = require("../config/proxy.config.js");

/**
 * ==========================
 * Environment Configuration
 * ==========================
 */
const PORT = process.env.PORT || 3001;

// Example:
// PROXY_TARGET=https://api.example.com
// LOCAL_API_PATH=/api
// ALLOWED_ORIGINS=https://app.example.com,https://admin.example.com
const PROXY_TARGET = process.env.PROXY_TARGET || proxyConfig.proxy;
const LOCAL_API_PATH = process.env.LOCAL_API_PATH || "/api";
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "http://localhost:8080")
    .split(",")
    .map(o => o.trim())
    .filter(Boolean);

console.log("Configuration:");
console.log("PROXY_TARGET:", PROXY_TARGET);
console.log("LOCAL_API_PATH:", LOCAL_API_PATH);
console.log("ALLOWED_ORIGINS:", ALLOWED_ORIGINS);

if (!PROXY_TARGET) {
    throw new Error("PROXY_TARGET environment variable is required");
}

const targetUrl = new URL(PROXY_TARGET);
const TARGET_HOSTNAME = targetUrl.hostname;

/**
 * ==========================
 * Security Configuration
 * ==========================
 */

// Headers allowed from browsers
const ALLOWED_HEADERS = [
    "content-type",
    "authorization",
    "client-request-id",
    "x-client-sku",
    "x-client-ver",
    "x-client-os",
    "x-client-cpu",
    "x-client-current-telemetry",
    "x-client-last-telemetry"
];

// Headers NEVER forwarded upstream
const BLOCKED_HEADERS = [
    "cookie",
    "host",
    "origin",
    "referer",
    "x-forwarded-for",
    "x-real-ip"
];

// HTTP methods allowed
const ALLOWED_METHODS = ["GET", "POST", "PUT", "DELETE", "OPTIONS"];

/**
 * ==========================
 * Helper Functions
 * ==========================
 */
function buildCorsHeaders(origin) {
    if (!ALLOWED_ORIGINS.includes(origin)) return null;

    return {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": ALLOWED_METHODS.join(", "),
        "Access-Control-Allow-Headers": ALLOWED_HEADERS.join(", "),
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Max-Age": "86400"
    };
}

function sanitizeHeaders(headers) {
    const clean = {};

    for (const [key, value] of Object.entries(headers)) {
        if (!BLOCKED_HEADERS.includes(key.toLowerCase())) {
            clean[key] = value;
        }
    }

    return clean;
}

/**
 * ==========================
 * HTTP Server
 * ==========================
 */
const server = http.createServer((req, res) => {
    try {
        const origin = req.headers.origin;
        console.log('Origin : %s', origin);
        const corsHeaders = buildCorsHeaders(origin);

        // Reject unknown origins early
        if (!corsHeaders && origin) {
            res.writeHead(403);
            res.end("CORS origin denied");
            return;
        }

        // Handle preflight
        if (req.method === "OPTIONS") {
            if (!corsHeaders) {
                res.writeHead(403);
                res.end();
                return;
            }

            res.writeHead(204, corsHeaders);
            res.end();
            return;
        }

        if (!ALLOWED_METHODS.includes(req.method)) {
            res.writeHead(405);
            res.end("Method not allowed");
            return;
        }

        if (!req.url.startsWith(LOCAL_API_PATH)) {
            res.writeHead(404);
            res.end("Not found");
            return;
        }

        const upstreamPath = req.url.replace(LOCAL_API_PATH, "") || "/";

        // Build a proper URL object for upstream requests
        // const upstreamUrl = new URL(upstreamPath, PROXY_TARGET);
        var upstreamUrl = PROXY_TARGET + upstreamPath;

        const proxyReq = https.request(
            upstreamUrl,
            {
                method: req.method,
                headers: {
                    ...sanitizeHeaders(req.headers),
                    host: TARGET_HOSTNAME
                }
            },
            proxyRes => {
                console.log(`Upstream response: ${proxyRes.statusCode} ${proxyRes.statusMessage}`);
                res.writeHead(proxyRes.statusCode, {
                    ...proxyRes.headers,
                    ...(corsHeaders || {})
                });

                proxyRes.pipe(res);
            }
        );

        proxyReq.on("error", err => {
            console.error("Proxy error:", err);
            res.writeHead(502);
            res.end("Bad gateway");
        });

        req.pipe(proxyReq);

    } catch (err) {
        console.error("Unhandled error:", err);
        res.writeHead(500);
        res.end("Internal server error");
    }
});

/**
 * ==========================
 * Start Server
 * ==========================
 */
server.listen(PORT, () => {
    console.log(`CORS proxy running on port ${PORT}`);
    console.log(`Proxying ${LOCAL_API_PATH} -> ${PROXY_TARGET}`);
});
