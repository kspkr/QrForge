/**
 * QRForge command-line interface. Everything runs locally and offline.
 */

import { parseArgs } from "node:util";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, extname } from "node:path";
import {
  generateQR,
  analyzeReliability,
  encode,
  getPreset,
  presets,
  QRForgeError,
} from "@qrforge/core";
import { COMMANDS, SHARED_OPTIONS, resolveCommand } from "./commands.js";
import { renderTerminal } from "./terminal.js";
import { ask } from "./prompt.js";

/** An expected, user-facing error (exit code 1). */
export class CliError extends Error {
  constructor(message, hint) {
    super(message);
    this.name = "CliError";
    this.hint = hint;
  }
}

const FORMATS = ["svg", "png", "pdf"];

function readVersion() {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  return pkg.version;
}

function useColor(stream) {
  return Boolean(stream.isTTY) && !("NO_COLOR" in process.env) && process.env.TERM !== "dumb";
}

function paint(stream, code, text) {
  return useColor(stream) ? `\x1b[${code}m${text}\x1b[0m` : text;
}

// ---------------------------------------------------------------------------
// Help

function optionLines(options) {
  return Object.entries(options).map(([name, def]) => {
    const flag = `${def.short ? `-${def.short}, ` : "    "}--${name}${def.type === "string" ? " <value>" : ""}`;
    return `  ${flag.padEnd(30)} ${def.description}`;
  });
}

export function mainHelp() {
  const commands = Object.entries(COMMANDS).map(([name, def]) => {
    const label = def.aliases ? `${name}, ${def.aliases.join(", ")}` : name;
    return `  ${label.padEnd(20)} ${def.summary}`;
  });
  return [
    "QRForge — the open-source QR platform. Generates codes locally and offline.",
    "",
    "Usage:",
    "  qrforge <command> [options]",
    "",
    "Commands:",
    ...commands,
    `  ${"help <command>".padEnd(20)} Show help for a command`,
    "",
    "Output & style options (all commands):",
    ...optionLines(SHARED_OPTIONS),
    "",
    "Global:",
    "  -h, --help                     Show help",
    "  -v, --version                  Show version",
    "",
    "Output rules:",
    "  no --output and no --format    preview the code in the terminal",
    "  --format <fmt> only            write qrcode.<fmt> in the current directory",
    "  --output <file>                write <file> (format inferred from the extension)",
    "  --output -                     write to stdout",
    "",
    "Examples:",
    "  qrforge generate https://example.com",
    "  qrforge generate https://example.com --format svg",
    "  qrforge generate https://example.com --output qr.svg",
    "  qrforge wifi --ssid Home --password 'hunter22' -o wifi.png",
    "  qrforge url example.com --preset modern --label 'Scan me' -o site.pdf",
    "",
    `Presets: ${presets.map((p) => p.id).join(", ")}`,
    "Docs: https://github.com/kspkr/QrForge/tree/main/packages/cli",
  ].join("\n");
}

export function commandHelp(name) {
  const def = COMMANDS[name];
  const lines = [`${def.summary}`, "", "Usage:", `  ${def.usage}`];
  if (Object.keys(def.options).length) lines.push("", "Options:", ...optionLines(def.options));
  lines.push("", "Output & style options:", ...optionLines(SHARED_OPTIONS));
  if (def.examples?.length) lines.push("", "Examples:", ...def.examples.map((e) => `  ${e}`));
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Argument handling

function parse(commandName, argv) {
  const def = COMMANDS[commandName];
  try {
    return parseArgs({
      args: argv,
      options: { ...SHARED_OPTIONS, ...def.options },
      allowPositionals: true,
      strict: true,
    });
  } catch (error) {
    throw new CliError(error.message.replace(/^.*?: /, "").replace(/\. To specify.*$/s, "."), `Run "qrforge ${commandName} --help" for usage.`);
  }
}

function inferFormat(values) {
  if (values.format) {
    const f = values.format.toLowerCase();
    if (!FORMATS.includes(f)) throw new CliError(`Unknown format "${values.format}". Use svg, png or pdf.`);
    return f;
  }
  if (values.output && values.output !== "-") {
    const ext = extname(values.output).slice(1).toLowerCase();
    if (FORMATS.includes(ext)) return ext;
    throw new CliError(
      `Cannot infer the format from "${values.output}".`,
      "Use a .svg, .png or .pdf extension, or pass --format.",
    );
  }
  return "svg";
}

function buildStyle(values, format) {
  let base = {};
  if (values.preset) {
    const preset = getPreset(values.preset);
    if (!preset) {
      throw new CliError(`Unknown preset "${values.preset}".`, `Available presets: ${presets.map((p) => p.id).join(", ")}.`);
    }
    base = { ...preset.options };
  }
  const style = { ...base };
  const set = (key, value) => {
    if (value !== undefined) style[key] = value;
  };
  set("size", values.size);
  set("margin", values.margin);
  set("ecc", values.ecc);
  set("foreground", values.fg);
  set("background", values.transparent ? "transparent" : values.bg);
  set("moduleStyle", values.style);
  set("cornerStyle", values.corner);
  set("cornerDotStyle", values["corner-dot"]);
  set("cornerColor", values["corner-color"]);
  if (values.label !== undefined) style.label = { text: values.label };

  if (values.frame !== undefined) {
    style.frame = { style: values.frame, color: values["frame-color"] ?? base.frame?.color };
  } else if (values["frame-color"] !== undefined) {
    if (!base.frame) throw new CliError("--frame-color needs a frame.", "Add --frame box or --frame banner.");
    style.frame = { ...base.frame, color: values["frame-color"] };
  }

  if (values.logo !== undefined) {
    let bytes;
    try {
      bytes = new Uint8Array(readFileSync(resolve(values.logo)));
    } catch (error) {
      throw new CliError(`Cannot read logo file "${values.logo}": ${error.code === "ENOENT" ? "file not found" : error.message}.`);
    }
    style.logo = { src: bytes };
    if (values["logo-size"] !== undefined) style.logo.size = values["logo-size"];
    // A logo hides modules: default to the highest error correction.
    if (values.ecc === undefined) style.ecc = "H";
  } else if (values["logo-size"] !== undefined) {
    throw new CliError("--logo-size needs --logo <file>.");
  }

  if (values["page-size"] !== undefined) {
    const allowed = ["fit", "A4", "Letter", "A5"];
    const match = allowed.find((p) => p.toLowerCase() === values["page-size"].toLowerCase());
    if (!match) throw new CliError(`Unknown page size "${values["page-size"]}". Use ${allowed.join(", ")}.`);
    if (format !== "pdf") throw new CliError("--page-size only applies to PDF output.");
    style.pageSize = match;
  }
  return style;
}

async function collectFields(def, values, io) {
  const missing = def.fields.filter((f) => def.fields && f.required(values) && !hasValue(values[f.key]));
  if (missing.length === 0) return;
  if (!io.stdin.isTTY) {
    const flags = missing.map((f) => f.flag ?? `--${f.key}`);
    throw new CliError(`Missing required ${flags.length > 1 ? "options" : "option"}: ${flags.join(", ")}.`, `Run "qrforge ${def.name} --help" for usage.`);
  }
  for (const field of def.fields) {
    if (!field.required(values) || hasValue(values[field.key])) continue;
    const answer = await ask(`${field.label}: `, { secret: field.secret, input: io.stdin, output: io.stderr });
    values[field.key] = answer;
    if (!hasValue(answer)) throw new CliError(`${field.label} is required.`);
  }
}

function hasValue(v) {
  return v !== undefined && v !== null && String(v).trim() !== "";
}

function printWarnings(options, io) {
  let report;
  try {
    report = analyzeReliability(options);
  } catch {
    return;
  }
  for (const w of report.warnings) {
    if (w.severity === "info") {
      io.stderr.write(`${paint(io.stderr, "2", `note: ${w.message}`)}\n`);
    } else {
      const label = w.severity === "danger" ? "warning (scan risk)" : "warning";
      io.stderr.write(`${paint(io.stderr, "33", `${label}: ${w.message}`)}\n`);
    }
  }
}

function summarize(def, payload) {
  const shown = def.mask ? def.mask(payload) : payload;
  const oneLine = shown.replace(/\r?\n/g, " ⏎ ");
  return oneLine.length > 120 ? `${oneLine.slice(0, 117)}...` : oneLine;
}

// ---------------------------------------------------------------------------

async function execute(commandName, argv, io) {
  const def = { ...COMMANDS[commandName], name: commandName };
  const { values, positionals } = parse(commandName, argv);
  if (values.help) {
    io.stdout.write(`${commandHelp(commandName)}\n`);
    return 0;
  }

  if (positionals.length > 0) {
    if (!def.positional) {
      throw new CliError(`Unexpected argument "${positionals[0]}".`, `Run "qrforge ${commandName} --help" for usage.`);
    }
    if (positionals.length > 1) {
      throw new CliError(
        `Too many arguments: ${positionals.map((p) => JSON.stringify(p)).join(" ")}.`,
        "Wrap text containing spaces in quotes.",
      );
    }
    if (hasValue(values[def.positional])) {
      throw new CliError(`Give the ${def.positional} either as an argument or with --${def.positional}, not both.`);
    }
    values[def.positional] = positionals[0];
  }
  if (commandName === "generate" && values.data === "-") {
    values.data = readFileSync(0, "utf8").replace(/\r?\n$/, "");
  }

  await collectFields(def, values, io);
  const payload = def.build(values);

  const toTerminal = values.terminal || (values.output === undefined && values.format === undefined);
  if (toTerminal && values.output === undefined && values.format === undefined) {
    const style = buildStyle(values, "svg");
    const matrix = encode(payload, { ecc: style.ecc ?? "M" });
    io.stdout.write(renderTerminal(matrix, { color: useColor(io.stdout) }));
    io.stdout.write(`${def.type} · version ${matrix.version} (${matrix.size}×${matrix.size}) · ecc ${matrix.ecc}\n`);
    io.stdout.write(`${summarize(def, payload)}\n`);
    return 0;
  }

  const format = inferFormat(values);
  const style = buildStyle(values, format);
  const options = { ...style, data: payload, format };

  if (values.terminal) {
    const matrix = encode(payload, { ecc: style.ecc ?? "M" });
    io.stderr.write(renderTerminal(matrix, { color: useColor(io.stderr) }));
  }

  let result;
  try {
    result = await generateQR({ ...options, output: format === "svg" ? "string" : "buffer" });
  } catch (error) {
    if (error instanceof QRForgeError && error.code === "UNSUPPORTED_FEATURE" && error.details?.field === "label") {
      throw new CliError("Text labels in PNG output need a browser.", "Use --format svg or --format pdf for labelled codes.");
    }
    if (error instanceof QRForgeError && error.code === "UNSUPPORTED_FEATURE" && error.details?.field === "logo.src") {
      throw new CliError(error.message, "Convert the logo to PNG, or use --format svg.");
    }
    throw error;
  }
  printWarnings(options, io);

  if (values.output === "-") {
    if (format !== "svg" && io.stdout.isTTY) {
      throw new CliError(`Refusing to write binary ${format.toUpperCase()} data to the terminal.`, "Redirect stdout to a file or pipe.");
    }
    io.stdout.write(typeof result === "string" ? result : Buffer.from(result));
    return 0;
  }

  const target = resolve(io.cwd, values.output ?? `qrcode.${format}`);
  try {
    writeFileSync(target, typeof result === "string" ? result : Buffer.from(result));
  } catch (error) {
    throw new CliError(`Cannot write "${target}": ${error.message}`);
  }
  io.stdout.write(`${paint(io.stdout, "32", "✓")} Saved ${format.toUpperCase()} to ${target}\n`);
  return 0;
}

/**
 * Run the CLI.
 * @param {string[]} argv - arguments without the node/script prefix
 * @param {{stdout?:NodeJS.WriteStream,stderr?:NodeJS.WriteStream,stdin?:NodeJS.ReadStream,cwd?:string}} [io]
 * @returns {Promise<number>} exit code
 */
export async function run(argv, io = {}) {
  const streams = {
    stdout: io.stdout ?? process.stdout,
    stderr: io.stderr ?? process.stderr,
    stdin: io.stdin ?? process.stdin,
    cwd: io.cwd ?? process.cwd(),
  };
  const [first, ...rest] = argv;
  try {
    if (first === undefined || first === "-h" || first === "--help") {
      streams.stdout.write(`${mainHelp()}\n`);
      return first === undefined ? 1 : 0;
    }
    if (first === "-v" || first === "--version" || first === "version") {
      streams.stdout.write(`${readVersion()}\n`);
      return 0;
    }
    if (first === "help") {
      if (rest.length === 0) {
        streams.stdout.write(`${mainHelp()}\n`);
        return 0;
      }
      const name = resolveCommand(rest[0]);
      if (!name) throw new CliError(`Unknown command "${rest[0]}".`, 'Run "qrforge --help" to see all commands.');
      streams.stdout.write(`${commandHelp(name)}\n`);
      return 0;
    }
    const name = resolveCommand(first);
    if (!name) {
      throw new CliError(`Unknown command "${first}".`, 'Run "qrforge --help" to see all commands.');
    }
    return await execute(name, rest, streams);
  } catch (error) {
    if (error instanceof CliError || error instanceof QRForgeError || error?.cancelled) {
      streams.stderr.write(`${paint(streams.stderr, "31", "error:")} ${error.message}\n`);
      if (error.hint) streams.stderr.write(`${error.hint}\n`);
      if (process.env.QRFORGE_DEBUG === "1") streams.stderr.write(`${error.stack}\n`);
      return 1;
    }
    streams.stderr.write(`${paint(streams.stderr, "31", "unexpected error:")} ${error?.message ?? error}\n`);
    if (process.env.QRFORGE_DEBUG === "1") streams.stderr.write(`${error?.stack}\n`);
    else streams.stderr.write("Set QRFORGE_DEBUG=1 for details. Please report bugs at https://github.com/kspkr/QrForge/issues\n");
    return 2;
  }
}
