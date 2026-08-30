import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VantageTime",
  description: "Script in. Schedule, validated call sheet, and location research out.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <head>
        {/* Google Fonts via a classic <link>, not next/font/google — see
            the comment on --font-display in globals.css for why. The
            actual font-family values these deliver are wired up there. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      {/* suppressHydrationWarning: browser extensions (Grammarly, etc.) inject
          attributes like data-gr-ext-installed onto <body> after SSR but
          before hydration — a real mismatch, but not one our code causes or
          can fix, and harmless since nothing here reads those attributes. */}
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        {/* Decorative film-grain texture, fixed over the whole app —
            see .grain-overlay in globals.css. Purely visual: it's
            pointer-events-none so nothing underneath is affected. */}
        <div className="grain-overlay" aria-hidden="true" />
        {children}
      </body>
    </html>
  );
}
