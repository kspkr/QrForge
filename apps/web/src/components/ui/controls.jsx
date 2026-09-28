import { useId, useRef, useState } from "react";
import { cx } from "../../lib/cx.js";

/** Accessible toggle switch. */
export function Switch({ checked, onChange, label, description, disabled, id: providedId }) {
  const generated = useId();
  const id = providedId ?? generated;
  return (
    <div className="flex items-start justify-between gap-4">
      {(label || description) && (
        <div className="min-w-0">
          {label && (
            <label htmlFor={id} className="block text-[13px] font-medium text-zinc-700 dark:text-zinc-300">
              {label}
            </label>
          )}
          {description && <p className="muted mt-0.5 text-xs">{description}</p>}
        </div>
      )}
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx(
          "relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 disabled:opacity-50",
          checked ? "bg-ember-500" : "bg-zinc-300 dark:bg-zinc-700",
        )}
      >
        <span
          className={cx(
            "inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200",
            checked ? "translate-x-[18px]" : "translate-x-0.5",
          )}
        />
      </button>
    </div>
  );
}

/**
 * Segmented control (radio group) with arrow-key navigation.
 * options: [{ value, label, icon? }]
 */
export function Segmented({ value, onChange, options, label, size = "md", className }) {
  const refs = useRef([]);
  const onKeyDown = (e, index) => {
    const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const next = (index + dir + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  };
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cx(
        "inline-flex w-full rounded-lg border border-zinc-200 bg-zinc-100/80 p-0.5 dark:border-zinc-800 dark:bg-zinc-900",
        className,
      )}
    >
      {options.map((opt, i) => {
        const active = opt.value === value;
        const Icon = opt.icon;
        return (
          <button
            key={opt.value}
            ref={(el) => (refs.current[i] = el)}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            title={opt.title}
            onKeyDown={(e) => onKeyDown(e, i)}
            onClick={() => onChange(opt.value)}
            className={cx(
              "flex flex-1 items-center justify-center gap-1.5 rounded-md font-medium transition-all duration-150",
              size === "sm" ? "h-7 px-2 text-xs" : "h-8 px-2.5 text-[13px]",
              active
                ? "bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-50 dark:ring-zinc-700"
                : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200",
            )}
          >
            {Icon && <Icon className="h-3.5 w-3.5" />}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

const HEX = /^#([0-9a-f]{6})$/i;

/** Colour swatch + hex input kept in sync. */
export function ColorField({ label, value, onChange, id: providedId }) {
  const generated = useId();
  const id = providedId ?? generated;
  const [draft, setDraft] = useState(value);
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    setDraft(value);
  }
  const commit = (v) => {
    const normalized = v.startsWith("#") ? v : `#${v}`;
    if (HEX.test(normalized)) onChange(normalized.toLowerCase());
    else setDraft(value);
  };
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-[13px] font-medium text-zinc-700 dark:text-zinc-300">
        {label}
      </label>
      <div className="flex h-9 items-center gap-2 rounded-lg border border-zinc-300 bg-white pr-2 pl-1 focus-within:border-ember-500 focus-within:ring-3 focus-within:ring-ember-500/15 dark:border-zinc-700/80 dark:bg-zinc-900/60">
        <input
          type="color"
          aria-label={`${label} picker`}
          value={HEX.test(value) ? value : "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className="h-7 w-7 shrink-0 cursor-pointer rounded-md border border-black/10 bg-transparent dark:border-white/10"
        />
        <input
          id={id}
          value={draft}
          spellCheck={false}
          maxLength={7}
          onChange={(e) => {
            setDraft(e.target.value);
            if (HEX.test(e.target.value)) onChange(e.target.value.toLowerCase());
          }}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && commit(e.currentTarget.value)}
          className="min-w-0 flex-1 bg-transparent font-mono text-[13px] uppercase outline-none"
        />
      </div>
    </div>
  );
}

/** Range slider with value readout. */
export function Slider({ label, value, onChange, min, max, step = 1, format = (v) => v, id: providedId }) {
  const generated = useId();
  const id = providedId ?? generated;
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="text-[13px] font-medium text-zinc-700 dark:text-zinc-300">
          {label}
        </label>
        <span className="font-mono text-xs text-zinc-500 tabular-nums dark:text-zinc-400">{format(value)}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ "--pct": `${pct}%` }}
        className={cx(
          "h-1.5 w-full cursor-pointer appearance-none rounded-full bg-zinc-200 accent-ember-500 dark:bg-zinc-800",
          "[background-image:linear-gradient(var(--color-ember-500),var(--color-ember-500))] [background-repeat:no-repeat] [background-size:var(--pct)_100%]",
          "[&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-zinc-300 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow",
          "[&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-zinc-300 [&::-moz-range-thumb]:bg-white",
        )}
      />
    </div>
  );
}

export function Badge({ tone = "neutral", children, className, dot }) {
  const tones = {
    neutral: "bg-zinc-100 text-zinc-700 ring-zinc-200 dark:bg-zinc-800/80 dark:text-zinc-300 dark:ring-zinc-700/60",
    success: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/20",
    warning: "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/20",
    danger: "bg-red-50 text-red-700 ring-red-200 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/20",
    accent: "bg-ember-50 text-ember-700 ring-ember-200 dark:bg-ember-500/10 dark:text-ember-300 dark:ring-ember-500/20",
    info: "bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-500/20",
  };
  const dots = {
    neutral: "bg-zinc-400",
    success: "bg-emerald-500",
    warning: "bg-amber-500",
    danger: "bg-red-500",
    accent: "bg-ember-500",
    info: "bg-sky-500",
  };
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap ring-1 ring-inset",
        tones[tone],
        className,
      )}
    >
      {dot && <span className={cx("h-1.5 w-1.5 rounded-full", dots[tone])} />}
      {children}
    </span>
  );
}
