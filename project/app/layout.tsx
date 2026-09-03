import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Revenue Recovery Agent | AI Revenue Recovery",
  description: "Autonomous AI agent for detecting, diagnosing, and recovering at-risk revenue.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-base-950 text-slate-100 antialiased min-h-screen">{children}</body>
    </html>
  );
}
