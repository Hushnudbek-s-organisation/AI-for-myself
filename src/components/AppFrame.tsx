"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AetherMark } from "./workspace/icons";
import { cn } from "@/lib/cn";

const LINKS = [
  { href: "/chat", label: "Chat" },
  { href: "/skills", label: "Skills" },
  { href: "/prompts", label: "Prompts" },
  { href: "/developer", label: "Developer" },
  { href: "/settings", label: "Settings" },
  { href: "/docs", label: "API docs" },
];

export function AppFrame({ children, title }: { children: React.ReactNode; title: string }) {
  const path = usePathname();
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 flex items-center gap-6 border-b border-white/5 bg-ink-950/80 px-5 py-3 backdrop-blur">
        <Link href="/chat" className="flex items-center gap-2">
          <AetherMark className="h-7 w-7" />
          <span className="font-serif text-lg">Aether</span>
        </Link>
        <nav className="flex flex-wrap gap-1 text-sm">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={cn(
                "rounded-full px-3 py-1 text-mist-400 hover:text-white",
                path.startsWith(l.href) && "bg-white/5 text-white",
              )}
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </header>
      <div className="mx-auto max-w-5xl px-5 py-10">
        <h1 className="font-serif text-4xl tracking-tight">{title}</h1>
        <div className="mt-8">{children}</div>
      </div>
    </div>
  );
}
