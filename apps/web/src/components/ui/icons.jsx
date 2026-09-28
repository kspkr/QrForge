/** The QRForge mark: three finder "eyes" and a module cluster. */
export function Logo({ className = "h-6 w-6" }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="8" className="fill-zinc-900 dark:fill-zinc-50" />
      <g className="fill-ember-500">
        <path d="M7 7h8v8H7zM9 9v4h4V9z" fillRule="evenodd" />
        <path d="M17 7h8v8h-8zm2 2v4h4V9z" fillRule="evenodd" />
        <path d="M7 17h8v8H7zm2 2v4h4v-4z" fillRule="evenodd" />
      </g>
      <g className="fill-zinc-50 dark:fill-zinc-900">
        <rect x="17" y="17" width="3" height="3" rx=".6" />
        <rect x="22" y="17" width="3" height="3" rx=".6" />
        <rect x="17" y="22" width="3" height="3" rx=".6" />
        <rect x="22" y="22" width="3" height="3" rx=".6" />
      </g>
    </svg>
  );
}

export function Wordmark({ className }) {
  return (
    <span className={className}>
      <span className="font-semibold tracking-tight">QRForge</span>
    </span>
  );
}

/** GitHub mark (lucide dropped brand icons). */
export function GitHubIcon({ className = "h-4 w-4" }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}
