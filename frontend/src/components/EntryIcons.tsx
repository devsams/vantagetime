import { ReactNode } from "react";

/** Small badge icons for the "how would you like to start?" landing
 * cards — real inline SVGs instead of emoji, so they render identically
 * everywhere and pick up the app's own palette instead of whatever
 * emoji font the OS happens to use. */

function IconBadge({ tone, children }: { tone: "accent" | "mint"; children: ReactNode }) {
  const toneClasses =
    tone === "accent" ? "bg-accent/10 text-accent" : "bg-mint/10 text-mint";
  return (
    <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${toneClasses}`}>
      {children}
    </div>
  );
}

/** A dog-eared script page with a few text lines and a slate/clapper
 * corner mark — reads as "screenplay," not just "generic document." */
export function ScriptIcon() {
  return (
    <IconBadge tone="accent">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M6 2.75h8.5L19 7.25V20a1.25 1.25 0 0 1-1.25 1.25H6A1.25 1.25 0 0 1 4.75 20V4A1.25 1.25 0 0 1 6 2.75Z"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
        <path d="M14.5 2.75V6.5a.75.75 0 0 0 .75.75H19" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        <path d="M8 11.5h8M8 14.25h8M8 17h5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    </IconBadge>
  );
}

/** A spreadsheet grid with a highlighted header row — instantly reads
 * as "CSV / table," the actual format this option expects. */
export function SpreadsheetIcon() {
  return (
    <IconBadge tone="mint">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="3.25" y="4" width="17.5" height="16" rx="1.75" stroke="currentColor" strokeWidth="1.4" />
        <path d="M3.25 9h17.5" stroke="currentColor" strokeWidth="1.4" />
        <path d="M9.25 4v16M15 4v16" stroke="currentColor" strokeWidth="1.2" opacity="0.6" />
        <path d="M3.25 13.5h17.5M3.25 16.75h17.5" stroke="currentColor" strokeWidth="1" opacity="0.4" />
        <rect x="3.25" y="4" width="17.5" height="5" rx="1.75" fill="currentColor" opacity="0.15" />
      </svg>
    </IconBadge>
  );
}
