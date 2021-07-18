#!/usr/bin/env node

const path = require("path");
const crossSpawn = require("cross-spawn");

const tasklemonPath = path.join(__dirname, "node_modules/tasklemon/source/tasklemon.js");
const scriptPath = path.join(__dirname, "timefind.lem.js");

const scriptArgs = process.argv.slice(2);

const scriptProcess = crossSpawn(
	"node",
	[tasklemonPath, scriptPath, ...scriptArgs],
	{ stdio: "inherit" }
);

scriptProcess.on('exit', code => {
	process.exit(code);
});
