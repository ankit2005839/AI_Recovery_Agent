import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ledger — AI Revenue Recovery Agent",
  description: "Detects revenue at risk, diagnoses root causes, and executes bounded recovery workflows.",
};

// Fonts are loaded at runtime via <link> rather than next/font/google so that
// `npm run build` never depends on reaching fonts.googleapis.com at build time
// — useful in sandboxed CI/build environments with restricted egress. Swap for
// next/font if your deploy target has open network access and you want
// automatic font subsetting/self-hosting.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Source+Serif+4:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
