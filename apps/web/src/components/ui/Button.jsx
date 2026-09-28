import { forwardRef } from "react";
import { Link } from "react-router";
import { Spinner } from "./misc.jsx";
import { cx } from "../../lib/cx.js";

const VARIANTS = {
  primary:
    "bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-white shadow-sm",
  accent: "bg-ember-500 text-white hover:bg-ember-600 shadow-sm shadow-ember-500/20",
  secondary:
    "border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700/80 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800/80",
  ghost: "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/70 dark:hover:text-zinc-100",
  danger: "bg-red-600 text-white hover:bg-red-700 shadow-sm",
  "danger-ghost": "text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10",
};

const SIZES = {
  xs: "h-7 px-2 text-xs gap-1 rounded-md",
  sm: "h-8 px-3 text-[13px] gap-1.5 rounded-lg",
  md: "h-9 px-3.5 text-sm gap-2 rounded-lg",
  lg: "h-11 px-5 text-[15px] gap-2 rounded-xl",
  icon: "h-8 w-8 justify-center rounded-lg",
  "icon-sm": "h-7 w-7 justify-center rounded-md",
};

export function buttonClasses({ variant = "secondary", size = "md", className } = {}) {
  return cx(
    "inline-flex shrink-0 select-none items-center font-medium whitespace-nowrap transition-colors duration-150",
    "disabled:pointer-events-none disabled:opacity-50",
    VARIANTS[variant],
    SIZES[size],
    className,
  );
}

export const Button = forwardRef(function Button(
  { variant, size, className, loading = false, disabled, children, type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClasses({ variant, size, className })}
      {...props}
    >
      {loading && <Spinner className="h-3.5 w-3.5" />}
      {children}
    </button>
  );
});

export function ButtonLink({ variant, size, className, to, href, children, ...props }) {
  const classes = buttonClasses({ variant, size, className });
  if (href) {
    return (
      <a href={href} className={classes} {...props}>
        {children}
      </a>
    );
  }
  return (
    <Link to={to} className={classes} {...props}>
      {children}
    </Link>
  );
}
