#!/usr/bin/env node
/**
 * Local development: runs the Go API (SQLite by default) and the Vite web app together.
 *
 *   npm run dev              # API on :8080 + web on :5173 (open http://localhost:5173)
 *   npm run dev -- --web     # web only (Studio works without the API)
 *
 * The API is built to .dev/ and run directly (not via `go run`) so Ctrl+C
 * reliably stops it on every platform. Set QRFORGE_DATABASE_URL to use Postgres,
 * e.g. after `docker compose up -d postgres`:
 *   QRFORGE_DATABASE_URL=postgres://qrforge:qrforge@localhost:5432/qrforge?sslmode=disable npm run dev
 */

import { spawn, spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const webOnly = process.argv.includes("--web");
const isWindows = process.platform === "win32";
const color = process.stdout.isTTY && !process.env.NO_COLOR;
const tint = (code, s) => (color ? `\x1b[${code}m${s}\x1b[0m` : s);

const children = [];

function prefixed(name, code, stream) {
  let buffer = "";
  stream.on("data", (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop();
    for (const line of lines) process.stdout.write(`${tint(code, name.padEnd(4))} ${line}\n`);
  });
}

function run(name, code, command, args, options) {
  const child = spawn(command, args, { cwd: root, env: process.env, ...options });
  children.push(child);
  prefixed(name, code, child.stdout);
  prefixed(name, code, child.stderr);
  child.on("exit", (status) => {
    console.log(tint(code, `${name} exited with code ${status}`));
    shutdown(status ?? 0);
  });
  return child;
}

let stopping = false;
function shutdown(status) {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (child.exitCode === null) child.kill();
  setTimeout(() => process.exit(status), 200);
}
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

function haveGo() {
  return spawnSync("go", ["version"], { stdio: "ignore" }).status === 0;
}

if (!webOnly) {
  if (!haveGo()) {
    console.log(tint(33, "Go is not installed — starting the web app only. Install Go 1.26+ for dynamic codes and the dashboard."));
  } else {
    mkdirSync(join(root, ".dev"), { recursive: true });
    const binary = join(root, ".dev", isWindows ? "qrforge.exe" : "qrforge");
    console.log(tint(36, "Building the API…"));
    const build = spawnSync("go", ["build", "-o", binary, "./apps/api"], { cwd: root, stdio: "inherit" });
    if (build.status !== 0) process.exit(build.status ?? 1);
    run("api", 36, binary, [], {
      env: {
        ...process.env,
        QRFORGE_DATABASE_URL: process.env.QRFORGE_DATABASE_URL || `sqlite://${join(root, ".dev", "qrforge.db").replace(/\\/g, "/")}`,
        // Dynamic links point at the Vite server, which proxies /r/ to the API.
        QRFORGE_BASE_URL: process.env.QRFORGE_BASE_URL || "http://localhost:5173",
      },
    });
  }
}

// Run Vite through the current Node binary: no shell, works the same on every OS.
run("web", 35, process.execPath, [join(root, "node_modules", "vite", "bin", "vite.js")], { cwd: join(root, "apps", "web") });
