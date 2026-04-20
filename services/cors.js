const http = require("http");
const https = require("https");
const url = require("url");
const proxyConfig = require("../config/proxy.config.js");

const extraHeaders = [
    "x-client-SKU",
    "x-client-VER",
    "x-client-OS",
    "x-client-CPU",
    "x-client-current-telemetry",
    "x-client-last-telemetry",
    "client-request-id",
];

function buildCorsHeaders(origin) {
    return {
        "Access-Control-Allow-Origin": origin || "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, " + extraHeaders.join(", "),
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Max-Age": "86400",
    };
}

http.createServer((req, res) => {
    const reqUrl = url.parse(req.url);
    const domain = url.parse(proxyConfig.proxy).hostname;

    // Set CORS headers for all responses including OPTIONS
    const corsHeaders = buildCorsHeaders(req.headers.origin);

    // Handle preflight OPTIONS request
    if (req.method === "OPTIONS") {
        res.writeHead(204, corsHeaders);
        res.end();
        return;
    }

    if (reqUrl.pathname.startsWith(proxyConfig.localApiPath)) {
        const targetUrl = proxyConfig.proxy + reqUrl.pathname?.replace(proxyConfig.localApiPath, "") + (reqUrl.search || "");

        console.log("Incoming request -> " + req.url + " ===> " + reqUrl.pathname);
        console.log("Target URL : " + targetUrl);

        const newHeaders = {};
        for (let [key, value] of Object.entries(req.headers)) {
            if (key !== 'origin') {
                newHeaders[key] = value;
            }
        }

        const proxyReq = https.request(
            targetUrl, // CodeQL [SM04580] The newly generated target URL utilizes the configured proxy URL to resolve the CORS issue and will be used exclusively for demo purposes and run locally.
            {
                method: req.method,
                rejectUnauthorized: !proxyConfig.allowInsecureTls,
                headers: {
                    ...newHeaders,
                    host: domain,
                },
            },
            (proxyRes) => {
                res.writeHead(proxyRes.statusCode, {
                    ...proxyRes.headers,
                    ...corsHeaders,
                });

                proxyRes.pipe(res);
            }
        );

        proxyReq.on("error", (err) => {
            console.error("Error with the proxy request:", err);
            res.writeHead(500, {
                ...corsHeaders,
                "Content-Type": "text/plain",
            });
            res.end("Proxy error.");
        });

        req.pipe(proxyReq);
    } else {
        res.writeHead(404, {
            ...corsHeaders,
            "Content-Type": "text/plain",
        });
        res.end("Not Found");
    }
}).listen(proxyConfig.port, () => {
    console.log(`CORS proxy running on http://localhost:${proxyConfig.port}`);
    console.log("Proxying from " + proxyConfig.localApiPath + " ===> " + proxyConfig.proxy);
    console.log("ALLOW_INSECURE_TLS=" + String(proxyConfig.allowInsecureTls));
});
