import { useId, useRef, useState } from "react";
import { ChevronDown, ImagePlus, Trash2, ArrowLeftRight } from "lucide-react";
import { QRCode } from "@qrforge/react";
import { presets } from "@qrforge/core";
import { applyPreset, designToOptions } from "../../lib/design.js";
import { ColorField, Segmented, Slider, Switch } from "../ui/controls.jsx";
import { Field, Input } from "../ui/Field.jsx";
import { Button } from "../ui/Button.jsx";
import { cx } from "../../lib/cx.js";

const SAMPLE = "https://qrforge.dev";
const MAX_LOGO_BYTES = 1024 * 1024;
const LOGO_TYPES = ["image/png", "image/jpeg", "image/svg+xml", "image/webp", "image/gif"];

export function Section({ title, children, defaultOpen = true, aside }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <section className="border-t border-zinc-200 first:border-t-0 dark:border-zinc-800/80">
      <div className="flex items-center justify-between">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((o) => !o)}
          className="flex flex-1 items-center gap-2 py-3.5 text-left text-[13px] font-semibold text-zinc-800 dark:text-zinc-200"
        >
          <ChevronDown className={cx("h-4 w-4 text-zinc-400 transition-transform duration-200", !open && "-rotate-90")} />
          {title}
        </button>
        {aside}
      </div>
      {open && (
        <div id={id} className="animate-fade-in pb-5">
          {children}
        </div>
      )}
    </section>
  );
}

function Tile({ active, onClick, label, children, title }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      aria-label={label}
      title={title ?? label}
      onClick={onClick}
      className={cx(
        "group flex flex-col items-center gap-1.5 rounded-lg border p-2 transition-all duration-150",
        active
          ? "border-ember-500/60 ring-1 ring-ember-500/30"
          : "border-zinc-200 hover:border-zinc-300 dark:border-zinc-800 dark:hover:border-zinc-700",
      )}
    >
      {children}
      <span className={cx("text-[11px] font-medium", active ? "text-zinc-900 dark:text-zinc-50" : "muted")}>{label}</span>
    </button>
  );
}

function MiniQR({ options }) {
  return (
    <span className="block overflow-hidden rounded-md bg-white ring-1 ring-black/5">
      <QRCode value={SAMPLE} size={112} margin={2} {...options} aria-hidden="true" className="h-auto w-full" />
    </span>
  );
}

export function DesignPanel({ design, onChange, onNotice }) {
  const fileRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [logoError, setLogoError] = useState(null);
  const base = designToOptions({ ...design, logo: null, label: "", frame: "none" });

  const update = (patch) => onChange({ ...design, preset: "custom", ...patch });

  const readLogo = (file) => {
    setLogoError(null);
    if (!file) return;
    if (!LOGO_TYPES.includes(file.type)) {
      setLogoError("Use a PNG, JPEG, SVG, WebP or GIF image.");
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setLogoError("Logos must be 1 MB or smaller.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const patch = {
        logo: { src: reader.result, name: file.name, size: 0.22, padding: 1, background: true, bgColor: "" },
      };
      if (design.ecc === "L" || design.ecc === "M") {
        patch.ecc = "H";
        onNotice?.("Error correction raised to H so the code stays scannable with a logo.");
      }
      onChange({ ...design, ...patch });
    };
    reader.onerror = () => setLogoError("Couldn't read that file.");
    reader.readAsDataURL(file);
  };

  return (
    <div>
      <Section title="Presets">
        <div role="radiogroup" aria-label="Presets" className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {presets.map((p) => (
            <Tile
              key={p.id}
              label={p.name}
              title={p.description}
              active={design.preset === p.id}
              onClick={() => onChange(applyPreset(design, p.id))}
            >
              <MiniQR options={{ ...p.options, frame: null }} />
            </Tile>
          ))}
        </div>
      </Section>

      <Section title="Colors">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <ColorField label="Foreground" value={design.foreground} onChange={(v) => update({ foreground: v })} />
          <div className="space-y-2">
            <ColorField
              label="Background"
              value={design.background}
              onChange={(v) => update({ background: v, transparent: false })}
            />
          </div>
          <ColorField
            label="Corner color"
            value={design.cornerColor || design.foreground}
            onChange={(v) => update({ cornerColor: v === design.foreground ? "" : v })}
          />
          <div className="flex flex-col justify-end gap-3 pb-1">
            <Switch label="Transparent background" checked={design.transparent} onChange={(v) => update({ transparent: v })} />
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <Button
            size="xs"
            variant="ghost"
            onClick={() => update({ foreground: design.background, background: design.foreground, transparent: false })}
          >
            <ArrowLeftRight className="h-3.5 w-3.5" /> Swap colors
          </Button>
          {design.cornerColor && (
            <Button size="xs" variant="ghost" onClick={() => update({ cornerColor: "" })}>
              Reset corner color
            </Button>
          )}
        </div>
      </Section>

      <Section title="Modules">
        <div role="radiogroup" aria-label="Module style" className="grid grid-cols-4 gap-2">
          {[
            ["square", "Square"],
            ["soft", "Soft"],
            ["rounded", "Rounded"],
            ["dots", "Dots"],
          ].map(([value, label]) => (
            <Tile key={value} label={label} active={design.moduleStyle === value} onClick={() => update({ moduleStyle: value })}>
              <MiniQR options={{ ...base, moduleStyle: value, background: "#ffffff" }} />
            </Tile>
          ))}
        </div>
      </Section>

      <Section title="Corners">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <span className="block text-[13px] font-medium text-zinc-700 dark:text-zinc-300">Frame</span>
            <Segmented
              label="Corner frame style"
              value={design.cornerStyle}
              onChange={(v) => update({ cornerStyle: v })}
              options={[
                { value: "square", label: "Square" },
                { value: "rounded", label: "Rounded" },
                { value: "circle", label: "Circle" },
              ]}
            />
          </div>
          <div className="space-y-1.5">
            <span className="block text-[13px] font-medium text-zinc-700 dark:text-zinc-300">Eye</span>
            <Segmented
              label="Corner eye style"
              value={design.cornerDotStyle}
              onChange={(v) => update({ cornerDotStyle: v })}
              options={[
                { value: "square", label: "Square" },
                { value: "rounded", label: "Rounded" },
                { value: "circle", label: "Circle" },
              ]}
            />
          </div>
        </div>
      </Section>

      <Section title="Logo" defaultOpen={!!design.logo}>
        {!design.logo ? (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              readLogo(e.dataTransfer.files?.[0]);
            }}
            className={cx(
              "flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-7 text-center transition-colors",
              dragging ? "border-ember-500 bg-ember-500/5" : "border-zinc-300 dark:border-zinc-700",
            )}
          >
            <ImagePlus className="h-5 w-5 text-zinc-400" />
            <p className="text-sm">
              Drop a logo here or{" "}
              <button type="button" className="font-medium text-ember-600 hover:underline dark:text-ember-400" onClick={() => fileRef.current?.click()}>
                browse
              </button>
            </p>
            <p className="muted text-xs">PNG, JPEG, SVG or WebP · max 1 MB · stays on your device</p>
            <input
              ref={fileRef}
              type="file"
              accept={LOGO_TYPES.join(",")}
              className="sr-only"
              tabIndex={-1}
              onChange={(e) => {
                readLogo(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-lg border border-zinc-200 p-2 dark:border-zinc-800">
              <img src={design.logo.src} alt="" className="checkerboard h-10 w-10 rounded-md object-contain" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{design.logo.name || "Logo"}</p>
                <p className="muted text-xs">Embedded locally</p>
              </div>
              <Button size="icon-sm" variant="danger-ghost" aria-label="Remove logo" onClick={() => onChange({ ...design, logo: null })}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Slider
                label="Logo size"
                min={0.1}
                max={0.3}
                step={0.01}
                value={design.logo.size}
                format={(v) => `${Math.round(v * 100)}%`}
                onChange={(v) => onChange({ ...design, logo: { ...design.logo, size: v } })}
              />
              <Slider
                label="Padding"
                min={0}
                max={3}
                step={0.5}
                value={design.logo.padding}
                format={(v) => `${v} mod`}
                onChange={(v) => onChange({ ...design, logo: { ...design.logo, padding: v } })}
              />
            </div>
            <Switch
              label="Logo background"
              description="A solid plate behind the logo keeps it legible."
              checked={design.logo.background}
              onChange={(v) => onChange({ ...design, logo: { ...design.logo, background: v } })}
            />
            {design.logo.background && (
              <ColorField
                label="Logo background color"
                value={design.logo.bgColor || (design.transparent ? "#ffffff" : design.background)}
                onChange={(v) => onChange({ ...design, logo: { ...design.logo, bgColor: v } })}
              />
            )}
          </div>
        )}
        {logoError && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{logoError}</p>}
      </Section>

      <Section title="Frame & label" defaultOpen={design.frame !== "none" || !!design.label}>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <span className="block text-[13px] font-medium text-zinc-700 dark:text-zinc-300">Frame</span>
            <Segmented
              label="Frame style"
              value={design.frame}
              onChange={(v) => update({ frame: v, label: v !== "none" && !design.label ? "SCAN ME" : design.label })}
              options={[
                { value: "none", label: "None" },
                { value: "box", label: "Outline" },
                { value: "banner", label: "Banner" },
              ]}
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Label text" optional hint="Shown below the code. Max 32 characters.">
              <Input value={design.label} maxLength={32} placeholder="SCAN ME" onChange={(e) => update({ label: e.target.value })} />
            </Field>
            {design.frame !== "none" && (
              <ColorField label="Frame color" value={design.frameColor} onChange={(v) => update({ frameColor: v })} />
            )}
          </div>
        </div>
      </Section>

      <Section title="Advanced" defaultOpen={false}>
        <div className="space-y-5">
          <div className="space-y-1.5">
            <span className="block text-[13px] font-medium text-zinc-700 dark:text-zinc-300">Error correction</span>
            <Segmented
              label="Error correction"
              value={design.ecc}
              onChange={(v) => onChange({ ...design, ecc: v })}
              options={[
                { value: "L", label: "L · 7%", title: "Low — smallest code" },
                { value: "M", label: "M · 15%", title: "Medium — good default" },
                { value: "Q", label: "Q · 25%", title: "Quartile" },
                { value: "H", label: "H · 30%", title: "High — best with logos" },
              ]}
            />
            <p className="muted text-xs">Higher levels survive damage and logos, but make the code denser.</p>
          </div>
          <Slider
            label="Quiet zone (margin)"
            min={0}
            max={8}
            value={design.margin}
            format={(v) => `${v} modules`}
            onChange={(v) => onChange({ ...design, margin: v })}
          />
        </div>
      </Section>
    </div>
  );
}
