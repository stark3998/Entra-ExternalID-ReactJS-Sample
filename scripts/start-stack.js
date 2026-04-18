#!/usr/bin/env node

const { spawn } = require("child_process");
const { getTargetPorts, killPorts } = require("./port-utils");

const plainMode = process.argv.includes("--plain");

const services = [
  { name: "APP", color: "\x1b[36m", command: process.execPath, args: ["--env-file-if-exists=.env", "services/server.js"] },
  { name: "CORS", color: "\x1b[35m", command: process.execPath, args: ["--env-file-if-exists=.env", "services/cors.js"] },
];

const children = [];
let shuttingDown = false;

function formatLog(service, chunk) {
  const text = chunk.toString();
  if (plainMode) {
    return text
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => `[${service.name}] ${line}`)
      .join("\n") + (text.endsWith("\n") ? "\n" : "");
  }

  const reset = "\x1b[0m";
  return text
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => `${service.color}[${service.name}]${reset} ${line}`)
    .join("\n") + (text.endsWith("\n") ? "\n" : "");
}

function spawnService(service) {
  const child = spawn(service.command, service.args, {
    cwd: process.cwd(),
    stdio: ["inherit", "pipe", "pipe"],
    shell: false,
    env: process.env,
  });

  child.stdout.on("data", (chunk) => {
    process.stdout.write(formatLog(service, chunk));
  });

  child.stderr.on("data", (chunk) => {
    process.stderr.write(formatLog(service, chunk));
  });

  child.on("exit", (code, signal) => {
    if (shuttingDown) return;

    const exitDetail = signal ? `signal ${signal}` : `code ${code}`;
    console.error(`[${service.name}] exited with ${exitDetail}. Shutting down stack.`);
    shutdown(code || 1);
  });

  children.push(child);
}

function shutdown(exitCode) {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const child of children) {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }

  setTimeout(() => {
    for (const child of children) {
      if (!child.killed) {
        child.kill("SIGKILL");
      }
    }
    process.exit(exitCode);
  }, 800);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

const targetPorts = getTargetPorts();
if (!plainMode) {
  console.log(`[stack] pre-start cleanup on ports: ${targetPorts.join(", ")}`);
}
killPorts(targetPorts, plainMode ? () => {} : console.log);

for (const service of services) {
  spawnService(service);
}
