#!/usr/bin/env node

const { getTargetPorts, killPorts } = require("./port-utils");

console.log("[stack] stopping demo stack...");
const ports = getTargetPorts();
killPorts(ports, console.log);
console.log("[stack] stop complete");
