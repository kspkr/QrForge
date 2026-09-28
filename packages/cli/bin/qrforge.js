#!/usr/bin/env node
import { run } from "../src/cli.js";

run(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (error) => {
    // run() handles its own errors; this is a last-resort guard.
    process.stderr.write(`qrforge: unexpected error: ${error?.message ?? error}\n`);
    process.exitCode = 2;
  },
);
