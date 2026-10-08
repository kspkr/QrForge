import { useEffect, useState } from "react";
import {
  ArrowRight,
  Lock,
  Palette,
  ChartColumn,
  Zap,
  Package,
  Terminal,
  Atom,
  Container,
  Link2,
  FileDown,
  HandCoins,
  UserX,
  EyeOff,
  Server,
  Check,
  Copy,
} from "lucide-react";
import { QRCode } from "@qrforge/react";
import { presets } from "@qrforge/core";
import { ButtonLink } from "../components/ui/Button.jsx";
import { GitHubIcon } from "../components/ui/icons.jsx";
import { REPO_URL } from "../lib/config.js";
import { cx } from "../lib/cx.js";
import { useDocumentTitle } from "../hooks/useDocumentTitle.js";

const SPECIMENS = presets.filter((p) => p.id !== "dark");

function Specimen() {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return undefined;
    const t = setInterval(() => setIndex((i) => (i + 1) % SPECIMENS.length), 2800);
    return () => clearInterval(t);
  }, []);
  const preset = SPECIMENS[index];
  return (
    <div className="relative mx-auto w-full max-w-[360px]">
      <div className="absolute -inset-10 -z-10 rounded-full bg-ember-500/10 blur-3xl dark:bg-ember-500/[0.07]" aria-hidden="true" />
      <div className="rounded-[22px] border border-zinc-200 bg-white/70 p-3 shadow-2xl shadow-zinc-950/[0.06] backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/60 dark:shadow-black/40">
        <div className="relative aspect-square overflow-hidden rounded-2xl" style={{ background: preset.options.background }}>
          {SPECIMENS.map((p, i) => (
            <div
              key={p.id}
              className={cx("absolute inset-0 p-5 transition-opacity duration-700", i === index ? "opacity-100" : "opacity-0")}
              aria-hidden={i !== index}
            >
              <QRCode value="https://qrforge.dev" size={600} margin={1} {...p.options} frame={null} className="h-full w-full" title={i === index ? `QR code in the ${p.name} style` : undefined} />
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between px-2 pt-3 pb-1 text-xs">
          <span className="font-medium">{preset.name}</span>
          <span className="muted flex items-center gap-1.5">
            <Lock className="h-3 w-3" /> generated in your browser
          </span>
        </div>
      </div>
    </div>
  );
}

function CodeBlock({ code, label }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-xl bg-zinc-950 p-5 font-mono text-[13px] leading-relaxed text-zinc-200 ring-1 ring-zinc-800">
        <code>{code}</code>
      </pre>
      <button
        type="button"
        aria-label={`Copy ${label} example`}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            /* clipboard unavailable */
          }
        }}
        className="absolute top-3 right-3 rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
      >
        {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
      </button>
    </div>
  );
}

const DEV_TABS = [
  {
    id: "core",
    label: "Core",
    icon: Package,
    code: `npm install @qrforge/core

import { generateQR } from "@qrforge/core";

const svg = await generateQR({
  data: "https://example.com",
  format: "svg",
  moduleStyle: "rounded",
  foreground: "#0f172a",
});`,
  },
  {
    id: "react",
    label: "React",
    icon: Atom,
    code: `npm install @qrforge/react

import { QRCode } from "@qrforge/react";

export default function App() {
  return <QRCode value="https://example.com" size={300} preset="modern" />;
}`,
  },
  {
    id: "cli",
    label: "CLI",
    icon: Terminal,
    code: `npm install -g @qrforge/cli

qrforge generate https://example.com --output qr.svg
qrforge wifi --ssid "Cafe" --password "espresso" -o wifi.png
qrforge vcard --first Ada --last Lovelace --email ada@example.com`,
  },
  {
    id: "docker",
    label: "Self-host",
    icon: Container,
    code: `git clone ${REPO_URL}
cd QrForge
docker compose up -d

# → http://localhost`,
  },
  {
    id: "api",
    label: "REST API",
    icon: Server,
    code: `curl -X POST http://localhost/api/v1/qrcodes \\
  -H "Authorization: Bearer qrf_…" \\
  -H "Content-Type: application/json" \\
  -d '{"name":"Menu","type":"dynamic","destination":"https://example.com/menu"}'

{ "id": "qr_…", "slug": "k7Pq2xR", "redirect_url": "http://localhost/r/k7Pq2xR" }`,
  },
];

const FEATURES = [
  { icon: Link2, title: "Dynamic QR codes", text: "Change where a printed code points, any time." },
  { icon: Palette, title: "QR designer", text: "Colors, shapes, logos, frames and presets." },
  { icon: ChartColumn, title: "Analytics", text: "Anonymous, self-hosted scan statistics." },
  { icon: Zap, title: "REST API", text: "Documented with OpenAPI, API-key auth." },
  { icon: Package, title: "NPM packages", text: "Zero-dependency core library." },
  { icon: Terminal, title: "CLI", text: "Generate codes offline from your terminal." },
  { icon: Atom, title: "React components", text: "Drop-in <QRCode /> and hooks." },
  { icon: Container, title: "Docker", text: "One command to run the full platform." },
  { icon: Lock, title: "Privacy-first", text: "Static codes never leave your browser." },
  { icon: HandCoins, title: "Free & open source", text: "MIT licensed. No paid services, ever." },
];

function Flow({ steps }) {
  return (
    <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
      {steps.map((s, i) => (
        <span key={s} className="flex items-center gap-2">
          <span className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 dark:border-zinc-800 dark:bg-zinc-900">{s}</span>
          {i < steps.length - 1 && <ArrowRight className="h-3.5 w-3.5 text-zinc-400" />}
        </span>
      ))}
    </div>
  );
}

export default function Landing() {
  useDocumentTitle(null);
  const [tab, setTab] = useState("core");
  const active = DEV_TABS.find((t) => t.id === tab);

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] bg-[radial-gradient(60%_60%_at_50%_0%,rgb(255_106_43/0.10),transparent)] dark:bg-[radial-gradient(60%_60%_at_50%_0%,rgb(255_106_43/0.08),transparent)]"
          aria-hidden="true"
        />
        <div className="mx-auto grid max-w-[1240px] items-center gap-14 px-4 pt-16 pb-20 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:pt-24 lg:pb-28">
          <div className="animate-rise">
            <a
              href={REPO_URL}
              className="group inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white/60 py-1 pr-3 pl-1 text-xs font-medium text-zinc-600 backdrop-blur hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-300 dark:hover:border-zinc-700"
            >
              <span className="rounded-full bg-zinc-900 px-2 py-0.5 text-[11px] text-white dark:bg-zinc-100 dark:text-zinc-900">MIT</span>
              Free, open source &amp; self-hostable
              <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
            </a>
            <h1 className="mt-6 text-[44px] leading-[1.05] font-semibold tracking-[-0.035em] text-balance sm:text-6xl">
              The open-source
              <br />
              QR platform.
            </h1>
            <p className="muted mt-6 max-w-xl text-lg leading-relaxed text-pretty">
              Create beautiful QR codes. Generate locally. Self-host everything — dynamic codes, analytics and an API included.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink to="/studio" variant="accent" size="lg">
                Create QR Code <ArrowRight className="h-4 w-4" />
              </ButtonLink>
              <ButtonLink href={REPO_URL} variant="secondary" size="lg">
                <GitHubIcon className="h-4 w-4" /> Explore GitHub
              </ButtonLink>
            </div>
            <ul className="mt-9 flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-zinc-600 dark:text-zinc-400">
              {[
                [Lock, "Generated locally"],
                [UserX, "No account needed"],
                [EyeOff, "No ads or trackers"],
                [FileDown, "PNG, SVG & PDF"],
              ].map(([Icon, label]) => (
                <li key={label} className="flex items-center gap-1.5">
                  <Icon className="h-3.5 w-3.5 text-ember-500" /> {label}
                </li>
              ))}
            </ul>
          </div>
          <div className="animate-rise [animation-delay:120ms]">
            <Specimen />
          </div>
        </div>
      </section>

      {/* Static vs dynamic */}
      <section className="border-t border-zinc-200 dark:border-zinc-800/60">
        <div className="mx-auto max-w-[1240px] px-4 py-20 sm:px-6">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold tracking-widest text-ember-600 uppercase dark:text-ember-400">Two kinds of codes</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">Static when you can. Dynamic when you need it.</h2>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-2">
            <div className="surface p-6">
              <h3 className="font-semibold">Static QR codes</h3>
              <p className="muted mt-2 text-sm leading-relaxed">
                The content is encoded directly in the pattern. They work forever, need no server, and are generated entirely in your
                browser. Perfect for Wi-Fi, contacts and links that won't change.
              </p>
              <div className="mt-5">
                <Flow steps={["QR code", "https://example.com"]} />
              </div>
            </div>
            <div className="surface p-6">
              <h3 className="font-semibold">Dynamic QR codes</h3>
              <p className="muted mt-2 text-sm leading-relaxed">
                The code points at a short link on your QRForge server. Change the destination after printing, pause it, add an
                expiry or password, and see anonymous scan analytics.
              </p>
              <div className="mt-5">
                <Flow steps={["QR code", "/r/abc123", "current destination"]} />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-zinc-200 dark:border-zinc-800/60">
        <div className="mx-auto max-w-[1240px] px-4 py-20 sm:px-6">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold tracking-widest text-ember-600 uppercase dark:text-ember-400">Everything included</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">A QR platform, not just a generator.</h2>
          </div>
          <div className="mt-10 grid gap-px overflow-hidden rounded-xl border border-zinc-200 bg-zinc-200 sm:grid-cols-2 lg:grid-cols-5 dark:border-zinc-800 dark:bg-zinc-800">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <div key={title} className="bg-white p-5 dark:bg-zinc-950">
                <Icon className="h-4 w-4 text-ember-500" />
                <h3 className="mt-3 text-sm font-semibold">{title}</h3>
                <p className="muted mt-1 text-[13px] leading-relaxed">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Developers */}
      <section className="border-t border-zinc-200 dark:border-zinc-800/60">
        <div className="mx-auto grid max-w-[1240px] gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[1fr_1.3fr]">
          <div>
            <p className="text-xs font-semibold tracking-widest text-ember-600 uppercase dark:text-ember-400">For developers</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">An ecosystem you can build on.</h2>
            <p className="muted mt-4 leading-relaxed">
              The same zero-dependency engine powers the Studio, the React components, the CLI and the server. Deterministic output,
              typed APIs, and no network calls — ever.
            </p>
            <div role="tablist" aria-label="Developer examples" className="mt-8 flex flex-wrap gap-2">
              {DEV_TABS.map((t) => (
                <button
                  key={t.id}
                  role="tab"
                  type="button"
                  aria-selected={tab === t.id}
                  onClick={() => setTab(t.id)}
                  className={cx(
                    "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] font-medium transition-colors",
                    tab === t.id
                      ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                      : "border-zinc-200 text-zinc-600 hover:border-zinc-300 dark:border-zinc-800 dark:text-zinc-400 dark:hover:border-zinc-700",
                  )}
                >
                  <t.icon className="h-3.5 w-3.5" /> {t.label}
                </button>
              ))}
            </div>
          </div>
          <div role="tabpanel" aria-label={active.label} className="min-w-0 self-center">
            <CodeBlock code={active.code} label={active.label} />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-zinc-200 dark:border-zinc-800/60">
        <div className="mx-auto flex max-w-[1240px] flex-col items-start gap-6 px-4 py-20 sm:px-6 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight">Your data. Your server. Your codes.</h2>
            <p className="muted mt-2">No sign-up, no watermark, no expiring codes.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <ButtonLink to="/studio" variant="accent" size="lg">
              Open the Studio <ArrowRight className="h-4 w-4" />
            </ButtonLink>
            <ButtonLink href={`${REPO_URL}#self-hosting`} variant="secondary" size="lg">
              <Container className="h-4 w-4" /> Self-host
            </ButtonLink>
          </div>
        </div>
      </section>
    </div>
  );
}
