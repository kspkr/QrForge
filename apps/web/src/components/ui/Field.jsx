import { forwardRef, useId, cloneElement, isValidElement } from "react";
import { ChevronDown } from "lucide-react";
import { cx } from "../../lib/cx.js";

const control =
  "w-full rounded-lg border bg-white text-sm text-zinc-900 placeholder:text-zinc-400 transition-colors " +
  "border-zinc-300 hover:border-zinc-400 focus:border-ember-500 focus:outline-none focus:ring-3 focus:ring-ember-500/15 " +
  "dark:bg-zinc-900/60 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:border-zinc-700/80 dark:hover:border-zinc-600 " +
  "disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-red-500 aria-[invalid=true]:focus:ring-red-500/15";

export const Input = forwardRef(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cx(control, "h-9 px-3", className)} {...props} />;
});

export const Textarea = forwardRef(function Textarea({ className, rows = 3, ...props }, ref) {
  return <textarea ref={ref} rows={rows} className={cx(control, "resize-y px-3 py-2 leading-relaxed", className)} {...props} />;
});

export const Select = forwardRef(function Select({ className, children, ...props }, ref) {
  return (
    <div className="relative">
      <select ref={ref} className={cx(control, "h-9 appearance-none pr-8 pl-3", className)} {...props}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 h-4 w-4 -translate-y-1/2 text-zinc-400" />
    </div>
  );
});

export function Label({ htmlFor, children, className }) {
  return (
    <label htmlFor={htmlFor} className={cx("block text-[13px] font-medium text-zinc-700 dark:text-zinc-300", className)}>
      {children}
    </label>
  );
}

/**
 * Label + control + hint/error. The first child receives id and aria attributes.
 */
export function Field({ label, hint, error, children, className, optional, id: providedId }) {
  const generated = useId();
  const id = providedId ?? generated;
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  const child = isValidElement(children)
    ? cloneElement(children, {
        id,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": describedBy,
      })
    : children;
  return (
    <div className={cx("space-y-1.5", className)}>
      {label && (
        <Label htmlFor={id}>
          {label}
          {optional && <span className="ml-1 font-normal text-zinc-400 dark:text-zinc-500">optional</span>}
        </Label>
      )}
      {child}
      {error ? (
        <p id={`${id}-error`} className="text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="muted text-xs">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
