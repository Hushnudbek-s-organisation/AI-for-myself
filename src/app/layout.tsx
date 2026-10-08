import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Aether — Universal AI Platform",
  description:
    "A standalone AI operating environment: chat, skills, prompts, tools, and a public API on one core.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
