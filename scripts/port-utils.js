#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

function loadDotEnv(envPath) {
  if (!fs.existsSync(envPath)) return {};

  const result = {};
  const content = fs.readFileSync(envPath, "utf8");
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex <= 0) continue;

    const key = trimmed.slice(0, equalsIndex).trim();
    let value = trimmed.slice(equalsIndex + 1).trim();

    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    result[key] = value;
  }

  return result;
}

function parsePort(value, fallback) {
  const n = Number(value || fallback);
  if (!Number.isInteger(n) || n <= 0 || n > 65535) {
    return fallback;
  }
  return n;
}

function getTargetPorts() {
  const envFilePath = path.resolve(process.cwd(), ".env");
  const envFile = loadDotEnv(envFilePath);

  const appPort = parsePort(process.env.APP_PORT || envFile.APP_PORT, 8080);
  const corsPort = parsePort(
    process.env.CORS_PORT || process.env.PORT || envFile.CORS_PORT || envFile.PORT,
    3001
  );

  return Array.from(new Set([appPort, corsPort]));
}

function getPidsOnPortWindows(port) {
  try {
    const cmd = `netstat -ano -p tcp | findstr :${port}`;
    const output = execSync(cmd, { encoding: "utf8" });
    const lines = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

    const pids = new Set();
    for (const line of lines) {
      const tokens = line.split(/\s+/);
      if (tokens.length < 5) continue;

      const localAddress = tokens[1] || "";
      const state = (tokens[3] || "").toUpperCase();
      const pid = Number(tokens[tokens.length - 1]);

      if (!localAddress.endsWith(`:${port}`)) continue;
      if (state !== "LISTENING") continue;
      if (!Number.isInteger(pid) || pid <= 0 || pid === process.pid) continue;

      pids.add(pid);
    }

    return Array.from(pids);
  } catch (_err) {
    return [];
  }
}

function getPidsOnPortUnix(port) {
  try {
    const output = execSync(`lsof -ti tcp:${port}`, { encoding: "utf8" });
    return output
      .split(/\r?\n/)
      .map((line) => Number(line.trim()))
      .filter((pid) => Number.isInteger(pid) && pid > 0 && pid !== process.pid);
  } catch (_err) {
    return [];
  }
}

function getPidsOnPort(port) {
  if (process.platform === "win32") {
    return getPidsOnPortWindows(port);
  }
  return getPidsOnPortUnix(port);
}

function killPid(pid) {
  try {
    if (process.platform === "win32") {
      execSync(`taskkill /F /PID ${pid}`, { stdio: "ignore" });
    } else {
      execSync(`kill -9 ${pid}`, { stdio: "ignore" });
    }
    return true;
  } catch (_err) {
    return false;
  }
}

function killPorts(ports, logger) {
  const log = typeof logger === "function" ? logger : () => {};
  const report = [];

  for (const port of ports) {
    const pids = getPidsOnPort(port);
    if (pids.length === 0) {
      log(`[ports] ${port}: no listener found`);
      report.push({ port, killed: [] });
      continue;
    }

    const killed = [];
    for (const pid of pids) {
      if (killPid(pid)) {
        killed.push(pid);
      }
    }

    if (killed.length > 0) {
      log(`[ports] ${port}: killed PID(s) ${killed.join(", ")}`);
    } else {
      log(`[ports] ${port}: listener found but could not kill PID(s)`);
    }

    report.push({ port, killed });
  }

  return report;
}

module.exports = {
  getTargetPorts,
  killPorts,
};
