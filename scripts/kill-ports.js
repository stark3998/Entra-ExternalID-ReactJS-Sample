#!/usr/bin/env node

const { getTargetPorts, killPorts } = require("./port-utils");

const ports = getTargetPorts();
console.log(`[ports] checking ${ports.join(", ")}`);
killPorts(ports, console.log);
console.log("[ports] cleanup complete");
